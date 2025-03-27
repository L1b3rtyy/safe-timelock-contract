// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { BaseGuard } from "@safe-global/safe-contracts/contracts/base/GuardManager.sol";
import { Enum } from "@safe-global/safe-contracts/contracts/common/Enum.sol";
import "./TimelockModule.sol";

contract TimelockGuard is BaseGuard {
    TimelockModule public immutable timelockModule;

    constructor(address _timelockModule) {
        timelockModule = TimelockModule(_timelockModule);
    }

    function checkTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures,
        address executor
    ) external {
        require(msg.sender == address(timelockModule.safe()), "Only Safe can call guard");

        // Instead of directly executing, enforce queuing explicitly:
        timelockModule.queueTransaction(to, value, data, operation);

        // Revert explicitly to prevent direct execution:
        revert("Transaction queued in TimelockModule; execute after delay");
    }

    function checkAfterExecution(bytes32 txHash, bool success) external {
        // No action needed here
    }
}