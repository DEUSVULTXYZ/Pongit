// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {AgentPublishedRatings} from "../src/agents/competition/AgentPublishedRatings.sol";
import {IndependentTypes as T} from "../src/independent/IndependentTypes.sol";

contract AgentPublishedRatingsTest is Test {
    AgentPublishedRatings ledger;address a=address(0xa);address b=address(0xb);
    function setUp() public {vm.chainId(10143);vm.warp(1_800_000_000);ledger=new AgentPublishedRatings(address(this),address(this),block.timestamp);ledger.sealMigration(keccak256("empty season"));}
    function result(uint256 id,address arena,address winner,bool ranked) private view returns(T.Result memory){
        return T.Result(arena,1,id,a,b,winner,0,ranked,3,winner==address(0)?6:winner==a?7:2,winner==address(0)?6:winner==b?7:2,bytes32(id));
    }
    function testDrawLeavesEloPlacementsAndPairCountUnchanged() public {
        ledger.publish(result(1,address(0x10),address(0),true),false);assertEq(ledger.ratingOf(a,0).elo,1000);assertEq(ledger.ratingOf(a,0).played,0);
        ledger.publish(result(2,address(0x11),a,true),false);assertEq(ledger.ratingOf(a,0).elo,1032);assertEq(ledger.ratingOf(b,0).elo,968);
        assertEq(ledger.ratingOf(a,0).played,1);assertEq(ledger.ratingOf(a,1).elo,1000,"Classic and Chaos remain distinct");
    }
    function testDifferentArenasShareOneLedgerAndCorrectionRebuildsAtomically() public {
        T.Result memory first=result(1,address(0x10),a,true);ledger.publish(first,false);ledger.publish(result(2,address(0x11),a,true),false);
        uint32 previous=ledger.ratingOf(a,0).elo;assertGt(previous,1032);
        first.winner=address(0);first.scoreA=6;first.scoreB=6;first.hash=bytes32(uint256(99));ledger.reconcile(first,false);
        assertGt(ledger.buildGeneration(),0);ledger.rebuild(1);assertEq(ledger.ratingOf(a,0).elo,previous,"partial rebuild is not the displayed ranking");
        ledger.rebuild(1);assertEq(ledger.ratingOf(a,0).elo,1032);assertEq(ledger.ratingOf(a,0).played,1);
        ledger.reconcile(first,false);assertEq(ledger.buildGeneration(),0);assertEq(ledger.count(),2);
    }
    function testFriendlyAndCancellationNeverChangeAgentRatings() public {
        ledger.publish(result(1,address(0x10),a,false),false);T.Result memory cancelled=result(2,address(0x11),address(0),true);cancelled.status=4;
        ledger.publish(cancelled,true);assertEq(ledger.ratingOf(a,0).played,0);assertEq(ledger.ratingOf(b,0).elo,1000);
        vm.expectRevert("result identity");ledger.publish(cancelled,true);
        cancelled.status=3;cancelled.winner=a;vm.expectRevert("final result immutable");ledger.reconcile(cancelled,true);
    }
}
