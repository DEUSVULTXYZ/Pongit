// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ChaosEffects} from "../src/chaos/ChaosEffects.sol";

contract ChaosEffectsTest is Test {
    ChaosEffects rules=new ChaosEffects();
    function testAnnouncementDoesNotApplyEarly() public view {
        ChaosEffects.Effect[2] memory es;(es,)=rules.announce(es,1,0,123,1,10000);
        assertFalse(rules.active(es[0],10999));assertTrue(rules.active(es[0],11000));assertFalse(rules.active(es[0],17000));
    }
    function testAll276PairsAdmissionExpiryAndNoThird() public {
        uint256 count;
        for(uint8 a=1;a<=24;a++)for(uint8 b=a+1;b<=24;b++){
            ChaosEffects.Effect[2] memory es;(es,)=rules.announce(es,a,0,15,1,1000);(es,)=rules.announce(es,b,1,16,2,1000);
            assertEq(es[0].id,a);assertEq(es[1].id,b);
            assertEq(rules.excluded(es,1500),(uint24(1)<<(a-1))|(uint24(1)<<(b-1)));
            vm.expectRevert(ChaosEffects.DuplicateEffect.selector);rules.announce(es,a,0,4,3,1500);
            uint8 third=1;while(third==a||third==b)third++;
            vm.expectRevert(ChaosEffects.NoEffectSlot.selector);rules.announce(es,third,0,4,3,1500);
            (es,)=rules.expire(es,14000);assertEq(es[0].id,0);assertEq(es[1].id,0);count++;
        }
        assertEq(count,276);
    }
    function testChargedShotConsumesOnceAndCombinesWithParry() public view {
        ChaosEffects.Effect[2] memory es;(es,)=rules.announce(es,4,0,0,1,0);(es,)=rules.announce(es,6,0,0,2,0);
        ChaosEffects.Shot memory shot;(es,shot)=rules.paddleHit(es,0,0,5,true,1000);
        assertEq(shot.numerator,78);assertEq(shot.denominator,50);assertEq(shot.consumedMask,1);assertEq(es[0].id,0);assertEq(es[1].id,6);
        (,shot)=rules.paddleHit(es,0,0,5,false,1001);assertEq(shot.numerator,1);
    }
    function testCurveUsesLastMovementThenVerticalSign() public view {
        ChaosEffects.Effect[2] memory es;(es,)=rules.announce(es,5,1,0,1,0);
        (,ChaosEffects.Shot memory shot)=rules.paddleHit(es,1,-1,42,false,1000);assertEq(shot.curveSign,-1);
        (,shot)=rules.paddleHit(es,1,0,-42,false,1000);assertEq(shot.curveSign,-1);
        (,shot)=rules.paddleHit(es,1,0,0,false,1000);assertEq(shot.curveSign,1);
    }
    function testHotPotatoStopsTransferringAtFourSeconds() public view {
        ChaosEffects.Effect[2] memory es;(es,)=rules.announce(es,10,0,0,1,0);
        (es,)=rules.paddleHit(es,1,0,0,false,4999);assertEq(es[0].target,1);
        (es,)=rules.paddleHit(es,0,0,0,false,5000);assertEq(es[0].target,1);
    }
    function testShieldAndEachBrickCanOnlyBeUsedOnce() public {
        ChaosEffects.Effect[2] memory es;(es,)=rules.announce(es,3,0,0,1,0);(es,)=rules.announce(es,19,1,0,2,0);
        bool saved;(es,saved,)=rules.shield(es,1,1000);assertFalse(saved);
        (es,saved,)=rules.shield(es,0,1000);assertTrue(saved);
        (es,saved,)=rules.shield(es,0,1000);assertFalse(saved);
        es=rules.breakBrick(es,1,2,1000);assertEq(es[1].remaining,3);
        vm.expectRevert(ChaosEffects.InvalidEffect.selector);rules.breakBrick(es,1,2,1000);
        es=rules.breakBrick(es,1,0,1000);es=rules.breakBrick(es,1,1,1000);assertEq(es[1].id,0);
    }
    function testJackpotOnlyWithinConfirmedActiveInterval() public view {
        ChaosEffects.Effect[2] memory es;(es,)=rules.announce(es,22,0,0,1,0);
        assertEq(rules.pointValue(es,999),1);assertEq(rules.pointValue(es,1000),2);assertEq(rules.pointValue(es,13000),1);
    }
    function testMysteryRefreshesExistingRewardWithoutStacking() public view {
        for(uint8 reward=1;reward<=4;reward++){
            ChaosEffects.Effect[2] memory es;(es,)=rules.announce(es,reward,0,0,1,0);(es,)=rules.announce(es,24,0,reward-1,2,0);
            uint8 actual;(es,actual)=rules.collect(es,1,1,2000);
            assertEq(actual,reward);assertEq(es[1].id,0);assertEq(es[0].id,reward);assertEq(es[0].target,1);
            assertEq(es[0].serial,2);assertEq(es[0].expiresAt,2000+rules.duration(reward));
        }
    }
}
