// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IndependentHubFixture} from "./Independent.t.sol";
import {ReusableEventsArena} from "../src/independent/ReusableEventsArena.sol";
import {ReusableAdmission as Admission} from "../src/independent/ReusableAdmission.sol";
import {ReusableGame as Game} from "../src/independent/ReusableGame.sol";
import {ReusableArenaStorage as S} from "../src/independent/ReusableArenaStorage.sol";
import {PublishedResultVerifier, IReusableAdmissionAuthority} from "../src/independent/PublishedResultVerifier.sol";
import {PublishedResultTree as Tree} from "../src/agents/competition/PublishedResultTree.sol";
import {IndependentTypes as T} from "../src/independent/IndependentTypes.sol";
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
import {ChaosGameFlow as Flow} from "../src/chaos/ChaosGameFlow.sol";
import {DrandEvmnet} from "../src/chaos/DrandEvmnet.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {RoomsState} from "../src/labs/RoomsState.sol";

/// Authority is deliberately a fixture: these tests do NOT qualify the pending
/// Monad matchmaking/issue implementation or hosted capacity/publication.
contract ReusableEventsArenaTest is Test, IReusableAdmissionAuthority {
    mapping(address=>bool) public registeredArena;
    mapping(address=>mapping(uint256=>mapping(uint256=>bytes32))) public issuedTicket;
    IndependentHubFixture hub;ReusableEventsArena arena;ChaosEngine kernel;PublishedResultVerifier verifier;
    uint256 constant BRIDGE=812;uint256 constant PRESSURE=813;
    function setUp() public {
        vm.chainId(10143);vm.warp(1_800_000_000);vm.roll(100);hub=new IndependentHubFixture();
        ChaosEffects effects=new ChaosEffects();ChaosDynamics dynamics=new ChaosDynamics(effects,new ChaosModifiers());
        ChaosPhysics physics=new ChaosPhysics(effects,new ChaosRally(),dynamics,new ChaosContacts(dynamics));
        kernel=new ChaosEngine(new ChaosCodec(),physics,new DrandEvmnet(),new ChaosDrawRules());
        verifier=new PublishedResultVerifier(IReusableAdmissionAuthority(address(this)),IInterludeHub(address(hub)));
        arena=new ReusableEventsArena(IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE),vm.addr(PRESSURE),kernel,verifier);
        registeredArena[address(arena)]=true;arena.openEngine();vm.chainId(4242);
    }
    function sign(uint256 privateKey,bytes32 hash) internal pure returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(privateKey,hash);return abi.encodePacked(r,s,v);}
    function ticket(uint256 id,uint256 sequence,uint8 mode) internal view returns(Admission.Ticket memory t,T.Binding memory b){
        (uint256 epoch,,)=arena.resultCommitment();
        b=T.Binding(id,99,vm.addr(101),vm.addr(102),vm.addr(1101),vm.addr(1102),uint64(vm.getBlockTimestamp()+7200),uint64(vm.getBlockTimestamp()+7200),mode,true,99,epoch);
        t=Admission.Ticket(address(this),address(arena),epoch,sequence,id,keccak256(abi.encode(b)),uint64(vm.getBlockTimestamp()),uint64(vm.getBlockTimestamp()+90),99,keccak256("source block"),14);
    }
    function admit(uint256 id,uint256 sequence,uint8 mode) internal returns(Admission.Ticket memory t){
        T.Binding memory b;(t,b)=ticket(id,sequence,mode);issuedTicket[address(arena)][t.epoch][sequence]=Admission.digest(t);
        arena.admit(t,b,sign(BRIDGE,Admission.digest(t)));
    }
    function start(uint256 id) internal {
        (uint256 epoch,)=arena.currentMatch();
        vm.prank(vm.addr(1101));arena.confirmReady(epoch,id);vm.prank(vm.addr(1102));arena.confirmReady(epoch,id);
        arena.start(epoch,id);vm.warp(vm.getBlockTimestamp()+3);vm.roll(vm.getBlockNumber()+300);arena.start(epoch,id);
    }
    function firstProof() internal pure returns(bytes32[16] memory proof){for(uint256 i=1;i<16;i++)proof[i]=keccak256(abi.encode(proof[i-1],proof[i-1]));}
    function testLinkedLibrariesFitRuntimeBudget() public {
        assertLe(vm.getDeployedCode("ReusableGame.sol:ReusableGame").length,24576,"ReusableGame runtime");
        assertLe(vm.getDeployedCode("ReusableHumanBinding.sol:ReusableHumanBinding").length,24576,"ReusableHumanBinding runtime");
        assertLe(vm.getDeployedCode("ReusableAuthorizations.sol:ReusableAuthorizations").length,24576,"ReusableAuthorizations runtime");
    }
    function testSequentialClassicChaosKeepsEpochAndRejectsOldCommands() public {
        admit(9001,1,0);start(9001);vm.roll(vm.getBlockNumber()+10);vm.prank(vm.addr(1101));arena.input(1,9001,1,1,vm.getBlockNumber()+10);
        assertEq(arena.getSnapshot(9001).nonceA,1);vm.prank(vm.addr(1102));arena.concede(1,9001);
        assertEq(arena.publishedResult().match_.winner,vm.addr(101));(uint256 epoch,uint32 count,bytes32 root)=arena.resultCommitment();assertEq(epoch,1);assertEq(count,1);
        admit(9002,2,1);start(9002);assertEq(arena.getSnapshot(9002).nonceA,0);
        vm.expectRevert("stale match reference");vm.prank(vm.addr(1101));arena.input(1,9001,1,2,vm.getBlockNumber()+10);
        vm.expectRevert("stale match reference");arena.tick(2,9002);
        vm.expectRevert("stale match reference");arena.getSnapshot(9001);
        vm.roll(vm.getBlockNumber()+10);vm.prank(vm.addr(1101));arena.input(1,9002,-1,1,vm.getBlockNumber()+10);
        vm.prank(vm.addr(1102));arena.concede(1,9002);(epoch,count,)=arena.resultCommitment();assertEq(epoch,1);assertEq(count,2);
        assertEq(uint256(hub.statusOf(address(arena),0)),uint256(Types.Status.Active));assertTrue(root!=0);
        vm.expectRevert(Game.InvalidMatch.selector);arena.tick(1,9002);
        assertLe(address(arena).code.length,24576);emit log_named_uint("reusable runtime bytes",address(arena).code.length);
    }
    function testReadinessAndTrueThreeSecondCountdownAreRequired() public {
        admit(42,1,1);arena.start(1,42);assertEq(arena.launchAt(42),0);
        vm.expectRevert("unbound or expired arcade key");arena.confirmReady(1,42);
        vm.prank(vm.addr(1101));arena.confirmReady(1,42);arena.start(1,42);assertEq(arena.launchAt(42),0);
        vm.prank(vm.addr(1102));arena.confirmReady(1,42);arena.start(1,42);assertEq(arena.launchAt(42),vm.getBlockTimestamp()+3);
        vm.expectRevert("countdown pending");arena.start(1,42);vm.warp(vm.getBlockTimestamp()+3);vm.roll(vm.getBlockNumber()+300);arena.start(1,42);assertEq(arena.getSnapshot(42).phase,2);
    }
    function testBrowserBindingAndPressureViewsRetainOnlyTheCurrentLogicalMatch() public {
        (Admission.Ticket memory t,T.Binding memory b)=ticket(4242,1,1);
        arena.admit(t,b,sign(BRIDGE,Admission.digest(t)));
        assertEq(keccak256(abi.encode(arena.boundMatch())),keccak256(abi.encode(b)));
        start(4242);RoomsState.Header memory h=arena.getSnapshot(4242);
        Flow.LivePressure memory p=Flow.LivePressure(4242,1,h.state.seed,1,0.003 ether,0.001 ether,101,keccak256("paid checkpoint"),uint64(vm.getBlockTimestamp()+20));
        arena.submitLivePressure(p,sign(PRESSURE,arena.pressureDigest(p)));
        (uint256 paidA,uint256 paidB,uint64 source,bytes32 checkpoint)=arena.queuedPressure(4242);
        assertEq(paidA,p.paidA);assertEq(paidB,p.paidB);assertEq(source,p.sourceBlock);assertEq(checkpoint,p.checkpoint);
        vm.prank(vm.addr(1102));arena.concede(1,4242);admit(9009,2,0);
        assertEq(arena.boundMatch().id,9009);assertEq(arena.boundMatch().preparedBlock,99);
        vm.expectRevert("stale match reference");arena.queuedPressure(4242);
        (paidA,paidB,source,checkpoint)=arena.queuedPressure(9009);
        assertEq(paidA,0);assertEq(paidB,0);assertEq(source,0);assertEq(checkpoint,0);
    }
    function testBatchTimestampJumpCannotSkipCountdownTicks() public {
        admit(420,1,0);
        vm.prank(vm.addr(1101));arena.confirmReady(1,420);
        vm.prank(vm.addr(1102));arena.confirmReady(1,420);arena.start(1,420);
        (uint256 deadline,uint256 clock)=arena.launchClock(420);assertEq(deadline-clock,3000);
        uint256 head=vm.getBlockNumber();vm.warp(vm.getBlockTimestamp()+10);
        vm.roll(head+299);vm.expectRevert("countdown pending");arena.start(1,420);
        vm.roll(head+300);arena.start(1,420);assertEq(arena.getSnapshot(420).phase,2);
        assertEq(arena.launchAt(420),vm.getBlockTimestamp()-7);
    }
    function testAbandonedLoadingCommitsCancellationAndSlotCanBeReused() public {
        admit(42,1,0);vm.warp(vm.getBlockTimestamp()+31);arena.cancelUnready(1,42);
        assertEq(arena.publishedResult().match_.status,4);assertEq(arena.publishedResult().match_.winner,address(0));admit(43,2,1);
        assertEq(arena.getSnapshot(43).id,43);
    }
    function testExpiredUnadmittedTicketPublishesCancellationWithoutClosingEpoch() public {
        (Admission.Ticket memory t,T.Binding memory b)=ticket(42,1,1);bytes memory sig=sign(BRIDGE,Admission.digest(t));
        issuedTicket[address(arena)][1][1]=Admission.digest(t);
        vm.expectRevert("admission still valid");arena.cancelAdmission(t,b,sig);
        // Even an expired player key cannot strand a never-started reservation.
        vm.warp(vm.getBlockTimestamp()+7201);
        vm.expectRevert(Admission.InvalidAdmission.selector);arena.admit(t,b,sig);
        arena.cancelAdmission(t,b,sig);Game.Result memory r=arena.publishedResult();
        assertEq(r.match_.status,4);assertEq(r.match_.winner,address(0));assertEq(r.match_.scoreA,0);assertEq(r.match_.scoreB,0);assertEq(r.elapsedUs,0);
        (uint256 epoch,uint32 count,bytes32 root)=arena.resultCommitment();assertEq(epoch,1);assertEq(count,1);
        vm.expectRevert(Admission.InvalidAdmission.selector);arena.cancelAdmission(t,b,sig);
        vm.chainId(10143);hub.publish(address(arena));assertFalse(verifier.verify(t,keccak256(abi.encode(r)),0,firstProof()));
        vm.chainId(4242);admit(43,2,0);assertEq(arena.getSnapshot(43).phase,1);
        assertEq(uint256(hub.statusOf(address(arena),0)),uint256(Types.Status.Active));assertTrue(root!=0);
    }
    function testExpiredTicketCannotCancelAnAdmittedMatchOrAlterItsBinding() public {
        (Admission.Ticket memory t,T.Binding memory b)=ticket(42,1,0);bytes memory sig=sign(BRIDGE,Admission.digest(t));
        arena.admit(t,b,sig);vm.warp(vm.getBlockTimestamp()+91);
        vm.expectRevert("slot busy/full");arena.cancelAdmission(t,b,sig);
        arena.cancelUnready(1,42);
        (t,b)=ticket(43,2,0);sig=sign(BRIDGE,Admission.digest(t));arena.admit(t,b,sig);start(43);
        vm.warp(vm.getBlockTimestamp()+91);vm.expectRevert("slot busy/full");arena.cancelAdmission(t,b,sig);
        assertEq(arena.getSnapshot(43).phase,2);
    }
    function testOldOwnerAuthorizationCannotReviveAfterSlotReuse() public {
        admit(42,1,1);start(42);
        Auth.Renewal memory r=Auth.Renewal(vm.addr(101),vm.addr(5001),1,42,0,uint64(vm.getBlockTimestamp()+7100),uint64(vm.getBlockTimestamp()+100));
        bytes memory oldSignature=sign(101,arena.renewalDigest(r));bytes memory prior=arena.chaosState(42);
        arena.renewActive(r,oldSignature);assertEq(arena.chaosState(42),prior);assertEq(arena.authorizationRevision(vm.addr(101)),1);
        vm.expectRevert("unbound or expired arcade key");vm.prank(vm.addr(1101));arena.input(1,42,1,1,vm.getBlockNumber()+10);
        vm.prank(vm.addr(5001));arena.input(1,42,1,1,vm.getBlockNumber()+10);
        uint64 deadline=uint64(vm.getBlockTimestamp()+90);bytes memory revoke=sign(101,arena.revocationDigest(vm.addr(101),deadline));
        arena.revokeActive(1,42,vm.addr(101),deadline,revoke);vm.expectRevert("unbound or expired arcade key");vm.prank(vm.addr(5001));arena.input(1,42,0,2,vm.getBlockNumber()+10);
        vm.prank(vm.addr(1102));arena.concede(1,42);admit(43,2,1);start(43);
        vm.expectRevert("stale match reference");arena.renewActive(r,oldSignature);
        vm.expectRevert("stale match reference");arena.revokeActive(1,42,vm.addr(101),deadline,revoke);
        vm.prank(vm.addr(1101));arena.input(1,43,1,1,vm.getBlockNumber()+10);
    }
    function testLogicalRandomnessPressureAndEventsNeverUsePhysicalSlot() public {
        admit(987,1,1);start(987);vm.roll(vm.getBlockNumber()+10);vm.recordLogs();arena.tick(1,987);
        Vm.Log[] memory logs=vm.getRecordedLogs();bytes32 requested=keccak256("EventRequested(uint256,uint256)");bool saw;
        for(uint256 i;i<logs.length;i++)if(logs[i].topics[0]==requested){assertEq(uint256(logs[i].topics[1]),987);saw=true;}assertTrue(saw);
        (RoomsState.Header memory h,,uint256 q,)=abi.decode(arena.chaosState(987),(RoomsState.Header,uint256[8],uint256,uint256));
        bytes memory proof=new bytes(64);uint256 draw=1|(uint256(8000)<<48);
        // Mock only the cryptographic proof in this identity test. Real drand
        // verification and hosted publication remain separate mandatory gates.
        vm.mockCall(address(kernel),abi.encodeCall(kernel.prove,(address(arena),987,q,proof)),abi.encode(draw,bytes32(uint256(123))));
        arena.submitRandomness(1,987,q,proof);
        (,,,uint256 stored)=abi.decode(arena.chaosState(987),(RoomsState.Header,uint256[8],uint256,uint256));assertEq(stored,draw);
        Flow.LivePressure memory p=Flow.LivePressure(987,1,h.state.seed,1,0.01 ether,0,101,keccak256("checkpoint"),uint64(vm.getBlockTimestamp()+20));
        arena.submitLivePressure(p,sign(PRESSURE,arena.pressureDigest(p)));p.matchId=1;
        bytes memory wrongSignature=sign(PRESSURE,arena.pressureDigest(p));
        vm.expectRevert("stale match reference");arena.submitLivePressure(p,wrongSignature);
        vm.prank(vm.addr(1102));arena.concede(1,987);admit(988,2,1);start(988);
        vm.expectRevert("stale match reference");arena.submitRandomness(1,987,q,proof);
    }
    function testResultProofIsHistoricalAndEpochCannotResetBeforeReleaseAndSeal() public {
        Admission.Ticket memory t=admit(42,1,0);start(42);vm.prank(vm.addr(1102));arena.concede(1,42);
        bytes32 resultHash=keccak256(abi.encode(arena.publishedResult()));bytes32[16] memory proof=firstProof();
        vm.chainId(10143);vm.expectRevert("result not published");verifier.verify(t,resultHash,0,proof);
        hub.publish(address(arena));assertFalse(verifier.verify(t,resultHash,0,proof));
        vm.expectRevert("released authority only");arena.openEngine();arena.closeEngine();
        vm.expectRevert("epoch not released");verifier.sealReleased(address(arena));
        vm.warp(vm.getBlockTimestamp()+3600);hub.releaseStake(address(arena),0);
        vm.expectRevert("seal released root first");arena.openEngine();verifier.sealReleased(address(arena));arena.openEngine();
        assertTrue(verifier.verify(t,resultHash,0,proof));vm.chainId(4242);admit(42,1,1);start(42);
        vm.expectRevert("stale match reference");vm.prank(vm.addr(1101));arena.input(1,42,1,1,vm.getBlockNumber()+10);
        vm.prank(vm.addr(1101));arena.input(2,42,1,1,vm.getBlockNumber()+10);
    }
    function testSixtyFourRealPhysicsGamesHaveBoundedKeysAndReservePublication() public {
        bytes32[] memory union=new bytes32[](82);uint256 length;uint256 maxWrites;
        for(uint256 i=1;i<=64;i++){
            vm.record();admit(10000+i,i,uint8(i%2));start(10000+i);vm.roll(vm.getBlockNumber()+20);
            vm.prank(vm.addr(1101));arena.input(1,10000+i,1,1,vm.getBlockNumber()+10);
            vm.prank(vm.addr(1102));arena.concede(1,10000+i);
            (,bytes32[] memory writes)=vm.accesses(address(arena));uint256 distinct;
            for(uint256 j;j<writes.length;j++){bool duplicate;for(uint256 k;k<j;k++)if(writes[k]==writes[j]){duplicate=true;break;}if(!duplicate)distinct++;
                bool known;for(uint256 k;k<length;k++)if(union[k]==writes[j]){known=true;break;}
                if(!known){assertLt(length,82);union[length++]=writes[j];}}
            if(distinct>maxWrites)maxWrites=distinct;
        }
        (,uint32 count,)=arena.resultCommitment();assertEq(count,64);assertLe(length,82);
        emit log_named_uint("distinct keys after 64 short real physics games",length);
        emit log_named_uint("max distinct keys in one complete short game",maxWrites);
    }
    function testRecoveryAfterPermissionlessRootSealCannotChangeFinalCommitment() public {
        admit(42,1,1);start(42);vm.chainId(10143);vm.warp(vm.getBlockTimestamp()+1 days);
        arena.closeEngine();vm.warp(vm.getBlockTimestamp()+3600);hub.releaseStake(address(arena),0);
        (uint256 epoch,uint32 count,bytes32 root)=arena.resultCommitment();assertEq(count,0);verifier.sealReleased(address(arena));
        arena.cancelRecovered();(uint256 afterEpoch,uint32 afterCount,bytes32 afterRoot)=arena.resultCommitment();
        assertEq(epoch,afterEpoch);assertEq(count,afterCount);assertEq(root,afterRoot);
        assertEq(arena.publishedResult().match_.status,4);arena.openEngine();(epoch,,)=arena.resultCommitment();assertEq(epoch,2);
    }
}
