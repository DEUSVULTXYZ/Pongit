// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {IndependentHubFixture} from "./Independent.t.sol";
import {ReusableEventsArena} from "../src/independent/ReusableEventsArena.sol";
import {ReusableEventsLobby} from "../src/independent/ReusableEventsLobby.sol";
import {IndependentArena} from "../src/independent/IndependentArena.sol";
import {ReusableAdmission as Admission} from "../src/independent/ReusableAdmission.sol";
import {ReusableGame as Game} from "../src/independent/ReusableGame.sol";
import {IndependentTypes as T} from "../src/independent/IndependentTypes.sol";
import {ArcadeFamily} from "../src/independent/ArcadeFamily.sol";
import {PublishedRatings} from "../src/independent/PublishedRatings.sol";
import {PublishedResultVerifier,IReusableAdmissionAuthority} from "../src/independent/PublishedResultVerifier.sol";
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

contract ReusableEventsLobbyTest is Test {
    IndependentHubFixture hub;ArcadeFamily family;ReusableEventsLobby lobby;PublishedRatings ratings;
    PublishedResultVerifier verifier;ReusableEventsArena arena;uint256 constant BRIDGE=812;
    function setUp() public virtual {
        vm.chainId(10143);vm.warp(1_800_000_000);vm.roll(100);vm.setBlockhash(99,keccak256("known Monad block"));
        hub=new IndependentHubFixture();family=new ArcadeFamily();lobby=new ReusableEventsLobby(family,IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE),vm.addr(813));
        verifier=new PublishedResultVerifier(IReusableAdmissionAuthority(address(lobby)),IInterludeHub(address(hub)));lobby.bindVerifier(verifier);
        ratings=new PublishedRatings(address(lobby),address(this),vm.getBlockTimestamp());ratings.sealMigration(keccak256("empty fixture"));lobby.bindRatings(ratings);
        ChaosEffects effects=new ChaosEffects();ChaosDynamics dynamics=new ChaosDynamics(effects,new ChaosModifiers());
        ChaosPhysics physics=new ChaosPhysics(effects,new ChaosRally(),dynamics,new ChaosContacts(dynamics));
        ChaosEngine kernel=new ChaosEngine(new ChaosCodec(),physics,new DrandEvmnet(),new ChaosDrawRules());
        for(uint256 i;i<3;i++){
            ReusableEventsArena next=new ReusableEventsArena(IInterludeHub(address(hub)),address(lobby),vm.addr(BRIDGE),vm.addr(813),kernel,verifier);
            lobby.addArena(IndependentArena(address(next)));if(i==0)arena=next;
        }
        lobby.seal();lobby.openReusableArena(address(arena));register(101);register(102);register(103);register(104);
        assertLe(address(lobby).code.length,32768,"reviewed Monad authority runtime budget");
    }
    function sig(uint256 key,bytes32 h) internal pure returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(key,h);return abi.encodePacked(r,s,v);}
    function register(uint256 key) internal {
        ArcadeFamily.Grant memory g=ArcadeFamily.Grant(vm.addr(key),vm.addr(key+1000),uint64(vm.getBlockTimestamp()),uint64(vm.getBlockTimestamp()+7200),0);
        family.register(g,sig(key,family.grantDigest(g)));
    }
    function command(uint256 key,bytes memory data) internal returns(bytes memory){
        bytes32 grant=family.grantDigest(family.grantOf(vm.addr(key)));uint256 nonce=lobby.commandNonces(grant);uint64 deadline=uint64(vm.getBlockTimestamp()+30);
        return lobby.relay(vm.addr(key),data,nonce,deadline,sig(key+1000,lobby.commandDigest(grant,data,nonce,deadline)));
    }
    function executeCommand(uint256 key,bytes calldata data) external returns(bytes memory){return command(key,data);}
    function propose(uint256 room_) internal returns(uint256 id){
        id=lobby.propose(room_);command(101,abi.encodeCall(lobby.acceptProposal,(id)));command(102,abi.encodeCall(lobby.acceptProposal,(id)));
    }
    function roomAndProposal(uint8 mode) internal returns(uint256 room_,uint256 id){
        room_=abi.decode(command(101,abi.encodeCall(lobby.createRoom,(mode))),(uint256));command(102,abi.encodeCall(lobby.joinRoom,(room_)));id=propose(room_);
    }
    function play(uint256 id) internal returns(Game.Result memory result){
        (Admission.Ticket memory t,T.Binding memory b)=lobby.ticketOf(id);vm.chainId(4242);arena.admit(t,b,sig(BRIDGE,Admission.digest(t)));
        vm.prank(b.keyA);arena.confirmReady(t.epoch,id);vm.prank(b.keyB);arena.confirmReady(t.epoch,id);arena.start(t.epoch,id);vm.warp(vm.getBlockTimestamp()+3);vm.roll(vm.getBlockNumber()+300);arena.start(t.epoch,id);
        vm.prank(b.keyB);arena.concede(t.epoch,id);result=arena.publishedResult();vm.chainId(10143);
    }
    function firstProof() internal pure returns(bytes32[16] memory proof){for(uint256 i=1;i<16;i++)proof[i]=keccak256(abi.encode(proof[i-1],proof[i-1]));}
    function testTwoGamesOneDelegationWithAuthoritativeTicketsAndPublishedRelease() public {
        (uint256 room_,uint256 id)=roomAndProposal(1);assertEq(lobby.assignNext(),address(arena));
        (Admission.Ticket memory ticket,T.Binding memory b)=lobby.ticketOf(id);assertEq(ticket.bindingHash,keccak256(abi.encode(b)));assertEq(b.a,vm.addr(101));assertEq(b.b,vm.addr(102));
        assertEq(lobby.issuedTicket(address(arena),1,1),Admission.digest(ticket));assertEq(lobby.reservedMatch(address(arena)),id);
        Game.Result memory result=play(id);vm.expectRevert("result not published");lobby.captureProof(id,result,firstProof());
        hub.publish(address(arena));lobby.captureProof(id,result,firstProof());lobby.captureProof(id,result,firstProof());
        assertEq(ratings.count(),1);assertEq(lobby.activeMatchOf(b.a),0);assertEq(lobby.occupancy(b.a),room_);assertEq(lobby.reservedMatch(address(arena)),0);
        assertEq(lobby.bettingCutoff(id),result.finishedAt);assertEq(ratings.ratingOf(b.a,1).played,0,"friendly room");
        uint256 next=propose(room_);assertEq(lobby.assignNext(),address(arena));(ticket,b)=lobby.ticketOf(next);assertEq(ticket.epoch,1);assertEq(ticket.sequence,2);
        assertEq(uint256(hub.statusOf(address(arena),0)),uint256(Types.Status.Active));
        vm.expectRevert("issued ticket requires published result or epoch recovery");this.executeCommand(101,abi.encodeCall(lobby.cancelAdmission,(next)));
    }
    function testFalseBridgeTicketCannotSettleDespitePublishedPhysicsResult() public {
        (,uint256 id)=roomAndProposal(0);lobby.assignNext();(Admission.Ticket memory t,T.Binding memory b)=lobby.ticketOf(id);
        // Same owners, different control keys: bridge-only consent is not an
        // authoritative family grant and cannot be laundered through publication.
        b.keyA=vm.addr(5001);b.keyB=vm.addr(5002);t.bindingHash=keccak256(abi.encode(b));
        vm.chainId(4242);arena.admit(t,b,sig(BRIDGE,Admission.digest(t)));
        vm.prank(b.keyA);arena.confirmReady(1,id);vm.prank(b.keyB);arena.confirmReady(1,id);arena.start(1,id);vm.warp(vm.getBlockTimestamp()+3);vm.roll(vm.getBlockNumber()+300);arena.start(1,id);
        vm.prank(b.keyB);arena.concede(1,id);Game.Result memory r=arena.publishedResult();vm.chainId(10143);hub.publish(address(arena));
        vm.expectRevert("result proof");lobby.captureProof(id,r,firstProof());assertEq(ratings.count(),0);assertEq(lobby.reservedMatch(address(arena)),id);
    }
    function testAmbiguousExpiredTicketKeepsLockUntilActualEpochRelease() public {
        (,uint256 id)=roomAndProposal(0);lobby.assignNext();vm.warp(vm.getBlockTimestamp()+240);
        vm.expectRevert("issued ticket requires published result or epoch recovery");lobby.cancelUnopened(id);
        vm.expectRevert("released arena");lobby.recoverReleased(address(arena));assertEq(lobby.reservedMatch(address(arena)),id);
        lobby.closeReusableArena(address(arena));vm.warp(vm.getBlockTimestamp()+3600);hub.releaseStake(address(arena),0);lobby.recoverReleased(address(arena));
        assertEq(lobby.reservedMatch(address(arena)),0);assertEq(lobby.activeMatchOf(vm.addr(101)),0);
        verifier.sealReleased(address(arena));lobby.openReusableArena(address(arena));(uint256 epoch,,)=arena.resultCommitment();assertEq(epoch,2);
    }
    function testNoVisitorClosesHealthySessionAndNoUnverifiedCaptureShortcut() public {
        vm.expectRevert("session still admitting");vm.prank(vm.addr(999));lobby.closeReusableArena(address(arena));
        vm.expectRevert("published result proof required");lobby.capture(1);
        vm.expectRevert("use reusable lifecycle and issued ticket");lobby.openArena(1);
    }
}
