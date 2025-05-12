// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { BaseGuard } from "@safe-global/safe-contracts/contracts/base/GuardManager.sol";
import { Enum } from "@safe-global/safe-contracts/contracts/common/Enum.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
contract TimelockGuardv021 is BaseGuard, Initializable {

    string public constant VERSION = "0.2.1";

    error UnAuthorized(address caller, bool reason);
    error ZerodAddess();
    error InvalidConfig(uint64 timelockDuration, uint64 throttle);
    error Throttled(uint256 timestamp, uint256 lastQueueTime, uint64 throttle);
    error QueuingNeeded(bytes32 txHash);
    error QueuingNotNeeded(uint64 timelockDuration, uint128 limitNoTimelock, uint256 value);
    error TimeLockActive(bytes32 txHash);
    error CancelMisMatch(bytes32 txHash); 
    function checkSender() private view {
        if(msg.sender != address(safe)) revert UnAuthorized(msg.sender, true);
    }

    function initialize(address _safe, uint64 timelockDuration, uint64 throttle, uint128 limitNoTimelock, uint8 _quorumCancel, uint8 _quorumExecute) public initializer {
        if(address(_safe) == address(0)) revert ZerodAddess();
        setConfigHelper(timelockDuration, throttle, limitNoTimelock, _quorumCancel, _quorumExecute);
        safe = _safe;
        lastQueueTime = 1;
    }

    function checkTransaction(address to, uint256 value, bytes calldata data, Enum.Operation operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures, address executor ) external {
        checkSender();
        // allow skipping the queue for queueTransaction or cancelTransaction
        if (to == address(this) && data.length > 3) {
            bytes4 selector = bytes4(data);
            if (selector == this.queueTransaction.selector)
                return;
            else if(selector == this.cancelTransaction.selector) {
                if(signatures.length < quorumCancel) revert UnAuthorized(executor, false);
                return;
            }
        }
        
        if(signatures.length >= quorumExecute)
            return;
        // Proceed to mark as executed if the transaction was queued and meets the timelock condition
        validateAndMarkExecuted (to, value, data, operation);
    }

    function checkAfterExecution(bytes32 txHash, bool success) external {
        // No action needed here
    }

    address public safe;
    struct TimelockConfig { 
        uint64 timelockDuration;
        uint64 throttle;
        uint128 limitNoTimelock;
    }
    TimelockConfig public timelockConfig;
    uint256 private lastQueueTime;
    event TimelockConfigChanged();  // Empty event to save on gas as we dont need the history. Check the field of timelockConfig for the new values

    /// Set the configuration for this timelock and allow clearings caches that may have become irrelevant due to the new configuration (this is not verified in the contract) 
    /// @param timelockDuration    Duration of timelock, 0 disables the timelock, transactions can be executed directly
    /// @param throttle            Throttle time, 0 disables the throttling
    /// @param limitNoTimelock     Value under which a direct ETH transfer does not require a timelock and can be executed directly. 0 forces any direct ETH sent to go through the queue when the timelock is active 
    /// @param clearHashes          Transaction hashes for which to clear the timelock. Relevant when the config has been changed so no timelock is need for these hashes 
    function setConfig (uint64 timelockDuration, uint64 throttle, uint128 limitNoTimelock, uint8 _quorumCancel, uint8 _quorumExecute, bytes32[] calldata clearHashes) external {
        checkSender();
        setConfigHelper(timelockDuration, throttle, limitNoTimelock, _quorumCancel, _quorumExecute);
        uint256 len = clearHashes.length;
        if(len != 0) {
            unchecked {
                for(uint256 i = 0; i < len; ++i)
                    delete transactions[clearHashes[i]];
            }
            emit TransactionsCleared(clearHashes);
        }
        emit TimelockConfigChanged();
    }
    function setConfigHelper(uint64 timelockDuration, uint64 throttle, uint128 limitNoTimelock, uint8 _quorumCancel, uint8 _quorumExecute) private {
        if(timelockDuration > 1209600 || throttle > 3600) revert InvalidConfig(timelockDuration, throttle);
        quorumCancel = _quorumCancel;
        quorumExecute = _quorumExecute;
        timelockConfig.timelockDuration = timelockDuration;
        timelockConfig.throttle = throttle;
        timelockConfig.limitNoTimelock = limitNoTimelock;
    }
    
    /// @notice Mapping of transaction hashes to timestamp when the transactions have been queued.
    /// @notice Using an array allow for several identical transactions to be in the queue at the same time. Timestamp are always in ascending order, and the most recent are cleared first.
    mapping(bytes32 => uint256[]) public transactions;
    
    event TransactionQueued(bytes32 txHash); // The details of the queued transaction must be retrieved directly from the transaction itself to save gas
    event TransactionCanceled(bytes32 txHash, uint256 timestamp);
    event TransactionCleared(bytes32 txHash);
    event TransactionsCleared(bytes32[] txHash);
    event TransactionExecuted(bytes32 txHash, uint256 timestamp);

    function queueTransaction(address to, uint256 value, bytes calldata data, Enum.Operation operation) external {
        checkSender();
        if(block.timestamp < lastQueueTime + timelockConfig.throttle) revert Throttled(block.timestamp, lastQueueTime, timelockConfig.throttle);
        if(noTimelockNeeded(value, data, operation)) revert QueuingNotNeeded(timelockConfig.timelockDuration, timelockConfig.limitNoTimelock, value);
        bytes32 txHash = getTxHash(to, value, data, operation);

        lastQueueTime = block.timestamp;
        transactions[txHash].push(block.timestamp);
        emit TransactionQueued(txHash);
    }

    function cancelTransaction(bytes32 txHash, uint256 timestampPos, uint256 timestamp) external {
        checkSender();
        uint256[] storage timestamps = transactions[txHash];
        uint256 len = timestamps.length;
        if(timestampPos >= len) revert CancelMisMatch(txHash);

        if(timestamps[timestampPos] == timestamp) {
            if(len == 1)
                delete transactions[txHash];
            else
                shiftAndPop(timestamps, timestampPos);
            emit TransactionCanceled(txHash, timestamp);
            return;
        }
        for(uint256 i = timestampPos-1; timestamps[i]>=timestamp; ) {
            if(timestamp == timestamps[i]) {
                shiftAndPop(timestamps, i);
                emit TransactionCanceled(txHash, timestamp);
                return;
            }
            if(i==0)    break;
            unchecked { --i; }
        }
        revert CancelMisMatch(txHash);        
    }
    function shiftAndPop(uint256[] storage arr, uint256 pos) private {
        unchecked {
            uint256 max = arr.length-1;
            for(uint256 i = pos; i < max; ++i)
                arr[i] = arr[i+1];
            arr.pop();
        }
    }

    function validateAndMarkExecuted (address to, uint256 value, bytes calldata data, Enum.Operation operation) private {
        bytes32 txHash = getTxHash(to, value, data, operation);
        if(noTimelockNeeded(value, data, operation)) {
            // If it was queued anyway (for instance if timelockDuration == 0 now and was > 0 before), remove it from storage
            if(transactions[txHash].length != 0) {
                emit TransactionCleared(txHash);
                delete transactions[txHash];
            }
        }
        else {
            uint256[] storage timestamps = transactions[txHash];
            uint256 len = timestamps.length;
            if(len == 0) revert QueuingNeeded(txHash);
            uint256 executeFrom = block.timestamp - timelockConfig.timelockDuration;
            if(executeFrom < timestamps[0]) revert TimeLockActive(txHash);
            
            // We clear the corresponding value
            if(len == 1) {
                emit TransactionExecuted(txHash, timestamps[0]);
                delete transactions[txHash];
            }
            else {
                uint256 i = 1;
                unchecked {
                    while(i < len && executeFrom > timestamps[i])
                        ++i;
                }
                emit TransactionExecuted(txHash, timestamps[i-1]);
                shiftAndPop(timestamps, i-1);
            }
        }
    }
    function noTimelockNeeded( uint256 value, bytes calldata data, Enum.Operation operation) private view returns (bool) {
        // We want simple ETH transfers smaller than limitNoTimelock to not require a timelock
        return timelockConfig.timelockDuration == 0 || (operation == Enum.Operation.Call && (data.length == 0 || (data.length == 1 && data[0] == 0)) && timelockConfig.limitNoTimelock >= value);
    }
    function getTxHash(address to, uint256 value, bytes calldata data, Enum.Operation operation) private pure returns (bytes32) {
        // Only data has a dynamic type so abi.encodePacked can be used and will save some gas compared to abi.encode  
        return keccak256(abi.encodePacked(to, value, data, operation));
    }
    uint8 public quorumCancel;
    uint8 public quorumExecute;
}