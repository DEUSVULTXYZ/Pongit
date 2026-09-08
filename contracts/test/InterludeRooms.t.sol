// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {PongInterludeRooms} from "../src/labs/PongInterludeRooms.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
contract InterludeRoomsTest is Test {
    PongInterludeRooms g;
    uint256 constant KEY=0xBEEF123; // Deterministic signing fixture, never a network account.
    address a=address(0xA); address b=address(0xB); address c=address(0xC); address d=address(0xD);
    function setUp() public { vm.chainId(10143);vm.warp(1000);vm.roll(100); g=new PongInterludeRooms(IInterludeHub(address(0x1234)),vm.addr(KEY));vm.chainId(4242); }
    function offer(uint256 id,address p,address q,bool ranked) private view returns(PongInterludeRooms.Offer memory) {return PongInterludeRooms.Offer(id,bytes32(id),p,q,ranked,uint64(block.timestamp+20),3,bytes32(id));}
    function sig(PongInterludeRooms.Offer memory o) private view returns(bytes memory) {(uint8 v,bytes32 r,bytes32 s)=vm.sign(KEY,g.ticketDigest(o));return abi.encodePacked(r,s,v);}
    function start(uint256 id,address p,address q,bool ranked) private {PongInterludeRooms.Offer memory o=offer(id,p,q,ranked);bytes memory s=sig(o);vm.prank(p);g.acceptMatch(o,s);vm.prank(q);g.acceptMatch(o,s);}
    function phase(uint256 id) private view returns(uint256 p) {(,,p,,,,,,,,,,)=g.getSnapshot(id);}
    function state(uint256 id) private view returns(PhysicsV2.State memory s) {(,,,,,,,,,,,,s)=g.getSnapshot(id);}
    function testTwoAgreementsRequired() public {PongInterludeRooms.Offer memory o=offer(1,a,b,true);bytes memory s=sig(o);vm.prank(a);g.acceptMatch(o,s);assertEq(phase(1),1);vm.roll(150);assertEq(state(1).t,0);vm.prank(a);vm.expectRevert();g.acceptMatch(o,s);vm.prank(b);g.acceptMatch(o,s);assertEq(phase(1),2);}
    function testTwoIndependentArenasAndCapacity() public {start(1,a,b,true);start(2,c,d,false);vm.prank(a);g.input(1,-1,1,200);vm.roll(120);g.tick(1);assertLt(state(1).left,state(2).left);PongInterludeRooms.Offer memory o=offer(3,address(5),address(6),false);bytes memory s=sig(o);vm.prank(address(5));vm.expectRevert(PongInterludeRooms.ArenaBusy.selector);g.acceptMatch(o,s);}
    function testCannotPlayTwiceOrMoveOtherArena() public {start(1,a,b,true);PongInterludeRooms.Offer memory o=offer(2,a,c,false);bytes memory s=sig(o);vm.prank(c);vm.expectRevert();g.acceptMatch(o,s);start(3,c,d,false);vm.prank(a);vm.expectRevert();g.input(3,1,1,200);}
    function testTicketBindsAllRulesAndParticipants() public {PongInterludeRooms.Offer memory o=offer(1,a,b,true);bytes memory s=sig(o);o.ranked=false;vm.prank(a);vm.expectRevert();g.acceptMatch(o,s);o.ranked=true;o.b=c;vm.prank(a);vm.expectRevert();g.acceptMatch(o,s);o.b=b;o.room=bytes32(uint256(99));vm.prank(a);vm.expectRevert();g.acceptMatch(o,s);}
    function testWrongCoordinatorAndApplication() public {PongInterludeRooms.Offer memory o=offer(1,a,b,true);bytes memory s=sig(o);vm.chainId(10143);PongInterludeRooms other=new PongInterludeRooms(IInterludeHub(address(0x1234)),vm.addr(KEY));vm.chainId(4242);vm.prank(a);vm.expectRevert();other.acceptMatch(o,s);}
    function testExpiredTicketAndCancellationNoElo() public {PongInterludeRooms.Offer memory o=offer(1,a,b,true);bytes memory s=sig(o);vm.prank(a);g.acceptMatch(o,s);vm.warp(1021);vm.prank(b);vm.expectRevert();g.acceptMatch(o,s);g.cancelMatch(1);assertEq(g.ratingOf(a).elo,1000);assertEq(g.activeCount(),0);assertEq(g.activeMatchOf(b),0);}
    function testTicketCannotBeReplayedAfterEnd() public {PongInterludeRooms.Offer memory o=offer(1,a,b,true);bytes memory s=sig(o);vm.prank(a);g.acceptMatch(o,s);vm.prank(b);g.acceptMatch(o,s);vm.prank(a);g.concede(1);vm.prank(a);vm.expectRevert();g.acceptMatch(o,s);}
    function testRankedEloExactAndSingleSettlement() public {start(1,a,b,true);vm.prank(b);g.concede(1);assertEq(g.ratingOf(a).elo,1032);assertEq(g.ratingOf(b).elo,968);assertEq(g.ratingOf(a).wins,1);assertEq(g.ratingOf(b).played,1);(uint32 ba,uint32 bb,uint32 aa,uint32 ab)=g.ratingChange(1);assertEq(ba,1000);assertEq(bb,1000);assertEq(aa,1032);assertEq(ab,968);vm.expectRevert();g.tick(1);vm.prank(a);vm.expectRevert();g.concede(1);assertEq(g.ratingOf(a).played,1);}
    function testFriendlyDoesNotModifyRatings() public {start(1,a,b,false);vm.prank(a);g.concede(1);assertEq(g.ratingOf(a).elo,1000);assertEq(g.ratingOf(b).played,0);assertEq(g.activeCount(),0);}
    function testRepeatOpponentHasDiminishingGain() public {start(1,a,b,true);vm.prank(b);g.concede(1);start(2,a,b,true);vm.prank(b);g.concede(2);assertLt(g.ratingOf(a).elo-1032,16);}
    function testSeasonSoftReset() public {start(1,a,b,true);vm.prank(b);g.concede(1);vm.warp(1000+30 days);assertEq(g.ratingOf(a).elo,1016);assertEq(g.ratingOf(a).played,0);assertEq(g.ratingOf(a).season,2);}
    function testNaturalSevenEndsAndKeepsOtherMatch() public {start(1,a,b,true);start(2,c,d,false);vm.prank(a);g.input(1,-1,1,200);vm.prank(b);g.input(1,1,1,200);vm.roll(60100);g.tick(1);assertEq(phase(1),3);assertTrue(state(1).scoreA==7||state(1).scoreB==7);assertEq(phase(2),2);assertEq(g.activeCount(),1);assertEq(g.ratingOf(a).played,1);}
    function testStrictInputNoncesAndRelease() public {start(1,a,b,false);vm.prank(a);g.input(1,1,1,150);vm.roll(120);vm.prank(a);g.input(1,0,2,150);assertEq(state(1).left,324000000);vm.roll(140);g.tick(1);assertEq(state(1).left,324000000);vm.prank(a);vm.expectRevert();g.input(1,-1,2,160);vm.prank(a);vm.expectRevert();g.input(1,0,4,160);vm.prank(a);vm.expectRevert();g.input(1,0,3,139);}
    function testBothTerminalStatesFitCommitBudget() public {vm.record();start(1,a,b,true);start(2,c,d,true);vm.prank(a);g.concede(1);vm.prank(c);g.concede(2);(,bytes32[] memory writes)=vm.accesses(address(g));uint256 unique;for(uint256 i;i<writes.length;i++){bool seen;for(uint256 j;j<i;j++)if(writes[j]==writes[i])seen=true;if(!seen)unique++;}assertLe(unique,64);}
    function testTimeoutNoRatingAndEngineOnly() public {start(1,a,b,true);vm.roll(200000);g.tick(1);assertEq(phase(1),4);assertEq(g.ratingOf(a).played,0);vm.chainId(10143);PongInterludeRooms.Offer memory o=offer(2,a,b,false);bytes memory s=sig(o);vm.prank(a);vm.expectRevert();g.acceptMatch(o,s);}
}
