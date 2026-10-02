// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableEventsLobbyTest} from "./ReusableEventsLobby.t.sol";
import {ReusableEventsArena} from "../src/independent/ReusableEventsArena.sol";
import {ProvisionedReusableEventsArena} from "../src/labs/ProvisionedReusableEventsArena.sol";
import {ChaosEngine} from "../src/chaos/ChaosEngine.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Delegatable} from "../vendor/interlude/Delegatable.sol";

/// Replays all lobby admission, capture and recovery tests with distinct hosting
/// consent. The EOA must not become the delegated or financial authority.
contract ProvisionedReusableEventsArenaTest is ReusableEventsLobbyTest {
    function createArena(ChaosEngine kernel) internal override returns(ReusableEventsArena){
        return new ProvisionedReusableEventsArena(IInterludeHub(address(hub)),address(lobby),vm.addr(BRIDGE),vm.addr(813),kernel,verifier,vm.addr(678));
    }
    function testHostingConsentCannotOpenCloseOrDelegate() public {
        address signer=vm.addr(678);
        assertEq(arena.owner(),signer);assertEq(arena.lifecycleOwner(),address(lobby));
        assertLe(address(arena).code.length,24_576,"human hosted runtime budget");
        bytes[] memory forbidden=new bytes[](6);
        forbidden[0]=abi.encodeWithSignature("delegateAll()");
        forbidden[1]=abi.encodeWithSignature("delegateKey(bytes32)",bytes32(0));
        forbidden[2]=abi.encodeWithSignature("delegateAllTo(address)",address(7));
        forbidden[3]=abi.encodeWithSignature("delegateKeyTo(bytes32,address)",bytes32(0),address(7));
        forbidden[4]=abi.encodeWithSignature("undelegate(bytes32)",bytes32(0));
        forbidden[5]=abi.encodeWithSignature("delegateRaw(bytes32,bytes32[],bytes32[],address)",bytes32(0),new bytes32[](0),new bytes32[](0),address(7));
        for(uint i;i<forbidden.length;i++){
            vm.prank(signer);(bool ok,bytes memory reason)=address(arena).call(forbidden[i]);
            assertFalse(ok);assertEq(reason,abi.encodeWithSelector(Delegatable.OnlyOwner.selector));
        }
        vm.prank(signer);vm.expectRevert("released authority only");arena.openEngine();
        vm.prank(signer);vm.expectRevert("authority only");arena.closeEngine();
    }
}
