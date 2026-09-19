// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {IndependentHubFixture} from "./Independent.t.sol";
import {AgentCatalog} from "../src/agents/competition/AgentCatalog.sol";
import {AgentTournaments} from "../src/agents/competition/AgentTournaments.sol";
import {AgentPublishedRatings} from "../src/agents/competition/AgentPublishedRatings.sol";
import {AgentChallenges} from "../src/agents/competition/AgentChallenges.sol";
import {AgentArenaPool} from "../src/agents/competition/AgentArenaPool.sol";
import {AgentArenaTypes as A,IAgentArena} from "../src/agents/competition/AgentArenaTypes.sol";
import {CompetitionTypes as T,ICompetitionAuthority} from "../src/agents/competition/CompetitionTypes.sol";
import {PooledAgentArena} from "../src/agents/competition/PooledAgentArena.sol";
import {HousePolicies} from "../src/agents/competition/HousePolicies.sol";
import {ArcadeFamily} from "../src/independent/ArcadeFamily.sol";
import {ArenaAuthorizations as Auth} from "../src/independent/ArenaAuthorizations.sol";
import {ChaosEngine} from "../src/chaos/ChaosEngine.sol";
import {ChaosCodec} from "../src/chaos/ChaosCodec.sol";
import {ChaosPhysics} from "../src/chaos/ChaosPhysics.sol";
import {ChaosEffects} from "../src/chaos/ChaosEffects.sol";
import {ChaosDynamics} from "../src/chaos/ChaosDynamics.sol";
import {ChaosContacts} from "../src/chaos/ChaosContacts.sol";
import {ChaosModifiers} from "../src/chaos/ChaosModifiers.sol";
import {ChaosRally} from "../src/chaos/ChaosRally.sol";
import {ChaosDrawRules} from "../src/chaos/ChaosDrawRules.sol";
import {DrandEvmnet} from "../src/chaos/DrandEvmnet.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

contract PooledArenaHarness is PooledAgentArena {
    constructor(IInterludeHub h,address p,HousePolicies policy,ChaosEngine kernel) PooledAgentArena(h,p,policy,kernel){}
    function terminal(uint256 id,address winner) external {_finish(id,3,winner);}
    function classicAt(uint256 id,uint64 t,uint8 a,uint8 b) external {
        PhysicsV2.State memory s=_state(id);s.t=t;s.scoreA=a;s.scoreB=b;s.x=512e6;s.y=288e6;s.vx=192e6;s.vy=96e6;
        _save(id,s);
    }
    function corrected(uint256 id,uint8 a,uint8 b,address winner,bytes32 hash) external {
        PhysicsV2.State memory s=_state(id);s.scoreA=a;s.scoreB=b;_save(id,s);
        uint256 m=_get(id,0)&~(uint256(3)<<166);_set(id,0,m|((winner==address(uint160(m))?uint256(1):uint256(2))<<166));_set(id,9,uint256(hash));
    }
}

