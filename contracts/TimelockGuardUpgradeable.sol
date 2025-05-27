// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { BaseTimelockGuard } from "./BaseTimelockGuard.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract TimelockGuardUpgradeable is BaseTimelockGuard, Initializable {

    function initialize(address _safe, uint64 timelockDuration, uint128 limitNoTimelock, uint8 _quorumCancel, uint8 _quorumExecute) public initializer {
        super._initialize(_safe, timelockDuration, limitNoTimelock, _quorumCancel, _quorumExecute);
    }
}