// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {MigratingAgentCatalogTest} from "./MigratingAgentCatalog.t.sol";
import {RecoveringAgentCatalog} from "../src/agents/competition/RecoveringAgentCatalog.sol";
import {ContinuingAgentTournaments} from "../src/agents/competition/ContinuingAgentTournaments.sol";
import {AgentTournaments} from "../src/agents/competition/AgentTournaments.sol";
import {CompetitionTypes as T} from "../src/agents/competition/CompetitionTypes.sol";

contract RecoveringAgentCatalogTest is MigratingAgentCatalogTest {
    RecoveringAgentCatalog recovery;
    ContinuingAgentTournaments continued;
    bytes32 constant WHY=keccak256("operator-authorized legacy hosting outage");
    function setUp() public override {
        super.setUp();recovery=new RecoveringAgentCatalog(old,address(old).codehash,address(this),address(this),builtin);
        continued=new ContinuingAgentTournaments(recovery,pool,address(this));
        recovery.configure(address(continued),address(pool));vm.prank(address(pool));recovery.bindQualifications(address(pool));
    }
    function _stopped(bool finality) private {
        book.setAdmissions(true);book.begin();book.select(1,32);
        (uint8 index,address a,address b,)=book.nextFixture(1);
        T.Ref memory ref=T.Ref(10143,address(0xaa),1,1);pool.bind(book,1,index,ref);
        pool.put(T.Result(ref,a,b,a,bytes32(uint256(1)),0,3,7,2,20_000_000,finality));book.synchronize(1,index);
        book.setAdmissions(false);
    }
    function _recover() private {
        recovery.authorizeRetirement(1,WHY);recovery.startImport();recovery.importPage(32);recovery.seal();continued.sealContinuation();
    }
    function testRetiresExactTournamentLocksWithoutChampionOrRewritingResults() public {
        _stopped(true);AgentTournaments.Tournament memory before_=book.tournament(1);
        bytes32 original=keccak256(abi.encode(book.fixture(1,0)));_recover();
        assertEq(uint8(continued.tournament(1).status),5);assertEq(continued.tournament(1).champion,address(0));
        assertEq(continued.tournament(1).completedAt,0);assertEq(continued.interruptedAt(),block.timestamp);
        assertEq(uint8(book.tournament(1).status),2);assertEq(keccak256(abi.encode(continued.fixture(1,0))),original);
        assertEq(keccak256(abi.encode(continued.standings(1))),keccak256(abi.encode(book.standings(1))));
        for(uint8 i;i<8;i++){
            address a=before_.agents[i];assertEq(old.participation(a),book.token(1));assertEq(recovery.participation(a),0);
            assertEq(keccak256(abi.encode(old.identity(a))),keccak256(abi.encode(recovery.identity(a))));
        }
        assertFalse(continued.fixture(1,1).resolved);assertEq(continued.fixture(1,1).published.winner,address(0));
        vm.expectRevert("unbound match");continued.synchronize(1,0);
        continued.setAdmissions(true);vm.warp(continued.nextAt());assertEq(continued.begin(),2);continued.select(2,32);
        assertEq(continued.tournament(2).mode,1);assertEq(uint8(continued.tournament(2).status),2);
    }
    function testCannotRetireUnfinalizedScoreOrLiveLane() public {
        _stopped(false);vm.expectRevert("unfinalized source fixture");recovery.authorizeRetirement(1,WHY);
        pool.setLaneCount(5);pool.setLane(4,bytes32(uint256(4)));
        vm.expectRevert("source matches still active");recovery.authorizeRetirement(1,WHY);
    }
    function testOwnerExplicitEvidenceAndSingleAuthorizationRequired() public {
        _stopped(true);vm.expectRevert("retired source changed");recovery.startImport();
        vm.prank(address(444));vm.expectRevert("retirement setup only");recovery.authorizeRetirement(1,WHY);
        vm.expectRevert("retirement setup only");recovery.authorizeRetirement(1,0);
        recovery.authorizeRetirement(1,WHY);vm.expectRevert("retirement setup only");recovery.authorizeRetirement(1,WHY);
    }
    function testRetirementInvalidatedIfSourceStartsAnotherFixture() public {
        _stopped(true);recovery.authorizeRetirement(1,WHY);
        (uint8 index,,,) =book.nextFixture(1);pool.bind(book,1,index,T.Ref(10143,address(0xaa),1,2));
        vm.expectRevert("unfinalized source fixture");recovery.startImport();
    }
    function testCannotRetireUnrelatedQualificationLockOrOpenSource() public {
        _stopped(true);
        // Community is the ninth address, outside this tournament's eight slots.
        vm.prank(address(pool));old.reserveQualification(COMMUNITY,0,bytes32(uint256(987)));
        recovery.authorizeRetirement(1,WHY);recovery.startImport();
        vm.expectRevert("unrelated source participation");recovery.importPage(32);
        pool.gates(true,false);vm.expectRevert("source admissions open");recovery.importPage(1);
    }
    function testCompletedTournamentCannotBeRelabeledInterrupted() public {
        _finishTournament();vm.expectRevert("only latest stopped playing tournament");recovery.authorizeRetirement(1,WHY);
    }
}
