// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { BaseTimelockGuard } from "./BaseTimelockGuard.sol";

contract TimelockGuard is BaseTimelockGuard {

    constructor(address _safe, uint64 timelockDuration, uint64 throttle, uint128 limitNoTimelock, uint8 _quorumCancel, uint8 _quorumExecute) {
        _initialize(_safe, timelockDuration, throttle, limitNoTimelock, _quorumCancel, _quorumExecute);
    }
}