// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IndependentEventsArenaTest} from "./IndependentEventsArena.t.sol";
import {IndependentEventsArena} from "../src/independent/IndependentEventsArena.sol";
import {ReadyIndependentEventsArena} from "../src/independent/ReadyIndependentEventsArena.sol";
import {ReadyIndependentEventsLobby} from "../src/independent/ReadyIndependentEventsLobby.sol";
import {IndependentLobby} from "../src/independent/IndependentLobby.sol";
import {IndependentTypes as T} from "../src/independent/IndependentTypes.sol";
import {ChaosEngine} from "../src/chaos/ChaosEngine.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";

contract ReadyIndependentEventsArenaTest is IndependentEventsArenaTest {
    function makeLobby() internal override returns(IndependentLobby){return new ReadyIndependentEventsLobby(family,IInterludeHub(address(hub)),address(this),vm.addr(900));}
    function makeArena(ChaosEngine kernel) internal override returns(IndependentEventsArena){return new ReadyIndependentEventsArena(IInterludeHub(address(hub)),address(lobby),vm.addr(900),kernel);}
    function expectedRules() internal pure override returns(uint256){return 13;}
    function acknowledge(IndependentEventsArena arena,uint256 id) internal override {
        T.Binding memory b=arena.boundMatch();
        vm.prank(b.keyA);ReadyIndependentEventsArena(address(arena)).confirmReady(id);
        vm.prank(b.keyB);ReadyIndependentEventsArena(address(arena)).confirmReady(id);
    }
    function prepared() internal returns(ReadyIndependentEventsArena arena,uint256 id){
        id=propose(101,102,0);arena=ReadyIndependentEventsArena(lobby.assignNext());
        vm.roll(block.number+1);lobby.openArena(id);vm.chainId(4242);
    }
    function testOnlyBothScopedParticipantsCanArmCountdown() public {
        (ReadyIndependentEventsArena arena,uint256 id)=prepared();
        arena.start();(uint8 mask,uint64 deadline)=arena.readiness(id);assertEq(mask,0);assertEq(deadline,block.timestamp+30);assertEq(arena.launchAt(id),0);
        vm.expectRevert("unbound or expired human control");vm.prank(vm.addr(101));arena.confirmReady(id);
        vm.expectRevert("current unstarted match");vm.prank(vm.addr(1101));arena.confirmReady(id+1);
        vm.prank(vm.addr(1101));arena.confirmReady(id);vm.prank(vm.addr(1101));arena.confirmReady(id);
        vm.warp(block.timestamp+10);arena.start();assertEq(arena.launchAt(id),0);(mask,)=arena.readiness(id);assertEq(mask,1);
        vm.prank(vm.addr(1102));arena.confirmReady(id);arena.start();assertEq(arena.launchAt(id),block.timestamp+3);
        vm.expectRevert("match ready or ended");arena.cancelUnready(id);
        vm.expectRevert("countdown pending");arena.start();vm.warp(block.timestamp+3);arena.start();
        vm.expectRevert("current unstarted match");vm.prank(vm.addr(1101));arena.confirmReady(id);
    }
    function testMissingReadyCancelsWithoutWinnerOrEloAndPublishesForRecovery() public {
        (ReadyIndependentEventsArena arena,uint256 id)=prepared();arena.start();
        vm.prank(vm.addr(1101));arena.confirmReady(id);vm.warp(block.timestamp+30);
        vm.expectRevert("loading deadline pending");arena.cancelUnready(id);vm.warp(block.timestamp+1);
        vm.expectRevert("loading deadline expired");vm.prank(vm.addr(1102));arena.confirmReady(id);
        arena.start();assertEq(arena.launchAt(id),0);arena.cancelUnready(id);
        T.Result memory r=arena.publishedResult();assertEq(r.status,4);assertEq(r.winner,address(0));assertEq(arena.activeCount(),0);
        vm.chainId(10143);hub.publish(address(arena));lobby.capture(id);
        assertEq(ratings.entry(id).first.status,4);assertEq(ratings.ratingOf(vm.addr(101),0).played,0);assertEq(lobby.activeMatchOf(vm.addr(101)),0);
    }
    function testProvisioningDelayDoesNotConsumeLoadingAllowance() public {
        (ReadyIndependentEventsArena arena,uint256 id)=prepared();vm.warp(block.timestamp+240);
        (,uint64 before_)=arena.readiness(id);assertEq(before_,0);arena.start();
        (,uint64 after_)=arena.readiness(id);assertEq(after_,block.timestamp+30);
        acknowledge(arena,id);arena.start();assertEq(arena.launchAt(id),block.timestamp+3);
    }
}
