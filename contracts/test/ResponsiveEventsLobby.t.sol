// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableEventsLobbyTest} from "./ReusableEventsLobby.t.sol";
import {ResponsiveEventsLobby} from "../src/independent/ResponsiveEventsLobby.sol";
import {ReusableEventsLobby} from "../src/independent/ReusableEventsLobby.sol";
import {ResponsiveEventsArena} from "../src/independent/ResponsiveEventsArena.sol";
import {ReusableEventsArena} from "../src/independent/ReusableEventsArena.sol";
import {ResponsiveChaosModifiers} from "../src/chaos/ResponsiveChaosModifiers.sol";
import {ChaosModifiers} from "../src/chaos/ChaosModifiers.sol";
import {ChaosEngine} from "../src/chaos/ChaosEngine.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
contract ResponsiveEventsLobbyTest is ReusableEventsLobbyTest {
    function createLobby() internal override returns(ReusableEventsLobby){
        return new ResponsiveEventsLobby(family,IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE),vm.addr(813),2);
    }
    function createModifiers() internal override returns(ChaosModifiers){return new ResponsiveChaosModifiers();}
    function createArena(ChaosEngine kernel) internal override returns(ReusableEventsArena){
        return new ResponsiveEventsArena(IInterludeHub(address(hub)),address(lobby),vm.addr(BRIDGE),vm.addr(813),kernel,verifier);
    }
    function testNewIdsCannotShadowImportedHumanResults() public {
        (uint256 room_,uint256 id)=roomAndProposal(0);assertEq(room_>>128,2);assertEq(id>>128,2);
        assertEq(lobby.arenaRulesVersion(),18);
    }
}
