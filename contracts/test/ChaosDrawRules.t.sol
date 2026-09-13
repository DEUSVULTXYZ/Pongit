// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ChaosDrawRules} from "../src/chaos/ChaosDrawRules.sol";
contract ChaosDrawRulesTest is Test {
    ChaosDrawRules rules;
    function setUp() public { rules=new ChaosDrawRules(); }
    function request() private pure returns(ChaosDrawRules.Request memory){
        return ChaosDrawRules.Request(address(0x1234),1,99,0,20595447,0);
    }
    function testCatalogueIncludesAllTwentyFour() public view {
        uint256 total;
        for(uint8 i=1;i<=24;i++){assertGe(rules.durationMs(i),5000);assertLe(rules.durationMs(i),12000);total+=rules.weight(i);}
        assertEq(total,84);
    }
    function testFuzzDrawDomainAndRange(bytes32 random,uint24 excluded) public view {
        if(excluded==type(uint24).max)excluded=0;
        ChaosDrawRules.Request memory r=request();r.excluded=excluded;
        ChaosDrawRules.Draw memory d=rules.reveal(r,rules.commitment(r),random);
        assertGe(d.eventId,1);assertLe(d.eventId,24);assertLe(d.target,1);
        assertEq(excluded&(uint24(1)<<(d.eventId-1)),0);
        assertGe(d.intervalMs,8000);assertLe(d.intervalMs,12000);assertEq(d.intervalMs%10,0);
    }
    function testRejectChangedEpochRoundMatchIndexApplicationAndMask() public {
        ChaosDrawRules.Request memory r=request();bytes32 c=rules.commitment(r);
        r.epoch++;rejected(r,c);r=request();r.round++;rejected(r,c);
        r=request();r.matchId++;rejected(r,c);r=request();r.index++;rejected(r,c);
        r=request();r.app=address(0x4567);rejected(r,c);r=request();r.excluded=1;rejected(r,c);
    }
    function rejected(ChaosDrawRules.Request memory r,bytes32 c) private {
        vm.expectRevert(ChaosDrawRules.InvalidDrawContext.selector);rules.reveal(r,c,bytes32(uint256(42)));
    }
    function testEveryAllowedSingletonCanBeDrawn() public view {
        for(uint8 i=1;i<=24;i++){
            ChaosDrawRules.Request memory r=request();r.excluded=type(uint24).max^(uint24(1)<<(i-1));
            assertEq(rules.reveal(r,rules.commitment(r),bytes32(uint256(i))).eventId,i);
        }
    }
    function testEveryPairExclusionIsRespected() public view {
        uint256 pairs;
        for(uint8 a=1;a<=24;a++)for(uint8 b=a+1;b<=24;b++){
            ChaosDrawRules.Request memory r=request();r.excluded=(uint24(1)<<(a-1))|(uint24(1)<<(b-1));
            ChaosDrawRules.Draw memory d=rules.reveal(r,rules.commitment(r),keccak256(abi.encode(a,b)));
            assertTrue(d.eventId!=a&&d.eventId!=b);pairs++;
        }
        assertEq(pairs,276);
    }
    function testAllExcludedAndUnknownEventsReject() public {
        ChaosDrawRules.Request memory r=request();r.excluded=type(uint24).max;bytes32 c=rules.commitment(r);rejected(r,c);
        vm.expectRevert();rules.weight(0);vm.expectRevert();rules.durationMs(25);
    }
}