/// Real application contracts and authority wiring against a lifecycle fixture.
/// Hosted capacity, publication and timeout costs require separate real trials.
contract AgentArenaPoolTest is Test {
    IndependentHubFixture hub;AgentCatalog catalog;AgentArenaPool pool;AgentTournaments book;
    AgentPublishedRatings ratings;AgentChallenges queue;ArcadeFamily family;HousePolicies policies;ChaosEngine kernel;
    PooledArenaHarness[3] arenas;uint256 constant PLAYER=123;uint256 constant KEY=456;
    uint256 engineBlock;
    function setUp() public {
        vm.chainId(10143);vm.warp(1_800_000_000);vm.roll(100);
        hub=new IndependentHubFixture();policies=new HousePolicies();family=new ArcadeFamily();
        catalog=new AgentCatalog(address(this),address(this),address(policies));pool=new AgentArenaPool(catalog,IInterludeHub(address(hub)),address(this));
        book=new AgentTournaments(catalog,ICompetitionAuthority(address(pool)),address(this));ratings=new AgentPublishedRatings(address(pool),address(this),block.timestamp);
        ratings.sealMigration(keccak256("new empty agent season"));pool.configure(book,ratings);
        queue=new AgentChallenges(family,catalog,address(pool),address(this));pool.bindChallenges(queue);catalog.configure(address(book),address(pool));
        ChaosEffects effects=new ChaosEffects();ChaosDynamics dynamics=new ChaosDynamics(effects,new ChaosModifiers());
        ChaosPhysics physics=new ChaosPhysics(effects,new ChaosRally(),dynamics,new ChaosContacts(dynamics));
        kernel=new ChaosEngine(new ChaosCodec(),physics,new DrandEvmnet(),new ChaosDrawRules());
        for(uint8 i;i<8;i++){
            address bot=address(uint160(0x1000+i));catalog.addHouse(bot,bytes32(uint256(i+1)),i);
            catalog.qualify(bot,0,true,bytes32(uint256(1)));catalog.qualify(bot,1,true,bytes32(uint256(1)));
        }
        catalog.seal();for(uint8 i;i<3;i++){arenas[i]=new PooledArenaHarness(IInterludeHub(address(hub)),address(pool),policies,kernel);pool.addArena(IAgentArena(address(arenas[i])));}
        pool.seal();pool.setAdmissions(true);book.setAdmissions(true);queue.setAdmissions(true);
        grant();
    }
    function sig(uint256 key,bytes32 hash) private pure returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(key,hash);return abi.encodePacked(r,s,v);}
    function grant() private {
        ArcadeFamily.Grant memory g=ArcadeFamily.Grant(vm.addr(PLAYER),vm.addr(KEY),uint64(block.timestamp),uint64(block.timestamp+7200),0);
        family.register(g,sig(PLAYER,family.grantDigest(g)));
    }
    function challenge(address bot,uint8 mode) private returns(uint256){
        bytes32 h=family.grantDigest(family.grantOf(vm.addr(PLAYER)));uint64 deadline=uint64(block.timestamp+120);uint256 n=queue.nonces(h);
        return queue.command(vm.addr(PLAYER),1,bot,mode,0,n,deadline,sig(KEY,queue.digest(h,1,bot,mode,0,n,deadline)));
    }
    function community() private {
        address creator=vm.addr(789);address agent=address(0x2000);vm.etch(agent,abi.encodePacked(hex"73",creator,hex"60005260206000f3"));
        AgentCatalog.Registration memory r=AgentCatalog.Registration(agent,creator,bytes32(uint256(999)),3,uint64(block.timestamp+120),0);
        catalog.register(r,sig(789,catalog.digest(r)));catalog.qualify(agent,0,true,bytes32(uint256(1)));catalog.qualify(agent,1,true,bytes32(uint256(1)));
        vm.prank(creator);catalog.setAvailable(agent,true);
    }
    function tournament() private returns(uint64 id){id=book.begin();book.select(id,32);}
    function open(T.Ref memory ref) private {
        vm.roll(block.number+1);pool.openArena(ref);vm.chainId(4242);PooledAgentArena(ref.arena).start();engineBlock=block.number;vm.chainId(10143);
    }
    function finish(T.Ref memory ref,address winner) private {
        vm.chainId(4242);PooledArenaHarness(ref.arena).terminal(ref.id,winner);vm.chainId(10143);hub.publish(ref.arena);pool.capture(ref);
    }
    function testTournamentAndHumanChallengeUseSeparateLanesAndThirdArenaDuringClosure() public {
        community();challenge(address(0x1000),0);T.Ref memory human=pool.admitChallenge();open(human);
        uint64 id=tournament();T.Ref memory first=pool.admitTournament(id);assertTrue(first.arena!=human.arena);open(first);
        finish(first,book.fixture(id,0).a);book.synchronize(id,0);pool.closeArena(first);
        assertEq(uint8(hub.statusOf(first.arena,0)),uint8(Types.Status.Exiting));
        T.Ref memory next=pool.admitTournament(id);assertTrue(next.arena!=first.arena&&next.arena!=human.arena);open(next);
        assertEq(uint8(hub.statusOf(human.arena,0)),uint8(Types.Status.Active));assertEq(pool.playing(vm.addr(PLAYER)),T.key(human));
        assertEq(pool.releasedArenaCount(),0);vm.expectRevert("challenge window");pool.releaseArena(first);
        vm.warp(block.timestamp+3600);pool.releaseArena(first);assertTrue(pool.result(first).finality);assertEq(pool.releasedArenaCount(),1);
        finish(next,book.fixture(id,1).a);book.synchronize(id,1);T.Ref memory reused=pool.admitTournament(id);
        assertEq(reused.arena,first.arena);assertEq(reused.epoch,2);assertEq(pool.result(first).hash,ratings.entry(uint256(T.key(first))).latest.hash);
    }
    function testNoEarlyPublicationNoArbitraryResultAndUncertainOpenCannotDuplicate() public {
        uint64 id=tournament();T.Ref memory ref=pool.admitTournament(id);
        vm.expectRevert("prepared arena/pool only");pool.openArena(ref);open(ref);
        vm.expectRevert("epoch admission");pool.openArena(ref);
        vm.expectRevert("publication pending");pool.capture(ref);hub.publish(ref.arena);
        vm.expectRevert("result pending");pool.capture(ref);assertEq(pool.playing(book.fixture(id,0).a),T.key(ref));
        vm.expectRevert("tournament lane waiting");pool.admitTournament(id);
        hub.challenge(ref.arena);vm.expectRevert("result under review/unopened");pool.capture(ref);
    }
    function testHumanChallengesWaitForTournamentAndCannotUseBotKeys() public {
        uint64 id=tournament();uint256 challengeId=challenge(address(0x1000),0);T.Ref memory empty=pool.admitChallenge();assertEq(empty.id,0);
        (,,,uint8 status,,)=queue.requests(challengeId);assertEq(status,1);
        T.Ref memory ref=pool.admitTournament(id);open(ref);address bot=book.fixture(id,0).a;vm.chainId(4242);
        vm.expectRevert("unbound or expired human control");vm.prank(bot);PooledAgentArena(ref.arena).input(ref.id,1,1,block.number+100);
        vm.expectRevert(PooledAgentArena.PoolAdmissionOnly.selector);PooledAgentArena(ref.arena).cancelMatch(ref.id);
    }
    function testSharedGrantControlsOnlyTheHumanSeatAndProfilesDoNotGrantPermissions() public {
        challenge(address(0x1000),1);T.Ref memory ref=pool.admitChallenge();open(ref);vm.chainId(4242);
        vm.prank(vm.addr(KEY));PooledAgentArena(ref.arena).input(ref.id,1,1,block.number+100);
        vm.expectRevert("unbound or expired human control");vm.prank(vm.addr(PLAYER));PooledAgentArena(ref.arena).input(ref.id,-1,2,block.number+100);
        vm.prank(vm.addr(KEY));PooledAgentArena(ref.arena).concede(ref.id);vm.chainId(10143);hub.publish(ref.arena);pool.capture(ref);
        assertEq(queue.pending(vm.addr(PLAYER)),0);assertEq(catalog.participation(address(0x1000)),0);assertEq(ratings.ratingOf(vm.addr(PLAYER),1).played,0);
    }
    function testFiveMinuteLeadStopsBeforeAnyOvertimeAndDrawGetsOneMinute() public {
        uint64 id=tournament();T.Ref memory ref=pool.admitTournament(id);open(ref);
        PooledArenaHarness game=PooledArenaHarness(ref.arena);vm.chainId(4242);game.classicAt(ref.id,299_999_000,4,3);
        vm.roll(engineBlock+36_000);game.tick(ref.id);(T.Result memory r,,)=game.publishedResult();assertEq(r.status,3);assertEq(r.elapsedUs,300_000_000);assertEq(r.winner,r.a);
        vm.chainId(10143);hub.publish(ref.arena);pool.capture(ref);book.synchronize(id,0);
        ref=pool.admitTournament(id);open(ref);game=PooledArenaHarness(ref.arena);vm.chainId(4242);game.classicAt(ref.id,299_999_000,4,4);
        vm.roll(engineBlock+36_000);game.tick(ref.id);(r,,)=game.publishedResult();assertEq(r.status,2);assertEq(r.elapsedUs,300_000_000);
        game.classicAt(ref.id,359_999_000,4,4);game.tick(ref.id);(r,,)=game.publishedResult();assertEq(r.status,3);assertEq(r.elapsedUs,360_000_000);assertEq(r.winner,address(0));
        vm.chainId(10143);hub.publish(ref.arena);pool.capture(ref);book.synchronize(id,1);assertTrue(book.fixture(id,1).administrative);
    }
    function testFiveMinuteChallengeDrawHasNoHumanElo() public {
        challenge(address(0x1001),0);T.Ref memory ref=pool.admitChallenge();open(ref);PooledArenaHarness game=PooledArenaHarness(ref.arena);
        vm.chainId(4242);game.classicAt(ref.id,299_999_000,4,4);vm.roll(engineBlock+36_000);game.tick(ref.id);
        (T.Result memory r,,)=game.publishedResult();assertEq(r.status,3);assertEq(r.elapsedUs,300_000_000);assertEq(r.winner,address(0));
        vm.chainId(10143);hub.publish(ref.arena);pool.capture(ref);assertEq(ratings.ratingOf(vm.addr(PLAYER),0).elo,1000);
    }
    function testActiveRevocationAndExplicitRootRenewalDoNotGrantBotOrFinancialRights() public {
        challenge(address(0x1001),0);T.Ref memory ref=pool.admitChallenge();open(ref);PooledAgentArena game=PooledAgentArena(ref.arena);
        vm.chainId(4242);uint64 deadline=uint64(block.timestamp+60);address player=vm.addr(PLAYER);
        game.revokeActive(player,deadline,sig(PLAYER,game.revocationDigest(player,deadline)));
        vm.expectRevert("unbound or expired human control");vm.prank(vm.addr(KEY));game.input(ref.id,1,1,block.number+100);
        Auth.Renewal memory r=Auth.Renewal(player,vm.addr(KEY+1),ref.epoch,ref.id,game.authorizationRevision(player),uint64(block.timestamp+7200),deadline);
        bytes memory proof=sig(PLAYER,game.renewalDigest(r));game.renewActive(r,proof);
        vm.prank(vm.addr(KEY+1));game.input(ref.id,1,1,block.number+100);
        vm.expectRevert("owner renewal/revision");game.renewActive(r,proof);
        r.player=address(0x1001);vm.expectRevert("human participant only");game.renewActive(r,proof);
        vm.expectRevert(PooledAgentArena.SharedArenaAction.selector);game.renewEngine();
    }
    function testExpiredUnpublishedArenaReleasesOnlyAfterRealHubDeadline() public {
        uint64 id=tournament();T.Ref memory ref=pool.admitTournament(id);open(ref);vm.warp(block.timestamp+1 days);
        pool.recoverExpired(ref);vm.expectRevert("challenge window");pool.releaseArena(ref);
        vm.warp(block.timestamp+3600);pool.releaseArena(ref);T.Result memory r=pool.result(ref);assertEq(r.status,4);assertTrue(r.finality);
        book.synchronize(id,0);book.retryCancelled(id,0);assertEq(book.fixture(id,0).attempt,1);
        T.Ref memory next=pool.admitTournament(id);assertEq(next.epoch,2);assertEq(next.arena,ref.arena);assertTrue(next.id!=ref.id);
    }
    function testRuntimeSizesAreDeployable() public {
        PooledAgentArena production=new PooledAgentArena(IInterludeHub(address(hub)),address(pool),policies,kernel);
        assertLe(address(production).code.length,24576);assertLe(address(pool).code.length,24576);assertLe(address(queue).code.length,24576);
    }
    function testPrivateTrialNeverPretendsToBeQualifiedPublicCapacity() public {
        uint64 id=tournament();assertEq(pool.capacityEvidence(),0);assertFalse(pool.publicAdmissions());
        vm.expectRevert("private qualification");vm.prank(address(0x999));pool.admitTournament(id);
        vm.expectRevert("qualification required");pool.setPublicAdmissions(true);
    }
    function testUnopenedFailureCanBeCancelledWithoutInventingAnEpochOrConsumingNonce() public {
        uint64 id=tournament();T.Ref memory ref=pool.admitTournament(id);pool.cancelUnopened(ref);
        assertEq(pool.result(ref).status,4);assertTrue(pool.result(ref).finality);assertEq(pool.arenaEpoch(ref.arena),0);
        book.synchronize(id,0);book.retryCancelled(id,0);T.Ref memory next=pool.admitTournament(id);
        assertEq(next.epoch,1);assertEq(next.arena,ref.arena);assertTrue(next.id!=ref.id);open(next);
        vm.expectRevert("session already opened");pool.cancelUnopened(next);
    }
}
