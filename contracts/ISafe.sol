// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Enum} from "@safe-global/safe-contracts/contracts/common/Enum.sol";

interface ISafe {
    function execTransactionFromModule(address to, uint256 value, bytes calldata data, Enum.Operation operation) external returns (bool);
    function checkNSignatures(bytes32 dataHash, bytes memory txData, bytes memory signatures, uint256 requiredSignatures) external view;
}