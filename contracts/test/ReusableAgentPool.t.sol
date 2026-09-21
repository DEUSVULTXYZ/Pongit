// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {IndependentHubFixture} from "./Independent.t.sol";
import {ReusableAgentArena} from "../src/agents/competition/ReusableAgentArena.sol";
import {ReusableAgentPool} from "../src/agents/competition/ReusableAgentPool.sol";
import {ReusableAgentGame as Game} from "../src/agents/competition/ReusableAgentGame.sol";
import {AgentCatalog} from "../src/agents/competition/AgentCatalog.sol";
import {AgentTournaments} from "../src/agents/competition/AgentTournaments.sol";
import {AgentPublishedRatings} from "../src/agents/competition/AgentPublishedRatings.sol";
import {AgentChallenges} from "../src/agents/competition/AgentChallenges.sol";
import {AgentQualifications} from "../src/agents/competition/AgentQualifications.sol";
import {CompetitionTypes as T,ICompetitionAuthority} from "../src/agents/competition/CompetitionTypes.sol";
import {AgentArenaTypes as A} from "../src/agents/competition/AgentArenaTypes.sol";
import {HousePolicies} from "../src/agents/competition/HousePolicies.sol";
import {ArcadeFamily} from "../src/independent/ArcadeFamily.sol";
import {PublishedResultVerifier,IReusableAdmissionAuthority} from "../src/independent/PublishedResultVerifier.sol";
import {PublishedResultTree as Tree} from "../src/agents/competition/PublishedResultTree.sol";
import {ReusableAdmission as Admission} from "../src/independent/ReusableAdmission.sol";
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
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

/// Authority/proof integration harness only. Its terminal shortcut is never
/// compiled into the deployable arena. Real physics is covered separately.
contract ReusableAgentPoolHarness is ReusableAgentArena {
    constructor(IInterludeHub h,address p,address bridge,HousePolicies policies_,ChaosEngine k,PublishedResultVerifier v)
        ReusableAgentArena(h,p,bridge,policies_,k,v){}
    function terminal(address winner) external {Game.finish(words,kernel,3,winner);}
}

