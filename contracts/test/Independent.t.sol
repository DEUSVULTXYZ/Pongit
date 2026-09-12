// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ArcadeFamily} from "../src/independent/ArcadeFamily.sol";
import {IndependentLobby} from "../src/independent/IndependentLobby.sol";
import {IndependentArena} from "../src/independent/IndependentArena.sol";
import {PublishedRatings} from "../src/independent/PublishedRatings.sol";
import {IndependentTypes as T} from "../src/independent/IndependentTypes.sol";
import {ArenaPressure} from "../src/independent/ArenaPressure.sol";
import {ArenaAuthorizations} from "../src/independent/ArenaAuthorizations.sol";
import {AutonomousGameBase} from "../src/autonomous/AutonomousGameBase.sol";
import {ILobbyRatings, ContractLobby as L} from "../src/autonomous/ContractLobby.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {IDelegatableApp} from "../vendor/interlude/interfaces/IDelegatableApp.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {IndependentSettlement} from "../src/independent/IndependentSettlement.sol";
import {MarketV4} from "../src/v4/MarketV4.sol";
import {LMSRV2} from "../src/v2/MarketV2.sol";
import {RoomsVault} from "../src/labs/RoomsVault.sol";

contract IndependentHubFixture {
    mapping(address=>Types.Session) private sessions;
    mapping(address=>uint256) private epochs;
    mapping(address=>uint256) public unlockAt;
    mapping(address=>uint256) public sessionEpochOf;
    function sessionOf(address a,bytes32) external view returns (Types.Session memory) { return sessions[a]; }
    function statusOf(address a,bytes32) external view returns (Types.Status) { return sessions[a].status; }
    function openDelegation(bytes32,bytes32[] calldata,bytes32[] calldata,address,address,uint256) external payable {
        Types.Session storage s = sessions[msg.sender]; require(s.status == Types.Status.None,"occupied");
        s.status=Types.Status.Active; s.epoch=++epochs[msg.sender]; s.baseBlock=uint64(block.number);
        s.expiresAt=uint64(block.timestamp+1 days); s.maxDiffsPerCommit=64;
        IDelegatableApp(msg.sender).onDelegationChanged(0,true);
    }
    function publish(address a) external { sessions[a].batchIndex++; }
    function closeDelegation(bytes32) external { _close(msg.sender); }
    function _close(address a) private { require(sessions[a].status==Types.Status.Active); sessions[a].status=Types.Status.Exiting; unlockAt[a]=block.timestamp+3600; }
    function forceClose(address a,bytes32) external { require(block.timestamp>=sessions[a].expiresAt); _close(a); }
    function releaseStake(address a,bytes32) external {
        require(sessions[a].status==Types.Status.Exiting && block.timestamp>=unlockAt[a],"challenge window");
        delete sessions[a]; IDelegatableApp(a).onDelegationChanged(0,false);
    }
    function challenge(address a) external { sessions[a].status=Types.Status.Challenged; }
}

