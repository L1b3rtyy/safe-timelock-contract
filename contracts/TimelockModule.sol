// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Enum} from "@safe-global/safe-contracts/contracts/common/Enum.sol";
import {ISafe} from "./ISafe.sol";

contract TimelockModule {
    ISafe public immutable safe;
    address public guard;
    uint256 public timelockDuration;
    // uint256 public requiredCancelQuorum;

    function setGuard(address _guard) external {
        require(msg.sender == address(safe), "Only Safe can set guard");
        require(_guard != address(0), "Invalid guard");
        guard = _guard;
    }

    function settimelockDuration(uint256 _timelockDuration) external {
        require(msg.sender == address(safe), "Only Safe can set timelockDuration");
        require(_timelockDuration > 0, "Timelock duration required");
        timelockDuration = _timelockDuration;
    }

    struct TimelockedTx {
        address to;
        uint256 value;
        bytes data;
        Enum.Operation operation;
        uint256 executeAfter;
        bool canceled;
        bool isValue;
    }

    mapping(bytes32 => TimelockedTx) public transactions;

    event TransactionQueued(bytes32 indexed txHash);
    // event TransactionCanceled(bytes32 indexed txHash, address[] signers);
    event TransactionExecuted(bytes32 indexed txHash);

    constructor(ISafe _safe, uint256 _timelockDuration) { //}, uint256 _requiredCancelQuorum) {
        require(address(_safe) != address(0), "Invalid Safe address");
        // require(_requiredCancelQuorum > 0, "Cancel quorum required");
        require(_timelockDuration > 0, "Timelock duration required");
        safe = _safe;
        timelockDuration = _timelockDuration;
        // requiredCancelQuorum = _requiredCancelQuorum;
    }

    function queueTransaction(address to, uint256 value, bytes memory data, Enum.Operation operation) public returns (bytes32) {
        require(msg.sender == guard, "Only guard can call");

        bytes32 txHash = keccak256(abi.encode(to, value, data, operation, block.timestamp));
        uint256 executeAfter = block.timestamp + timelockDuration;

        transactions[txHash] = TimelockedTx({
            to: to,
            value: value,
            data: data,
            operation: operation,
            executeAfter: executeAfter,
            canceled: false,
            isValue: true
        });

        emit TransactionQueued(txHash);
        return txHash;
    }

    // function cancelTransaction(bytes32 txHash, bytes calldata signatures) public {
    //     TimelockedTx storage txn = transactions[txHash];
    //     require(!txn.canceled, "Invalid or already canceled");

    //     bytes memory txData = abi.encodePacked(txHash, "\x19\x01", address(this));
    //     bytes32 messageHash = keccak256(txData);

    //     uint256 signatureLength = 65; // standard signature length
    //     require(signatures.length % signatureLength == 0, "Invalid signatures length");
    //     uint256 signerCount = signatures.length / signatureLength;

    //     address[] memory signers = new address[](signerCount);

    //     for (uint256 i = 0; i < signerCount; i++) {
    //         bytes memory sig = signatures[i * signatureLength:(i + 1) * signatureLength];
    //         (address recoveredSigner, ECDSA.RecoverError err, ) = ECDSA.tryRecover(messageHash, sig);
    //         require(err == ECDSA.RecoverError.NoError, "Invalid signature");
    //         signers[i] = recoveredSigner;
    //     }

    //     safe.checkNSignatures(txHash, txData, signatures, requiredCancelQuorum);

    //     txn.canceled = true;
    //     emit TransactionCanceled(txHash, signers);
    // }

    function executeTransaction(bytes32 txHash) public {
        TimelockedTx storage txn = transactions[txHash];
        require(!txn.isValue, "Invalid transaction hash");
        require(block.timestamp >= txn.executeAfter, "Timelock active");
        require(!txn.canceled, "Transaction canceled");

        require(safe.execTransactionFromModule(txn.to, txn.value, txn.data, txn.operation), "Transaction failed");

        delete transactions[txHash];

        emit TransactionExecuted(txHash);
    }
}