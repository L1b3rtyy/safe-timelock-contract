// SPDX-License-Identifier: MIT
// Only exists for the test suite: to test a second call to initialize with BaseTimelockGuard
pragma solidity ^0.8.28;

import { BaseTimelockGuard } from "./BaseTimelockGuard.sol";

contract TimelockGuardUpgradeableHack is BaseTimelockGuard {

    function initialize(address _safe, uint64 timelockDuration, uint64 throttle, uint128 limitNoTimelock, uint8 _quorumCancel, uint8 _quorumExecute) public {
        _initialize(_safe, timelockDuration, throttle, limitNoTimelock, _quorumCancel, _quorumExecute);
    }
}