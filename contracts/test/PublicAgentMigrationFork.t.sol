// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ReusableAgentPool} from "../src/agents/competition/ReusableAgentPool.sol";
import {AgentCatalog} from "../src/agents/competition/AgentCatalog.sol";
import {AgentTournaments} from "../src/agents/competition/AgentTournaments.sol";
import {AgentPublishedRatings} from "../src/agents/competition/AgentPublishedRatings.sol";
import {AgentChallenges} from "../src/agents/competition/AgentChallenges.sol";
import {AgentQualifications} from "../src/agents/competition/AgentQualifications.sol";
import {MigratingAgentCatalog} from "../src/agents/competition/MigratingAgentCatalog.sol";
import {ContinuingFiveLaneAgentPool} from "../src/agents/competition/ContinuingFiveLaneAgentPool.sol";
import {ContinuingAgentTournaments} from "../src/agents/competition/ContinuingAgentTournaments.sol";
import {ContinuingAgentRatings} from "../src/agents/competition/ContinuingAgentRatings.sol";
import {ContinuingAgentChallenges} from "../src/agents/competition/ContinuingAgentChallenges.sol";
import {ContinuingAgentQualifications} from "../src/agents/competition/ContinuingAgentQualifications.sol";
import {PublishedResultVerifier,IReusableAdmissionAuthority} from "../src/independent/PublishedResultVerifier.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";

