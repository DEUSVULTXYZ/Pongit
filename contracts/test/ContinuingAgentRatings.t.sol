// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {AgentPublishedRatings} from "../src/agents/competition/AgentPublishedRatings.sol";
import {ContinuingAgentRatings} from "../src/agents/competition/ContinuingAgentRatings.sol";
import {IndependentTypes as T} from "../src/independent/IndependentTypes.sol";
import {PublishedRatings} from "../src/independent/PublishedRatings.sol";
import {ILobbyRatings} from "../src/autonomous/ContractLobby.sol";

contract RetiredRatingPool {
    AgentPublishedRatings public ratings;
    bool public admissions;bool public publicAdmissions;
    mapping(uint256=>bytes32) public laneMatch;
    function bind(AgentPublishedRatings r) external {ratings=r;}
    function gate(bool v) external {admissions=v;}
    function lane(uint256 id,bytes32 token) external {laneMatch[id]=token;}
    function publish(T.Result calldata r,bool finality) external {ratings.publish(r,finality);}
    function correct(T.Result calldata r,bool finality) external {ratings.reconcile(r,finality);}
}

contract ContinuingAgentRatingsTest is Test {
    RetiredRatingPool oldPool;AgentPublishedRatings source;AgentPublishedRatings control;
    ContinuingAgentRatings next;address a=address(0xa);address b=address(0xb);
    bytes32 constant SEAL=keccak256("empty source");bytes32 constant AUDIT=keccak256("audited owner nonce interval");
    uint256 genesis;
    function setUp() public {
        vm.chainId(10143);vm.warp(1_800_000_000);genesis=block.timestamp;
        oldPool=new RetiredRatingPool();source=new AgentPublishedRatings(address(oldPool),address(this),genesis);oldPool.bind(source);source.sealMigration(SEAL);
        control=new AgentPublishedRatings(address(this),address(this),genesis);control.sealMigration(SEAL);
        next=new ContinuingAgentRatings(source,address(source).codehash,SEAL,AUDIT,address(this),address(this));
    }
    function result(uint256 id,address winner,bool ranked,uint8 mode) private view returns(T.Result memory){
        return T.Result(address(0x10),1,id,a,b,winner,mode,ranked,3,winner==address(0)?6:winner==a?7:2,winner==address(0)?6:winner==b?7:2,bytes32(id));
    }
    function publish(T.Result memory r) private {oldPool.publish(r,false);control.publish(r,false);}
    function migrate() private {next.startImport();next.importPage(32);next.verifyPlayers(0,32);next.verifyPlayers(1,32);next.finishImport();}
    function equalRatings() private view {
        for(uint8 mode;mode<2;mode++){
            assertEq(abi.encode(next.ratingOf(a,mode)),abi.encode(control.ratingOf(a,mode)));
            assertEq(abi.encode(next.ratingOf(b,mode)),abi.encode(control.ratingOf(b,mode)));
        }
    }
    function testReplayPreservesTimestampsPlacementsModesAndNextRepeatPenalty() public {
        publish(result(1,a,true,0));vm.warp(block.timestamp+3);publish(result(2,a,true,0));publish(result(3,b,true,1));
        migrate();equalRatings();assertEq(next.genesisTime(),genesis);
        assertEq(abi.encode(next.entry(1)),abi.encode(source.entry(1)));
        T.Result memory last=result(4,a,true,0);next.publish(last,false);control.publish(last,false);equalRatings();
        assertEq(next.ratingOf(a,0).played,3);assertEq(next.count(),4);
    }
    function testOriginalSeasonSurvivesBoundaryInsteadOfRestartingAtMigration() public {
        publish(result(1,a,true,0));vm.warp(genesis+30 days+10);migrate();equalRatings();assertEq(next.currentSeason(),2);
        T.Result memory later=result(2,b,true,0);next.publish(later,false);control.publish(later,false);equalRatings();
    }
    function testLateCorrectionRebuildsInheritedAndNewResultsExactlyOnce() public {
        publish(result(1,a,true,0));publish(result(2,a,true,0));migrate();
        T.Result memory later=result(3,b,true,0);next.publish(later,false);control.publish(later,false);
        T.Result memory correction=result(1,b,true,0);correction.hash=keccak256("correction");oldPool.correct(correction,false);control.reconcile(correction,false);
        vm.expectRevert("historical ranking synchronization required");next.ratingOf(a,0);
        next.synchronizeHistory(1);vm.expectRevert("historical ranking synchronization required");next.publish(result(4,a,true,0),false);
        next.synchronizeHistory(1);assertGt(next.buildGeneration(),0);next.rebuild(1);next.rebuild(2);control.rebuild(3);equalRatings();
        uint256 g=next.generation();next.synchronizeHistory(32);assertEq(next.buildGeneration(),0);assertEq(next.generation(),g);
    }
    function testSecondCorrectionRestartsPartialHistoryScan() public {
        publish(result(1,a,true,0));publish(result(2,a,true,0));migrate();
        T.Result memory r=result(1,b,true,0);r.hash=bytes32(uint256(8));oldPool.correct(r,false);control.reconcile(r,false);next.synchronizeHistory(1);
        r=result(2,b,true,0);r.hash=bytes32(uint256(9));oldPool.correct(r,false);control.reconcile(r,false);
        next.synchronizeHistory(1);assertEq(next.synchronizationCursor(),1);next.synchronizeHistory(1);
        next.rebuild(32);control.rebuild(32);equalRatings();assertEq(next.sourceRevision(),2);
    }
    function testSourceChangeDuringImportCannotSealMixedHistory() public {
        publish(result(1,a,true,0));next.startImport();next.importPage(1);
        T.Result memory r=result(1,b,true,0);r.hash=bytes32(uint256(9));oldPool.correct(r,false);
        vm.expectRevert("source ratings changed during import");next.finishImport();
    }
    function testClosedSourceAndEmptyLanesAreRequired() public {
        oldPool.gate(true);vm.expectRevert("source ratings still active");next.startImport();oldPool.gate(false);
        oldPool.lane(1,bytes32(uint256(1)));vm.expectRevert("source ratings still active");next.startImport();oldPool.lane(1,0);
        migrate();oldPool.gate(true);vm.expectRevert("source ratings still active");next.publish(result(1,a,true,0),false);
    }
    function testCannotSkipLedgerOrPlayerValidationOrInjectSeeds() public {
        publish(result(1,a,true,0));next.startImport();vm.expectRevert("incomplete history import");next.finishImport();next.importPage(1);
        vm.expectRevert("incomplete rating verification");next.finishImport();
        address[] memory accounts=new address[](0);ILobbyRatings.Rating[] memory values=new ILobbyRatings.Rating[](0);
        vm.expectRevert("replay source ledger only");next.seed(accounts,0,values);
        vm.expectRevert("replay source ledger only");next.seedPairCounts(new bytes32[](0),new uint8[](0));
        vm.expectRevert("finish verified import only");next.sealMigration(bytes32(uint256(1)));
    }
    function testNewPoolCannotRewriteInheritedResultOrPublishDuplicate() public {
        T.Result memory r=result(1,a,true,0);publish(r);migrate();
        vm.expectRevert("historical result belongs to predecessor");next.reconcile(r,false);
        vm.expectRevert("result identity");next.publish(r,false);
        vm.prank(address(0x123));vm.expectRevert("lobby only");next.publish(result(2,a,true,0),false);
    }
    function testFinalityOnlySynchronizationDoesNotRebuildElo() public {
        T.Result memory r=result(1,a,true,0);publish(r);migrate();oldPool.correct(r,true);next.synchronizeHistory(1);
        assertTrue(next.entry(1).finality);assertEq(next.buildGeneration(),0);equalRatings();
    }
    function testEmptySourceAndFriendlyDrawDoNotInventRankedPlayers() public {
        publish(result(1,address(0),false,0));migrate();equalRatings();(,uint256 n)=next.playerPage(0,0,10);assertEq(n,0);
    }
    function testWrongCodeOrMissingAuditRefused() public {
        vm.expectRevert("source ratings code");new ContinuingAgentRatings(source,bytes32(uint256(1)),SEAL,AUDIT,address(this),address(this));
        bytes32 code=address(source).codehash;
        vm.expectRevert("audited empty source required");new ContinuingAgentRatings(source,code,SEAL,0,address(this),address(this));
    }
}
