// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {MigratingAgentCatalogTest} from "./MigratingAgentCatalog.t.sol";
import {AgentCatalog} from "../src/agents/competition/AgentCatalog.sol";
import {AgentQualifications} from "../src/agents/competition/AgentQualifications.sol";
import {ContinuingAgentQualifications} from "../src/agents/competition/ContinuingAgentQualifications.sol";

contract QualificationMigrationSourceMock {
    AgentCatalog public catalog;address public pool;uint256 public cursor;
    mapping(address=>mapping(uint8=>uint64)) public retryAt;
    constructor(AgentCatalog c,address p){catalog=c;pool=p;}
    function setCursor(uint256 n) external {cursor=n;}
    function setRetry(address a,uint8 mode,uint64 at) external {retryAt[a][mode]=at;}
}

contract ContinuingAgentQualificationsTest is MigratingAgentCatalogTest {
    QualificationMigrationSourceMock sourceQueue;
    ContinuingAgentQualifications queue;
    function setUp() public override {
        super.setUp();sourceQueue=new QualificationMigrationSourceMock(old,address(pool));
        pool.setQueues(address(0),address(sourceQueue));
        sourceQueue.setCursor(17);sourceQueue.setRetry(COMMUNITY,0,uint64(block.timestamp+60));
        sourceQueue.setRetry(COMMUNITY,1,uint64(block.timestamp+900));
    }
    function _queue() private {
        _import();queue=new ContinuingAgentQualifications(AgentQualifications(address(sourceQueue)),address(sourceQueue).codehash,next,address(this));
        queue.startImport();
    }
    function _sealQueue() private {_queue();queue.importPage(8);queue.importPage(8);queue.sealContinuation();}
    function testPreservesCursorEvidenceAndBothModeRetryDeadlines() public {
        _sealQueue();assertEq(queue.cursor(),17);assertEq(queue.sourceCursor(),17);assertEq(queue.imported(),9);
        assertEq(queue.retryAt(COMMUNITY,0),sourceQueue.retryAt(COMMUNITY,0));
        assertEq(queue.retryAt(COMMUNITY,1),sourceQueue.retryAt(COMMUNITY,1));
        assertEq(queue.inheritedEvidence(COMMUNITY,0),old.qualificationEvidence(COMMUNITY,0));
        assertEq(queue.inheritedEvidence(COMMUNITY,1),bytes32(0));assertTrue(queue.continuationSealed());
    }
    function testRetryDoesNotDisappearAtMigrationOrPermitImmediateRequalification() public {
        _sealQueue();(address a,,)=queue.takeNext();assertEq(a,address(0));
        vm.warp(block.timestamp+901);uint8 mode;(a,,mode)=queue.takeNext();assertEq(a,COMMUNITY);assertEq(mode,1);
    }
    function testLaterHistoricalCorrectionExtendsInheritedRetry() public {
        _sealQueue();uint64 extended=uint64(block.timestamp+1800);sourceQueue.setRetry(COMMUNITY,1,extended);
        assertEq(queue.retryAt(COMMUNITY,1),extended);vm.warp(block.timestamp+901);(address a,,)=queue.takeNext();assertEq(a,address(0));
    }
    function testMirroringHistoricalEvidenceDoesNotDiscardItsRetry() public {
        _sealQueue();vm.prank(address(pool));old.qualify(COMMUNITY,1,false,bytes32(uint256(800)));
        sourceQueue.setRetry(COMMUNITY,1,uint64(block.timestamp+1800));next.synchronizeQualification(COMMUNITY,1);
        assertEq(queue.retryAt(COMMUNITY,1),block.timestamp+1800);assertTrue(next.qualificationInherited(COMMUNITY,1));
    }
    function testNewIndependentVerdictStopsAnOldTrialChangingItsRetry() public {
        _sealQueue();uint64 original=queue.retryAt(COMMUNITY,1);
        vm.prank(address(pool));next.qualify(COMMUNITY,1,false,bytes32(uint256(999)));
        sourceQueue.setRetry(COMMUNITY,1,uint64(block.timestamp+1800));
        assertEq(queue.retryAt(COMMUNITY,1),original,"old trial does not overwrite independent verdict");
    }
    function testNoSelectionOrPartialSealBeforeCompleteImport() public {
        _queue();vm.expectRevert("qualification continuation not sealed");queue.takeNext();
        queue.importPage(8);vm.expectRevert("incomplete qualification import");queue.sealContinuation();
        queue.importPage(8);queue.sealContinuation();vm.expectRevert("import setup only");queue.startImport();
    }
    function testReopenedSourceOrChangedSourceCursorFailsClosed() public {
        _queue();pool.gates(true,false);vm.expectRevert("source qualifications open");queue.importPage(8);pool.gates(false,false);
        queue.importPage(8);sourceQueue.setCursor(0);vm.expectRevert("source qualification changed");queue.importPage(8);
    }
    function testSourceCatalogueEditCannotMixQualificationSnapshots() public {
        _queue();queue.importPage(8);vm.prank(vm.addr(CREATOR));old.setAvailable(COMMUNITY,false);
        vm.expectRevert("source catalogue changed");queue.importPage(8);
    }
    function testWrongCodeBindingOwnerAndBoundsRejected() public {
        _import();vm.expectRevert("source qualification code");
        new ContinuingAgentQualifications(AgentQualifications(address(sourceQueue)),bytes32(uint256(1)),next,address(this));
        QualificationMigrationSourceMock wrong=new QualificationMigrationSourceMock(old,address(123));
        vm.expectRevert("source qualification binding");new ContinuingAgentQualifications(AgentQualifications(address(wrong)),address(wrong).codehash,next,address(this));
        queue=new ContinuingAgentQualifications(AgentQualifications(address(sourceQueue)),address(sourceQueue).codehash,next,address(this));
        vm.prank(address(123));vm.expectRevert("import setup only");queue.startImport();queue.startImport();
        vm.expectRevert("import page bounds");queue.importPage(0);vm.expectRevert("import page bounds");queue.importPage(33);
        vm.etch(address(sourceQueue),hex"00");vm.expectRevert("source qualification code");queue.importPage(1);
    }
}
