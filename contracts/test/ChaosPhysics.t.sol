// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ChaosState as T} from "../src/chaos/ChaosState.sol";
import {ChaosEffects as E} from "../src/chaos/ChaosEffects.sol";
import {ChaosModifiers as M} from "../src/chaos/ChaosModifiers.sol";
import {ChaosRally as R} from "../src/chaos/ChaosRally.sol";
import {ChaosDynamics as D} from "../src/chaos/ChaosDynamics.sol";
import {ChaosContacts as C} from "../src/chaos/ChaosContacts.sol";
import {ChaosPhysics} from "../src/chaos/ChaosPhysics.sol";
contract ChaosPhysicsTest is Test {
    E e=new E();M m=new M();R r=new R();D d=new D(e,m);C c=new C(d);ChaosPhysics k=new ChaosPhysics(e,r,d,c);
    int256 constant P=1e12;
    function base() private view returns(T.State memory){return k.initial(bytes32(0),96000000,72000000);}
    function withEffect(T.State memory s,uint8 id,uint8 target,uint32 variant) private view returns(T.State memory){
        (s.effects,)=e.announce(s.effects,id,target,variant,id,0);s.t=1000000;s.nextForce=1000000;return s;
    }
    function testContinuousMotionAndBudgetedCatchup() public view {
        T.State memory s=base();bool complete;
        (s,complete,)=k.advance(s,100000,64);assertTrue(complete);assertEq(s.t,100000);
        assertEq(s.balls[0].x,512*P+192e6*100000);assertEq(s.balls[0].y,288*P+96e6*100000);
        s=withEffect(base(),17,0,0);
        (s,complete,)=k.advance(s,1100000,3);assertFalse(complete);assertGt(s.t,1000000);assertLt(s.t,1100000);
        (s,complete,)=k.advance(s,1100000,64);assertTrue(complete);assertEq(s.t,1100000);
    }
    function testPointResetsEffectsAndVelocityButAdvancesRealRally() public view {
        T.State memory s=withEffect(base(),23,0,0);s.balls[0].x=1029*P;s.balls[0].y=10*P;s.balls[0].vx=1000e6;s.balls[0].vy=0;
        (s,,)=k.advance(s,1001000,64);assertEq(s.score.a,1);assertEq(s.score.rally,2);assertEq(s.effects[0].id,0);
        assertEq(s.balls[0].vx,-192e6);assertEq(s.balls[0].powerN,1);
    }
    function testShieldReturnsMissOnceWithoutCreditingScore() public view {
        T.State memory s=withEffect(base(),3,0,0);s.balls[0].x=20*P;s.balls[0].vx=-200e6;s.balls[0].vy=0;
        T.Collision[] memory log;(s,,log)=k.advance(s,1030000,64);
        assertEq(s.score.a+s.score.b,0);assertEq(s.effects[0].id,0);assertEq(s.balls[0].vx,200e6);assertEq(log.length,1);assertEq(log[0].kind,7);
    }
    function testSplitConnectorDoesNotCollide() public view {
        T.State memory s=withEffect(base(),11,0,0);s.balls[0].x=41*P;s.balls[0].y=s.left;s.balls[0].vx=-200e6;s.balls[0].vy=0;
        (s,,)=k.advance(s,1010000,64);assertLt(s.balls[0].vx,0);assertLt(s.balls[0].x,40*P);
    }
    function testPortalPreservesVelocityAndBreaksTrailWithoutBounceSound() public view {
        T.State memory s=withEffect(base(),14,0,0);s.balls[0].x=290*P;s.balls[0].y=180*P;s.balls[0].vx=200e6;s.balls[0].vy=0;
        T.Collision[] memory log;(s,,log)=k.advance(s,1050000,64);
        assertGt(s.balls[0].x,670*P);assertEq(s.balls[0].y,396*P);assertEq(s.balls[0].vx,200e6);assertEq(s.balls[0].trailRevision,1);assertEq(log.length,0);
    }
    function testObstacleActivatingOverBallIsNonSolidUntilExit() public view {
        T.State memory s=withEffect(base(),13,0,0);s.balls[0].vx=200e6;s.balls[0].vy=0;
        T.Collision[] memory log;(s,,log)=k.advance(s,1100000,64);
        assertGt(s.balls[0].vx,0);assertEq(log.length,0);assertEq(s.balls[0].ghost&1,1);
        (s,,log)=k.advance(s,1200000,64);assertEq(s.balls[0].ghost&1,0);assertEq(log.length,0);
    }
    function testMultiballOppositeSimultaneousGoalsVoidTheRally() public view {
        T.State memory s=withEffect(base(),21,0,0);s=d.prepare(s);
        s.balls[0].x=1029*P;s.balls[0].vx=1000e6;s.balls[0].vy=0;
        s.balls[1].x=-5*P;s.balls[1].vx=-1000e6;s.balls[1].vy=0;
        (s,,)=k.advance(s,1001000,64);assertEq(s.score.a+s.score.b,0);assertEq(s.score.rally,2);assertFalse(s.balls[1].alive);assertEq(s.effects[0].id,0);
    }
    function testSecondBallIsAnIndependentCopy() public view {
        T.State memory s=withEffect(base(),21,0,0);int256 original=s.balls[0].vy;s=d.prepare(s);
        assertEq(s.balls[0].vy,original);assertEq(s.balls[1].vy,-original);assertTrue(s.balls[1].alive);
    }
    function testMultiballSameSideCountsOnceAndJackpotClampsToSeven() public view {
        T.State memory s=withEffect(base(),21,0,0);(s.effects,)=e.announce(s.effects,22,0,0,22,0);s=d.prepare(s);
        s.score.a=6;
        for(uint8 i;i<2;i++){s.balls[i].x=1029*P;s.balls[i].vx=1000e6;s.balls[i].vy=0;}
        (s,,)=k.advance(s,1001000,64);assertEq(s.score.a,7);assertTrue(s.score.finished);assertEq(s.score.winner,1);
        (T.State memory again,,)=k.advance(s,1100000,64);assertEq(keccak256(abi.encode(again)),keccak256(abi.encode(s)));
    }
    function testAllTwentyFourAdvanceWithoutUnexpectedCancellation() public view {
        for(uint8 id=1;id<=24;id++){
            T.State memory s=withEffect(base(),id,0,0);s.balls[0].x=100*P;s.balls[0].y=100*P;
            (s,,)=k.advance(s,1200000,128);assertFalse(s.cancelled,string.concat("event ",vm.toString(id)));
            assertEq(s.t,1200000);
        }
    }
    function testAll276PairsPhysicsAndCallPartitioning() public view {
        uint256 pairs;
        for(uint8 a=1;a<=24;a++)for(uint8 b=a+1;b<=24;b++){
            T.State memory source=withEffect(base(),a,0,b);(source.effects,)=e.announce(source.effects,b,1,a,b,0);
            source.balls[0].x=200*P;source.balls[0].y=int256(120+20*((uint256(a)+b)%12))*P;source.balls[0].vx=1500e6;source.balls[0].vy=40e6;source.balls[0].lastHitter=0;
            (T.State memory full,bool complete,)=k.advance(source,1200000,256);assertTrue(complete);assertFalse(full.cancelled,string.concat("pair ",vm.toString(a),"/",vm.toString(b)));
            (T.State memory split,,)=k.advance(source,1073123,256);(split,,)=k.advance(split,1200000,256);
            assertEq(keccak256(abi.encode(full)),keccak256(abi.encode(split)),string.concat("split ",vm.toString(a),"/",vm.toString(b)));pairs++;
        }
        assertEq(pairs,276);
    }
    function testCallPartitionsPreserveForcesCollisionsAndState() public view {
        for(uint8 id=13;id<=24;id++){
            T.State memory source=withEffect(base(),id,0,0);source.balls[0].x=200*P;source.balls[0].y=250*P;source.balls[0].vx=1500e6;source.balls[0].vy=40e6;
            (T.State memory full,,)=k.advance(source,1100000,256);
            (T.State memory split,,)=k.advance(source,1037123,256);(split,,)=k.advance(split,1100000,256);
            assertEq(keccak256(abi.encode(full)),keccak256(abi.encode(split)),string.concat("partition event ",vm.toString(id)));
        }
    }
}
