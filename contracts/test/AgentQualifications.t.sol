// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {AgentCatalog} from "../src/agents/competition/AgentCatalog.sol";
import {AgentQualifications} from "../src/agents/competition/AgentQualifications.sol";
import {HousePolicies} from "../src/agents/competition/HousePolicies.sol";
import {CompetitionTypes as T} from "../src/agents/competition/CompetitionTypes.sol";

contract AgentQualificationsTest is Test {
    AgentCatalog catalog;AgentQualifications queue;
    address constant A=address(0xa);address constant B=address(0xb);
    uint256 constant VALID=uint256(10)<<192;
    function setUp() public {
        vm.chainId(10143);vm.warp(1800000000);
        catalog=new AgentCatalog(address(this),address(this),address(new HousePolicies()));
        catalog.configure(address(this),address(this));queue=new AgentQualifications(catalog,address(this));catalog.bindQualifications(address(queue));
        catalog.addHouse(A,bytes32(uint256(1)),0);catalog.addHouse(B,bytes32(uint256(2)),1);
        catalog.qualify(B,0,true,bytes32(uint256(1)));
    }
    function trial(uint256 id) private returns(T.Result memory r){
        T.Ref memory ref=T.Ref(10143,address(0x123),1,id);queue.bind(ref,A,B,0);
        r=T.Result(ref,A,B,A,keccak256(abi.encode(id)),0,3,7,2,30000000,false);
    }
    function testTechnicalCancellationCanBeCorrectedWithoutLosingLaterValidEvidence() public {
        T.Result memory r=trial(1);r.status=4;queue.complete(r,0,0);
        assertEq(catalog.identity(A).qualified,0);assertEq(catalog.identity(B).qualified,1);
        r.status=3;r.hash=keccak256("published correction");queue.complete(r,VALID,VALID);
        assertEq(catalog.identity(A).qualified,1);assertEq(catalog.identity(B).qualified,1);
        bytes32 proof=catalog.qualificationEvidence(A,0);uint256 revision=catalog.revision();queue.complete(r,VALID,VALID);
        assertEq(catalog.qualificationEvidence(A,0),proof);assertEq(catalog.revision(),revision);
    }
    function testOldTrialCorrectionCannotEraseNewQualificationOrChangeItsRetry() public {
        T.Result memory first=trial(1);queue.complete(first,VALID,VALID);
        T.Result memory later=trial(2);vm.warp(block.timestamp+60);queue.complete(later,VALID,VALID);
        bytes32 evidence=catalog.qualificationEvidence(A,0);uint64 retry=queue.retryAt(A,0);
        vm.warp(block.timestamp+60);first.status=4;first.hash=keccak256("cancel old result");queue.complete(first,0,0);
        assertEq(catalog.identity(A).qualified,1);assertEq(catalog.qualificationEvidence(A,0),evidence);assertEq(queue.retryAt(A,0),retry);
    }
    function testCorrectedEngineCancellationRestoresStandingBeforeTrial() public {
        T.Result memory r=trial(1);queue.complete(r,VALID,VALID);assertEq(catalog.identity(A).qualified,1);
        r.status=4;r.hash=keccak256("corrected engine cancellation");queue.complete(r,0,0);
        assertEq(catalog.identity(A).qualified,0);assertEq(catalog.identity(B).qualified,1);
        assertEq(queue.retryAt(A,0),block.timestamp+60);
    }
    function testInvalidDecisionsCannotHideBehindValidOnesAndNonceIsPoolOnly() public {
        T.Result memory r=trial(1);queue.complete(r,VALID|(uint256(1)<<224),VALID);
        assertEq(catalog.identity(A).qualified,0);assertEq(queue.retryAt(A,0),block.timestamp+900);
        vm.expectRevert("Monad pool only");vm.prank(address(0x987));queue.complete(r,VALID,VALID);
    }
}
