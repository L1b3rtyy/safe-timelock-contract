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
abstract contract BaseTimelockGuard is BaseGuard {

    string public constant VERSION = "1.3.2";
    string public constant TESTED_SAFE_VERSIONS = "1.4.1";

    error UnAuthorized(address caller, bool reason);
    error ZerodAddess();
    error InvalidConfig(uint64 timelockDuration);
    error QueuingNeeded(bytes32 txHash);
    error QueuingNotNeeded(uint64 timelockDuration, uint128 limitNoTimelock, uint256 value);
    error TimeLockActive(bytes32 txHash);
    error CancelMisMatch(bytes32 txHash); 
    function checkSender() private view {
        if(msg.sender != address(safe)) revert UnAuthorized(msg.sender, true);
    }

    function _initialize(address _safe, uint64 timelockDuration, uint128 limitNoTimelock, uint8 _quorumCancel, uint8 _quorumExecute) internal {
        if(address(_safe) == address(0)) revert ZerodAddess();
        setConfigHelper(timelockDuration, limitNoTimelock, _quorumCancel, _quorumExecute);
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
        MySafe Isafe = MySafe(safe);
        // Skip if the transaction is signed by enough signers to be executed directly
        if(quorumExecute > 0 && signatures.length/65 >= quorumExecute && quorumExecute > Isafe.getThreshold()) {
            checkNSignatures(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, quorumExecute);
            return;
        }
        // allow skipping the queue for queueTransaction or cancelTransaction
        if (to == address(this) && data.length > 3) {
            bytes4 selector = bytes4(data);
            if (selector == this.queueTransaction.selector)
                return;
            else if(selector == this.cancelTransaction.selector) {
                if(quorumCancel == 0)
                    return;
                if(signatures.length/65 < quorumCancel) revert UnAuthorized(executor, false);
                if(quorumCancel > Isafe.getThreshold())
                    checkNSignatures(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures, quorumCancel);
                return;
            }
        }
        // Proceed to mark as executed if the transaction was queued and meets the timelock condition
        validateAndMarkExecuted (to, value, data, operation);
    }
    // ⚠️ This function overwrites the original `signatures` array and returns a shallow slice.
    // The original array must not be used after calling this.
    function sliceShallow(bytes memory signatures, uint256 start, uint256 end) private pure returns (bytes memory result) {
        assembly {
            // Pointer to the start of the slice data
            result := add(signatures, start)
            // Write new length just before the data
            mstore(result, sub(end, start))
        }
    }
    function checkNSignatures(address to, uint256 value, bytes memory data, Enum.Operation operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures, uint256 totalQuorum) private view {
        MySafe Isafe = MySafe(safe);
        bytes32 txHash = Isafe.getTransactionHash(
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
            Isafe.nonce()-1);   // Because it was incremented by the Safe before calling this guard
        // Here we could simply call Isafe.checkNSignatures(txHash, data, signatures, totalQuorum) but we want to save gas by not verifyng again the signtures up to the threshold 
        uint256 threshold = Isafe.getThreshold();
        bytes memory _signatures = sliceShallow(signatures, threshold*65, totalQuorum*65);
        Isafe.checkNSignatures(txHash, data, _signatures, totalQuorum - threshold);
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
    event TimelockConfigChanged();  // Empty event to save on gas as we dont need the history. Check the field of timelockConfig for the new values

    /// Set the configuration for this timelock and allow clearings caches that may have become irrelevant due to the new configuration (this is not verified in the contract) 
    /// @param timelockDuration    Duration of timelock, 0 disables the timelock, transactions can be executed directly
    /// @param limitNoTimelock     Value under which a direct ETH transfer does not require a timelock and can be executed directly. 0 forces any direct ETH sent to go through the queue when the timelock is active 
    /// @param clearHashes          Transaction hashes for which to clear the timelock. Relevant when the config has been changed so no timelock is need for these hashes 
    function setConfig (uint64 timelockDuration, uint128 limitNoTimelock, uint8 _quorumCancel, uint8 _quorumExecute, bytes32[] calldata clearHashes) external {
        checkSender();
        setConfigHelper(timelockDuration, limitNoTimelock, _quorumCancel, _quorumExecute);
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
    function setConfigHelper(uint64 timelockDuration, uint128 limitNoTimelock, uint8 _quorumCancel, uint8 _quorumExecute) internal {
        if(timelockDuration > 1209600) revert InvalidConfig(timelockDuration);
        quorumCancel = _quorumCancel;
        quorumExecute = _quorumExecute;
        timelockConfig.timelockDuration = timelockDuration;
        timelockConfig.limitNoTimelock = limitNoTimelock;
    }
    
    /// @notice Mapping of transaction hashes to timestamp when the transactions have been queued.
    /// @notice Using an array allow for several identical transactions to be in the queue at the same time. Timestamp are always in ascending order, and the most recent are cleared first.
    mapping(bytes32 => uint256[]) public transactions;
    
    event TransactionQueued(bytes32 txHash); // The details of the queued transaction must be retrieved directly from the transaction itself to save gas
    event TransactionCanceled();
    event TransactionCleared(bytes32 txHash);
    event TransactionsCleared();
    event TransactionExecuted(bytes32 txHash, uint256 timestamp);

    function queueTransaction(address to, uint256 value, bytes calldata data, Enum.Operation operation) external {
        checkSender();
        if(noTimelockNeeded(value, data, operation)) revert QueuingNotNeeded(timelockConfig.timelockDuration, timelockConfig.limitNoTimelock, value);
        bytes32 txHash = getTxHash(to, value, data, operation);

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
            emit TransactionCanceled();
            return;
        }
        unchecked {
            for(uint256 i = timestampPos-1; timestamps[i]>=timestamp; ) {
                if(timestamp == timestamps[i]) {
                    shiftAndPop(timestamps, i);
                    emit TransactionCanceled();
                    return;
                }
                if(i==0)    break;
                --i;
            }
        }
        revert CancelMisMatch(txHash);        
    }
    /**
     * @dev Removes the element at `pos` from a storage array, preserving order.
     *      Gas cost is O(len-pos) SLOAD/SSTORE operations.
     *      – Fast bounds-check and loop written in Yul
     *      – Clears the tail slot for the 4 800-gas refund introduced in Istanbul
     *      – If `pos` is the last element we only zero-out that slot and shrink length
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
    function noTimelockNeeded( uint256 value, bytes memory data, Enum.Operation operation) private view returns (bool) {
        // We want simple ETH transfers smaller than limitNoTimelock to not require a timelock
        return timelockConfig.timelockDuration == 0 || (operation == Enum.Operation.Call && (data.length == 0 || (data.length == 1 && data[0] == 0)) && timelockConfig.limitNoTimelock >= value);
    }
    function getTxHash(address to, uint256 value, bytes memory data, Enum.Operation operation) private pure returns (bytes32) {
        // Only data has a dynamic type so abi.encodePacked can be used and will save some gas compared to abi.encode  
        return keccak256(abi.encodePacked(to, value, data, operation));
    }
    /// @notice The minimum quorum needed to cancel a queued transaction. 0 or a value below or equal the default Safe threshold means no specific quorum is needed. 
    uint8 public quorumCancel;
    /// @notice The minimum quorum needed to directly execute a transaction without timelock. 0 disactivate direct execution. A value below or equal the default Safe threshold will allow all transactions to be executed without timelock.
    uint8 public quorumExecute;
}