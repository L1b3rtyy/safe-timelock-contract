// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { BaseGuard } from "@safe-global/safe-contracts/contracts/base/GuardManager.sol";
import { Enum } from "@safe-global/safe-contracts/contracts/common/Enum.sol";
contract TimelockGuard is BaseGuard {

    error UnAuthorized(address caller);
    error InvalidAddess(address _safe);
    error InvalidConfig(uint64 _timelockDuration, uint64 _throttle);
    error Throttled(uint256 timestamp, uint256 lastQueueTime, uint64 throttle);
    error QueuingNeeded(bytes32 txHash);
    error QueuingNotNeeded(uint64 timelockDuration, uint128 limitNoTimelock, uint256 value);
    error TimeLockActive(bytes32 txHash, uint256 timestamp, uint256 executeAfter);
    error CancelMisMatch(bytes32 txHash, uint256 timestamp); 
    function checkSender() private view {
        if(msg.sender != address(safe)) revert UnAuthorized(msg.sender);
    }

    constructor(address _safe, uint64 _timelockDuration, uint64 _throttle, uint128 _limitNoTimelock) {
        if(address(_safe) == address(0)) revert InvalidAddess(address(_safe));
        setConfigHelper(_timelockDuration, _throttle, _limitNoTimelock);
        safe = _safe;
    }

    function checkTransaction(address to, uint256 value, bytes calldata data, Enum.Operation operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures, address executor ) external {
        checkSender();

        // allow skipping the queue for queueTransaction or cancelTransaction
        if (to == address(this) && data.length > 3) {
            bytes4 selector = bytes4(data);
            if (selector == this.queueTransaction.selector || selector == this.cancelTransaction.selector)
                return;
        }

        validateAndMarkExecuted (to, value, data, operation);
    }

    function checkAfterExecution(bytes32 txHash, bool success) external {
        // No action needed here
    }

    address public immutable safe;
    struct TimelockConfig { 
        uint64 timelockDuration;
        uint64 throttle;
        uint128 limitNoTimelock;
    }
    TimelockConfig public timelockConfig;
    uint256 private lastQueueTime = 1;
    event TimelockConfigChanged(uint64 timelockDuration, uint64 throttle, uint128 limitNoTimelock);

    /// Set the configuration for this timelock and allow clearings caches that may have become irrelevant due to the new configuration (this is not verified in the contract) 
    /// @param _timelockDuration    Duration of timelock, 0 disables the timelock, transactions can be executed directly
    /// @param _throttle            Throttle time, 0 disables the throttling
    /// @param _limitNoTimelock     Value under which a direct ETH transfer does not require a timelock and can be executed directly. 0 forces any direct ETH sent to go through the queue when the timelock is active 
    /// @param clearHashes          Transaction hashes for which to clear the timelock
    function setConfig (uint64 _timelockDuration, uint64 _throttle, uint128 _limitNoTimelock, bytes32[] calldata clearHashes) external {
        checkSender();
        setConfigHelper(_timelockDuration, _throttle, _limitNoTimelock);
        uint256 len = clearHashes.length;
        if(len != 0) {
            unchecked {
                for(uint256 i = 0; i < len; ++i)
                    delete transactions[clearHashes[i]];
            }
            emit TransactionsCleared(clearHashes);
        }

        emit TimelockConfigChanged(_timelockDuration, _throttle, _limitNoTimelock);
    }
    function setConfigHelper(uint64 _timelockDuration, uint64 _throttle, uint128 _limitNoTimelock) private {
        if(_timelockDuration > 1209600 || _throttle > 3600) revert InvalidConfig(_timelockDuration, _throttle);
        timelockConfig.timelockDuration = _timelockDuration;
        timelockConfig.throttle = _throttle;
        timelockConfig.limitNoTimelock = _limitNoTimelock;
    }
    
    /// @notice Mapping of transaction hashes to timestamp after which these transaction can be executed
    /// @notice Using an array allow for several identical transactions to be in the queue at the same time. Timestamp are always in ascending order, and the most recent are cleared first.
    mapping(bytes32 => uint256[]) public transactions;
    
    event TransactionQueued(bytes32 txHash);
    event TransactionCanceled(bytes32 txHash, uint256 timestamp, bytes data, address to, uint256 value, Enum.Operation operation); // Full data is emitted, future optimization would be to store the data off-chain at queue time instead
    event TransactionCleared(bytes32 txHash);
    event TransactionsCleared(bytes32[] txHash);
    event TransactionExecuted(bytes32 txHash);

    function queueTransaction(address to, uint256 value, bytes calldata data, Enum.Operation operation) external {
        checkSender();
        if(block.timestamp < lastQueueTime + timelockConfig.throttle) revert Throttled(block.timestamp, lastQueueTime, timelockConfig.throttle);
        if(noTimelockNeeded(value, data, operation)) revert QueuingNotNeeded(timelockConfig.timelockDuration, timelockConfig.limitNoTimelock, value);
        bytes32 txHash = getTxHash(to, value, data, operation);

        lastQueueTime = block.timestamp;
        transactions[txHash].push(block.timestamp + timelockConfig.timelockDuration);
        emit TransactionQueued(txHash);
    }

    function cancelTransaction(bytes32 txHash, address to, uint256 value, bytes calldata data, Enum.Operation operation, uint256 timestampPos, uint256 timestamp) external {
        checkSender();
        uint256[] storage executesAfter = transactions[txHash];
        uint256 len = executesAfter.length;
        if(timestampPos >= len) revert CancelMisMatch(txHash, timestamp);

        if(executesAfter[timestampPos] == timestamp) {
            if(len == 1)
                delete transactions[txHash];
            else
                shiftAndPop(executesAfter, timestampPos);
            emit TransactionCanceled(txHash, timestamp, data, to, value, operation);
            return;
        }
        for(uint256 i = timestampPos-1; executesAfter[i]>=timestamp; ) {
            if(timestamp == executesAfter[i]) {
                shiftAndPop(executesAfter, i);
                emit TransactionCanceled(txHash, timestamp, data, to, value, operation);
                return;
            }
            if(i==0)    break;
            unchecked { --i; }
        }
        revert CancelMisMatch(txHash, timestamp);        
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
            uint256[] storage executesAfter = transactions[txHash];
            uint256 len = executesAfter.length;
            if(len == 0) revert QueuingNeeded(txHash);
            if(block.timestamp < executesAfter[0]) revert TimeLockActive(txHash, block.timestamp, executesAfter[0]);
            
            // We clear the executeAfter value
            if(len == 1)
                delete transactions[txHash];
            else {
                uint256 i = 1;
                unchecked {
                    while(i < len && block.timestamp > executesAfter[i])
                        ++i;
                }
                shiftAndPop(executesAfter, i-1);
            }
            emit TransactionExecuted(txHash);
        }
    }
    function noTimelockNeeded( uint256 value, bytes calldata data, Enum.Operation operation) private view returns (bool) {
        // We want simple ETH transfers smaller than limitNoTimelock to not require a timelock\
        return timelockConfig.timelockDuration == 0 || (operation == Enum.Operation.Call && (data.length == 0 || (data.length == 1 && data[0] == 0)) && timelockConfig.limitNoTimelock >= value);
    }
    function getTxHash(address to, uint256 value, bytes calldata data, Enum.Operation operation) private pure returns (bytes32) {
        // Only data has a dynamic type so abi.encodePacked can be used and will save some gas compared to abi.encode  
        return keccak256(abi.encodePacked(to, value, data, operation));
    }
}