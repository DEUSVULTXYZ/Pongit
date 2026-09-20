// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IndependentEventsLobby} from "./IndependentEventsLobby.sol";
import {ArcadeFamily} from "./ArcadeFamily.sol";
import {IInterludeHub} from "../../vendor/interlude/interfaces/IInterludeHub.sol";
contract ReadyIndependentEventsLobby is IndependentEventsLobby {
    constructor(ArcadeFamily f,IInterludeHub h,address admin,address bridge) IndependentEventsLobby(f,h,admin,bridge) {}
    function arenaRulesVersion() public pure override returns(uint256){return 13;}
}