contract IndependentTest is Test {
    ArcadeFamily family; IndependentLobby lobby; PublishedRatings ratings; IndependentHubFixture hub;
    IndependentArena[3] arenas;
    uint256 constant A=101; uint256 constant B=102; uint256 constant C=103; uint256 constant D=104;
    uint256 constant BRIDGE=0xB71D6E;
    function setUp() public {
        vm.chainId(10143); vm.warp(10000); vm.roll(100);
        family=new ArcadeFamily(); hub=new IndependentHubFixture();
        lobby=new IndependentLobby(family,IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE));
        ratings=new PublishedRatings(address(lobby),address(this),block.timestamp);
        ratings.sealMigration(keccak256("empty test migration")); lobby.bindRatings(ratings);
        for(uint256 i;i<3;i++) { arenas[i]=new IndependentArena(IInterludeHub(address(hub)),address(lobby),vm.addr(BRIDGE)); lobby.addArena(arenas[i]); }
        lobby.seal(); for(uint256 i=101;i<112;i++) _register(i);
    }
    function _sig(uint256 key,bytes32 h) private view returns(bytes memory) {
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(key,h); return abi.encodePacked(r,s,v);
    }
    function _register(uint256 key) private {
        ArcadeFamily.Grant memory g=ArcadeFamily.Grant(vm.addr(key),vm.addr(key+1000),uint64(block.timestamp),uint64(block.timestamp+7200),family.revisions(vm.addr(key)));
        family.register(g,_sig(key,family.grantDigest(g)));
    }
    function _call(uint256 key,bytes memory data) private returns(bytes memory) {
        return this.callAs(key,data);
    }
    function callAs(uint256 key,bytes memory data) external returns(bytes memory) {
        bytes32 g=family.grantDigest(family.grantOf(vm.addr(key))); uint256 n=lobby.commandNonces(g); uint64 d=uint64(block.timestamp+30);
        return lobby.relay(vm.addr(key),data,n,d,_sig(key+1000,lobby.commandDigest(g,data,n,d)));
    }
    function _room(uint256 a,uint256 b,uint8 mode) private returns(uint256 r,uint256 id) {
        r=abi.decode(_call(a,abi.encodeCall(lobby.createRoom,(mode))),(uint256));
        _call(b,abi.encodeCall(lobby.joinRoom,(r))); id=lobby.propose(r);
        _call(a,abi.encodeCall(lobby.acceptProposal,(id))); _call(b,abi.encodeCall(lobby.acceptProposal,(id)));
    }
    function _open(uint256 id) private returns(IndependentArena arena) {
        arena=IndependentArena(lobby.assignNext()); vm.roll(block.number+1); lobby.openArena(id);
    }
    function _engine(IndependentArena a,uint256 ownerKey,bytes memory data) private {
        this.engineAs(a,ownerKey,data); vm.chainId(10143);
    }
    function engineAs(IndependentArena a,uint256 ownerKey,bytes memory data) external {
        vm.chainId(4242);
        Types.SessionGrant memory g=Types.SessionGrant(vm.addr(ownerKey+1000),vm.addr(ownerKey+1000),uint64(block.timestamp+3600),0,false,new bytes4[](1));
        g.selectors[0]=bytes4(data);
        bytes memory signature=_sig(ownerKey+1000,a.sessionDigest(g));
        vm.prank(vm.addr(ownerKey+1000)); a.withSession(g,signature,data);
        vm.chainId(10143);
    }
    function _finish(IndependentArena a,uint256 id,uint256 loser) private {
        _engine(a,loser,abi.encodeCall(a.concede,(id))); hub.publish(address(a)); lobby.capture(id);
    }
    function testCancelCapacityWaitDoesNotCancelDelegatedGame() public {
        (uint256 r,uint256 id)=_room(A,B,0);
        vm.expectRevert("admission participant");_call(C,abi.encodeCall(lobby.cancelAdmission,(id)));
        lobby.assignNext();
        _call(A,abi.encodeCall(lobby.cancelAdmission,(id)));
        assertEq(lobby.occupancy(vm.addr(A)),0);
        assertEq(lobby.activeMatchOf(vm.addr(B)),0);
        assertEq(lobby.room(r).members.length,1);
        vm.expectRevert("stale assignment");lobby.openArena(id);
        _call(B,abi.encodeCall(lobby.leaveRoom,()));
        (,uint256 next)=_room(A,B,1);_open(next);
        vm.expectRevert("session opened");_call(A,abi.encodeCall(lobby.cancelAdmission,(next)));
        assertEq(lobby.activeMatchOf(vm.addr(A)),next);
    }
    function testIndependentPublicationAndThirdMatchDuringChallenge() public {
        (,uint256 x)=_room(A,B,0); IndependentArena first=_open(x);
        (,uint256 y)=_room(C,D,1); IndependentArena second=_open(y);
        _finish(first,x,A); lobby.closeArena(x);
        assertEq(uint256(hub.statusOf(address(first),0)),uint256(Types.Status.Exiting));
        _engine(second,C,abi.encodeCall(second.input,(y,int8(1),1,block.number+100)));
        assertEq(second.activeCount(),1);
        _call(A,abi.encodeCall(lobby.leaveRoom,())); _call(B,abi.encodeCall(lobby.leaveRoom,()));
        (,uint256 z)=_room(A,B,0); IndependentArena third=_open(z);
        assertEq(address(third),address(arenas[2])); assertEq(third.activeCount(),1);
        assertEq(lobby.activeMatchOf(vm.addr(A)),z); assertEq(lobby.activeMatchOf(vm.addr(C)),y);
        assertEq(family.grantOf(vm.addr(A)).key,vm.addr(A+1000));
    }
    function testTwoAgreementsAndSingleParticipationAcrossModes() public {
        uint256 r=abi.decode(_call(A,abi.encodeCall(lobby.createRoom,(uint8(0)))),(uint256));
        _call(B,abi.encodeCall(lobby.joinRoom,(r))); uint256 id=lobby.propose(r);
        _call(A,abi.encodeCall(lobby.acceptProposal,(id))); assertEq(lobby.assignNext(),address(0));
        vm.expectRevert("participation exists"); _call(A,abi.encodeCall(lobby.queue,(uint8(1))));
        _call(B,abi.encodeCall(lobby.acceptProposal,(id))); _call(B,abi.encodeCall(lobby.acceptProposal,(id)));
        assertEq(address(_open(id)),address(arenas[0]));
        vm.expectRevert("concede active match first"); _call(A,abi.encodeCall(lobby.leaveRoom,()));
    }
    function testEightMembersTimeoutAndHostTransfer() public {
        uint256 r=abi.decode(_call(A,abi.encodeCall(lobby.createRoom,(uint8(0)))),(uint256));
        for(uint256 i=102;i<109;i++) { vm.warp(block.timestamp+1); _call(i,abi.encodeCall(lobby.joinRoom,(r))); }
        vm.expectRevert("room full"); _call(109,abi.encodeCall(lobby.joinRoom,(r)));
        uint256 id=lobby.propose(r); _call(A,abi.encodeCall(lobby.acceptProposal,(id)));
        vm.warp(block.timestamp+21); lobby.expireProposal(id);
        L.Room memory v=lobby.room(r); assertTrue(v.members[1].away);
        _call(B,abi.encodeCall(lobby.rejoinQueue,(r))); _call(A,abi.encodeCall(lobby.leaveRoom,()));
        assertEq(lobby.room(r).host,vm.addr(B));
    }
    function testSessionScopeNonceAndRevocation() public {
        bytes memory data=abi.encodeCall(lobby.queue,(uint8(0)));
        bytes32 hash=family.grantDigest(family.grantOf(vm.addr(A))); uint64 deadline=uint64(block.timestamp+30);
        bytes memory signed=_sig(A+1000,lobby.commandDigest(hash,data,0,deadline));
        lobby.relay(vm.addr(A),data,0,deadline,signed);
        vm.expectRevert("command nonce"); lobby.relay(vm.addr(A),data,0,deadline,signed);
        vm.expectRevert("arcade scope"); _call(B,abi.encodeCall(lobby.seal,()));
        bytes32 action=keccak256(abi.encode(family.revoke.selector,family.revisions(vm.addr(A))));
        family.revoke(vm.addr(A),0,deadline,_sig(A,family.writeDigest(vm.addr(A),action,0,deadline)));
        vm.expectRevert("arcade session expired or revoked"); _call(A,abi.encodeCall(lobby.cancelQueue,()));
        vm.warp(block.timestamp+31); lobby.matchmake(0,32); assertEq(lobby.occupancy(vm.addr(A)),0);
    }
    function testActiveRevocationSeparateFromFutureAdmission() public {
        (,uint256 id)=_room(A,B,0); IndependentArena arena=_open(id);
        uint64 deadline=uint64(block.timestamp+30);
        bytes32 action=keccak256(abi.encode(family.revoke.selector,family.revisions(vm.addr(A))));
        family.revoke(vm.addr(A),0,deadline,_sig(A,family.writeDigest(vm.addr(A),action,0,deadline)));
        _engine(arena,A,abi.encodeCall(arena.input,(id,int8(1),1,block.number+100)));
        bytes memory signature=_sig(A,arena.revocationDigest(vm.addr(A),deadline));
        vm.chainId(4242); arena.revokeActive(vm.addr(A),deadline,signature); vm.chainId(10143);
        vm.expectRevert("active authorization revoked"); _engine(arena,A,abi.encodeCall(arena.input,(id,int8(0),2,block.number+100)));
    }
    function testEngineAndCommandIsolation() public {
        (,uint256 x)=_room(A,B,0); IndependentArena first=_open(x);
        (,uint256 y)=_room(C,D,0); IndependentArena second=_open(y);
        vm.expectRevert("engine only"); first.input(x,1,1,block.number+100);
        vm.expectRevert("unbound arcade key"); _engine(second,A,abi.encodeCall(second.input,(y,int8(1),1,block.number+100)));
        vm.expectRevert(AutonomousGameBase.InvalidMatch.selector); _engine(first,A,abi.encodeCall(first.input,(y,int8(1),1,block.number+100)));
        vm.expectRevert(IndependentArena.InvalidLifecycle.selector); vm.prank(address(lobby)); first.closeEngine();
    }
    function testRootCanRenewActiveControlWithoutReplayingAnOldRevocation() public {
        (,uint256 id)=_room(A,B,0); IndependentArena arena=_open(id);
        uint64 deadline=uint64(block.timestamp+60);
        bytes memory revokeSignature=_sig(A,arena.revocationDigest(vm.addr(A),deadline));
        vm.chainId(4242); arena.revokeActive(vm.addr(A),deadline,revokeSignature);
        ArenaAuthorizations.Renewal memory renewal=ArenaAuthorizations.Renewal(vm.addr(A),vm.addr(A+1000),1,id,1,uint64(block.timestamp+7200),deadline);
        bytes memory signature=_sig(A,arena.renewalDigest(renewal));
        arena.renewActive(renewal,signature);
        vm.expectRevert("owner revocation"); arena.revokeActive(vm.addr(A),deadline,revokeSignature);
        vm.expectRevert("authorization revision"); arena.renewActive(renewal,signature);
        vm.chainId(10143); _engine(arena,A,abi.encodeCall(arena.input,(id,int8(1),1,block.number+100)));
        assertEq(arena.authorizationRevision(vm.addr(A)),2);
    }
    function testFinalityBeforeReuseAndNoDoubleRating() public {
        _call(A,abi.encodeCall(lobby.queue,(uint8(0)))); _call(B,abi.encodeCall(lobby.queue,(uint8(0))));
        uint256 room=lobby.matchmake(0,32); uint256 id=lobby.room(room).proposal;
        _call(A,abi.encodeCall(lobby.acceptProposal,(id))); _call(B,abi.encodeCall(lobby.acceptProposal,(id)));
        IndependentArena a=_open(id); _finish(a,id,A); lobby.capture(id);
        assertEq(ratings.ratingOf(vm.addr(A),0).elo,968); assertEq(ratings.ratingOf(vm.addr(B),0).elo,1032);
        assertEq(ratings.count(),1); assertFalse(ratings.entry(id).finality);
        lobby.closeArena(id); vm.expectRevert("challenge window"); hub.releaseStake(address(a),0);
        vm.warp(block.timestamp+3600); hub.releaseStake(address(a),0); lobby.capture(id);
        assertTrue(ratings.entry(id).finality); assertEq(ratings.ratingOf(vm.addr(B),0).played,1);
        _call(A,abi.encodeCall(lobby.leaveRoom,())); _call(B,abi.encodeCall(lobby.leaveRoom,()));
        (,uint256 next)=_room(A,B,0); assertEq(address(_open(next)),address(a)); assertEq(a.boundMatch().epoch,2);
        vm.expectRevert(AutonomousGameBase.InvalidMatch.selector); _engine(a,A,abi.encodeCall(a.input,(id,int8(0),1,block.number+100)));
    }
    function testExpiredUnopenedAdmissionDoesNotTrapRoom() public {
        (,uint256 id)=_room(A,B,0); lobby.assignNext(); vm.warp(block.timestamp+201); lobby.cancelUnopened(id);
        assertEq(lobby.activeMatchOf(vm.addr(A)),0); _call(A,abi.encodeCall(lobby.leaveRoom,()));
        assertEq(lobby.occupancy(vm.addr(A)),0);
    }
    function testCrossedInvitationsProduceOneInvitationAndOneProposal() public {
        uint256 first=abi.decode(_call(A,abi.encodeCall(lobby.inviteSomeone,(vm.addr(B),uint8(1)))),(uint256));
        uint256 crossed=abi.decode(_call(B,abi.encodeCall(lobby.inviteSomeone,(vm.addr(A),uint8(1)))),(uint256));
        assertEq(first,crossed);
        uint256 room=lobby.occupancy(vm.addr(A)); assertEq(room,lobby.occupancy(vm.addr(B)));
        uint256 id=lobby.room(room).proposal; assertEq(lobby.proposal(id).status,2);
        assertEq(lobby.activeMatchOf(vm.addr(A)),id); assertEq(lobby.activeMatchOf(vm.addr(B)),id);
        (uint256[] memory inbox,uint256 total)=lobby.invitationPage(vm.addr(B),false,0,10);
        assertEq(total,1); assertEq(inbox[0],first);
        _open(id);
    }
    function testRematchKeepsOpponentAndRulesWithoutLeavingRoom() public {
        _call(A,abi.encodeCall(lobby.queue,(uint8(1)))); _call(B,abi.encodeCall(lobby.queue,(uint8(1))));
        uint256 room=lobby.matchmake(1,32); uint256 first=lobby.room(room).proposal;
        _call(A,abi.encodeCall(lobby.acceptProposal,(first))); _call(B,abi.encodeCall(lobby.acceptProposal,(first)));
        IndependentArena arena=_open(first); _finish(arena,first,A);
        uint256 id=abi.decode(_call(A,abi.encodeCall(lobby.rematch,(first))),(uint256));
        uint256 same=abi.decode(_call(B,abi.encodeCall(lobby.rematch,(first))),(uint256));
        assertEq(id,same); assertTrue(lobby.room(room).ranked); assertEq(lobby.room(room).mode,1);
        assertEq(lobby.proposal(id).status,2); assertEq(lobby.proposal(id).a,vm.addr(B)); assertEq(lobby.proposal(id).b,vm.addr(A));
        assertEq(lobby.occupancy(vm.addr(A)),room); assertEq(address(_open(id)),address(arenas[1]));
    }
    function testInviteAcceptLeavesIdleQueueAndBindsBothConsents() public {
        _call(B,abi.encodeCall(lobby.queue,(uint8(0))));
        uint256 id=abi.decode(_call(A,abi.encodeCall(lobby.inviteSomeone,(vm.addr(B),uint8(1)))),(uint256));
        _call(B,abi.encodeCall(lobby.answerInvitation,(id,true)));
        uint256 room=lobby.occupancy(vm.addr(B)); assertEq(lobby.room(room).mode,1);
        assertEq(lobby.proposal(lobby.room(room).proposal).accepted,3);
    }
    function testRevokedInviteConsentCannotCreateMatchWithANewKey() public {
        uint256 id=abi.decode(_call(A,abi.encodeCall(lobby.inviteSomeone,(vm.addr(B),uint8(1)))),(uint256));
        uint64 deadline=uint64(block.timestamp+30);
        bytes32 action=keccak256(abi.encode(family.revoke.selector,family.revisions(vm.addr(A))));
        family.revoke(vm.addr(A),0,deadline,_sig(A,family.writeDigest(vm.addr(A),action,0,deadline))); _register(A);
        _call(B,abi.encodeCall(lobby.answerInvitation,(id,true)));
        uint256 proposal=lobby.room(lobby.occupancy(vm.addr(B))).proposal;
        assertEq(lobby.proposal(proposal).accepted,2); assertEq(lobby.assignNext(),address(0));
        _call(A,abi.encodeCall(lobby.acceptProposal,(proposal))); _open(proposal);
    }
    function testExpiredArenaRecoveryCancelsOnlyItsOwnMatch() public {
        (,uint256 x)=_room(A,B,0); IndependentArena a=_open(x);
        vm.warp(block.timestamp+7201); _register(C); _register(D);
        (,uint256 y)=_room(C,D,0); IndependentArena b=_open(y);
        vm.expectRevert("not expired"); lobby.recoverExpired(x);
        vm.warp(96400); lobby.recoverExpired(x); vm.warp(block.timestamp+3600); hub.releaseStake(address(a),0);
        lobby.capture(x); assertEq(ratings.entry(x).latest.status,4); assertEq(ratings.ratingOf(vm.addr(A),0).played,0);
        assertEq(lobby.activeMatchOf(vm.addr(C)),y); assertEq(b.activeCount(),1);
    }
    function testChaosAttestationBoundAndImmutable() public {
        (,uint256 id)=_room(A,B,1); IndependentArena arena=_open(id);
        vm.chainId(4242); vm.roll(block.number+3000); arena.tick(id); vm.chainId(10143);
        (,,,,,,,,,,,,PhysicsV2.State memory s)=arena.getSnapshot(id);
        assertTrue(s.awaitingServe);
        ArenaPressure.Attestation memory p=ArenaPressure.Attestation(1,id,s.scoreA+s.scoreB,s.resumeAt,2000000000000000,0,100,keccak256("cutoff"),uint64(block.timestamp+30));
        bytes memory signature=_sig(BRIDGE,arena.pressureDigest(p));
        vm.chainId(4242); arena.submitPressure(p,signature);
        p.paidB=1; signature=_sig(BRIDGE,arena.pressureDigest(p));
        vm.expectRevert("checkpoint immutable"); arena.submitPressure(p,signature);
        p.epoch=2; signature=_sig(BRIDGE,arena.pressureDigest(p));
        vm.expectRevert("pressure epoch"); arena.submitPressure(p,signature);
        vm.chainId(10143);
    }
    function testDeployableContractSize() public view {
        assertLe(address(arenas[0]).code.length,24576); assertLe(address(lobby).code.length,24576);
    }
    function testPayoutBeforeChallengeEndsAndAfterArenaReuse() public {
        IndependentSettlement adapter=new IndependentSettlement(lobby); RoomsVault vault=new RoomsVault(address(this));
        MarketV4 market=new MarketV4(address(this),payable(address(this)),adapter,new LMSRV2(),vault);
        vault.registerModule(address(market)); vault.seal(); vm.deal(address(this),1 ether);
        (,uint256 id)=_room(A,B,1); IndependentArena arena=_open(id);
        vm.chainId(4242); vm.roll(block.number+3000); arena.tick(id); vm.chainId(10143);
        hub.publish(address(arena)); adapter.openRound(id); market.open{value:0.01 ether}(id,0.01 ether);
        (bool allowed,uint256 version)=adapter.bettingWindow(id,0); assertTrue(allowed);
        for(uint256 key=777;key<=778;key++) {
            vault.depositFor{value:0.01 ether}(vm.addr(key));
            MarketV4.Bet memory bet=MarketV4.Bet(vm.addr(key),id,1,0.001 ether,0.002 ether,version,0,uint64(block.timestamp+60));
            bytes32 domain=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PONG Market"),keccak256("1"),uint256(10143),address(market)));
            market.buy(bet,_sig(key,keccak256(abi.encodePacked("\x19\x01",domain,keccak256(abi.encode(market.BET_TYPEHASH(),bet))))));
        }
        _finish(arena,id,A); assertFalse(ratings.entry(id).finality);
        uint256 before=vm.addr(777).balance; market.claim(id,vm.addr(777)); assertEq(vm.addr(777).balance-before,0.001 ether);
        lobby.closeArena(id); vm.warp(block.timestamp+3600); hub.releaseStake(address(arena),0); lobby.capture(id);
        _call(A,abi.encodeCall(lobby.leaveRoom,())); _call(B,abi.encodeCall(lobby.leaveRoom,()));
        (,uint256 next)=_room(A,B,0); assertEq(address(_open(next)),address(arena));
        before=vm.addr(778).balance; market.claim(id,vm.addr(778)); assertEq(vm.addr(778).balance-before,0.001 ether);
        (, , address winner,uint8 status)=adapter.result(id); assertEq(winner,vm.addr(B)); assertEq(status,3);
        vm.expectRevert("claim"); market.claim(id,vm.addr(778));
        (allowed,)=adapter.bettingWindow(id,0); assertFalse(allowed);
    }
}

