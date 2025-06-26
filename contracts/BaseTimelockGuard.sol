// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { BaseGuard } from "@safe-global/safe-contracts/contracts/base/GuardManager.sol";
import { Enum } from "@safe-global/safe-contracts/contracts/common/Enum.sol";
interface MySafe {
    function getThreshold() external view returns (uint256);
    function nonce() external view returns (uint256);
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 nonce
    ) external view returns (bytes32);
    function checkNSignatures(bytes32 dataHash, bytes memory data, bytes memory signatures, uint256 requiredSignatures) external view;   
}
/// @title Safe Timelock Guard 
/// @notice Once in place the SafeTimelock will:
/// 1. Force 'most' transactions to be queued first for a given time span, before they can be executed
/// 2. Allow cancelling queued transactions
/// 3. Allow bypassing the timelock for transactions matching some pre-configured conditions 
/// Main configuration parameters are:
/// - timelockDuration: duration of the timelock in seconds, 0 disables the timelock
/// - throttle: duration enforced between queued transaction, 0 disables this feature.
/// - limitNoTimelock: limit in Wei under which a simple transfer is allowed without timelock, 0 disables this feature
/// - quorumCancel: the number of signatures needed to cancel a queued transaction. Not relevant if equal or under the Safe's threshold
/// - quorumExecute: the number of signatures needed to execute any transaction directly without timelock. Not relevant if equal or under the Safe's threshold
/// Typically you would have threshold < quorumCancel <= quorumExecute <= nb owners. This is not enforced in the contract
///  
/// Example values for Safe 2/5 (5 owners, 2 signatures required):
/// - timelockDuration = 172800               // 2 days
/// - throttle = 180                          // 3 minutes
/// - limitNoTimelock = 1                     // 1 ETH
/// - quorumCancel = 3
/// - quorumExecute = 4
///  
///  Note: once set, all transactions except queuing and cancelling are subject to a timelock, including changing any of the parameters above or removing/upgrading the guard.
abstract contract BaseTimelockGuard is BaseGuard {

    // Use string for readability
    string public constant VERSION = "1.5.3";
    string public constant TESTED_SAFE_VERSIONS = "1.4.1";

    /// @notice Maximum number of queued transactions per hash. This is a limit to avoid excessive gas usage in the queue
    uint8 public constant MAX_QUEUE = 100;

    enum UNAUTHORIZED_REASONS{SENDER, REINITIALIZE, SIGNATURES, DATA}       // solhint-disable-line contract-name-capwords
    error UnAuthorized(address caller, UNAUTHORIZED_REASONS reason);
    error ZeroAddress();
    error InvalidConfig();
    error Throttled(uint256 timestamp, uint256 lastQueueTime, uint64 throttle);
    error QueuingNeeded(bytes32 txHash);
    error QueuingNotNeeded(uint64 timelockDuration, uint128 limitNoTimelock);
    error TimeLockActive(bytes32 txHash);
    error CancelMisMatch(); 
    error MaxQueue();
    function checkSender() private view {
        if(msg.sender != address(safe)) revert UnAuthorized(msg.sender, UNAUTHORIZED_REASONS.SENDER);
    }

    /// @dev Any contract that inherits from this contract must call this function
    /// - from its constructor if non upgradable
    /// - from its initialize function if upgradable
    /// We do not put the  keyword 'onlyInitializing' here so that non upgradable contract can inherit from this contract
    function _initialize(address _safe, uint64 timelockDuration, uint64 throttle, uint128 limitNoTimelock, uint8 _quorumCancel, uint8 _quorumExecute) internal {
        if(address(safe) != address(0)) revert UnAuthorized(msg.sender, UNAUTHORIZED_REASONS.REINITIALIZE);
        if(address(_safe) == address(0)) revert ZeroAddress();
        setConfigHelper(timelockDuration, throttle, limitNoTimelock, _quorumCancel, _quorumExecute);
        safe = _safe;
    }

    function checkTransaction(
        address to, 
        uint256 value, 
        bytes memory data, 
        Enum.Operation operation, 
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures,
        address executor ) external {
        checkSender();
        MySafe mySafe = MySafe(safe);
        // Skip if the transaction is signed by enough signers to be executed directly
        if(signatures.length >= uint16(quorumExecute)*65 && quorumExecute > mySafe.getThreshold()) {
            checkNSignatures(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, quorumExecute);
            return;
        }
        // allow skipping the queue for queueTransaction or cancelTransaction
        if (to == address(this)) {
            if(data.length < 4) revert UnAuthorized(executor, UNAUTHORIZED_REASONS.DATA);
            bytes4 selector = bytes4(data);
            if (selector == this.queueTransaction.selector)
                return;
            else if(selector == this.cancelTransaction.selector) {
                if(quorumCancel == 0)
                    return;
                if(signatures.length < uint16(quorumCancel)*65) revert UnAuthorized(executor, UNAUTHORIZED_REASONS.SIGNATURES);
                if(quorumCancel > mySafe.getThreshold())
                    checkNSignatures(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, quorumCancel);
                return;
            }
        }
        // Proceed to mark as executed if the transaction was queued and meets the timelock condition
        validateAndMarkExecuted (to, value, data, operation);
    }
    function checkNSignatures(address to, uint256 value, bytes memory data, Enum.Operation operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures, uint256 totalQuorum) private view {
        MySafe mySafe = MySafe(safe);
        bytes32 txHash = mySafe.getTransactionHash(
            // Transaction info
            to,
            value,
            data,
            operation,
            // Payment info
            safeTxGas,
            baseGas,
            gasPrice,
            gasToken,
            refundReceiver,
            // Signature info
            mySafe.nonce()-1);   // Because it was incremented by the Safe before calling this guard
        // We have to re-verify all signatures as there is no easy other way to check whether the additional provided signatures above the threshold are from different owners
        mySafe.checkNSignatures(txHash, data, signatures, totalQuorum);
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
    uint256 internal lastQueueTime;
    event TimelockConfigChanged();  // Empty event to save on gas as we don't need the history. Check the field of timelockConfig for the new values

    /// @notice Set the configuration for this timelock and allow clearing hashes that are irrelevant due to the new configuration (this is not verified in the contract) 
    /// @param clearHashes Transaction hashes for which to clear the timelock. Relevant when the config has been changed so no timelock is need for these hashes 
    function setConfig (uint64 timelockDuration, uint64 throttle, uint128 limitNoTimelock, uint8 _quorumCancel, uint8 _quorumExecute, bytes32[] calldata clearHashes) external {
        checkSender();
        setConfigHelper(timelockDuration, throttle, limitNoTimelock, _quorumCancel, _quorumExecute);
        uint256 len = clearHashes.length;
        if(len != 0) {
            unchecked {
                for(uint256 i = 0; i < len; ++i)
                    delete transactions[clearHashes[i]];
            }
            emit TransactionsCleared();
        }
        emit TimelockConfigChanged();
    }
    function setConfigHelper(uint64 timelockDuration, uint64 throttle, uint128 limitNoTimelock, uint8 _quorumCancel, uint8 _quorumExecute) internal {
        if(timelockDuration > 1209600 || throttle > 3600) revert InvalidConfig();
        quorumCancel = _quorumCancel;
        quorumExecute = _quorumExecute;
        timelockConfig.timelockDuration = timelockDuration;
        timelockConfig.throttle = throttle;
        timelockConfig.limitNoTimelock = limitNoTimelock;
    }
    
    /// @notice Mapping of transaction hashes to timestamp when the transactions have been queued.
    /// Using an array allow for several identical transactions to be in the queue at the same time. Timestamp are always in ascending order, and the most recent are cleared first.
    mapping(bytes32 => uint256[]) public transactions;
    function getTransactions(bytes32 txHash) external view returns (uint256[] memory) {
        return transactions[txHash];
    }
    // No need to index anything here as the events are not used for querying. The Safe UX already displays all executed transactions.
    event TransactionQueued(bytes32 txHash);    // The details of the queued transaction must be retrieved directly from the transaction itself to save gas
    event TransactionCanceled();
    event TransactionCleared(bytes32 txHash);
    event TransactionsCleared();
    event TransactionExecuted(bytes32 txHash, uint256 timestamp);

    /// @notice Queues a transaction to be executed after the timelock duration.
    function queueTransaction(address to, uint256 value, bytes calldata data, Enum.Operation operation) external {
        checkSender();
        // Yes miners can manipulate block timestamps by up to a few minutes, but to continuously skip the throttle would require time manipulation over each block, unfeasible as the #blocks increases.
        // An attacker could DoS the contract by continuously queuing transactions when the throttle time is over. But without throttling an attacker could continuously queue transactions consuming the Safe's nonce as soon as available, an even worse DoS.
        // The attack is anyway remediated by an emergency change of owners using a number of signatures > quorumExecute > threshold, skipping the queue
        // <= to allow multisend
        if(block.timestamp <= lastQueueTime + timelockConfig.throttle) revert Throttled(block.timestamp, lastQueueTime, timelockConfig.throttle);
        if(noTimelockNeeded(value, data, operation)) revert QueuingNotNeeded(timelockConfig.timelockDuration, timelockConfig.limitNoTimelock);
        bytes32 txHash = getTxHash(to, value, data, operation);

        uint256[] storage timestamps = transactions[txHash];
        if(timestamps.length == MAX_QUEUE) revert MaxQueue();
        lastQueueTime = block.timestamp;
        timestamps.push(block.timestamp);
        emit TransactionQueued(txHash);
    }

    /// @notice Cancels a queued transaction identified by its hash and timestamp. Only exact match are cancelled, ow the transaction is reverted.
    /// @dev Several transactions can have the same hash and timestamp, in this case one of the then will be cancelled.
    /// @param txHash The hash of the transaction to cancel
    /// @param timestampPos The position of the timestamp in transactions[txHash]. Used to speed up the search for the timestamp in the array.
    /// @param timestamp The timestamp to match in transactions[txHash]
    function cancelTransaction(bytes32 txHash, uint256 timestampPos, uint256 timestamp) external {
        checkSender();
        uint256[] storage timestamps = transactions[txHash];
        uint256 len = timestamps.length;
        if(timestampPos >= len) revert CancelMisMatch();

        if(timestamps[timestampPos] == timestamp) {
            shiftAndPop(timestamps, timestampPos);
            emit TransactionCanceled();
        }
        else revert CancelMisMatch();        
    }
    /**
     * @dev Removes the element at `pos` from a storage array, preserving order.
     *      Gas cost is O(len-pos) SLOAD/SSTORE operations.
     *      – Fast bounds-check and loop written in Yul
     *      – Clears the tail slot for the 4 800-gas refund introduced in Istanbul
     *      – If `pos` is the last element we only zero-out that slot and shrink length
     *      
     *      An attacker with queueing rights could make this very expensive by queuing up to MAX_QUEUE transactions.
     *      However the setConfig function allows to clear the queue, which can be executed immediately provider quorumExecute is above threshold and enough signatures are provided. 
     */
    function shiftAndPop(uint256[] storage arr, uint256 pos) internal {
        assembly {
            // Load current length
            let len := sload(arr.slot)

            // Index of the last valid element
            let lastIdx := sub(len, 1)

            // Compute the storage slot of element 0: keccak256(arrSlot)
            mstore(0x00, arr.slot)
            let base := keccak256(0x00, 0x20)

            // two cases: removing last element vs. shifting
            if lt(pos, lastIdx) {
                // shift left: arr[i] = arr[i+1]  for i = pos … lastIdx-1
                for { let i := pos } lt(i, lastIdx) { i := add(i, 1) } {
                    sstore(add(base, i), sload(add(base, add(i, 1))))
                }
            }

            // clear the (old) last slot
            sstore(add(base, lastIdx), 0)

            // shorten length
            sstore(arr.slot, lastIdx)
        }
    }
    /// @notice Clear a transaction from the queue and mark it as executed. Reverts if the transaction is not queued or if the timelock is still active.
    function validateAndMarkExecuted (address to, uint256 value, bytes memory data, Enum.Operation operation) private {
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
            // Yes miners can manipulate block timestamps by up to a few minutes, but a timelock is typically a few days, so this is not an issue
            if(executeFrom < timestamps[0]) revert TimeLockActive(txHash);
            
            // We clear the corresponding value
            unchecked {
                uint256 i = 1;
                while(i < len && executeFrom >= timestamps[i])
                    ++i;
                emit TransactionExecuted(txHash, timestamps[i-1]);
                shiftAndPop(timestamps, i-1);
            }
        }
    }
    function noTimelockNeeded( uint256 value, bytes memory data, Enum.Operation operation) private view returns (bool) {
        // We want simple ETH transfers smaller than limitNoTimelock to not require a timelock
        return timelockConfig.timelockDuration == 0 || (operation == Enum.Operation.Call && data.length == 0 && timelockConfig.limitNoTimelock >= value);
    }
    function getTxHash(address to, uint256 value, bytes memory data, Enum.Operation operation) private pure returns (bytes32) {
        // Only data has a dynamic type so abi.encodePacked can be used and will save some gas compared to abi.encode  
        return keccak256(abi.encodePacked(to, value, data, operation));
    }
    uint8 public quorumCancel;
    uint8 public quorumExecute;
}