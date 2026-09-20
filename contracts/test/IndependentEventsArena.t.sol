// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {IndependentHubFixture} from "./Independent.t.sol";
import {IndependentEventsArena} from "../src/independent/IndependentEventsArena.sol";
import {IndependentEventsLobby} from "../src/independent/IndependentEventsLobby.sol";
import {IndependentEventsSettlement} from "../src/independent/IndependentEventsSettlement.sol";
import {IndependentArena} from "../src/independent/IndependentArena.sol";
import {IndependentLobby} from "../src/independent/IndependentLobby.sol";
import {IndependentTypes as T} from "../src/independent/IndependentTypes.sol";
import {ArcadeFamily} from "../src/independent/ArcadeFamily.sol";
import {PublishedRatings} from "../src/independent/PublishedRatings.sol";
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
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {RealtimeMarket} from "../src/labs/RealtimeMarket.sol";
import {MarketV4} from "../src/v4/MarketV4.sol";
import {RoomsVault} from "../src/labs/RoomsVault.sol";
import {LMSRV2} from "../src/v2/MarketV2.sol";

/// Actual lobby and new human application against a lifecycle fixture. No
/// provider-capacity or real publication claim follows from these tests.
contract IndependentEventsArenaTest is Test {
    IndependentHubFixture hub;ArcadeFamily family;IndependentLobby lobby;PublishedRatings ratings;
    IndependentEventsArena[3] arenas;
    IndependentEventsSettlement settlement;
    RealtimeMarket market;
    RoomsVault vault;
    receive() external payable {}
    function setUp() public {
        vm.chainId(10143);vm.warp(1_800_000_000);vm.roll(100);
        hub=new IndependentHubFixture();family=new ArcadeFamily();
        lobby=new IndependentEventsLobby(family,IInterludeHub(address(hub)),address(this),vm.addr(900));
        ratings=new PublishedRatings(address(lobby),address(this),block.timestamp);
        ratings.sealMigration(keccak256("isolated empty season"));lobby.bindRatings(ratings);
        ChaosEffects effects=new ChaosEffects();ChaosDynamics dynamics=new ChaosDynamics(effects,new ChaosModifiers());
        ChaosPhysics physics=new ChaosPhysics(effects,new ChaosRally(),dynamics,new ChaosContacts(dynamics));
        ChaosEngine kernel=new ChaosEngine(new ChaosCodec(),physics,new DrandEvmnet(),new ChaosDrawRules());
        for(uint8 i;i<3;i++){
            arenas[i]=new IndependentEventsArena(IInterludeHub(address(hub)),address(lobby),vm.addr(900),kernel);
            lobby.addArena(IndependentArena(address(arenas[i])));
        }
        lobby.seal();for(uint256 i=101;i<=106;i++)register(i);
        settlement=new IndependentEventsSettlement(IndependentEventsLobby(address(lobby)));
        vault=new RoomsVault(address(this));market=new RealtimeMarket(address(this),payable(address(this)),settlement,new LMSRV2(),vault);
        vault.registerModule(address(market));vault.seal();vm.deal(address(this),10 ether);
        vault.depositFor{value:1 ether}(vm.addr(777));
    }
    function sig(uint256 key,bytes32 digest) private pure returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(key,digest);return abi.encodePacked(r,s,v);}
    function register(uint256 key) private {
        ArcadeFamily.Grant memory g=ArcadeFamily.Grant(vm.addr(key),vm.addr(key+1000),uint64(block.timestamp),uint64(block.timestamp+7200),family.revisions(vm.addr(key)));
        family.register(g,sig(key,family.grantDigest(g)));
    }
    function callLobby(uint256 key,bytes memory data) private returns(bytes memory){
        bytes32 grant=family.grantDigest(family.grantOf(vm.addr(key)));uint256 n=lobby.commandNonces(grant);uint64 deadline=uint64(block.timestamp+30);
        return lobby.relay(vm.addr(key),data,n,deadline,sig(key+1000,lobby.commandDigest(grant,data,n,deadline)));
    }
    function propose(uint256 a,uint256 b,uint8 mode) private returns(uint256 id){
        uint256 room=abi.decode(callLobby(a,abi.encodeCall(lobby.createRoom,(mode))),(uint256));
        callLobby(b,abi.encodeCall(lobby.joinRoom,(room)));id=lobby.propose(room);
        callLobby(a,abi.encodeCall(lobby.acceptProposal,(id)));callLobby(b,abi.encodeCall(lobby.acceptProposal,(id)));
    }
    function open(uint256 id) private returns(IndependentEventsArena arena){
        arena=IndependentEventsArena(lobby.assignNext());assertEq(arena.boundMatch().epoch,0);
        vm.roll(block.number+1);lobby.openArena(id);vm.chainId(4242);arena.start();vm.warp(block.timestamp+3);arena.start();vm.chainId(10143);
    }
    function finish(IndependentEventsArena arena,uint256 id,uint256 loser) private {
        vm.chainId(4242);vm.prank(vm.addr(loser+1000));arena.concede(id);vm.chainId(10143);hub.publish(address(arena));lobby.capture(id);
    }
    function testBothModesHumanControlsAndIndependentClosure() public {
        uint256 a=propose(101,102,0);IndependentEventsArena first=open(a);
        uint256 b=propose(103,104,1);IndependentEventsArena second=open(b);
        assertEq(first.RULES_VERSION(),12);assertEq(first.gameEpoch(a),1);
        vm.chainId(4242);vm.prank(vm.addr(1101));first.input(a,1,1,block.number+100);
        vm.prank(vm.addr(1104));second.input(b,-1,1,block.number+100);vm.chainId(10143);
        finish(first,a,101);lobby.closeArena(a);
        assertEq(uint256(hub.statusOf(address(first),0)),uint256(Types.Status.Exiting));
        vm.chainId(4242);vm.prank(vm.addr(1103));second.input(b,1,1,block.number+100);vm.chainId(10143);
        uint256 c=propose(105,106,1);IndependentEventsArena third=open(c);assertTrue(address(third)!=address(first)&&address(third)!=address(second));
        assertEq(first.publishedResult().winner,vm.addr(102));assertEq(second.activeCount(),1);assertEq(third.activeCount(),1);
        assertEq(ratings.ratingOf(vm.addr(101),0).played,0,"room remains friendly");
    }
    function testCancelledUnopenedPreparationDoesNotConsumeEpoch() public {
        uint256 a=propose(101,102,1);IndependentEventsArena first=IndependentEventsArena(lobby.assignNext());
        callLobby(101,abi.encodeCall(lobby.cancelAdmission,(a)));callLobby(102,abi.encodeCall(lobby.leaveRoom,()));
        uint256 b=propose(101,102,0);IndependentEventsArena next=open(b);
        assertEq(address(next),address(first));assertEq(next.boundMatch().epoch,1);assertEq(first.publishedResult().id,b);
    }
    function testReleasedArenaRenewsAfterHubClearsItsSession() public {
        uint256 a=propose(101,102,1);IndependentEventsArena first=open(a);finish(first,a,101);lobby.closeArena(a);
        vm.warp(block.timestamp+3600);hub.releaseStake(address(first),0);lobby.capture(a);
        assertEq(hub.sessionOf(address(first),0).epoch,0,"fixture clears the released tuple");
        callLobby(101,abi.encodeCall(lobby.leaveRoom,()));callLobby(102,abi.encodeCall(lobby.leaveRoom,()));
        register(101);register(102);uint256 b=propose(101,102,1);IndependentEventsArena next=open(b);
        assertEq(address(next),address(first));assertEq(next.boundMatch().epoch,2);assertEq(next.gameEpoch(b),2);
        assertEq(ratings.entry(a).latest.id,a,"old publication retained");
        vm.chainId(4242);vm.expectRevert();vm.prank(vm.addr(1101));next.input(a,1,1,block.number+100);
        vm.prank(vm.addr(1101));next.input(b,1,1,block.number+100);
    }
    function testOwnerIsNotArcadeKeyAndRenewalDoesNotWritePackedChaos() public {
        uint256 id=propose(101,102,1);IndependentEventsArena arena=open(id);vm.chainId(4242);
        vm.expectRevert("unbound or expired human control");vm.prank(vm.addr(101));arena.input(id,1,1,block.number+100);
        bytes memory beforeState=arena.chaosState(id);
        Auth.Renewal memory r=Auth.Renewal(vm.addr(101),vm.addr(5001),1,id,0,uint64(block.timestamp+7100),uint64(block.timestamp+60));
        arena.renewActive(r,sig(101,arena.renewalDigest(r)));assertEq(arena.chaosState(id),beforeState);
        assertEq(arena.authorizationRevision(vm.addr(101)),1);
        vm.expectRevert("unbound or expired human control");vm.prank(vm.addr(1101));arena.input(id,1,1,block.number+100);
        vm.prank(vm.addr(5001));arena.input(id,1,1,block.number+100);
        vm.expectRevert(IndependentEventsArena.SharedHumanRanking.selector);arena.ratingOf(vm.addr(101),1);
    }
    function testPreparedAndActiveArenasCannotBeOverwritten() public {
        uint256 id=propose(101,102,0);IndependentEventsArena arena=open(id);
        T.Binding memory b=arena.boundMatch();b.id++;b.epoch=0;
        vm.expectRevert("released arena/pool only");vm.prank(address(lobby));arena.prepare(b);
        vm.expectRevert(IndependentEventsArena.LobbyActionOnly.selector);arena.cancelRecovered();
        vm.expectRevert(IndependentEventsArena.LobbyActionOnly.selector);arena.renewEngine();
    }
    function testCandidateRuntimeRemainsInsideItsExplicitMonadBudget() public view {
        assertLe(address(arenas[0]).code.length,32768);
        assertLe(address(lobby).code.length,32768);
        assertLe(address(settlement).code.length,24576);
    }
    function testExpiredArenaRecoveryPublishesOnlyACancellation() public {
        uint256 id=propose(101,102,1);IndependentEventsArena arena=open(id);
        vm.warp(block.timestamp+1 days);lobby.recoverExpired(id);
        vm.expectRevert("challenge window");hub.releaseStake(address(arena),0);
        vm.warp(block.timestamp+3600);hub.releaseStake(address(arena),0);lobby.capture(id);
        T.Result memory r=arena.publishedResult();assertEq(r.status,4);assertEq(r.winner,address(0));
        // The match lock is released, while friends remain in their room.
        // Clearing occupancy here would silently remove them from that room.
        assertEq(lobby.activeMatchOf(vm.addr(101)),0);assertEq(lobby.activeMatchOf(vm.addr(102)),0);
        assertEq(lobby.proposal(id).status,3);
        assertEq(lobby.occupancy(vm.addr(101)),arena.boundMatch().room);
        register(101);register(102);
        callLobby(101,abi.encodeCall(lobby.leaveRoom,()));callLobby(102,abi.encodeCall(lobby.leaveRoom,()));
        assertEq(lobby.occupancy(vm.addr(101)),0);assertEq(lobby.occupancy(vm.addr(102)),0);
        assertEq(ratings.ratingOf(vm.addr(101),1).played,0);
    }
    function buy(uint256 id,uint8 side) private returns(uint256 cost){
        (,uint256 version)=settlement.bettingWindow(id,0);
        MarketV4.Bet memory b=MarketV4.Bet(vm.addr(777),id,side,.005 ether,1 ether,version,market.nonces(vm.addr(777)),uint64(block.timestamp+60));
        bytes32 domain=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256("PONG Market"),keccak256("1"),block.chainid,address(market)));
        cost=market.quote(id,side,b.shares);market.buy(b,sig(777,keccak256(abi.encodePacked("\x19\x01",domain,keccak256(abi.encode(market.BET_TYPEHASH(),b))))));
    }
    function bettingMatch() private returns(uint256 id,IndependentEventsArena arena){
        id=propose(101,102,1);arena=open(id);hub.publish(address(arena));settlement.openRound(id);market.open{value:.1 ether}(id,.01 ether);
    }
    function testRealtimeBetsDoNotRequireAPauseOrFortyBlockRound() public {
        (uint256 id,)=bettingMatch();(bool allowed,uint256 version)=settlement.bettingWindow(id,0);assertTrue(allowed);buy(id,0);
        vm.roll(block.number+41);(bool later,uint256 afterVersion)=settlement.bettingWindow(id,0);assertTrue(later);assertEq(version,afterVersion);
        settlement.openRound(id);buy(id,1);
    }
    function testCountdownUsesContractTimeAndCannotBeSkippedOrExtended() public {
        uint256 id=propose(101,102,1);IndependentEventsArena arena=IndependentEventsArena(lobby.assignNext());
        vm.roll(block.number+1);lobby.openArena(id);vm.chainId(4242);arena.start();uint64 at=arena.launchAt(id);
        assertEq(at,block.timestamp+3);vm.warp(block.timestamp+2);
        vm.expectRevert("countdown pending");arena.start();assertEq(arena.launchAt(id),at);
        vm.expectRevert();vm.prank(vm.addr(1101));arena.input(id,1,1,block.number+100);
        vm.warp(block.timestamp+1);arena.start();assertEq(arena.launchAt(id),at);
        vm.expectRevert("unopened or started arena");arena.start();
        vm.prank(vm.addr(1101));arena.input(id,1,1,block.number+100);
    }
    function testCutoffAndUnclaimedGainsSurviveArenaReuse() public {
        (uint256 id,IndependentEventsArena arena)=bettingMatch();buy(id,1);
        vm.warp(block.timestamp+2);uint64 cutoff=uint64(block.timestamp);uint256 late=buy(id,0);
        finish(arena,id,101);assertEq(settlement.bettingCutoff(id),cutoff);
        lobby.closeArena(id);vm.warp(block.timestamp+3600);hub.releaseStake(address(arena),0);lobby.capture(id);
        callLobby(101,abi.encodeCall(lobby.leaveRoom,()));callLobby(102,abi.encodeCall(lobby.leaveRoom,()));
        register(101);register(102);uint256 next=propose(101,102,1);IndependentEventsArena reused=open(next);assertEq(address(reused),address(arena));
        // Settlement reads its frozen record even if the historical engine read fails.
        vm.mockCallRevert(address(arena),abi.encodeWithSelector(arena.finishedAt.selector,id),bytes("unavailable"));
        settlement.finalizeResult(id);assertEq(settlement.bettingCutoff(id),cutoff);
        (,,address winner,uint8 status)=settlement.result(id);assertEq(winner,vm.addr(102));assertEq(status,3);
        (uint256 amount,uint256 refund,bool ready)=market.claimPreview(id,vm.addr(777));assertTrue(ready);assertEq(refund,late);assertEq(amount,.005 ether+late);
        market.claim(id,vm.addr(777));assertEq(vm.addr(777).balance,amount);
        vm.expectRevert("claim");market.claim(id,vm.addr(777));
        (bool allowed,)=settlement.bettingWindow(id,0);assertFalse(allowed);
    }
    function testCutoffFailureRollsBackCaptureAndPreservesMatchLock() public {
        (uint256 id,IndependentEventsArena arena)=bettingMatch();
        vm.chainId(4242);vm.prank(vm.addr(1101));arena.concede(id);vm.chainId(10143);hub.publish(address(arena));
        vm.mockCall(address(arena),abi.encodeWithSelector(arena.finishedAt.selector,id),abi.encode(uint64(0)));
        vm.expectRevert("published cutoff pending");lobby.capture(id);
        assertEq(ratings.indexOf(id),0);assertEq(lobby.activeMatchOf(vm.addr(101)),id);
        vm.clearMockedCalls();lobby.capture(id);assertEq(lobby.activeMatchOf(vm.addr(101)),0);
        assertGt(settlement.bettingCutoff(id),0);
    }
    function testKnownChallengeBlocksCaptureAndCorrectionNeverRepays() public {
        (uint256 id,IndependentEventsArena arena)=bettingMatch();buy(id,1);vm.warp(block.timestamp+2);
        vm.chainId(4242);vm.prank(vm.addr(1101));arena.concede(id);vm.chainId(10143);hub.publish(address(arena));
        Types.Session memory session=hub.sessionOf(address(arena),0);hub.challenge(address(arena));
        vm.expectRevert("result under review");settlement.finalizeResult(id);assertEq(ratings.indexOf(id),0);
        vm.mockCall(address(hub),abi.encodeWithSelector(hub.sessionOf.selector,address(arena),bytes32(0)),abi.encode(session));
        settlement.finalizeResult(id);uint64 firstCutoff=settlement.bettingCutoff(id);market.claim(id,vm.addr(777));
        T.Result memory corrected=arena.publishedResult();corrected.winner=vm.addr(101);corrected.hash=keccak256("corrected fixture publication");
        vm.mockCall(address(arena),abi.encodeWithSelector(arena.publishedResult.selector),abi.encode(corrected));
        vm.mockCall(address(arena),abi.encodeWithSelector(arena.finishedAt.selector,id),abi.encode(uint64(block.timestamp+10)));
        lobby.capture(id);assertEq(ratings.entry(id).latest.winner,vm.addr(101));assertEq(ratings.revision(),1);
        (,,address paidWinner,)=settlement.result(id);assertEq(paidWinner,vm.addr(102));assertEq(settlement.bettingCutoff(id),firstCutoff);
        vm.expectRevert("claim");market.claim(id,vm.addr(777));assertEq(vm.addr(777).balance,.005 ether);
    }
    function testExpiredUnpublishedMatchRefundsAllBetsAfterRecovery() public {
        (uint256 id,IndependentEventsArena arena)=bettingMatch();uint256 paid=buy(id,0);
        vm.warp(block.timestamp+1 days);lobby.recoverExpired(id);vm.warp(block.timestamp+3600);hub.releaseStake(address(arena),0);
        settlement.finalizeResult(id);(,,address winner,uint8 status)=settlement.result(id);assertEq(winner,address(0));assertEq(status,4);
        market.claim(id,vm.addr(777));assertEq(vm.addr(777).balance,paid);
        vm.expectRevert("claim");market.claim(id,vm.addr(777));
    }
}
