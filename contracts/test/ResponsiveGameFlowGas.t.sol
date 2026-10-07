// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosGameFlowGasTest} from "./ChaosGameFlowGas.t.sol";
import {ChaosModifiers} from "../src/chaos/ChaosModifiers.sol";
import {ResponsiveChaosModifiers} from "../src/chaos/ResponsiveChaosModifiers.sol";
contract ResponsiveGameFlowGasTest is ChaosGameFlowGasTest {
    function createModifiers() internal override returns(ChaosModifiers){return new ResponsiveChaosModifiers();}
}
