// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableEventsArena} from "./ReusableEventsArena.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {ChaosEngine} from "../chaos/ChaosEngine.sol";
import {PublishedResultVerifier} from "./PublishedResultVerifier.sol";

contract ResponsiveEventsArena is ReusableEventsArena {
    constructor(IInterludeHub h,address authority,address admissions,address pressure,ChaosEngine physics,PublishedResultVerifier verifier)
        ReusableEventsArena(h,authority,admissions,pressure,physics,verifier){
        require(physics.physics().dynamics().modifiers().baseSpeed()==300_000_000,"responsive Chaos rules required");
    }
    function RULES_VERSION() public pure override returns(uint256){return 18;}
}