/// Read-only upstream; every closure and deployment happens on the local fork.
/// This tests real source data and ABI compatibility, not hosted migration or
/// the independent owner-nonce audit required before a real rating import.
contract PublicAgentMigrationForkTest is Test {
    function testPinnedPublicSourcePreservesAllCommonAuthorities() public {
        if(!vm.envOr("PONG_PUBLIC_AGENT_MIGRATION_FORK",false)){vm.skip(true);return;}
        uint256 forkBlock=vm.envUint("PONG_PUBLIC_AGENT_MIGRATION_BLOCK");
        vm.createSelectFork(vm.envString("PONG_PUBLIC_AGENT_MIGRATION_RPC"),forkBlock);
        assertEq(block.chainid,10143);assertEq(block.number,forkBlock);
        ReusableAgentPool oldPool=ReusableAgentPool(0x708E32A09A1F5C0d4De2477793A7D6E8D9c1b8e5);
        AgentCatalog oldCatalog=oldPool.catalog();AgentTournaments oldBook=oldPool.tournaments();
        AgentPublishedRatings oldRatings=oldPool.ratings();AgentChallenges oldQueue=oldPool.challenges();
        AgentQualifications oldQualification=oldPool.qualifications();address admin=oldPool.owner();
        assertEq(oldPool.laneMatch(0),0);assertEq(oldPool.laneMatch(1),0);
        assertEq(uint8(oldBook.tournament(oldBook.count()).status),uint8(AgentTournaments.Status.Complete));
        vm.startPrank(admin);
        oldPool.setPublicAdmissions(false);oldPool.setAdmissions(false);oldBook.setAdmissions(false);oldQueue.setAdmissions(false);
        MigratingAgentCatalog catalog=new MigratingAgentCatalog(oldCatalog,address(oldCatalog).codehash,admin,admin);
        catalog.startImport();
        ContinuingFiveLaneAgentPool pool=new ContinuingFiveLaneAgentPool(catalog,oldPool.hub(),admin,address(0xbeef),address(oldPool).codehash);
        ContinuingAgentTournaments book=new ContinuingAgentTournaments(catalog,pool,admin);
        ContinuingAgentRatings ratings=new ContinuingAgentRatings(oldRatings,address(oldRatings).codehash,oldRatings.migrationEvidence(),
            keccak256("fork-only audit placeholder; not a release audit"),address(pool),admin);
        ContinuingAgentQualifications qualification=new ContinuingAgentQualifications(oldQualification,address(oldQualification).codehash,catalog,address(pool));
        ContinuingAgentChallenges queue=new ContinuingAgentChallenges(oldQueue,address(oldQueue).codehash,catalog,address(pool),admin);
        PublishedResultVerifier verifier=new PublishedResultVerifier(IReusableAdmissionAuthority(address(pool)),oldPool.hub());
        catalog.configure(address(book),address(pool));pool.bindQualifications(qualification);pool.bindChallenges(queue);
        pool.bindVerifier(verifier);pool.configure(book,ratings);
        while(catalog.imported()<catalog.sourceCount())catalog.importPage(16);catalog.seal();book.sealContinuation();
        ratings.startImport();while(ratings.imported()<ratings.sourceCount())ratings.importPage(16);
        for(uint8 mode;mode<2;mode++){
            (,uint256 count)=oldRatings.playerPage(mode,0,0);
            while(ratings.checkedPlayers(mode)<count)ratings.verifyPlayers(mode,16);
        }
        ratings.finishImport();qualification.startImport();
        while(qualification.imported()<catalog.sourceCount())qualification.importPage(16);qualification.sealContinuation();
        queue.startImport();while(queue.imported()<queue.inheritedCount())queue.importPage(16);queue.sealContinuation();
        vm.stopPrank();
        assertEq(pool.nonce(),oldPool.nonce());assertFalse(pool.admissions());assertFalse(pool.publicAdmissions());
        assertEq(catalog.count(),oldCatalog.count());assertEq(book.count(),oldBook.count());assertEq(book.nextAt(),oldBook.nextAt());
        assertEq(ratings.count(),oldRatings.count());assertEq(ratings.genesisTime(),oldRatings.genesisTime());
        assertEq(address(queue.family()),address(oldQueue.family()));assertEq(queue.count(),oldQueue.count());assertEq(queue.cursor(),oldQueue.cursor());
        assertEq(qualification.cursor(),oldQualification.cursor());
        for(uint256 i;i<oldCatalog.count();i++){
            address agent=oldCatalog.at(i);assertEq(catalog.at(i),agent);
            assertEq(abi.encode(catalog.identity(agent)),abi.encode(oldCatalog.identity(agent)));
            address creator=oldCatalog.identity(agent).creator;assertEq(catalog.nonces(creator),oldCatalog.nonces(creator));
            assertEq(catalog.registeredBlock(agent),oldCatalog.registeredBlock(agent));
            for(uint8 mode;mode<2;mode++){
                assertEq(catalog.qualificationEvidence(agent,mode),oldCatalog.qualificationEvidence(agent,mode));
                assertEq(qualification.retryAt(agent,mode),oldQualification.retryAt(agent,mode));
                assertEq(abi.encode(ratings.ratingOf(agent,mode)),abi.encode(oldRatings.ratingOf(agent,mode)));
            }
        }
        // Result IDs are arena-bound hashes, not ordinal ledger positions.
        for(uint256 offset;offset<oldRatings.count();offset+=32){
            (AgentPublishedRatings.Entry[] memory beforePage,)=oldRatings.resultPage(offset,32);
            (AgentPublishedRatings.Entry[] memory afterPage,)=ratings.resultPage(offset,32);
            assertEq(abi.encode(afterPage),abi.encode(beforePage));
            for(uint256 i;i<beforePage.length;i++){
                uint256 id=beforePage[i].first.id;
                assertEq(abi.encode(ratings.entry(id)),abi.encode(oldRatings.entry(id)));
                assertEq(ratings.indexOf(id),oldRatings.indexOf(id));
                (uint32 a,uint32 b,uint32 c,uint32 d)=ratings.ratingChange(id);
                (uint32 wa,uint32 wb,uint32 wc,uint32 wd)=oldRatings.ratingChange(id);
                assertEq(abi.encode(a,b,c,d),abi.encode(wa,wb,wc,wd));
            }
        }
        for(uint256 i=1;i<=oldQueue.count();i++){
            (address player,address agent,uint8 mode,uint8 status,uint64 at,bytes32 grant)=oldQueue.requests(i);
            (bool ok,bytes memory value)=address(queue).staticcall(abi.encodeCall(queue.requests,(i)));assertTrue(ok);
            assertEq(value,abi.encode(player,agent,mode,status,at,grant));assertEq(queue.nonces(grant),oldQueue.nonces(grant));
            assertEq(queue.pending(player),oldQueue.pending(player));
        }
        for(uint64 id=1;id<=oldBook.count();id++){
            assertEq(abi.encode(book.tournament(id)),abi.encode(oldBook.tournament(id)));
            uint256 n=oldBook.tournament(id).league?28:7;
            for(uint8 i;i<n;i++)assertEq(abi.encode(book.fixture(id,i)),abi.encode(oldBook.fixture(id,i)));
        }
        emit log_named_uint("Pinned public block",forkBlock);emit log_named_uint("Identities preserved",catalog.count());
        emit log_named_uint("Results preserved",ratings.count());emit log_named_uint("Tournaments preserved",book.count());
        emit log_named_uint("Requests preserved",queue.count());
    }
}
