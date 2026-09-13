// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ChaosRally} from "../src/chaos/ChaosRally.sol";
contract ChaosRallyTest is Test {
    ChaosRally rules=new ChaosRally();
    function testAllScoresBothBeneficiariesAndPointValues() public view {
        for(uint8 a;a<7;a++)for(uint8 b;b<7;b++)for(uint8 beneficiary=1;beneficiary<=2;beneficiary++)for(uint8 jackpot;jackpot<2;jackpot++){
            ChaosRally.Score memory s=ChaosRally.Score(a,b,17,false,0);bool point;bool result;
            (s,point,result)=rules.resolve(s,beneficiary,jackpot==1);
            assertTrue(point);assertEq(s.rally,18);assertLe(s.a,7);assertLe(s.b,7);
            uint8 prior=beneficiary==1?a:b;bool win=prior+1+jackpot>=7;
            assertEq(result,win);assertEq(s.finished,win);if(win)assertEq(s.winner,beneficiary);
            if(beneficiary==1)assertEq(s.b,b);else assertEq(s.a,a);
        }
    }
    function testOppositeSimultaneousGoalsVoidButAdvanceRealRally() public view {
        (ChaosRally.Score memory s,bool point,bool result)=rules.resolve(ChaosRally.Score(6,6,19,false,0),3,true);
        assertEq(s.a,6);assertEq(s.b,6);assertEq(s.rally,20);assertFalse(point);assertFalse(result);
    }
    function testDuplicateResultCannotAwardAnotherPointOrResult() public view {
        (ChaosRally.Score memory s,,bool result)=rules.resolve(ChaosRally.Score(5,6,20,false,0),1,true);assertTrue(result);
        (s,,result)=rules.resolve(s,2,true);assertFalse(result);assertEq(s.a,7);assertEq(s.b,6);assertEq(s.rally,21);
    }
}
