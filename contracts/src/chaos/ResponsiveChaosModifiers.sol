// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosModifiers} from "./ChaosModifiers.sol";

/// Rules 17: unchanged effects and geometry, 300 units/s before multipliers.
contract ResponsiveChaosModifiers is ChaosModifiers {
    function baseSpeed() public pure override returns(uint256){return 300_000_000;}
}
