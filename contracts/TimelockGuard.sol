// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { BaseTimelockGuard } from "./BaseTimelockGuard.sol";

contract TimelockGuard is BaseTimelockGuard {

    constructor(address _safe, uint64 timelockDuration, uint64 throttle, uint128 limitNoTimelock, uint64 minTimeNoTimelock, uint8 _quorumCancel, uint8 _quorumExecute) {
        _initialize(_safe, timelockDuration, throttle, limitNoTimelock, minTimeNoTimelock, _quorumCancel, _quorumExecute);
    }
}