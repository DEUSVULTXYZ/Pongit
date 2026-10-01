// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentArenaTest,ReusableAgentHarness} from "./ReusableAgentArena.t.sol";
import {IndependentHubFixture} from "./Independent.t.sol";
import {PublishedResultVerifier,IReusableAdmissionAuthority} from "../src/independent/PublishedResultVerifier.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

contract ReusableAgentNoLeaseTest is ReusableAgentArenaTest {
    address constant V3=0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e;
    function v3() internal {
        vm.chainId(10143);vm.etch(V3,address(hub).code);hub=IndependentHubFixture(V3);
        verifier=new PublishedResultVerifier(IReusableAdmissionAuthority(address(this)),IInterludeHub(V3));
        arena=new ReusableAgentHarness(IInterludeHub(V3),address(this),vm.addr(BRIDGE),policies,kernel,verifier);
        registeredArena[address(arena)]=true;arena.openEngine();vm.chainId(4242);zeroExpiry(Types.Status.Active,1);
    }
    function zeroExpiry(Types.Status status,uint256 epoch) internal {
        Types.Session memory s=hub.sessionOf(address(arena),bytes32(0));s.expiresAt=0;s.status=status;s.epoch=epoch;
        vm.mockCall(address(hub),abi.encodeWithSelector(IInterludeHub.sessionOf.selector,address(arena),bytes32(0)),abi.encode(s));
    }
    function testZeroExpiryDoesNotAuthorizeLegacyCommands() public {
        zeroExpiry(Types.Status.Active,1);vm.expectRevert("engine session unavailable");arena.preparePublication(1);
    }
    function testNoLeasePublicationAdmissionAndActiveClosureProtection() public {
        v3();arena.preparePublication(1);admit(1,0,false,1,false);start(1,true);
        vm.chainId(10143);vm.expectRevert("published match running");arena.closeEngine();
        vm.chainId(4242);vm.prank(vm.addr(1101));arena.concede(1,1);
        vm.chainId(10143);arena.closeEngine();
        assertEq(uint256(hub.statusOf(address(arena),bytes32(0))),uint256(Types.Status.Exiting));
    }
    function testNoLeaseStillRejectsWrongEpochAndChallenge() public {
        v3();zeroExpiry(Types.Status.Active,2);vm.expectRevert("engine session unavailable");arena.preparePublication(1);
        zeroExpiry(Types.Status.Challenged,1);vm.expectRevert("engine session unavailable");arena.preparePublication(1);
    }
    function testEmptyNoLeaseCanCloseNormally() public {
        v3();arena.preparePublication(1);vm.chainId(10143);arena.closeEngine();
        assertEq(uint256(hub.statusOf(address(arena),bytes32(0))),uint256(Types.Status.Exiting));
    }
}
