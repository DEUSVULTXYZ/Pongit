// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ChaosModifiers as M} from "../src/chaos/ChaosModifiers.sol";
contract ChaosModifiersTest is Test {
    M m;function setUp()public{m=new M();}
    function effect(uint8 id,uint8 target)private pure returns(M.Effect memory){return M.Effect(id,target,1000,13000,false);}
    function pair(uint8 a,uint8 b)private pure returns(M.Effect[2] memory e){e[0]=effect(a,0);if(b!=0)e[1]=effect(b,0);}
    function testSizeSwapBeforeIndividualBonusesAndSolidClamp() public view {
        M.Paddles memory p=m.calculate(72e6,96e6,pair(12,1),1000);assertEq(p.heightA,120e6);assertEq(p.heightB,72e6);
        p=m.calculate(72e6,96e6,pair(7,9),1000);assertEq(p.heightA,64e6);
        p=m.calculate(96e6,72e6,pair(1,23),1000);assertEq(p.heightA,120e6);assertEq(p.heightB,90e6);
    }
    function testOverdriveAndHeavyMultiply() public view {
        M.Paddles memory p=m.calculate(96e6,96e6,pair(2,8),1000);assertEq(p.speedA,187200000);assertEq(p.speedB,180e6);
    }
    function testAnnouncementExpiryAndConsumption() public view {
        M.Effect[2] memory e=pair(1,2);
        M.Paddles memory p=m.calculate(96e6,96e6,e,999);assertEq(p.heightA,96e6);assertEq(p.speedA,180e6);
        p=m.calculate(96e6,96e6,e,13000);assertEq(p.heightA,96e6);assertEq(p.speedA,180e6);
        e[0].consumed=true;p=m.calculate(96e6,96e6,e,1000);assertEq(p.heightA,96e6);assertEq(p.speedA,234e6);
    }
    function testPotatoUsesItsCurrentOwnerAtFourSeconds() public view {
        M.Effect[2] memory e=pair(10,0);e[0].expiresAt=8000;e[0].target=1;
        assertEq(m.calculate(96e6,96e6,e,4999).speedB,180e6);
        assertEq(m.calculate(96e6,96e6,e,5000).speedB,144e6);
        assertEq(m.calculate(96e6,96e6,e,8000).speedB,180e6);
    }
    function testSplitHasEmptyGapInAdditionToSolidHeight() public view {
        M.Paddles memory p=m.calculate(96e6,96e6,pair(11,0),1000);assertTrue(p.splitA);assertFalse(p.splitB);
        assertEq(m.outerHalf(p.heightA,p.splitA),56e6);assertEq(m.outerHalf(p.heightB,p.splitB),48e6);
    }
    function testAll276PairsStayBoundedAndOrderIndependent() public view {
        for(uint8 a=1;a<=24;a++)for(uint8 b=a+1;b<=24;b++){
            M.Paddles memory p=m.calculate(72543219,95321123,pair(a,b),5500);
            M.Paddles memory q=m.calculate(72543219,95321123,pair(b,a),5500);
            assertEq(abi.encode(p),abi.encode(q));assertGe(p.heightA,64e6);assertLe(p.heightA,120e6);
            assertGe(p.heightB,64e6);assertLe(p.heightB,120e6);assertGt(p.speedA,0);
        }
    }
}
