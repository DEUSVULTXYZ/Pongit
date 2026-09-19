// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {HousePolicies as P} from "../src/agents/competition/HousePolicies.sol";
import {HouseController as H} from "../src/agents/HouseController.sol";

contract HousePoliciesTest is Test {
    P policy=new P();int256 constant UNIT=1e12;
    function viewAt(uint64 time,int256 y,int256 vy) private pure returns(P.View memory v){
        v.balls=new H.Ball[](1);v.balls[0]=H.Ball(500*UNIT,y,-500e6,vy);
        v.side=0;v.t=time;v.paddle=288*UNIT;v.half=48*UNIT;v.opponent=200*UNIT;v.seed=bytes32(uint256(123));v.rally=1;v.tournament=8;
    }
    function testEightDistinctPoliciesOnTheSamePublicObservations() public view {
        bytes32[8] memory traces;
        for(uint8 style;style<8;style++){
            P.Memory memory brain;
            for(uint16 step;step<160;step++){
                P.View memory v=viewAt(uint64(step)*100_000,int256(uint256(20+(step*19)%536))*UNIT,int256(uint256(step%2==0?350:140))*1e6);
                (int8 direction,P.Memory memory next)=policy.decide(style,v,brain);brain=next;
                assertGe(direction,-1);assertLe(direction,1);assertGe(brain.lastTarget,48*UNIT);assertLe(brain.lastTarget,528*UNIT);
                traces[style]=keccak256(abi.encode(traces[style],direction,brain.lastTarget,brain.nextDecision));
            }
            for(uint8 old;old<style;old++)assertTrue(traces[old]!=traces[style],"behavior, not just name, differs");
        }
    }
    function testReactionPeriodHoldsCommandAndPackRoundTrips() public view {
        for(uint8 style;style<8;style++){
            P.Memory memory brain;(int8 direction,P.Memory memory first)=policy.decide(style,viewAt(1_000_000,100*UNIT,0),brain);
            (int8 held,P.Memory memory second)=policy.decide(style,viewAt(first.nextDecision-1,500*UNIT,0),first);
            assertEq(held,direction);assertEq(keccak256(abi.encode(second)),keccak256(abi.encode(first)));
            assertEq(keccak256(abi.encode(policy.unpack(policy.pack(first)))),keccak256(abi.encode(first)));
        }
        assertEq(policy.unpack(0).held,0);
    }
    function testEchoLearnsOnlyObservedVelocityAndGlitchIsRepeatable() public view {
        P.Memory memory brain;(,brain)=policy.decide(5,viewAt(1_000_000,200*UNIT,200e6),brain);
        assertEq(brain.meanVy,200e6);(,brain)=policy.decide(5,viewAt(2_000_000,200*UNIT,-200e6),brain);
        assertEq(brain.meanVy,100e6);assertEq(brain.samples,2);
        P.Memory memory fresh;P.View memory v=viewAt(2_000_000,200*UNIT,200e6);
        (,P.Memory memory a)=policy.decide(6,v,fresh);(,P.Memory memory b)=policy.decide(6,v,fresh);
        assertEq(keccak256(abi.encode(a)),keccak256(abi.encode(b)));
        v.tournament++;(,b)=policy.decide(6,v,fresh);assertTrue(a.lastTarget!=b.lastTarget,"actual tournament identity is in the behavior seed");
    }
    function testDriftRepositionsWithoutAnIncomingBallAndViperAimsOffCentre() public view {
        P.View memory v=viewAt(1_000_000,200*UNIT,0);v.balls[0].vx=500e6;P.Memory memory brain;
        (,P.Memory memory drift)=policy.decide(4,v,brain);v.t=2_000_000;(,P.Memory memory later)=policy.decide(4,v,brain);
        assertTrue(drift.lastTarget!=later.lastTarget);
        v.balls[0].vx=-500e6;(,P.Memory memory viper)=policy.decide(7,v,brain);
        assertGt(viper.lastTarget,215*UNIT);
    }
    function testPolicyRuntimeFits() public view {assertLe(address(policy).code.length,24576);}
    function testEchoUsesTheBallArrivingFirstInMultiball() public view {
        P.View memory v=viewAt(1_000_000,100*UNIT,300e6);v.balls=new H.Ball[](2);
        v.balls[0]=H.Ball(500*UNIT,100*UNIT,-500e6,300e6);
        v.balls[1]=H.Ball(140*UNIT,400*UNIT,-500e6,-200e6);
        P.Memory memory brain;(,brain)=policy.decide(5,v,brain);
        assertEq(brain.meanVy,-200e6);assertGt(brain.lastTarget,330*UNIT);assertLt(brain.lastTarget,390*UNIT);
        H.Ball memory swap=v.balls[0];v.balls[0]=v.balls[1];v.balls[1]=swap;
        P.Memory memory empty;(,P.Memory memory reverse)=policy.decide(5,v,empty);
        assertEq(reverse.lastTarget,brain.lastTarget,"array order does not select the wrong threat");
    }
}