contract PublishedRatingsTest is Test {
    PublishedRatings ledger;
    address constant A=address(0xAA); address constant B=address(0xBB); address constant C=address(0xCC);
    function setUp() public { vm.chainId(10143); vm.warp(10000); ledger=new PublishedRatings(address(this),address(this),10000); ledger.sealMigration(keccak256("empty")); }
    function result(uint256 id,address a,address b,address winner) private pure returns(T.Result memory) {
        return T.Result(address(uint160(1000+id)),1,id,a,b,winner,0,true,3,7,2,keccak256(abi.encode(id,winner)));
    }
    function testCorrectionReplaysDependenciesAndPreservesPaymentDecision() public {
        T.Result memory r1=result(1,A,B,A); T.Result memory r2=result(2,B,C,B);
        ledger.publish(r1,false); ledger.publish(r2,false); uint32 before=ledger.ratingOf(C,0).elo;
        r1.winner=B; r1.hash=keccak256("corrected"); ledger.reconcile(r1,true);
        assertEq(ledger.entry(1).first.winner,A); assertEq(ledger.ratingOf(C,0).elo,before);
        ledger.rebuild(1); assertGt(ledger.buildGeneration(),0); assertEq(ledger.ratingOf(C,0).elo,before);
        ledger.rebuild(1); assertEq(ledger.buildGeneration(),0); assertNotEq(ledger.ratingOf(C,0).elo,before);
        assertEq(ledger.ratingOf(A,0).elo,968); assertEq(ledger.ratingOf(B,0).played,2);
        assertEq(ledger.entry(1).first.winner,A); assertEq(ledger.entry(1).latest.winner,B);
        vm.expectRevert("final result immutable"); ledger.reconcile(result(1,A,B,A),true);
    }
    function testSecondCorrectionDuringRebuildAndConcurrentPublication() public {
        T.Result memory r=result(1,A,B,A); ledger.publish(r,false); ledger.publish(result(2,B,C,B),false);
        r.winner=B; r.hash=keccak256("first correction"); ledger.reconcile(r,false); ledger.rebuild(1);
        r.status=4; r.winner=address(0); r.hash=keccak256("cancel"); ledger.reconcile(r,true);
        ledger.publish(result(3,C,A,C),false); ledger.rebuild(32);
        assertEq(ledger.ratingOf(A,0).played,1); assertEq(ledger.ratingOf(B,0).played,1); assertEq(ledger.ratingOf(C,0).played,2);
    }
    function testFriendlyCanceledAndSeparateModes() public {
        T.Result memory r=result(1,A,B,A); r.ranked=false; ledger.publish(r,false);
        r=result(2,A,B,A); r.mode=1; ledger.publish(r,false);
        r=result(3,A,B,address(0)); r.status=4; ledger.publish(r,true);
        assertEq(ledger.ratingOf(A,0).elo,1000); assertEq(ledger.ratingOf(A,1).elo,1032);
        (address[] memory page,uint256 total)=ledger.playerPage(1,0,1); assertEq(total,2); assertEq(page[0],A);
    }
    function testRepeatedOpponentReductionAndUniqueResult() public {
        ledger.publish(result(1,A,B,A),false); ledger.publish(result(2,A,B,A),false);
        (uint32 beforeA,,uint32 afterA,)=ledger.ratingChange(2); assertLt(afterA-beforeA,32);
        vm.expectRevert("result identity"); ledger.publish(result(2,A,B,A),false);
    }
    function testMigrationPreservesSameDayRepeatPenaltyThroughCorrection() public {
        ledger = new PublishedRatings(address(this),address(this),10000);
        bytes32[] memory pairs = new bytes32[](1); uint8[] memory counts = new uint8[](1);
        pairs[0] = keccak256(abi.encode(A,B,uint256(block.timestamp)/1 days,uint8(0))); counts[0] = 3;
        ledger.seedPairCounts(pairs,counts); ledger.sealMigration(keccak256("verified source"));
        T.Result memory r = result(1,A,B,A); ledger.publish(r,false);
        assertEq(ledger.ratingOf(A,0).elo,1008);
        r.winner=B; r.hash=keccak256("corrected imported pair"); ledger.reconcile(r,true); ledger.rebuild(1);
        assertEq(ledger.ratingOf(A,0).elo,992); assertEq(ledger.ratingOf(B,0).elo,1008);
        vm.expectRevert("migration only"); ledger.seedPairCounts(pairs,counts);
    }
}
