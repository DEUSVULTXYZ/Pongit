// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableEventsLobbyTest} from "./ReusableEventsLobby.t.sol";
import {IndependentHubFixture} from "./Independent.t.sol";
import {ReusableAdmission as Admission} from "../src/independent/ReusableAdmission.sol";
import {IndependentTypes as T} from "../src/independent/IndependentTypes.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

contract ReusableHumanNoLeaseTest is ReusableEventsLobbyTest {
    address constant V3=0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e;
    function createHub() internal override returns(IndependentHubFixture){
        IndependentHubFixture template=new IndependentHubFixture();
        vm.etch(V3,address(template).code);return IndependentHubFixture(V3);
    }
    function zeroExpiry(Types.Status status,uint256 epoch) internal {
        Types.Session memory s=hub.sessionOf(address(arena),bytes32(0));s.expiresAt=0;s.status=status;s.epoch=epoch;
        vm.mockCall(V3,abi.encodeWithSelector(IInterludeHub.sessionOf.selector,address(arena),bytes32(0)),abi.encode(s));
    }
    function testNoLeaseHumanAdmissionDoesNotExpireOrAllowActiveClosure() public {
        zeroExpiry(Types.Status.Active,1);(,uint256 id)=roomAndProposal(1);
        assertEq(lobby.assignNext(),address(arena));
        (Admission.Ticket memory t,T.Binding memory b)=lobby.ticketOf(id);
        vm.chainId(4242);arena.admit(t,b,sig(BRIDGE,Admission.digest(t)));
        vm.prank(b.keyA);arena.confirmReady(1,id);vm.prank(b.keyB);arena.confirmReady(1,id);arena.start(1,id);
        vm.warp(vm.getBlockTimestamp()+3);vm.roll(vm.getBlockNumber()+300);arena.start(1,id);
        vm.chainId(10143);vm.expectRevert("not expired");lobby.recoverExpired(id);
        vm.prank(vm.addr(999));vm.expectRevert("session still admitting");lobby.closeReusableArena(address(arena));
        vm.expectRevert("published match running");lobby.closeReusableArena(address(arena));
        vm.chainId(4242);vm.prank(b.keyB);arena.concede(1,id);
        vm.chainId(10143);lobby.closeReusableArena(address(arena));
        assertEq(uint256(hub.statusOf(address(arena),0)),uint256(Types.Status.Exiting));
    }
    function testNoLeaseHumanAdmissionStillChecksEpochAndStatus() public {
        zeroExpiry(Types.Status.Active,1);(,uint256 id)=roomAndProposal(0);
        assertEq(lobby.assignNext(),address(arena));
        (Admission.Ticket memory t,T.Binding memory b)=lobby.ticketOf(id);bytes memory signature=sig(BRIDGE,Admission.digest(t));
        vm.chainId(4242);zeroExpiry(Types.Status.Active,2);
        vm.expectRevert("engine session unavailable");arena.admit(t,b,signature);
        zeroExpiry(Types.Status.Challenged,1);
        vm.expectRevert("engine session unavailable");arena.admit(t,b,signature);
        zeroExpiry(Types.Status.Active,1);arena.admit(t,b,signature);
        assertEq(arena.getSnapshot(id).id,id);
    }
    function testNoLeaseEmptyHumanArenaClosesOnlyFromOwner() public {
        zeroExpiry(Types.Status.Active,1);
        vm.prank(vm.addr(999));vm.expectRevert("session still admitting");lobby.closeReusableArena(address(arena));
        lobby.closeReusableArena(address(arena));
        assertEq(uint256(hub.statusOf(address(arena),0)),uint256(Types.Status.Exiting));
    }
}

contract ReusableHumanUnknownLeaseTest is ReusableEventsLobbyTest {
    function testUnknownZeroExpiryNeverAssignsHumanMatch() public {
        Types.Session memory s=hub.sessionOf(address(arena),bytes32(0));s.expiresAt=0;
        vm.mockCall(address(hub),abi.encodeWithSelector(IInterludeHub.sessionOf.selector,address(arena),bytes32(0)),abi.encode(s));
        roomAndProposal(0);assertEq(lobby.assignNext(),address(0));
    }
}
