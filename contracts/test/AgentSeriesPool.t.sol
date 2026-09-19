// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Vm} from "forge-std/Vm.sol";
import {SeriesAgentArenaTest,SeriesHarness} from "./SeriesAgentArena.t.sol";
import {AgentSeriesPool} from "../src/agents/competition/AgentSeriesPool.sol";
import {SeriesAgentArena} from "../src/agents/competition/SeriesAgentArena.sol";
import {AgentCatalog} from "../src/agents/competition/AgentCatalog.sol";
import {AgentTournaments} from "../src/agents/competition/AgentTournaments.sol";
import {AgentPublishedRatings} from "../src/agents/competition/AgentPublishedRatings.sol";
import {AgentQualifications} from "../src/agents/competition/AgentQualifications.sol";
import {AgentChallenges} from "../src/agents/competition/AgentChallenges.sol";
import {ArcadeFamily} from "../src/independent/ArcadeFamily.sol";
import {CompetitionTypes as T,ICompetitionAuthority} from "../src/agents/competition/CompetitionTypes.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

contract AgentSeriesPoolTest is SeriesAgentArenaTest {
    AgentCatalog catalog;AgentSeriesPool pool;AgentTournaments book;AgentPublishedRatings ratings;
    AgentChallenges challenges;ArcadeFamily family;
    SeriesHarness[2] games;
    function setUp() public override {
        super.setUp();catalog=new AgentCatalog(address(this),address(this),address(policies));
        pool=new AgentSeriesPool(catalog,IInterludeHub(address(hub)),address(this));
        book=new AgentTournaments(catalog,ICompetitionAuthority(address(pool)),address(this));
        ratings=new AgentPublishedRatings(address(pool),address(this),block.timestamp);ratings.sealMigration(keccak256("fixture empty ratings"));
        pool.configure(book,ratings);catalog.configure(address(book),address(pool));pool.bindQualifications(new AgentQualifications(catalog,address(pool)));
        family=new ArcadeFamily();challenges=new AgentChallenges(family,catalog,address(pool),address(this));pool.bindChallenges(challenges);
        for(uint8 i;i<8;i++){
            address a=address(uint160(0x1000+i));catalog.addHouse(a,bytes32(uint256(i+1)),i);
            catalog.qualify(a,0,true,bytes32(uint256(1)));catalog.qualify(a,1,true,bytes32(uint256(1)));
        }
        catalog.seal();for(uint8 i;i<2;i++){games[i]=new SeriesHarness(IInterludeHub(address(hub)),address(pool),policies,kernel);pool.addArena(games[i]);}
        pool.seal();pool.setAdmissions(true);book.setAdmissions(true);challenges.setAdmissions(true);
    }
    function begin() private returns(uint64 id){id=book.begin();book.select(id,32);}
    function testCommonPoolFitsReviewedMonadRuntimeBudget() public view {
        assertLe(address(pool).code.length,32768);
    }
    function testArchiveRecordsOnlyVerifiedChangedPublicationsAndFinality() public {
        uint64 tournament=begin();(address app,uint256[] memory ids)=openGroup(tournament);
        AgentSeriesPool.Record memory entry=pool.record(ids[0]);
        vm.chainId(4242);SeriesHarness(app).terminal(ids[0],entry.a);vm.chainId(10143);
        vm.expectRevert("publication pending");pool.capture(ids[0]);hub.publish(app);
        vm.recordLogs();pool.capture(ids[0]);pool.capture(ids[0]);
        Vm.Log[] memory logs=vm.getRecordedLogs();uint256 found;
        bytes32 topic=keccak256("SeriesResultRecorded(uint256,uint256,address,bytes32,address,address,address,uint8,uint8,bool,uint8,uint8,uint64,uint64,bool)");
        for(uint256 i;i<logs.length;i++)if(logs[i].emitter==address(pool)&&logs[i].topics[0]==topic){
            found++;assertEq(logs[i].topics[1],bytes32(ids[0]));assertEq(logs[i].topics[2],bytes32(entry.ref.epoch));
            assertEq(logs[i].topics[3],bytes32(uint256(uint160(app))));
        }
        assertEq(found,1,"duplicate capture must not create another archived result");
        vm.warp(block.timestamp+1 days);pool.recoverExpired(app);vm.warp(block.timestamp+3600);
        vm.recordLogs();pool.releaseArena(app);logs=vm.getRecordedLogs();found=0;
        for(uint256 i;i<logs.length;i++)if(logs[i].emitter==address(pool)&&logs[i].topics[0]==topic)found++;
        assertEq(found,ids.length,"finality records also include recovered unstarted cancellations");
    }
    function openGroup(uint64 id) private returns(address app,uint256[] memory ids){
        app=pool.admitTournament(id);require(app!=address(0),"fixture capacity");ids=pool.assignedIds(app);
        vm.roll(uint256(SeriesAgentArena(app).boundMatch().preparedBlock)+1);pool.openArena(app);
        vm.chainId(4242);SeriesAgentArena(app).start();vm.chainId(10143);
    }
    function finishGroup(address app,uint256[] memory ids) private {
        for(uint256 i;i<ids.length;i++){
            AgentSeriesPool.Record memory entry=pool.record(ids[i]);vm.chainId(4242);SeriesHarness(app).terminal(ids[i],entry.a);
            vm.chainId(10143);hub.publish(app);pool.capture(ids[i]);book.synchronize(entry.tournament,entry.fixture);
            if(i+1<ids.length){vm.chainId(4242);SeriesAgentArena(app).advanceSeries(SeriesAgentArena(app).boundMatch().id);vm.chainId(10143);}
        }
        vm.chainId(4242);SeriesAgentArena(app).drainSeries(SeriesAgentArena(app).boundMatch().id);vm.chainId(10143);hub.publish(app);pool.closeArena(app);
    }
    function releaseClosed() private {
        vm.warp(block.timestamp+3600);
        for(uint8 i;i<2;i++)if(hub.statusOf(address(games[i]),0)==Types.Status.Exiting)pool.releaseArena(address(games[i]));
    }
    function testPublishedQuarterResultsUnlockOnlyKnownNextOpponents() public {
        uint64 id=begin();(address first,uint256[] memory ids)=openGroup(id);assertEq(ids.length,3);
        hub.publish(first);vm.expectRevert("result identity/pending");pool.capture(ids[0]);
        finishGroup(first,ids);T.Result memory original=pool.result(pool.record(ids[0]).ref);
        (address next,uint256[] memory more)=openGroup(id);assertTrue(first!=next);assertEq(more.length,2);
        assertEq(uint8(hub.statusOf(first,0)),uint8(Types.Status.Exiting));finishGroup(next,more);
        releaseClosed();(address semi,uint256[] memory semiIds)=openGroup(id);assertEq(semiIds.length,1);finishGroup(semi,semiIds);
        (address final_,uint256[] memory finalIds)=openGroup(id);assertEq(finalIds.length,1);finishGroup(final_,finalIds);
        assertEq(uint8(book.tournament(id).status),uint8(AgentTournaments.Status.Complete));
        assertEq(pool.result(pool.record(ids[0]).ref).hash,original.hash);assertTrue(pool.result(pool.record(ids[0]).ref).finality);
        assertEq(ratings.ratingOf(address(0x1000),0).played,0,"same creator remains friendly");
    }
    function testExpiredSeriesCancelsUnstartedGamesWithoutFakeScore() public {
        uint64 id=begin();(address app,uint256[] memory ids)=openGroup(id);
        vm.warp(block.timestamp+1 days);pool.recoverExpired(app);vm.expectRevert("challenge window");pool.releaseArena(app);
        vm.warp(block.timestamp+3600);pool.releaseArena(app);
        for(uint256 i;i<ids.length;i++){
            AgentSeriesPool.Record memory entry=pool.record(ids[i]);T.Result memory r=pool.result(entry.ref);
            assertEq(r.status,4);assertTrue(r.finality);assertEq(r.winner,address(0));assertEq(r.scoreA,0);assertEq(r.scoreB,0);
            assertEq(pool.playing(entry.a),0);assertEq(pool.playing(entry.b),0);
        }
        assertEq(pool.activeSeries(),address(0));assertTrue(pool.available(app));
    }
    function testCannotAdmitSecondSeriesOrForgeHistoricalReference() public {
        uint64 id=begin();(address app,uint256[] memory ids)=openGroup(id);
        vm.expectRevert("series admission waiting");pool.admitTournament(id);
        vm.expectRevert("already opened");pool.openArena(app);finishGroup(app,ids);
        T.Ref memory fake=pool.record(ids[0]).ref;fake.epoch++;
        vm.expectRevert("unknown/unpublished series result");pool.result(fake);
        vm.expectRevert("operator/qualification");pool.setPublicAdmissions(true);
    }
    function testQualificationsReserveDistinctPairsAndRequirePublishedControllerEvidence() public {
        for(uint8 i;i<8;i++)for(uint8 mode;mode<2;mode++)catalog.qualify(address(uint160(0x1000+i)),mode,false,keccak256("reset fixture"));
        address app=pool.admitQualifications();uint256[] memory ids=pool.assignedIds(app);assertEq(ids.length,1,"do not reserve future qualifications ahead of human challenges");
        vm.expectRevert("qualification lane waiting");pool.admitQualifications();
        vm.roll(uint256(SeriesAgentArena(app).boundMatch().preparedBlock)+1);pool.openArena(app);vm.chainId(4242);SeriesAgentArena(app).start();
        for(uint256 i;i<ids.length;i++){
            AgentSeriesPool.Record memory e=pool.record(ids[i]);
            assertTrue(catalog.participation(e.a)!=0);assertTrue(catalog.participation(e.b)!=0);
            SeriesHarness(app).counters(ids[i],uint256(3)<<192,uint256(2)<<192);SeriesHarness(app).terminal(ids[i],e.a);
            vm.chainId(10143);hub.publish(app);pool.capture(ids[i]);pool.capture(ids[i]);
            uint8 mode=SeriesAgentArena(app).bindingFor(ids[i]).mode;
            assertEq(catalog.identity(e.a).qualified&(1<<mode),1<<mode);
            assertEq(catalog.identity(e.b).qualified&(1<<mode),0,"winning is not controller proof");
            assertEq(catalog.participation(e.a),0);assertEq(pool.playing(e.a),0);
            if(i+1<ids.length){vm.chainId(4242);SeriesAgentArena(app).advanceSeries(SeriesAgentArena(app).boundMatch().id);}
        }
        assertEq(pool.qualificationSeries(),address(0));
        vm.chainId(4242);SeriesAgentArena(app).drainSeries(SeriesAgentArena(app).boundMatch().id);vm.chainId(10143);hub.publish(app);pool.closeArena(app);
        vm.warp(block.timestamp+3600);pool.releaseArena(app);assertTrue(pool.available(app));
    }
    function testPublishedBudgetDrainReleasesUnstartedReservationsBeforeHubFinality() public {
        uint64 id=begin();(address app,uint256[] memory ids)=openGroup(id);
        vm.chainId(4242);SeriesHarness(app).terminal(ids[0],pool.record(ids[0]).a);vm.roll(block.number+84_001);
        SeriesAgentArena(app).drainSeries(SeriesAgentArena(app).boundMatch().id);SeriesAgentArena(app).drainSeries(SeriesAgentArena(app).boundMatch().id);vm.chainId(10143);hub.publish(app);
        for(uint256 i;i<ids.length;i++)pool.capture(ids[i]);
        assertEq(pool.remaining(app),0);assertEq(pool.activeSeries(),address(0));pool.closeArena(app);
        for(uint256 i=1;i<ids.length;i++){
            T.Result memory r=pool.result(pool.record(ids[i]).ref);assertEq(r.status,4);assertEq(r.winner,address(0));assertFalse(r.finality);
        }
    }
    function sign(uint256 key,bytes32 digest) private returns(bytes memory){
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(key,digest);return abi.encodePacked(r,s,v);
    }
    function challenge(address bot) private returns(address human){
        human=vm.addr(1111);ArcadeFamily.Grant memory grant=ArcadeFamily.Grant(human,vm.addr(2222),uint64(block.timestamp),uint64(block.timestamp+7200),0);
        family.register(grant,sign(1111,family.grantDigest(grant)));
        uint64 deadline=uint64(block.timestamp+60);bytes32 hash=family.grantDigest(grant);
        challenges.command(human,1,bot,0,0,0,deadline,sign(2222,challenges.digest(hash,1,bot,0,0,0,deadline)));
    }
    function testHumanChallengeHasPriorityAndOnlyItsBoundKeyCanPlay() public {
        address human=challenge(address(0x1000));
        vm.expectRevert("challenge priority");pool.admitQualifications();
        address app=pool.admitChallenge();uint256[] memory ids=pool.assignedIds(app);assertEq(ids.length,1);
        assertEq(pool.challengeOf(ids[0]),1);assertEq(pool.qualificationSeries(),app);
        vm.expectRevert("qualification lane waiting");pool.admitQualifications();
        vm.roll(block.number+1);pool.openArena(app);vm.chainId(4242);SeriesAgentArena(app).start();
        vm.expectRevert("unbound or expired human control");vm.prank(vm.addr(3333));SeriesAgentArena(app).input(ids[0],1,1,block.number+100);
        vm.prank(vm.addr(2222));SeriesAgentArena(app).input(ids[0],1,1,block.number+100);
        vm.prank(vm.addr(2222));SeriesAgentArena(app).concede(ids[0]);vm.chainId(10143);hub.publish(app);
        pool.capture(ids[0]);pool.capture(ids[0]);
        assertEq(challenges.pending(human),0);assertEq(catalog.participation(address(0x1000)),0);assertEq(pool.playing(human),0);
        assertEq(pool.qualificationSeries(),address(0));assertEq(ratings.ratingOf(human,0).played,0);
        assertEq(ratings.ratingOf(address(0x1000),0).played,0);
        vm.chainId(4242);SeriesAgentArena(app).drainSeries(ids[0]);vm.chainId(10143);hub.publish(app);pool.closeArena(app);
        vm.warp(block.timestamp+3600);pool.releaseArena(app);assertTrue(pool.available(app));
    }
    function testWaitingHumanDoesNotInterruptQualificationButWinsNextAdmission() public {
        catalog.qualify(address(0x1001),0,false,keccak256("reset fixture"));
        address trial=pool.admitQualifications();uint256 id=pool.assignedIds(trial)[0];
        address human=challenge(address(0x1007));
        vm.expectRevert("challenge lane waiting");pool.admitChallenge();
        pool.cancelUnopened(trial);assertEq(pool.result(pool.record(id).ref).status,4);
        vm.expectRevert("challenge priority");pool.admitQualifications();
        address app=pool.admitChallenge();assertEq(pool.record(pool.assignedIds(app)[0]).a,human);
    }
    function testExpiredChallengeCanBeCancelledWithoutEpochOrScore() public {
        address human=challenge(address(0x1000));address app=pool.admitChallenge();uint256 id=pool.assignedIds(app)[0];
        vm.expectRevert("admission still valid");vm.prank(address(0x999));pool.cancelUnopened(app);
        vm.warp(block.timestamp+7200);vm.roll(block.number+1);
        vm.expectRevert("challenge authorization changed");pool.openArena(app);
        vm.prank(address(0x999));pool.cancelUnopened(app);T.Result memory r=pool.result(pool.record(id).ref);
        assertEq(r.status,4);assertEq(r.winner,address(0));assertTrue(r.finality);assertEq(r.scoreA,0);assertEq(r.scoreB,0);
        assertEq(pool.arenaEpoch(app),0);assertEq(challenges.pending(human),0);assertTrue(pool.available(app));
        vm.expectRevert("admission already cancelled");pool.openArena(app);
    }
    function testUnopenedTournamentCancellationPreservesEpochAndRetriesFreshMatch() public {
        uint64 tournament=begin();address app=pool.admitTournament(tournament);uint256[] memory ids=pool.assignedIds(app);
        pool.cancelUnopened(app);assertEq(pool.arenaEpoch(app),0);assertEq(pool.activeSeries(),address(0));
        for(uint256 i;i<ids.length;i++){
            assertTrue(pool.result(pool.record(ids[i]).ref).finality);assertEq(pool.result(pool.record(ids[i]).ref).status,4);
            book.synchronize(tournament,uint8(i));book.retryCancelled(tournament,uint8(i));
        }
        address next=pool.admitTournament(tournament);assertEq(next,app);assertEq(pool.record(pool.assignedIds(next)[0]).ref.epoch,1);
        assertTrue(pool.assignedIds(next)[0]>ids[ids.length-1]);vm.roll(block.number+1);pool.openArena(next);
        vm.expectRevert("session already opened/cancelled");pool.cancelUnopened(next);
    }
    function testCancelledFutureLeagueGamesCannotEraseCompletedControllerLearning() public {
        // Reach the actual scheduled championship through both preceding cups.
        for(uint8 cup;cup<2;cup++){
            uint64 earlier=begin();
            while(book.tournament(earlier).status!=AgentTournaments.Status.Complete){
                (address app,uint256[] memory ids)=openGroup(earlier);finishGroup(app,ids);releaseClosed();
            }
        }
        uint64 league=begin();assertTrue(book.tournament(league).league);
        (address app,uint256[] memory ids)=openGroup(league);
        address repeated=pool.record(ids[0]).a;assertEq(pool.record(ids[1]).a,repeated);
        uint256 memoryWord=uint256(123)<<100;
        vm.chainId(4242);SeriesHarness(app).counters(ids[0],memoryWord,0);SeriesHarness(app).terminal(ids[0],repeated);
        vm.roll(block.number+84_001);
        SeriesAgentArena(app).drainSeries(ids[0]);SeriesAgentArena(app).drainSeries(ids[0]);
        vm.chainId(10143);hub.publish(app);for(uint256 i;i<ids.length;i++)pool.capture(ids[i]);
        assertEq(pool.learned(league,repeated),memoryWord);
        assertEq(pool.result(pool.record(ids[1]).ref).status,4);
    }
}
