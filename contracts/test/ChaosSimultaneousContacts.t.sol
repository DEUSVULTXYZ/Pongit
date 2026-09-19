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
import {ChaosCodec} from "../src/chaos/ChaosCodec.sol";
import {ChaosEngine} from "../src/chaos/ChaosEngine.sol";
import {ChaosDrawRules} from "../src/chaos/ChaosDrawRules.sol";
import {DrandEvmnet} from "../src/chaos/DrandEvmnet.sol";
import {ChaosPhysicsRules6} from "./legacy/ChaosPhysicsRules6.sol";

/// Rules 8: every wall, paddle, shield and goal plane a ball reaches in the microsecond a
/// move ends in is resolved, not only the tie-break winner. Each case runs on the corrected
/// kernel `k` and on `old`, the rules-6 kernel deployed on 13 September 2026, to show what
/// changed and what did not. docs/validation/chaos-corrected.md records the evidence.
abstract contract SimultaneousBase is Test {
    E e=new E();M m=new M();R r=new R();D d=new D(e,m);C c=new C(d);
    ChaosPhysics k=new ChaosPhysics(e,r,d,c);ChaosPhysicsRules6 old=new ChaosPhysicsRules6(e,r,d,c);
    ChaosCodec codec=new ChaosCodec();
    int256 constant P=1e12;uint64 constant T0=1_000_000;
    // Production replay of 2026-09-18 at t=13.47 s: 192 and 96 px/s after two returns (x1.1 each).
    int256 constant VX=-232_320_000;int256 constant VY=-116_160_000;
    uint64 constant REPLAY=13_470_000;
    // ceil(51 px / 232.32 px/s): both balls start 51 px from the left paddle plane.
    uint64 constant CROSS=219_525;

    function single() internal view returns(T.State memory s){
        s=k.initial(bytes32(0),96000000,96000000);s.t=T0;s.nextForce=T0;s.score.a=1;s.score.rally=2;
    }
    function multiball() internal view returns(T.State memory s){
        s=single();(s.effects,)=e.announce(s.effects,21,0,0,21,0);s=d.prepare(s);
        require(s.balls[1].alive,"multiball");
    }
    function place(T.State memory s,uint8 i,int256 x,int256 y,int256 vx,int256 vy) internal pure {
        s.balls[i].x=x;s.balls[i].y=y;s.balls[i].vx=vx;s.balls[i].vy=vy;s.balls[i].lastHitter=1;
    }
    /// The replay: Multiball announced at 10 s runs from 11 s; the left paddle is centred at
    /// 262 px, half-height 48 px; both balls cross x=40 in the same microsecond at y 235.5 and
    /// 279.5, both inside its span. Rules 6 returned ball 0 and let ball 1 score (1-0 -> 1-1).
    function replay() internal view returns(T.State memory s){
        s=k.initial(bytes32(0),96000000,96000000);
        (s.effects,)=e.announce(s.effects,21,0,0,1,10000);
        s.t=11_000_000;s.nextForce=s.t;s=d.prepare(s);require(s.balls[1].alive,"multiball");
        s.score.a=1;s.score.rally=2;s.left=262*P;s.t=REPLAY;s.nextForce=REPLAY;
        place(s,0,91*P,261*P,VX,VY);place(s,1,91*P,305*P,VX,VY);
    }
    function kinds(T.Collision[] memory log,uint64 at) internal pure returns(uint256 mask){
        for(uint256 i;i<log.length;i++)if(log[i].at==at)mask|=uint256(1)<<(uint256(log[i].ball)*16+log[i].kind);
    }
    function bit(uint8 ball,uint8 kind) internal pure returns(uint256){return uint256(1)<<(uint256(ball)*16+kind);}
    function same(T.State memory a,T.Collision[] memory la,T.State memory b,T.Collision[] memory lb) internal pure returns(bool){
        return keccak256(abi.encode(a,la))==keccak256(abi.encode(b,lb));
    }
}

