// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {PongRoomsRealtime} from "../src/labs/PongRoomsRealtime.sol";
import {PongInterludeRoomsChaos} from "../src/labs/PongInterludeRoomsChaos.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

contract RealtimeFixture is PongRoomsRealtime {
    constructor(IInterludeHub h,address c,address p) PongRoomsRealtime(h,c,p,msg.sender,address(0)) {}
    function setState(uint256 id,PhysicsV2.State memory s) external { _save(id,s); }
}
contract RealtimeChaosTest is Test {
    uint256 constant C=0xa110; uint256 constant P=0xb170;
    address constant A=address(0xa); address constant B=address(0xb); address constant H=address(0x1234);
    RealtimeFixture g;
    function setUp() public {
        vm.chainId(10143);vm.warp(1000);vm.roll(100);
        g=new RealtimeFixture(IInterludeHub(H),vm.addr(C),vm.addr(P));
        Types.Session memory session;session.epoch=1;session.status=Types.Status.Active;
        vm.mockCall(H,abi.encodeWithSelector(IInterludeHub.sessionOf.selector,address(g),Types.GLOBAL),abi.encode(session));
        vm.chainId(4242);
    }
    function sign(bytes32 hash,uint256 key) internal pure returns(bytes memory) {
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(key,hash);return abi.encodePacked(r,s,v);
    }
    function start(uint256 id,uint8 mode) internal { startPair(id,mode,A,B); }
    function startPair(uint256 id,uint8 mode,address a,address b) internal {
        PongInterludeRoomsChaos.Offer memory o=PongInterludeRoomsChaos.Offer(id,bytes32(id),a,b,mode,true,1020,5,bytes32(id));
        bytes memory sig=sign(g.ticketDigest(o),C);
        vm.prank(a);g.acceptMatch(o,sig);vm.prank(b);g.acceptMatch(o,sig);
    }
    function state(uint256 id) internal view returns(PhysicsV2.State memory s) { (,,,,,,,,,,,,s)=g.getSnapshot(id); }
    function pressure(uint256 id,uint128 a,uint128 b,uint64 number) internal view returns(PongRoomsRealtime.LivePressure memory) {
        PhysicsV2.State memory s=state(id);
        return PongRoomsRealtime.LivePressure(id,1,s.seed,s.scoreA+s.scoreB,a,b,number,bytes32(uint256(number)),uint64(block.timestamp+25));
    }
    function submit(PongRoomsRealtime.LivePressure memory p) internal {g.submitLivePressure(p,sign(g.pressureDigest(p),P));}
    function rejected(PongRoomsRealtime.LivePressure memory p) internal {bytes memory sig=sign(g.pressureDigest(p),P);vm.expectRevert();g.submitLivePressure(p,sig);}
    function nearPoint() internal {
        PhysicsV2.State memory s=state(1);s.x=4e6;s.y=10e6;s.vx=-192e6;s.vy=96e6;s.left=400e6;s.right=400e6;
        g.setState(1,s);
    }
    function testNoBridgeNeverBlocksAndConcessionRecordsCutoff() public {
        start(1,1);nearPoint();vm.roll(120);g.tick(1);
        PhysicsV2.State memory s=state(1);assertEq(s.scoreB,1);assertFalse(s.awaitingServe);assertEq(s.resumeAt,0);assertEq(s.t,200000);assertEq(s.halfA,48e6);assertEq(s.left,400e6);
        vm.prank(A);g.concede(1);assertEq(g.finishedAt(1),1000);assertTrue(g.resultHashes(1)!=bytes32(0));
    }
    function testPressureQueuesUntilPointAndPersistsWithoutFurtherCheckpoints() public {
        start(1,1);submit(pressure(1,2e15,0,101));assertEq(state(1).halfA,48e6);
        nearPoint();vm.roll(120);g.tick(1);assertEq(state(1).halfA,36e6);assertEq(state(1).halfB,48e6);
        vm.warp(1100);nearPoint();vm.roll(140);g.tick(1);assertFalse(state(1).awaitingServe);assertEq(state(1).halfA,36e6);
    }
    function testLatePressureDoesNotAffectPointProcessedBeforeItsArrival() public {
        start(1,1);nearPoint();vm.roll(120);submit(pressure(1,2e15,0,101));
        assertEq(state(1).scoreB,1);assertEq(state(1).halfA,48e6);
        nearPoint();vm.roll(140);g.tick(1);assertEq(state(1).halfA,36e6);
    }
    function testChangedFavouriteOnlyResizesAtNextPoint() public {
        start(1,1);submit(pressure(1,2e15,0,101));nearPoint();vm.roll(120);g.tick(1);
        submit(pressure(1,2e15,8e15,102));assertEq(state(1).halfA,36e6);assertEq(state(1).halfB,48e6);
        nearPoint();vm.roll(140);g.tick(1);assertEq(state(1).halfA,48e6);assertEq(state(1).halfB,42e6);
    }
    function testPressureAuthenticationEpochMonotonicityAndReplay() public {
        start(1,1);PongRoomsRealtime.LivePressure memory p=pressure(1,2e15,0,101);
        bytes memory wrong=sign(g.pressureDigest(p),C);vm.expectRevert();g.submitLivePressure(p,wrong);
        p.epoch=2;rejected(p);p.epoch=1;
        submit(p);submit(p);p.paidA--;p.sourceBlock++;rejected(p);
        p=pressure(1,2e15,0,102);p.expires=1000;rejected(p);
        p=pressure(1,2e15,0,102);p.rally=1;rejected(p);
    }
    function testSeventhPointStopsAndDoesNotServeAgain() public {
        start(1,1);nearPoint();PhysicsV2.State memory s=state(1);s.scoreB=6;g.setState(1,s);
        vm.roll(120);g.tick(1);s=state(1);assertEq(s.scoreB,7);assertTrue(s.finished);assertFalse(s.awaitingServe);assertEq(g.activeCount(),0);assertEq(g.finishedAt(1),1000);
    }
    function testTwoPaidGamesAndFinishesFitPublicationBudget() public {
        vm.record();start(1,1);startPair(2,1,address(0xc),address(0xd));
        submit(pressure(1,2e15,0,101));submit(pressure(2,0,2e15,101));
        nearPoint();vm.roll(120);g.tick(1);g.tick(2);
        vm.prank(A);g.concede(1);vm.prank(address(0xc));g.concede(2);
        (,bytes32[] memory writes)=vm.accesses(address(g));uint256 unique;
        for(uint256 i;i<writes.length;i++){bool seen;for(uint256 j;j<i;j++)if(writes[i]==writes[j])seen=true;if(!seen)unique++;}
        emit log_named_uint("Unique application slots",unique);assertLe(unique,64);assertEq(g.activeCount(),0);
    }
}
