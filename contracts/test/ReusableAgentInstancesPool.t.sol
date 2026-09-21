// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentPoolTest,ReusableAgentPoolHarness} from "./ReusableAgentPool.t.sol";
import {ReusableAgentArena} from "../src/agents/competition/ReusableAgentArena.sol";
import {ReusableAgentPool} from "../src/agents/competition/ReusableAgentPool.sol";
import {ReusableAgentInstancesPool} from "../src/agents/competition/ReusableAgentInstancesPool.sol";
import {AgentChallenges} from "../src/agents/competition/AgentChallenges.sol";
import {AgentQualifications} from "../src/agents/competition/AgentQualifications.sol";
import {HouseInstanceChallenges} from "../src/agents/competition/HouseInstanceChallenges.sol";
import {HouseInstanceQualifications} from "../src/agents/competition/HouseInstanceQualifications.sol";
import {CompetitionTypes as T} from "../src/agents/competition/CompetitionTypes.sol";
import {ReusableAgentGame as Game} from "../src/agents/competition/ReusableAgentGame.sol";
import {AgentArenaTypes as A} from "../src/agents/competition/AgentArenaTypes.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";

contract ReusableAgentInstancesPoolTest is ReusableAgentPoolTest {
    function makePool() internal virtual override returns(ReusableAgentPool){return new ReusableAgentInstancesPool(catalog,IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE));}
    function makeChallenges() internal override returns(AgentChallenges){return new HouseInstanceChallenges(family,catalog,address(pool),address(this));}
    function makeQualifications() internal override returns(AgentQualifications){return new HouseInstanceQualifications(catalog,address(pool));}

    function concurrent() internal returns(uint64 tournament,T.Ref memory competitive,T.Ref memory friendly,address bot){
        tournament=begin();competitive=pool.admitTournament(tournament);bot=book.fixture(tournament,0).a;admit(competitive);
        sourceBlock();challenge(bot,0);friendly=pool.admitChallenge();admit(friendly);
        assertTrue(competitive.arena!=friendly.arena);assertEq(pool.houseInstancesOf(T.key(friendly)),2);
        assertEq(pool.playing(bot),T.key(competitive));assertEq(catalog.participation(bot),book.token(tournament));
        (,A.Binding memory b)=pool.ticketOf(friendly);assertEq(b.controlB.memoryWord,0);assertFalse(b.ranked);
    }
    function testHouseTournamentAndFriendlyCaptureInEitherOrder() public {
        for(uint8 order;order<2;order++){
            if(order!=0)setUp();
            (uint64 tournament,T.Ref memory competitive,T.Ref memory friendly,address bot)=concurrent();
            Game.Result memory c=finish(competitive,bot);Game.Result memory f=finish(friendly,vm.addr(PLAYER));
            if(order==0){
                pool.captureProof(friendly,f,firstProof());assertEq(pool.playing(bot),T.key(competitive));
                assertEq(catalog.participation(bot),book.token(tournament));pool.captureProof(competitive,c,firstProof());
            }else{
                pool.captureProof(competitive,c,firstProof());assertEq(pool.playing(vm.addr(PLAYER)),T.key(friendly));
                pool.captureProof(friendly,f,firstProof());
            }
            pool.captureProof(friendly,f,firstProof());assertEq(queue.pending(vm.addr(PLAYER)),0);
            assertEq(catalog.participation(bot),book.token(tournament));assertEq(pool.playing(bot),bytes32(0));
            // The official duel is the reference ladder and counts. A human friendly
            // never touches a rating, whichever capture lands first.
            assertEq(ratings.ratingOf(bot,0).played,1);assertEq(ratings.ratingOf(vm.addr(PLAYER),0).played,0);
            book.synchronize(tournament,0);assertEq(book.fixture(tournament,0).published.winner,bot);
            sourceBlock();T.Ref memory next=pool.admitTournament(tournament);assertTrue(next.id>0);
        }
    }
    function testFriendlyMissingPublicationAndCancellationCannotReleaseTournamentIdentity() public {
        (uint64 tournament,T.Ref memory competitive,T.Ref memory friendly,address bot)=concurrent();
        vm.chainId(4242);ReusableAgentPoolHarness(friendly.arena).terminal(bot);
        Game.Result memory f=ReusableAgentArena(friendly.arena).publishedResult();vm.chainId(10143);
        vm.expectRevert();pool.captureProof(friendly,f,firstProof());
        assertEq(pool.playing(bot),T.key(competitive));assertEq(catalog.participation(bot),book.token(tournament));
    }
    function testUnadmittedHouseInstanceCancellationAndRenewalPreserveTournamentLock() public {
        uint64 tournament=begin();T.Ref memory competitive=pool.admitTournament(tournament);address bot=book.fixture(tournament,0).a;admit(competitive);
        sourceBlock();challenge(bot,1);T.Ref memory friendly=pool.admitChallenge();
        pool.closeReusableArena(friendly.arena);vm.warp(vm.getBlockTimestamp()+3600);pool.releaseArena(friendly.arena);
        assertEq(pool.result(friendly).status,4);assertEq(queue.pending(vm.addr(PLAYER)),0);
        assertEq(pool.playing(bot),T.key(competitive));assertEq(catalog.participation(bot),book.token(tournament));
        pool.openReusableArena(friendly.arena);assertEq(pool.arenaEpoch(friendly.arena),2);
        sourceBlock();challenge(bot,0);T.Ref memory next=pool.admitChallenge();assertTrue(next.id>friendly.id);
        assertEq(pool.playing(bot),T.key(competitive));assertEq(pool.houseInstancesOf(T.key(next)),2);
    }
    function testCommunityIdentityCannotUseHouseInstancesToBypassTournamentLock() public {
        address community=newCommunity();
        vm.prank(address(pool.qualifications()));catalog.qualify(address(0x1007),0,false,bytes32(uint256(2)));
        uint64 tournament=begin();
        assertEq(catalog.participation(community),book.token(tournament));challenge(community,0);
        assertEq(pool.admitChallenge().id,0);assertEq(pool.laneRecord(1).ref.id,0);
    }
    function testCommunityQualificationCanUseAHouseOpponentDuringItsTournament() public {
        address community=newCommunity();vm.prank(address(pool.qualifications()));catalog.qualify(community,0,false,bytes32(uint256(2)));
        vm.prank(address(pool.qualifications()));catalog.qualify(community,1,false,bytes32(uint256(2)));
        uint64 tournament=begin();T.Ref memory competitive=pool.admitTournament(tournament);admit(competitive);
        // The strategy must exist in a reusable engine's pinned base block.
        pool.closeReusableArena(address(arenas[2]));vm.warp(vm.getBlockTimestamp()+3600);pool.releaseArena(address(arenas[2]));pool.openReusableArena(address(arenas[2]));sourceBlock();
        T.Ref memory qualification=pool.admitQualification();(,A.Binding memory b)=pool.ticketOf(qualification);
        assertEq(b.a,community);assertEq(pool.houseInstancesOf(T.key(qualification)),2);
        assertEq(catalog.participation(b.b),book.token(tournament));assertEq(catalog.participation(community),T.key(qualification));
        admit(qualification);Game.Result memory r=finish(qualification,b.b);pool.captureProof(qualification,r,firstProof());
        assertEq(catalog.participation(community),bytes32(0));assertEq(catalog.participation(b.b),book.token(tournament));
    }
    function testHouseInstancesStillUseExactlyTwoLanesAndRejectAThirdAdmission() public {
        (uint64 tournament,T.Ref memory competitive,T.Ref memory friendly,address bot)=concurrent();
        vm.expectRevert("challenge lane waiting");pool.admitChallenge();
        vm.expectRevert("challenge priority/qualification waiting");pool.admitQualification();
        vm.expectRevert("tournament lane waiting");pool.admitTournament(tournament);
        assertEq(pool.laneRecord(0).ref.id,competitive.id);assertEq(pool.laneRecord(1).ref.id,friendly.id);
        assertEq(pool.playing(bot),T.key(competitive));
    }
    function testInstanceEligibilityRequiresPinnedOfficialControllerAndQualifiedMode() public {
        address bot=address(0x1000);HouseInstanceChallenges instances=HouseInstanceChallenges(address(queue));
        assertTrue(instances.houseInstanceEligible(bot,0));assertFalse(instances.houseInstanceEligible(vm.addr(PLAYER),0));
        address community=newCommunity();assertFalse(instances.houseInstanceEligible(community,0));
        vm.prank(address(pool.qualifications()));catalog.qualify(bot,1,false,bytes32(uint256(2)));
        assertTrue(instances.houseInstanceEligible(bot,0));assertFalse(instances.houseInstanceEligible(bot,1));
        assertTrue(HouseInstanceQualifications(address(pool.qualifications())).opponentEligible(bot,1));
        assertFalse(instances.houseInstanceEligible(bot,2));
        vm.etch(address(policies),hex"00");assertFalse(instances.houseInstanceEligible(bot,0));
        assertFalse(HouseInstanceQualifications(address(pool.qualifications())).opponentEligible(bot,1));
    }
}