contract ChaosSimultaneousContactsTest is SimultaneousBase {
    function testPaddleBoundaryReclampAtBothEdgesAndSides() public view {
        uint8[6] memory ids=[uint8(1),7,9,11,12,23];
        for(uint8 n;n<6;n++)for(uint8 side;side<2;side++)for(uint8 bottom;bottom<2;bottom++)for(uint8 crossed;crossed<2;crossed++){
            uint8 id=ids[n];bool expires=id==7||id==9;
            int256 oldHalf=expires?384*P/10:id==12?int256(36*P):int256(48*P);
            int256 newHalf=id==1||id==23?int256(60*P):id==11?int256(56*P):int256(48*P);
            T.State memory s=single();s.left=bottom==1?576*P-oldHalf:oldHalf;s.right=s.left;
            if(id==12){if(side==0)s.bettingA=72000000;else s.bettingB=72000000;}
            s.effects[0]=E.Effect(id,id>=12?2:side,0,1,expires?0:1200,expires?1200:12000,0);
            int256 y=bottom==1?576*P-newHalf*2:newHalf*2;
            int256 reach=232e6*int256(200000)-int256(uint256(crossed))*1000;
            place(s,0,side==0?40*P+reach:984*P-reach,y,side==0?int256(-232e6):int256(232e6),0);
            (T.State memory next,,T.Collision[] memory log)=k.advance(s,T0+300_000,128);
            assertEq(kinds(log,T0+200_000),bit(1,3+side));
            assertEq(next.score.a,1);assertEq(next.score.b,0);
            assertEq(side==0?next.left:next.right,bottom==1?576*P-newHalf:newHalf);
            assertGt(side==0?next.balls[0].vx:-next.balls[0].vx,0);
            (T.State memory first,,T.Collision[] memory beforeLog)=k.advance(s,T0+199_999,128);
            assertEq(beforeLog.length,0);
            (T.State memory split,,T.Collision[] memory afterLog)=k.advance(first,T0+300_000,128);
            assertTrue(same(split,afterLog,next,log),"split before boundary preserves state and contacts");
        }
    }

    function testReplayBothBallsAreReturnedByThePaddleThatCoversThem() public view {
        T.State memory s=replay();
        for(uint8 i;i<2;i++){
            int256 delta=s.balls[i].y+VY*int256(uint256(CROSS))-s.left;
            assertLe(delta<0?-delta:delta,54*P,"the paddle (48 px + the 6 px ball) covers this ball at the plane");
        }
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,REPLAY+320_000,128);
        assertEq(kinds(log,REPLAY+CROSS),bit(1,3)|bit(2,3),"both balls hit the left paddle in the same microsecond");
        assertGt(next.balls[0].vx,0);assertGt(next.balls[1].vx,0);
        (next,,)=k.advance(next,REPLAY+630_000,128);
        assertEq(next.score.a,1);assertEq(next.score.b,0,"no point through the paddle");
        // Rules 6: only the tie-break winner, ball 0; ball 1 passes and scores for B.
        (T.State memory legacy,,T.Collision[] memory legacyLog)=old.advance(s,REPLAY+320_000,128);
        assertEq(kinds(legacyLog,REPLAY+CROSS),bit(1,3));assertLt(legacy.balls[1].vx,0);assertLt(legacy.balls[1].x,40*P);
        (legacy,,)=old.advance(legacy,REPLAY+630_000,128);assertEq(legacy.score.b,1,"rules 6: 1-0 became 1-1 as observed");
    }

    /// The production path: packed words through ChaosEngine and the codec.
    function testReplayThroughEngineAndCodec() public {
        ChaosEngine engine=new ChaosEngine(codec,k,new DrandEvmnet(),new ChaosDrawRules());
        ChaosEngine.Progress memory p=engine.advance(codec.pack(replay()),bytes32(0),5,REPLAY+320_000,0,0);
        uint256 paddle;
        for(uint256 i;i<p.collisions.length;i++)if(uint8(p.collisions[i]>>72)==3){
            assertEq(uint64(p.collisions[i]>>88),REPLAY+CROSS);paddle|=uint256(1)<<uint8(p.collisions[i]>>64);
        }
        assertEq(paddle,6,"balls 1 and 2 both logged a left-paddle hit");
        T.State memory s=codec.unpack(p.words,bytes32(0),5);assertGt(s.balls[0].vx,0);assertGt(s.balls[1].vx,0);
    }

    /// Ball 0 reaches the right paddle and ball 1 the left paddle in the same microsecond.
    function testOppositePaddlesInTheSameMicrosecond() public view {
        T.State memory s=multiball();s.left=288*P;s.right=288*P;
        place(s,0,984*P-200e6*int256(100000)+7,288*P,200e6,0);
        place(s,1,40*P+200e6*int256(100000)-7,288*P,-200e6,0);
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,T0+150_000,128);
        assertEq(kinds(log,T0+100_000),bit(1,4)|bit(2,3));assertLt(next.balls[0].vx,0);assertGt(next.balls[1].vx,0);
        (next,,)=k.advance(next,T0+400_000,128);assertEq(next.score.a,1,"no point");
        // Rules 6: kind 3 wins the tie; ball 0 passes B's paddle and A scores.
        (T.State memory legacy,,T.Collision[] memory legacyLog)=old.advance(s,T0+400_000,128);
        assertEq(kinds(legacyLog,T0+100_000),bit(2,3));assertEq(legacy.score.a,2);
    }

    /// Ball 1 reaches the top wall in the microsecond ball 0 reaches the left paddle.
    function testWallAndPaddleOnTwoBallsInTheSameMicrosecond() public view {
        T.State memory s=replay();s.balls[1].x=300*P;s.balls[1].y=6*P-VY*int256(uint256(CROSS))-7;
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,REPLAY+320_000,128);
        assertEq(kinds(log,REPLAY+CROSS),bit(1,3)|bit(2,1));
        assertGt(next.balls[0].vx,0,"ball 0 returned");assertGt(next.balls[1].vy,0,"ball 1 bounced");assertGe(next.balls[1].y,6*P);
        // Rules 6: the wall (kind 1) wins; ball 0 passes the paddle that covers it.
        (T.State memory legacy,,T.Collision[] memory legacyLog)=old.advance(s,REPLAY+320_000,128);
        assertEq(kinds(legacyLog,REPLAY+CROSS),bit(2,1));assertLt(legacy.balls[0].vx,0);
    }

    /// One ball reaches the top wall and the paddle plane in the same microsecond (a corner).
    function testSingleBallCornerResolvesTheWallThenThePaddle() public view {
        T.State memory s=single();s.left=48*P;
        place(s,0,60*P-5,16*P-7,-200e6,-100e6);// x=40 and y=6 both reached at dt 100000
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,T0+150_000,128);
        assertEq(log.length,2);assertEq(log[0].kind,1);assertEq(log[1].kind,3);assertEq(log[1].at,T0+100_000);
        assertGt(next.balls[0].vx,0);assertGt(next.balls[0].vy,0);
        (T.State memory legacy,,T.Collision[] memory legacyLog)=old.advance(s,T0+400_000,128);
        assertEq(legacyLog.length,1);assertEq(legacy.score.b,1,"rules 6 scored through the corner");
    }

    /// Mirrored balls reach opposite walls in the same microsecond. Rules 6 carried ball 1
    /// through the floor and off the table.
    function testOppositeWallsInTheSameMicrosecond() public view {
        T.State memory s=multiball();
        place(s,0,500*P,100*P+5,50e6,-116e6);place(s,1,500*P,476*P-5,50e6,116e6);
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,T0+1_000_000,128);
        assertEq(log.length,2);assertEq(log[0].kind,1);assertEq(log[1].kind,2);assertEq(log[0].at,log[1].at);
        assertLe(next.balls[1].y,570*P);assertGe(next.balls[1].y,6*P);
        (T.State memory legacy,,)=old.advance(s,T0+1_000_000,128);assertGt(legacy.balls[1].y,576*P);
    }

    /// Boundary coincidences. Wind (17) forces every 10 ms; the paddle is due exactly on a tick.
    function testPaddleContactOnAForceTick() public view {
        T.State memory s=single();(s.effects,)=e.announce(s.effects,17,0,0,17,0);s.left=288*P;
        place(s,0,40*P+232e6*int256(200000)-1000,288*P,-232e6,0);
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,T0+300_000,128);
        assertEq(log.length,1);assertEq(log[0].kind,3);assertEq(log[0].at,T0+200_000);assertGt(next.balls[0].vx,0);
        (T.State memory legacy,,T.Collision[] memory legacyLog)=old.advance(s,T0+600_000,128);
        assertEq(legacyLog.length,0);assertEq(legacy.score.b,1,"rules 6 scored through a centred paddle");
    }
    /// A goal on a force tick: rules 6 never scored it and the ball flew on to a technical
    /// cancellation of the whole match.
    function testGoalOnAForceTickScoresInsteadOfCancellingTheMatch() public view {
        T.State memory s=single();(s.effects,)=e.announce(s.effects,17,0,0,17,0);
        place(s,0,-6*P+232e6*int256(190000)-1000,288*P,-232e6,0);// x 38.08 px, goal due at tick 19
        (T.State memory next,,)=k.advance(s,T0+300_000,128);
        assertEq(next.score.b,1,"point scored at the tick");assertFalse(next.cancelled);assertEq(next.score.rally,3);
        (T.State memory legacy,,)=old.advance(s,T0+300_000,128);
        assertEq(legacy.score.b,0);assertLt(legacy.balls[0].x,-6*P);
        for(uint256 i;i<40&&!legacy.cancelled;i++)(legacy,,)=old.advance(legacy,T0+60_000_000,512);
        assertTrue(legacy.cancelled,"rules 6 cancelled the match");assertEq(legacy.cancelReason,1);
    }
    /// The paddle is due exactly when an effect starts (jackpot 22, which forces nothing).
    function testPaddleContactOnAnEffectBoundary() public view {
        T.State memory s=single();s.left=288*P;
        (s.effects,)=e.announce(s.effects,22,0,0,22,uint32((T0+200_000)/1000-1000));
        place(s,0,40*P+232e6*int256(200000)-1000,288*P,-232e6,0);
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,T0+300_000,128);
        assertEq(log.length,1);assertEq(log[0].kind,3);assertEq(log[0].at,T0+200_000);assertGt(next.balls[0].vx,0);
        (T.State memory legacy,,)=old.advance(s,T0+600_000,128);assertEq(legacy.score.b,2,"rules 6 scored a jackpot point through it");
    }
    /// A shield expiring exactly when a ball reaches it: resolved against the effects at the
    /// boundary, so the expired shield saves nothing and nothing reverts.
    function testShieldExpiringAtTheContactMicrosecondSavesNothing() public view {
        T.State memory s=single();s.t=20_000_000;s.nextForce=s.t;
        (s.effects,)=e.announce(s.effects,3,0,0,3,20_100-13_000);// 12 s shield, expires at 20.1 s
        place(s,0,16*P+232e6*int256(100000)-1000,288*P,-232e6,0);
        assertEq(uint64(s.effects[0].expiresAt)*1000,s.t+100_000);
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,s.t+300_000,128);
        assertFalse(next.cancelled);assertEq(next.score.b,1);
        (T.State memory legacy,,T.Collision[] memory legacyLog)=old.advance(s,s.t+300_000,128);
        assertTrue(same(next,log,legacy,legacyLog));
    }

    /// Guards: a one-charge shield reached by both balls saves one; nothing reverts.
    function testShieldReachedByBothBallsSavesOne() public view {
        T.State memory s=replay();(s.effects,)=e.announce(s.effects,3,0,0,2,12000);s.left=500*P;
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,14_100_000,128);
        assertFalse(next.cancelled);assertEq(next.score.b,1,"the unsaved ball scores");
        assertEq(log.length,1);assertEq(log[0].kind,7);
    }
    /// The paddle covers only ball 1: ball 0 wins the tie and misses, ball 1 is still returned.
    function testFirstBallMissesAndTheSecondIsReturned() public view {
        T.State memory s=replay();s.left=330*P;
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,REPLAY+320_000,128);
        assertEq(kinds(log,REPLAY+CROSS),bit(2,3));assertLt(next.balls[0].vx,0);assertGt(next.balls[1].vx,0);
        (T.State memory legacy,,)=old.advance(s,REPLAY+320_000,128);assertLt(legacy.balls[1].vx,0,"rules 6 lost it");
    }
    /// The paddle covers only ball 0: ball 1 misses and scores under both rules.
    function testSecondBallMissesAndScoresUnderBothRules() public view {
        T.State memory s=replay();s.left=200*P;
        (T.State memory next,,)=k.advance(s,14_100_000,128);(T.State memory legacy,,)=old.advance(s,14_100_000,128);
        assertEq(next.score.b,1);assertEq(legacy.score.b,1);
    }
    /// Obstacles are not swept: a brick, pickup or bumper reached by both balls in one
    /// microsecond still acts once, for the tie-break winner, exactly as in rules 6.
    function testObstacleTiesAreUnchangedFromRules6() public view {
        T.State memory s=multiball();(s.effects,)=e.announce(s.effects,19,0,0,19,0);
        for(uint8 i;i<2;i++)place(s,i,400*P,0,-VX,0);
        s.balls[0].y=283*P;s.balls[1].y=293*P;
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,T0+500_000,128);
        (T.State memory legacy,,T.Collision[] memory legacyLog)=old.advance(s,T0+500_000,128);
        assertEq(log.length,1);assertEq(log[0].kind,16);
        assertFalse(next.cancelled);assertEq(next.effects[1].remaining,5,"brick 1 breaks once");
        assertTrue(same(next,log,legacy,legacyLog));
    }

    /// Controls: nothing else due in the microsecond, so rules 8 is rules 6 bit for bit.
    function testControlLoneBallIsIdenticalToRules6() public view {
        T.State memory s=replay();s.balls[0].x=500*P;s.balls[0].vx=-VX;
        (T.State memory next,bool done,T.Collision[] memory log)=k.advance(s,REPLAY+700_000,128);
        (T.State memory legacy,bool legacyDone,T.Collision[] memory legacyLog)=old.advance(s,REPLAY+700_000,128);
        assertEq(done,legacyDone);assertTrue(same(next,log,legacy,legacyLog));
        assertEq(kinds(log,REPLAY+CROSS),bit(2,3),"the same ball, paddle and microsecond, when alone");
    }
    /// Both balls land exactly on the plane: rules 6 already found the second at dt=0.
    function testControlExactLandingIsIdenticalToRules6() public view {
        T.State memory s=replay();for(uint8 i;i<2;i++)s.balls[i].x=40*P-VX*int256(uint256(CROSS));
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,REPLAY+320_000,128);
        (T.State memory legacy,,T.Collision[] memory legacyLog)=old.advance(s,REPLAY+320_000,128);
        assertTrue(same(next,log,legacy,legacyLog));assertEq(log.length,2);assertGt(next.balls[1].vx,0);
    }
    /// One microsecond apart: two separate moves under both rules.
    function testControlOneMicrosecondApartIsIdenticalToRules6() public view {
        T.State memory s=replay();s.balls[1].x-=VX;
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,REPLAY+320_000,128);
        (T.State memory legacy,,T.Collision[] memory legacyLog)=old.advance(s,REPLAY+320_000,128);
        assertTrue(same(next,log,legacy,legacyLog));assertEq(log.length,2);assertEq(log[1].at,log[0].at+1);
    }
    /// A ball one microsecond short of a corner: the paddle first, the wall a microsecond later.
    function testControlCornerOneMicrosecondApartIsIdenticalToRules6() public view {
        T.State memory s=single();s.left=48*P;place(s,0,60*P-5,16*P+100e6,-200e6,-100e6);
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,T0+150_000,128);
        (T.State memory legacy,,T.Collision[] memory legacyLog)=old.advance(s,T0+150_000,128);
        assertTrue(same(next,log,legacy,legacyLog));assertEq(log[0].kind,3);assertGt(next.balls[0].vx,0);
    }

    /// Log capacity. Ball 0 bounces between the walls seven times; its eighth wall contact
    /// falls in the microsecond both balls reach the bottom wall and the left paddle, which
    /// covers both. All four are logged in one call: 7 + 4 = 11 <= LOG_CAPACITY.
    function capacityCase() internal view returns(T.State memory s,uint64 at){
        s=multiball();s.left=528*P;// clamped low, covers y 474..582
        int256 v=5003e6;uint64 first=uint64(uint256((294*P+v-1)/v));uint64 period=uint64(uint256((564*P+v-1)/v));
        at=first+7*period;
        place(s,0,40*P+200e6*int256(uint256(at))-3,300*P,-200e6,-v);
        place(s,1,40*P+150e6*int256(uint256(at))-5,570*P-100e6*int256(uint256(at))+7,-150e6,100e6);
    }
    function testLogCapacityHoldsAFullMicrosecondAfterSevenCollisions() public view {
        assertEq(k.LOG_STOP(),8);assertEq(k.LOG_CAPACITY(),13);
        (T.State memory s,uint64 at)=capacityCase();
        (T.State memory next,,T.Collision[] memory log)=k.advance(s,T0+at+100_000,128);
        assertEq(log.length,11,"7 bounces, then both walls and both paddles in one microsecond");
        for(uint256 i;i<7;i++)assertLt(log[i].at,T0+at);
        assertEq(kinds(log,T0+at),bit(1,2)|bit(2,2)|bit(1,3)|bit(2,3));
        assertEq(log[7].kind,2);assertEq(log[7].ball,1);assertEq(log[8].kind,2);assertEq(log[8].ball,2);
        assertEq(log[9].kind,3);assertEq(log[9].ball,1);assertEq(log[10].kind,3);assertEq(log[10].ball,2);
        assertEq(next.t,T0+at,"the call stops after the microsecond that filled its log");
        for(uint256 i;i<11;i++)assertEq(log[i].sequence,s.collisionSequence+i+1);
        (next,,)=k.advance(next,T0+at+400_000,128);assertEq(next.score.b,0,"both returned");
        (T.State memory legacy,,T.Collision[] memory legacyLog)=old.advance(s,T0+at+100_000,128);
        assertEq(legacyLog.length,8);(legacy,,)=old.advance(legacy,T0+at+400_000,128);assertEq(legacy.score.b,1);
    }
    function testEngineBufferHoldsFourFullKernelCalls() public {
        (T.State memory s,uint64 at)=capacityCase();
        ChaosEngine engine=new ChaosEngine(codec,k,new DrandEvmnet(),new ChaosDrawRules());
        ChaosEngine.Progress memory p=engine.advance(codec.pack(s),bytes32(0),5,T0+at+100_000,0,0);
        assertGe(p.collisions.length,11);
        for(uint256 i;i<p.collisions.length;i++)assertEq(uint32(p.collisions[i]),s.collisionSequence+i+1,"no entry dropped");
    }

    /// Every lockstep Multiball arrival at a paddle that covers both balls. Rules 6 lost the
    /// second ball unless the distance divided exactly; rules 8 returns both, every time.
    function testSurveyLockstepMultiballFirstPaddle() public {
        uint256 covered;uint256 exact;uint256[2] memory through;
        for(uint256 i;i<300;i++){
            uint256 seed=uint256(keccak256(abi.encode("survey",i)));
            T.State memory s=k.initial(bytes32(seed),96000000,96000000);
            (s.effects,)=e.announce(s.effects,21,0,0,1,0);s.t=T0;s.nextForce=s.t;
            s.balls[0].x=int256(100+seed%824)*P+int256((seed>>100)%1e12);s.balls[0].y=int256(10+(seed>>16)%557)*P;
            s.balls[0].vx=int256(150+(seed>>32)%450)*1e6*((seed>>48)&1==0?int256(1):int256(-1));
            s.balls[0].vy=int256(20+(seed>>56)%400)*1e6*((seed>>72)&1==0?int256(1):int256(-1));
            s=d.prepare(s);T.Ball memory b=s.balls[0];bool left=b.vx<0;
            int256 gap=left?b.x-40*P:984*P-b.x;int256 speed=b.vx<0?-b.vx:b.vx;uint64 dt=uint64(uint256((gap+speed-1)/speed));
            int256 y0=fold(b.y+b.vy*int256(uint256(dt)));int256 y1=fold(b.y-b.vy*int256(uint256(dt)));
            int256 centre=(y0+y1)/2;if(centre<48*P)centre=48*P;if(centre>528*P)centre=528*P;
            if(abs(y0-centre)>50*P||abs(y1-centre)>50*P)continue;
            covered++;if(gap%speed==0)exact++;if(left)s.left=centre;else s.right=centre;
            for(uint8 j;j<2;j++){
                T.State memory o=s;bool complete;
                for(uint256 n;n<16&&!complete;n++)(o,complete,)=j==0?k.advance(o,s.t+dt+50_000,256):old.advance(o,s.t+dt+50_000,256);
                for(uint8 x;x<2;x++)if(o.balls[x].alive&&(left?o.balls[x].vx<0&&o.balls[x].x<40*P:o.balls[x].vx>0&&o.balls[x].x>984*P))through[j]++;
            }
        }
        emit log_named_uint("arrivals with both balls covered",covered);
        emit log_named_uint("rules 8: balls through the paddle",through[0]);
        emit log_named_uint("rules 6: balls through the paddle",through[1]);
        assertGt(covered,50);assertEq(through[0],0,"rules 8: none");
        assertEq(through[1],covered-exact,"rules 6: the second ball, unless the distance divides exactly");
    }
    function fold(int256 y) internal pure returns(int256){int256 l=564*P;int256 u=(y-6*P)%(2*l);if(u<0)u+=2*l;return 6*P+(u<=l?u:2*l-u);}
    function abs(int256 x) internal pure returns(int256){return x<0?-x:x;}

    /// Without Multiball, force grids and effect boundaries in reach, one ball has nothing to
    /// share a microsecond with but its own corner (probability ~1e-8): bit-identical.
    function testFuzzLoneBallIsIdenticalToRules6(uint256 seed) public view {
        T.State memory s=k.initial(bytes32(seed),uint32(72000000+(seed>>16)%24000001),uint32(72000000+(seed>>48)%24000001));
        uint8 a=pick(seed);uint8 b=pick(seed>>8);
        (s.effects,)=e.announce(s.effects,a,uint8(seed>>80)&1,uint32(seed>>88),1,0);
        if(b!=a)(s.effects,)=e.announce(s.effects,b,uint8(seed>>120)&1,uint32(seed>>128),2,0);
        s.t=T0;s.nextForce=T0;s.leftDir=int8(uint8(seed>>160)%3)-1;s.rightDir=int8(uint8(seed>>168)%3)-1;s.lastLeft=s.leftDir;s.lastRight=s.rightDir;
        s.balls[0].x=int256(20+(seed>>176)%985)*P+int256((seed>>100)%1e12);s.balls[0].y=int256(10+(seed>>192)%557)*P+int256((seed>>140)%1e12);
        s.balls[0].vx=int256(32+(seed>>208)%1200)*1e6*((seed>>224)&1==0?int256(1):int256(-1));
        s.balls[0].vy=int256((seed>>232)%500)*1e6*((seed>>248)&1==0?int256(1):int256(-1));
        (T.State memory x,bool cx,T.Collision[] memory lx)=k.advance(s,T0+2_000_000,256);
        (T.State memory y,bool cy,T.Collision[] memory ly)=old.advance(s,T0+2_000_000,256);
        assertEq(cx,cy);assertTrue(same(x,lx,y,ly),"diverged without a shared microsecond");
    }
    /// Effects that neither force a grid (5 curve, 16 well, 17 wind) nor add a ball (21).
    function pick(uint256 seed) internal pure returns(uint8 id){
        id=uint8(seed%24)+1;if(id==5||id==16||id==17||id==21)id=22;
    }
    /// Two balls, lockstep or independent: where a call stops never changes play.
    function testFuzzTwoBallCallPartitionInvariance(uint256 seed,uint64 cut) public view {
        T.State memory s=k.initial(bytes32(seed),96000000,96000000);
        (s.effects,)=e.announce(s.effects,21,0,0,1,0);
        uint8 b=uint8(seed%24+1);if(b!=21)(s.effects,)=e.announce(s.effects,b,uint8(seed>>8)%2,uint32(seed>>16),2,0);
        s.t=T0;s.nextForce=T0;randomBall(s.balls[0],seed>>60);s=d.prepare(s);
        if((seed>>250)&1==1)randomBall(s.balls[1],seed>>130);
        cut=uint64(bound(cut,T0+1,T0+599_999));
        T.State memory whole=drive(s,T0+600_000);T.State memory split=drive(drive(s,cut),T0+600_000);
        assertEq(keccak256(abi.encode(whole)),keccak256(abi.encode(split)),"partition changed the result");
    }
    function randomBall(T.Ball memory b,uint256 seed) internal pure {
        b.x=int256(20+seed%985)*P;b.y=int256(10+(seed>>12)%557)*P;
        b.vx=int256(32+(seed>>24)%6000)*1e6*((seed>>40)&1==0?int256(1):int256(-1));
        b.vy=int256((seed>>41)%800)*1e6*((seed>>52)&1==0?int256(1):int256(-1));b.lastHitter=uint8((seed>>53)%3);
    }
    function drive(T.State memory s,uint64 target) internal view returns(T.State memory){
        bool complete;for(uint256 i;i<64&&!complete;i++)(s,complete,)=k.advance(s,target,256);return s;
    }
}
