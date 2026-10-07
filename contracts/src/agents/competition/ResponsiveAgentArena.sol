// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {SynchronizedAgentArena} from "./SynchronizedAgentArena.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {HousePolicies} from "./HousePolicies.sol";
import {ChaosEngine} from "../../chaos/ChaosEngine.sol";
import {PublishedResultVerifier} from "../../independent/PublishedResultVerifier.sol";

/// New immutable generation; previous match references retain rules 15/16.
contract ResponsiveAgentArena is SynchronizedAgentArena {
    constructor(IInterludeHub h,address authority,address admissions,HousePolicies house,
        ChaosEngine physics,PublishedResultVerifier verifier)
        SynchronizedAgentArena(h,authority,admissions,house,physics,verifier){
        require(physics.physics().dynamics().modifiers().baseSpeed()==300_000_000,"responsive Chaos rules required");
    }
    function RULES_VERSION() public pure override returns(uint256){return 17;}
}
