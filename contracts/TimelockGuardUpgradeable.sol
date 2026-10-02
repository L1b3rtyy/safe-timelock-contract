// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { BaseTimelockGuard } from "./BaseTimelockGuard.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract TimelockGuardUpgradeable is BaseTimelockGuard, Initializable {

    // The contract is meant to be deployed with the Safe owning the ProxyAdmin contract so upgrading the guard will require a timelock
    // initialize is meant to be called at deployment
    function initialize(address _safe, uint64 timelockDuration, uint64 throttle, uint128 limitNoTimelock, uint64 minTimeNoTimelock, uint8 _quorumCancel, uint8 _quorumExecute) public initializer {
        _initialize(_safe, timelockDuration, throttle, limitNoTimelock, minTimeNoTimelock, _quorumCancel, _quorumExecute);
    }
}