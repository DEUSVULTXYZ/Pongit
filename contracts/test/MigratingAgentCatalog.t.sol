// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {AgentCatalog} from "../src/agents/competition/AgentCatalog.sol";
import {MigratingAgentCatalog} from "../src/agents/competition/MigratingAgentCatalog.sol";
import {AgentTournaments} from "../src/agents/competition/AgentTournaments.sol";
import {HousePolicies} from "../src/agents/competition/HousePolicies.sol";
import {CompetitionTypes as T} from "../src/agents/competition/CompetitionTypes.sol";
import {CompetitionAuthorityMock} from "./AgentTournaments.t.sol";

contract MigrationAuthorityMock is CompetitionAuthorityMock {
    bool public admissions;
    bool public publicAdmissions;
    uint256 public nonce;
    mapping(uint256=>bytes32) public laneMatch;
    address public challenges;
    address public qualifications;
    function gates(bool a,bool p) external {admissions=a;publicAdmissions=p;}
    function setNonce(uint256 n) external {nonce=n;}
    function setLane(uint256 lane,bytes32 ref) external {laneMatch[lane]=ref;}
    function setQueues(address c,address q) external {challenges=c;qualifications=q;}
}

contract MigratingAgentCatalogTest is Test {
    AgentCatalog old;
    MigratingAgentCatalog next;
    AgentTournaments book;
    MigrationAuthorityMock pool;
    address builtin;
    uint256 constant CREATOR=12345;
    address constant COMMUNITY=address(0x4000);

    function setUp() public virtual {
        vm.chainId(10143);vm.warp(1_800_000_000);vm.roll(100);
        builtin=address(new HousePolicies());old=new AgentCatalog(address(this),address(this),builtin);
        pool=new MigrationAuthorityMock();book=new AgentTournaments(old,pool,address(this));
        old.configure(address(book),address(pool));vm.prank(address(pool));old.bindQualifications(address(pool));
        for(uint8 i;i<8;i++){
            address bot=address(uint160(0x1000+i));old.addHouse(bot,bytes32(uint256(i+1)),i);
            old.qualify(bot,0,true,bytes32(uint256(10+i)));old.qualify(bot,1,true,bytes32(uint256(20+i)));
        }
        old.seal();_register(old,COMMUNITY,0);pool.qualify(old,COMMUNITY,0);
        vm.prank(vm.addr(CREATOR));old.setAvailable(COMMUNITY,true);
        next=_candidate(address(old).codehash,address(this));
    }
    function _candidate(bytes32 hash,address admin) private returns(MigratingAgentCatalog c){
        c=new MigratingAgentCatalog(old,hash,admin,address(this));
        c.configure(address(book),address(pool));vm.prank(address(pool));c.bindQualifications(address(pool));
    }
    function _register(AgentCatalog c,address agent,uint256 nonce) private {
        vm.etch(agent,abi.encodePacked(hex"73",vm.addr(CREATOR),hex"60005260206000f3"));
        AgentCatalog.Registration memory r=AgentCatalog.Registration(agent,vm.addr(CREATOR),bytes32(uint256(uint160(agent))),3,uint64(block.timestamp+300),nonce);
        (uint8 v,bytes32 rr,bytes32 s)=vm.sign(CREATOR,c.digest(r));c.register(r,abi.encodePacked(rr,s,v));
    }
    function _import() internal {next.startImport();next.importPage(8);next.importPage(8);next.seal();}
    function _finishTournament() internal {
        if(book.nextAt()>block.timestamp)vm.warp(book.nextAt());
        book.setAdmissions(true);uint64 id=book.begin();book.select(id,32);
        AgentTournaments.Tournament memory t=book.tournament(id);
        for(uint8 i;i<(t.league?28:7);i++){
            (uint8 index,address a,address b,)=book.nextFixture(id);
            uint256 serial=uint256(id)*100+i+1;T.Ref memory ref=T.Ref(10143,address(0xaa),1,serial);pool.bind(book,id,index,ref);
            pool.put(T.Result(ref,a,b,a,bytes32(serial),t.mode,3,7,0,20_000_000,true));book.synchronize(id,index);
        }
        book.setAdmissions(false);
    }
    function testExactIdentityNonceQualificationAvailabilityAndOrder() public {
        _finishTournament();_import();assertTrue(next.setupSealed());assertEq(next.count(),old.count());
        assertEq(next.sourceTournamentCount(),1);assertEq(next.sourceNextTournamentAt(),book.nextAt());
        for(uint256 i;i<old.count();i++){
            address agent=old.at(i);assertEq(next.at(i),agent);
            assertEq(keccak256(abi.encode(next.identity(agent))),keccak256(abi.encode(old.identity(agent))));
            assertEq(next.registeredBlock(agent),old.registeredBlock(agent));
            assertEq(next.nonces(old.identity(agent).creator),old.nonces(old.identity(agent).creator));
            assertEq(next.qualificationEvidence(agent,0),old.qualificationEvidence(agent,0));
            assertEq(next.qualificationEvidence(agent,1),old.qualificationEvidence(agent,1));
            assertEq(next.participation(agent),0);
        }
        for(uint8 i;i<8;i++)assertEq(next.house(i),old.house(i));
        assertEq(next.identity(COMMUNITY).house,0);assertEq(next.identity(COMMUNITY).qualified,1);
        assertNotEq(next.importDigest(),bytes32(0));assertEq(next.predecessorCodeHash(),address(old).codehash);
    }
    function testOnlyPinnedSealedSourceWithSameOwnerAndController() public {
        vm.expectRevert("source code hash");new MigratingAgentCatalog(old,bytes32(uint256(7)),address(this),address(this));
        vm.expectRevert("sealed source owner");new MigratingAgentCatalog(old,address(old).codehash,address(123),address(this));
        vm.etch(builtin,hex"00");
        vm.expectRevert("official controller changed");new MigratingAgentCatalog(old,address(old).codehash,address(this),address(this));
    }
    function testAllSourceAdmissionGatesMustClose() public {
        pool.gates(true,false);vm.expectRevert("source admissions open");next.startImport();
        pool.gates(false,true);vm.expectRevert("source admissions open");next.startImport();
        pool.gates(false,false);book.setAdmissions(true);vm.expectRevert("source admissions open");next.startImport();
    }
    function testIdleTournamentCannotHideAnActiveFriendlyLane() public {
        pool.setLane(1,bytes32(uint256(1)));vm.expectRevert("source matches still active");next.startImport();
    }
    function testChangingMatchCounterInvalidatesImportBeforeSeal() public {
        pool.setNonce(88);next.startImport();assertEq(next.sourceMatchNonce(),88);next.importPage(32);
        pool.setNonce(89);vm.expectRevert("source changed during import");next.seal();
    }
    function testUnfinishedTournamentCannotBeImported() public {
        book.setAdmissions(true);book.begin();book.setAdmissions(false);
        vm.expectRevert("source tournament unfinished");next.startImport();
    }
    function testActiveQualificationParticipationCannotBeClearedByImport() public {
        vm.prank(address(pool));old.reserveQualification(COMMUNITY,1,bytes32(uint256(99)));
        next.startImport();next.importPage(8);vm.expectRevert("source agent still participating");next.importPage(8);
        assertEq(next.imported(),8);assertEq(old.participation(COMMUNITY),bytes32(uint256(99)));
    }
    function testRevisionChangeBetweenPagesCannotMixSnapshots() public {
        next.startImport();next.importPage(8);
        vm.prank(vm.addr(CREATOR));old.setAvailable(COMMUNITY,false);
        vm.expectRevert("source changed during import");next.importPage(8);
        vm.expectRevert("source changed during import");next.seal();assertEq(next.imported(),8);
    }
    function testNewRegistrationBetweenPagesInvalidatesImport() public {
        next.startImport();next.importPage(8);_register(old,address(0x4001),1);
        vm.expectRevert("source changed during import");next.importPage(8);
    }
    function testReopenedSourceBlocksContinuationAndSeal() public {
        next.startImport();next.importPage(32);pool.gates(true,true);
        vm.expectRevert("source admissions open");next.seal();assertFalse(next.setupSealed());
        pool.gates(false,false);next.seal();
    }
    function testPageBoundOwnerAndNoPartialSeal() public {
        vm.prank(address(999));vm.expectRevert("import setup only");next.startImport();
        vm.expectRevert("import not started");next.importPage(1);next.startImport();
        vm.expectRevert("import page bounds");next.importPage(0);
        vm.expectRevert("import page bounds");next.importPage(33);
        vm.prank(address(999));vm.expectRevert("import page bounds");next.importPage(8);
        next.importPage(8);vm.expectRevert("incomplete import");next.seal();assertFalse(next.setupSealed());
    }
    function testNoSetupBypassOrCopiedCommunityAsHouse() public {
        vm.expectRevert("import source identities only");next.addHouse(COMMUNITY,bytes32(uint256(1)),0);
        vm.expectRevert("import not sealed");next.qualify(COMMUNITY,1,true,bytes32(uint256(1)));
        vm.expectRevert("import not sealed");next.setAvailable(COMMUNITY,true);
        AgentCatalog.Registration memory r;
        vm.expectRevert("import not sealed");next.register(r,hex"");
    }
    function testChangedCommunityCodeRetainsIdentityButNotEligibility() public {
        bytes32 pinned=old.identity(COMMUNITY).codeHash;vm.etch(COMMUNITY,hex"00");_import();
        assertEq(next.identity(COMMUNITY).codeHash,pinned);assertFalse(next.eligible(COMMUNITY,0));
        assertFalse(next.qualificationEligible(COMMUNITY,0));
    }
    function testOldSignatureCannotReplayInNewDomainAndNonceContinues() public {
        _import();address agent=address(0x4001);
        AgentCatalog.Registration memory r=AgentCatalog.Registration(agent,vm.addr(CREATOR),bytes32(uint256(99)),3,uint64(block.timestamp+300),1);
        (uint8 v,bytes32 rr,bytes32 s)=vm.sign(CREATOR,old.digest(r));
        assertNotEq(old.digest(r),next.digest(r));
        vm.expectRevert("creator signature");next.register(r,abi.encodePacked(rr,s,v));
        assertEq(next.nonces(vm.addr(CREATOR)),1);_register(next,agent,1);assertEq(next.nonces(vm.addr(CREATOR)),2);
        assertEq(old.nonces(vm.addr(CREATOR)),1);assertEq(next.identity(agent).house,0);
    }
    function testSealedImportCannotRunAgainAndNormalUpdatesWork() public {
        _import();vm.expectRevert("import setup only");next.startImport();
        vm.expectRevert("import page bounds");next.importPage(8);
        vm.prank(vm.addr(CREATOR));next.setAvailable(COMMUNITY,false);assertFalse(next.identity(COMMUNITY).available);
        vm.prank(address(pool));next.qualify(COMMUNITY,1,true,bytes32(uint256(123)));assertEq(next.identity(COMMUNITY).qualified,3);
    }
    function testSourceRuntimeChangedAfterStartFailsClosed() public {
        next.startImport();vm.etch(address(old),hex"00");vm.expectRevert("source code changed");next.importPage(8);
    }
    function testOfficialRuntimeChangedAfterStartFailsClosed() public {
        next.startImport();vm.etch(builtin,hex"00");vm.expectRevert("official controller changed");next.importPage(8);
    }
    function testHistoricalVerdictCorrectionChangesEligibilityBeforeKeeperSynchronization() public {
        _import();assertTrue(next.eligible(COMMUNITY,0));
        vm.prank(address(pool));old.qualify(COMMUNITY,0,false,bytes32(uint256(555)));
        assertFalse(next.eligible(COMMUNITY,0));assertEq(next.identity(COMMUNITY).qualified,0);
        assertTrue(next.qualificationInherited(COMMUNITY,0));next.synchronizeQualification(COMMUNITY,0);
        assertEq(next.qualificationEvidence(COMMUNITY,0),bytes32(uint256(555)));uint256 revision=next.revision();
        next.synchronizeQualification(COMMUNITY,0);assertEq(next.revision(),revision,"idempotent mirror");
        vm.prank(address(pool));old.qualify(COMMUNITY,0,true,bytes32(uint256(556)));
        assertTrue(next.eligible(COMMUNITY,0));
    }
    function testNewIndependentVerdictSupersedesOldCorrectionsOnlyForItsOwnMode() public {
        _import();vm.prank(address(pool));next.qualify(COMMUNITY,0,true,bytes32(uint256(777)));
        vm.prank(address(pool));old.qualify(COMMUNITY,0,false,bytes32(uint256(778)));
        assertTrue(next.eligible(COMMUNITY,0));assertFalse(next.qualificationInherited(COMMUNITY,0));
        vm.expectRevert("qualification already superseded");next.synchronizeQualification(COMMUNITY,0);
        vm.prank(address(pool));old.qualify(COMMUNITY,1,true,bytes32(uint256(779)));
        assertTrue(next.eligible(COMMUNITY,1));assertTrue(next.qualificationInherited(COMMUNITY,1));
        assertEq(next.qualificationEvidence(COMMUNITY,0),bytes32(uint256(777)));
    }
    function testPostImportSourceCodeChangeFailsInheritedEligibilityClosed() public {
        _import();vm.etch(address(old),hex"00");vm.expectRevert("source code changed");next.eligible(COMMUNITY,0);
    }
}
