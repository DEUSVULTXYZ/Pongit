// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {MigratingAgentCatalogTest} from "./MigratingAgentCatalog.t.sol";
import {MigratingAgentCatalog} from "../src/agents/competition/MigratingAgentCatalog.sol";
import {ContinuingAgentTournaments} from "../src/agents/competition/ContinuingAgentTournaments.sol";
import {AgentTournaments} from "../src/agents/competition/AgentTournaments.sol";
import {CompetitionTypes as T} from "../src/agents/competition/CompetitionTypes.sol";

contract ContinuingAgentTournamentsTest is MigratingAgentCatalogTest {
    ContinuingAgentTournaments continued;
    function setUp() public override {
        super.setUp();next=new MigratingAgentCatalog(old,address(old).codehash,address(this),address(this));
        continued=new ContinuingAgentTournaments(next,pool,address(this));next.configure(address(continued),address(pool));
        vm.prank(address(pool));next.bindQualifications(address(pool));
    }
    function testCannotAdmitBeforeSealedContinuationOrCompleteImport() public {
        vm.expectRevert("continuation not sealed");continued.setAdmissions(true);
        vm.expectRevert("import and authority binding");continued.sealContinuation();
        _import();continued.sealContinuation();continued.setAdmissions(true);
        assertEq(continued.begin(),1);
    }
    function testNumberFormatPriorityAndOneMinuteContinue() public {
        _finishTournament();_import();continued.sealContinuation();continued.setAdmissions(true);
        assertEq(continued.count(),1);assertEq(continued.nextAt(),book.nextAt());
        vm.expectRevert("tournament admission waiting");continued.begin();
        vm.warp(block.timestamp+60);assertEq(continued.begin(),2);continued.select(2,32);
        AgentTournaments.Tournament memory t=continued.tournament(2);
        assertEq(t.mode,1);assertFalse(t.league);assertEq(uint8(t.status),2);
        for(uint8 i;i<8;i++)assertEq(next.identity(t.agents[i]).lastTournament,2);
        assertEq(book.count(),1);assertEq(next.identity(address(0x1000)).creator,old.identity(address(0x1000)).creator);
    }
    function testHistoricalViewsKeepOriginalReferencesAndCannotBeWrittenHere() public {
        _finishTournament();_import();continued.sealContinuation();
        assertEq(keccak256(abi.encode(continued.tournament(1))),keccak256(abi.encode(book.tournament(1))));
        for(uint8 i;i<7;i++){
            assertEq(keccak256(abi.encode(continued.fixture(1,i))),keccak256(abi.encode(book.fixture(1,i))));
            assertEq(continued.attemptCount(1,i),book.attemptCount(1,i));
            assertEq(keccak256(abi.encode(continued.attemptRef(1,i,0))),keccak256(abi.encode(book.attemptRef(1,i,0))));
        }
        assertEq(keccak256(abi.encode(continued.standings(1))),keccak256(abi.encode(book.standings(1))));
        vm.expectRevert("unbound match");continued.synchronize(1,0);
        vm.expectRevert("no repair waiting");continued.resumeRepair(1);
        (uint8 index,,,)=continued.nextFixture(1);assertEq(index,255);
    }
    function testNoArbitraryCounterAndSourceChangesPreventSeal() public {
        _import();vm.prank(vm.addr(CREATOR));old.setAvailable(COMMUNITY,false);
        vm.expectRevert("source changed after import");continued.sealContinuation();assertEq(continued.count(),0);
    }
    function testSourceAdmissionsMustStayClosedUntilContinuation() public {
        _import();book.setAdmissions(true);vm.expectRevert("source tournament admission open");continued.sealContinuation();
        book.setAdmissions(false);pool.gates(true,false);vm.expectRevert("source pool admission open");continued.sealContinuation();
    }
    function testContinuationOwnerAndSingleSeal() public {
        _import();vm.prank(address(999));vm.expectRevert("continuation setup only");continued.sealContinuation();
        continued.sealContinuation();vm.expectRevert("continuation setup only");continued.sealContinuation();
    }
    function testAllFourHistoricalFormatsThenFifthContinueWithoutResettingPriority() public {
        for(uint8 i;i<4;i++)_finishTournament();
        _import();continued.sealContinuation();assertEq(continued.inheritedCount(),4);
        for(uint64 id=1;id<=4;id++){
            AgentTournaments.Tournament memory t=continued.tournament(id);
            assertEq(t.mode,(id-1)%2);assertEq(t.league,(id-1)%4>=2);assertEq(uint8(t.status),3);
        }
        continued.setAdmissions(true);vm.warp(continued.nextAt());assertEq(continued.begin(),5);continued.select(5,32);
        AgentTournaments.Tournament memory t=continued.tournament(5);assertEq(t.mode,0);assertFalse(t.league);assertEq(uint8(t.status),2);
        for(uint8 i;i<8;i++)assertEq(next.identity(t.agents[i]).lastTournament,5);
        assertEq(book.count(),4);assertEq(continued.count(),5);
    }
}
