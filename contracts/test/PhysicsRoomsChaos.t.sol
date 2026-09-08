// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {PhysicsRoomsChaos,PhysicsRoomsChaosHarness} from "../src/labs/PhysicsRoomsChaos.sol";
contract PhysicsRoomsChaosTest is Test {
    function paused() private pure returns(PhysicsV2.State memory s) {
        s=PhysicsRoomsChaos.initial(bytes32(0)); s.x=1030_000_000; s.vx=999_000_000;
        (s,)=PhysicsRoomsChaos.advance(s,60_000_000,128);
    }
    function testPauseStopsCatchupAndResumeResetsSpeed() public pure {
        PhysicsV2.State memory s=paused();
        assertEq(s.scoreA,1);assertTrue(s.awaitingServe);assertEq(s.resumeAt-s.t,3_000_000);assertEq(s.vx,0);
        (PhysicsV2.State memory later,)=PhysicsRoomsChaos.advance(s,600_000_000,128);
        assertEq(abi.encode(s),abi.encode(later));
        s=PhysicsRoomsChaos.resume(s,s.resumeAt,2e15,0);
        assertEq(s.halfA,36_000_000);assertEq(s.halfB,48_000_000);
        assertEq(s.vx<0?-s.vx:s.vx,192_000_000);assertFalse(s.awaitingServe);
    }
    function testThresholdsAndFavoriteChange() public pure {
        PhysicsV2.State memory s=paused();
        assertEq(PhysicsRoomsChaos.resume(s,s.resumeAt,2e15-1,0).halfA,48_000_000);
        s=paused();
        assertEq(PhysicsRoomsChaos.resume(s,s.resumeAt,12e14,8e14).halfA,48_000_000);
        s=paused();
        assertEq(PhysicsRoomsChaos.resume(s,s.resumeAt,16e14,4e14).halfA,42_000_000);
        s=paused();
        assertEq(PhysicsRoomsChaos.resume(s,s.resumeAt,0,2e15).halfB,36_000_000);
    }
    function testEveryReturnAcceleratesWithoutCap() public pure {
        PhysicsV2.State memory s=PhysicsRoomsChaos.initial(bytes32(0)); uint256 hits; int256 v=192_000_000;
        for(uint256 i;i<256 && hits<40;i++) {
            PhysicsV2.Event memory e=PhysicsV2.next(s);
            if(e.kind==3 || e.kind==4) {int256 y=s.y+s.vy*int256(uint256(e.at-s.t))/1e6;if(e.kind==3)s.left=PhysicsV2.clamp(y,s.halfA);else s.right=PhysicsV2.clamp(y,s.halfB);v=v*110/100;hits++;}
            (s,)=PhysicsRoomsChaos.advance(s,e.at,1);assertEq(s.vx<0?-s.vx:s.vx,v);
        }
        assertEq(hits,40);assertGt(v,8_000_000_000);
    }
    function testSeventhPointFinishesWithoutAnotherServe() public pure {
        PhysicsV2.State memory s=PhysicsRoomsChaos.initial(bytes32(0));s.scoreA=6;s.x=1030_000_000;
        (s,)=PhysicsRoomsChaos.advance(s,60_000_000,128);
        assertEq(s.scoreA,7);assertTrue(s.finished);assertFalse(s.awaitingServe);
    }
    function testEarlyResumeRejected() public {
        PhysicsRoomsChaosHarness h=new PhysicsRoomsChaosHarness();PhysicsV2.State memory s=paused();
        vm.expectRevert("serve not ready");h.resume(s,s.resumeAt-1,0,0);
    }
}