contract ReusableAgentPoolTest is Test {
    IndependentHubFixture hub;AgentCatalog catalog;ReusableAgentPool pool;AgentTournaments book;
    AgentPublishedRatings ratings;AgentChallenges queue;ArcadeFamily family;HousePolicies policies;ChaosEngine kernel;
    PublishedResultVerifier verifier;ReusableAgentPoolHarness[3] arenas;
    uint256 constant PLAYER=123;uint256 constant KEY=456;uint256 constant BRIDGE=812;
    function setUp() public {
        vm.chainId(10143);vm.warp(1_800_000_000);vm.roll(100);vm.setBlockhash(99,keccak256("Monad source"));
        hub=new IndependentHubFixture();policies=new HousePolicies();family=new ArcadeFamily();
        catalog=new AgentCatalog(address(this),address(this),address(policies));
        pool=new ReusableAgentPool(catalog,IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE));
        verifier=new PublishedResultVerifier(IReusableAdmissionAuthority(address(pool)),IInterludeHub(address(hub)));pool.bindVerifier(verifier);
        book=new AgentTournaments(catalog,ICompetitionAuthority(address(pool)),address(this));
        ratings=new AgentPublishedRatings(address(pool),address(this),vm.getBlockTimestamp());ratings.sealMigration(keccak256("empty fixture"));pool.configure(book,ratings);
        queue=new AgentChallenges(family,catalog,address(pool),address(this));pool.bindChallenges(queue);catalog.configure(address(book),address(pool));
        pool.bindQualifications(new AgentQualifications(catalog,address(pool)));
        ChaosEffects effects=new ChaosEffects();ChaosDynamics dynamics=new ChaosDynamics(effects,new ChaosModifiers());
        ChaosPhysics physics=new ChaosPhysics(effects,new ChaosRally(),dynamics,new ChaosContacts(dynamics));
        kernel=new ChaosEngine(new ChaosCodec(),physics,new DrandEvmnet(),new ChaosDrawRules());
        for(uint8 i;i<8;i++){
            address bot=address(uint160(0x1000+i));catalog.addHouse(bot,bytes32(uint256(i+1)),i);
            catalog.qualify(bot,0,true,bytes32(uint256(1)));catalog.qualify(bot,1,true,bytes32(uint256(1)));
        }
        catalog.seal();for(uint8 i;i<3;i++){
            arenas[i]=new ReusableAgentPoolHarness(IInterludeHub(address(hub)),address(pool),vm.addr(BRIDGE),policies,kernel,verifier);pool.addArena(arenas[i]);
        }
        pool.seal();pool.setAdmissions(true);book.setAdmissions(true);queue.setAdmissions(true);
        ArcadeFamily.Grant memory g=ArcadeFamily.Grant(vm.addr(PLAYER),vm.addr(KEY),uint64(vm.getBlockTimestamp()),uint64(vm.getBlockTimestamp()+7200),0);
        family.register(g,sig(PLAYER,family.grantDigest(g)));
        for(uint8 i;i<3;i++)pool.openReusableArena(address(arenas[i]));
    }
    function sig(uint256 key,bytes32 hash) internal pure returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(key,hash);return abi.encodePacked(r,s,v);}
    function challenge(address bot,uint8 mode) internal returns(uint256){
        bytes32 h=family.grantDigest(family.grantOf(vm.addr(PLAYER)));uint64 until=uint64(vm.getBlockTimestamp()+120);uint256 n=queue.nonces(h);
        return queue.command(vm.addr(PLAYER),1,bot,mode,0,n,until,sig(KEY,queue.digest(h,1,bot,mode,0,n,until)));
    }
    function sourceBlock() internal {vm.setBlockhash(vm.getBlockNumber()-1,keccak256(abi.encode(vm.getBlockNumber()-1)));}
    function begin() internal returns(uint64 id){id=book.begin();book.select(id,32);}
    function admit(T.Ref memory ref) internal {
        (Admission.Ticket memory ticket,A.Binding memory b)=pool.ticketOf(ref);vm.chainId(4242);
        ReusableAgentArena arena=ReusableAgentArena(ref.arena);arena.admit(ticket,b,sig(BRIDGE,Admission.digest(ticket)));
        if(b.controlA.codeHash==0){vm.prank(b.controlA.key);arena.confirmReady(ref.epoch,ref.id);}
        if(b.controlB.codeHash==0){vm.prank(b.controlB.key);arena.confirmReady(ref.epoch,ref.id);}
        arena.start(ref.epoch,ref.id);vm.warp(vm.getBlockTimestamp()+3);vm.roll(vm.getBlockNumber()+300);arena.start(ref.epoch,ref.id);vm.chainId(10143);
    }
    function firstProof() internal pure returns(bytes32[16] memory p){for(uint8 i=1;i<16;i++)p[i]=keccak256(abi.encode(p[i-1],p[i-1]));}
    function leaf(T.Ref memory ref,Game.Result memory result) internal view returns(bytes32){
        (Admission.Ticket memory ticket,)=pool.ticketOf(ref);
        return Tree.resultLeaf(ref.chainId,ref.arena,ref.epoch,ref.id,keccak256(abi.encode(Admission.digest(ticket),keccak256(abi.encode(result)))));
    }
    function finish(T.Ref memory ref,address winner) internal returns(Game.Result memory r){
        vm.chainId(4242);ReusableAgentPoolHarness(ref.arena).terminal(winner);r=ReusableAgentArena(ref.arena).publishedResult();vm.chainId(10143);hub.publish(ref.arena);
    }
    function testSameSessionNextTournamentFixtureAndHistoricalProofAfterReuse() public {
        uint64 id=begin();T.Ref memory first=pool.admitTournament(id);admit(first);
        Game.Result memory one=finish(first,book.fixture(id,0).a);pool.captureProof(first,one,firstProof());pool.captureProof(first,one,firstProof());
        assertEq(ratings.count(),1);book.synchronize(id,0);sourceBlock();T.Ref memory next=pool.admitTournament(id);
        assertEq(next.arena,first.arena);assertEq(next.epoch,first.epoch);assertTrue(next.id!=first.id);
        admit(next);Game.Result memory two=finish(next,book.fixture(id,1).a);bytes32[16] memory p=firstProof();p[0]=leaf(first,one);pool.captureProof(next,two,p);
        p[0]=leaf(next,two);pool.captureProof(first,one,p);assertEq(ratings.count(),2);assertEq(pool.result(first).hash,one.match_.hash);
        assertFalse(pool.result(first).finality);pool.closeReusableArena(first.arena);vm.warp(vm.getBlockTimestamp()+3600);pool.releaseArena(first.arena);
        pool.captureProof(first,one,p);assertTrue(pool.result(first).finality);pool.openReusableArena(first.arena);
        pool.captureProof(first,one,p);assertTrue(pool.result(first).finality);assertEq(pool.arenaEpoch(first.arena),2);
    }
    function testNewHumanAfterOpeningHasExactGrantAndNoHumanElo() public {
        challenge(address(0x1000),1);T.Ref memory ref=pool.admitChallenge();(Admission.Ticket memory t,A.Binding memory b)=pool.ticketOf(ref);
        assertEq(pool.laneRecord(1).ref.id,ref.id);assertEq(pool.laneRecord(1).a,b.a);
        assertEq(ReusableAgentArena(ref.arena).boundMatch().id,0);
        vm.expectRevert("lane bounds");pool.laneRecord(2);
        assertEq(t.bindingHash,keccak256(abi.encode(b)));assertEq(b.controlA.key,vm.addr(KEY));assertFalse(b.ranked);admit(ref);
        vm.chainId(4242);vm.prank(vm.addr(KEY));ReusableAgentArena(ref.arena).input(ref.epoch,ref.id,1,1,vm.getBlockNumber()+100);
        vm.prank(vm.addr(KEY));ReusableAgentArena(ref.arena).concede(ref.epoch,ref.id);Game.Result memory r=ReusableAgentArena(ref.arena).publishedResult();vm.chainId(10143);
        vm.expectRevert("result not published");pool.captureProof(ref,r,firstProof());hub.publish(ref.arena);pool.captureProof(ref,r,firstProof());
        assertEq(queue.pending(vm.addr(PLAYER)),0);assertEq(catalog.participation(b.b),0);assertEq(ratings.ratingOf(b.a,1).played,0);
    }
    function testFalseBridgeControllerCannotBecomeAuthoritativeResult() public {
        challenge(address(0x1000),0);T.Ref memory ref=pool.admitChallenge();(Admission.Ticket memory t,A.Binding memory b)=pool.ticketOf(ref);
        b.controlA.key=vm.addr(998);t.bindingHash=keccak256(abi.encode(b));vm.chainId(4242);
        ReusableAgentArena(ref.arena).admit(t,b,sig(BRIDGE,Admission.digest(t)));
        ReusableAgentPoolHarness(ref.arena).terminal(b.b);Game.Result memory r=ReusableAgentArena(ref.arena).publishedResult();vm.chainId(10143);hub.publish(ref.arena);
        vm.expectRevert("result proof");pool.captureProof(ref,r,firstProof());assertEq(pool.playing(b.a),T.key(ref));assertEq(ratings.count(),0);
    }
    function testUncertainExpiredTicketKeepsParticipationUntilReleasedAbsence() public {
        challenge(address(0x1000),0);T.Ref memory ref=pool.admitChallenge();vm.warp(vm.getBlockTimestamp()+121);
        hub.publish(ref.arena);
        vm.expectRevert("final proof of absence required");pool.captureMissing(ref);
        vm.expectRevert("challenge lane waiting");pool.admitChallenge();pool.closeReusableArena(ref.arena);
        vm.expectRevert("challenge window");pool.releaseArena(ref.arena);vm.warp(vm.getBlockTimestamp()+3600);pool.releaseArena(ref.arena);
        assertEq(pool.result(ref).status,4);assertTrue(pool.result(ref).finality);assertEq(queue.pending(vm.addr(PLAYER)),0);
        pool.openReusableArena(ref.arena);assertEq(pool.arenaEpoch(ref.arena),2);
    }
    function testClosureDoesNotStopOtherLaneAndNextAdmissionUsesOtherArena() public {
        uint64 tournament=begin();T.Ref memory first=pool.admitTournament(tournament);admit(first);
        Game.Result memory r=finish(first,book.fixture(tournament,0).a);pool.captureProof(first,r,firstProof());book.synchronize(tournament,0);
        pool.closeReusableArena(first.arena);sourceBlock();T.Ref memory next=pool.admitTournament(tournament);admit(next);
        assertTrue(next.arena!=first.arena);assertEq(uint8(hub.statusOf(first.arena,0)),uint8(Types.Status.Exiting));
        assertEq(uint8(hub.statusOf(next.arena,0)),uint8(Types.Status.Active));assertEq(pool.releasedArenaCount(),1);
    }
    function testUnadmittedExpiryCapturesCancellationAndReusesSameEpoch() public {
        challenge(address(0x1000),1);T.Ref memory ref=pool.admitChallenge();
        (Admission.Ticket memory t,A.Binding memory b)=pool.ticketOf(ref);bytes memory signed=sig(BRIDGE,Admission.digest(t));
        ReusableAgentArena arena=ReusableAgentArena(ref.arena);vm.chainId(4242);
        vm.expectRevert("admission still valid");arena.cancelAdmission(t,b,signed);
        vm.warp(vm.getBlockTimestamp()+7201);vm.expectRevert(Admission.InvalidAdmission.selector);arena.admit(t,b,signed);
        A.Binding memory changed=b;changed.id++;vm.expectRevert("agent admission binding");arena.cancelAdmission(t,changed,signed);changed.id--;
        vm.expectRevert(Admission.InvalidBridgeSignature.selector);arena.cancelAdmission(t,b,sig(999,Admission.digest(t)));
        // Missing external code must not strand an unplayed ticket. The
        // cancellation path never calls a strategy or awards a score.
        vm.etch(address(policies),hex"");
        arena.cancelAdmission(t,b,signed);Game.Result memory result=arena.publishedResult();
        assertEq(result.match_.status,4);assertEq(result.match_.elapsedUs,0);assertEq(result.match_.winner,address(0));
        vm.expectRevert(Admission.InvalidAdmission.selector);arena.cancelAdmission(t,b,signed);
        vm.chainId(10143);hub.publish(ref.arena);pool.captureProof(ref,result,firstProof());
        assertTrue(pool.record(ref).captured);assertEq(pool.playing(b.a),bytes32(0));assertEq(pool.playing(b.b),bytes32(0));
        assertEq(queue.pending(b.a),0);assertEq(uint8(hub.statusOf(ref.arena,0)),uint8(Types.Status.Active));
        assertEq(pool.releasedArenaCount(),3);
        assertEq(ratings.ratingOf(b.a,1).elo,1000);
    }
    function testDisputedRootCannotReleaseParticipationOrCreateRating() public {
        uint64 tournament=begin();T.Ref memory ref=pool.admitTournament(tournament);admit(ref);Game.Result memory r=finish(ref,book.fixture(tournament,0).a);
        hub.challenge(ref.arena);vm.expectRevert("result under review");pool.captureProof(ref,r,firstProof());assertEq(ratings.count(),0);
        assertEq(pool.playing(r.match_.a),T.key(ref));assertEq(pool.releasedArenaCount(),2);
    }
    function newCommunity() internal returns(address agent){
        vm.roll(vm.getBlockNumber()+1);sourceBlock();address creator=vm.addr(789);agent=address(0x2000);
        vm.etch(agent,abi.encodePacked(hex"73",creator,hex"60005260206000f3"));
        AgentCatalog.Registration memory r=AgentCatalog.Registration(agent,creator,bytes32(uint256(999)),3,uint64(vm.getBlockTimestamp()+120),0);
        catalog.register(r,sig(789,catalog.digest(r)));
        vm.prank(address(pool.qualifications()));catalog.qualify(agent,0,true,bytes32(uint256(1)));
        vm.prank(address(pool.qualifications()));catalog.qualify(agent,1,true,bytes32(uint256(1)));
        vm.prank(creator);catalog.setAvailable(agent,true);
    }
    function testNewCommunityCodeWaitsWithoutConsumingChallengeThenUsesNewerArena() public {
        address agent=newCommunity();uint256 request=challenge(agent,0);assertEq(pool.admitChallenge().id,0);
        (,,,uint8 status,,)=queue.requests(request);assertEq(status,1);assertEq(pool.nonce(),0);assertEq(catalog.participation(agent),0);
        pool.closeReusableArena(address(arenas[2]));vm.warp(vm.getBlockTimestamp()+3600);pool.releaseArena(address(arenas[2]));pool.openReusableArena(address(arenas[2]));
        T.Ref memory ref=pool.admitChallenge();assertEq(ref.arena,address(arenas[2]));assertEq(ref.epoch,2);admit(ref);
        assertEq(ReusableAgentArena(ref.arena).boundMatch().b,agent);
    }
    function testNewCommunityDoesNotHoldUpKnownQualification() public {
        address agent=newCommunity();vm.prank(address(pool.qualifications()));catalog.qualify(agent,0,false,bytes32(uint256(2)));
        catalog.qualify(address(0x1000),0,false,bytes32(uint256(2)));
        T.Ref memory ref=pool.admitQualification();(,A.Binding memory b)=pool.ticketOf(ref);
        assertTrue(b.a!=agent&&b.b!=agent);assertEq(b.a,address(0x1000));admit(ref);
        for(uint8 i;i<3;i++){vm.chainId(4242);vm.roll(vm.getBlockNumber()+10);ReusableAgentArena(ref.arena).tick(ref.epoch,ref.id);vm.chainId(10143);}
        Game.Result memory r=finish(ref,b.b);pool.captureProof(ref,r,firstProof());assertEq(catalog.identity(b.a).qualified,3);
        assertEq(catalog.identity(agent).qualified,2);assertEq(ratings.ratingOf(b.a,0).played,0);
    }
    function testRuntimeBudgetsAndPublicGateRemainExplicit() public {
        ReusableAgentArena production=new ReusableAgentArena(IInterludeHub(address(hub)),address(pool),vm.addr(BRIDGE),policies,kernel,verifier);
        emit log_named_uint("reusable agent root bytes",address(production).code.length);emit log_named_uint("reusable agent pool bytes",address(pool).code.length);
        assertLe(address(production).code.length,24576);
        // Like the existing AgentSeriesPool and reusable human lobby, this
        // Monad-only authority has an explicit 32 KiB review/deployment budget.
        // The delegated physics root keeps the stricter EIP-170 guard above.
        assertLe(address(pool).code.length,32768);
        assertFalse(pool.publicAdmissions());vm.expectRevert("qualification required");pool.setPublicAdmissions(true);
    }
}
