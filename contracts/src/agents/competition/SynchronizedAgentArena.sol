// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentArena} from "./ReusableAgentArena.sol";
import {IInterludeHub} from "../../../vendor/interlude/interfaces/IInterludeHub.sol";
import {HousePolicies} from "./HousePolicies.sol";
import {ChaosEngine} from "../../chaos/ChaosEngine.sol";
import {PublishedResultVerifier} from "../../independent/PublishedResultVerifier.sol";
import {ReusableAgentView as View} from "./ReusableAgentView.sol";

/// New immutable generation. Historic rules-15 matches retain their original
/// contracts and timeout behavior; only rules-16 friendly house games pause.
contract SynchronizedAgentArena is ReusableAgentArena {
    constructor(IInterludeHub protocol,address authority,address admissions,HousePolicies house,
        ChaosEngine physics,PublishedResultVerifier verifier)
        ReusableAgentArena(protocol,authority,admissions,house,physics,verifier){}
    function RULES_VERSION() public pure override returns(uint256){return 16;}
    function synchronizedState(uint256 id) external view returns(bytes memory){
        return View.synchronizedState(words,kernel,id,isEphemeral());
    }
}
