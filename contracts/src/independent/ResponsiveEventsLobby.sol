// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableEventsLobby} from "./ReusableEventsLobby.sol";
import {ArcadeFamily} from "./ArcadeFamily.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
import {AuthorityStore as S} from "../autonomous/AuthorityStore.sol";

contract ResponsiveEventsLobby is ReusableEventsLobby {
    constructor(ArcadeFamily family_,IInterludeHub h,address admin,address admissions,address pressure,uint128 generation)
        ReusableEventsLobby(family_,h,admin,admissions,pressure){
        require(generation>1,"distinct result generation");S.set(words,100,0,0,generation);
    }
    function arenaRulesVersion() public pure override returns(uint256){return 18;}
}
