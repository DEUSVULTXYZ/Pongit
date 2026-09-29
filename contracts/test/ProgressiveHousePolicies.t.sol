// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ProgressiveHousePolicies as P} from "../src/agents/competition/ProgressiveHousePolicies.sol";
import {HousePolicies as B} from "../src/agents/competition/HousePolicies.sol";
import {HouseController as H} from "../src/agents/HouseController.sol";

contract ProgressiveHousePoliciesTest is Test {
    P policy=new P();uint8[8] order=[0,6,4,1,5,3,7,2];int256 constant U=1e12;
    function observation(uint256 seed) private pure returns(B.View memory v){
        v.balls=new H.Ball[](1);v.balls[0]=H.Ball(100*U,288*U,-500e6,0);
        v.side=0;v.t=1000000;v.paddle=288*U;v.half=48*U;v.opponent=200*U;
        v.seed=bytes32(seed);v.rally=1;v.tournament=0;
    }
    function testLinearReactionAndMistakeScheduleWithStableIdentities() public view {
        for(uint8 level;level<8;level++){
            assertEq(policy.difficulty(order[level]),level);
            assertEq(policy.mistakePercent(order[level]),55-7*level);
            assertEq(policy.tuning(order[level]).reactionUs,450000-50000*uint256(level));
        }
    }
    function testActualAimErrorsDecreaseAtEveryLevelAcrossTheSameThousandRallies() public {
        uint256[8] memory missed;
        for(uint256 seed;seed<1000;seed++)for(uint8 level;level<8;level++){
            B.Memory memory brain;(,brain)=policy.decide(order[level],observation(seed),brain);
            uint256 error=uint256(brain.lastTarget>288*U?brain.lastTarget-288*U:288*U-brain.lastTarget);
            if(error>54*uint256(U))missed[level]++;
        }
        assertGt(missed[0],450);assertLt(missed[0],650);assertLt(missed[7],100);
        for(uint8 level;level<8;level++){
            emit log_named_uint("level misses per 1000",missed[level]);
            if(level>0){assertGt(missed[level-1],missed[level]);assertGt(missed[level-1]-missed[level],35);assertLt(missed[level-1]-missed[level],110);}
        }
    }
    function testReactionReallyHoldsAndNoMemoryLeaksBetweenInstances() public view {
        B.View memory v=observation(9);B.Memory memory a;(,a)=policy.decide(0,v,a);
        B.Memory memory before=a;v.balls[0].y=100*U;v.t=a.nextDecision-1;
        (,a)=policy.decide(0,v,a);assertEq(policy.pack(a),policy.pack(before));
        B.Memory memory other;(,other)=policy.decide(0,observation(9),other);assertEq(policy.pack(other),policy.pack(before));
        assertEq(policy.pack(policy.unpack(policy.pack(a))),policy.pack(a));
    }
    function testRookieDoesNotKnowTheFullReflectedIntercept() public view {
        B.View memory v=observation(22);v.balls[0]=H.Ball(940*U,80*U,-500e6,400e6);
        B.Memory memory empty;(,B.Memory memory novice)=policy.decide(0,v,empty);
        (,B.Memory memory expert)=policy.decide(2,v,empty);
        assertTrue(novice.lastTarget!=expert.lastTarget);
        assertLt(address(policy).code.length,24576);
    }
}
