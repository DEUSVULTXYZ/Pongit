// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ResponsiveEventsArena} from "../src/independent/ResponsiveEventsArena.sol";
import {ResponsiveChaosModifiers} from "../src/chaos/ResponsiveChaosModifiers.sol";
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
contract ResponsiveEventsArenaTest is Test, IReusableAdmissionAuthority {
    mapping(address=>bool) public registeredArena;
    mapping(address=>mapping(uint256=>mapping(uint256=>bytes32))) public issuedTicket;
    IndependentHubFixture hub;ReusableEventsArena arena;ChaosEngine kernel;PublishedResultVerifier verifier;
    uint256 constant BRIDGE=812;uint256 constant PRESSURE=813;
    function setUp() public {
        vm.chainId(10143);vm.warp(1_800_000_000);vm.roll(100);hub=new IndependentHubFixture();
        ChaosEffects effects=new ChaosEffects();ChaosDynamics dynamics=new ChaosDynamics(effects,new ResponsiveChaosModifiers());
        ChaosPhysics physics=new ChaosPhysics(effects,new ChaosRally(),dynamics,new ChaosContacts(dynamics));
        kernel=new ChaosEngine(new ChaosCodec(),physics,new DrandEvmnet(),new ChaosDrawRules());
        verifier=new PublishedResultVerifier(IReusableAdmissionAuthority(address(this)),IInterludeHub(address(hub)));
        arena=new ResponsiveEventsArena(IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE),vm.addr(PRESSURE),kernel,verifier);
        registeredArena[address(arena)]=true;arena.openEngine();vm.chainId(4242);
    }
    function sign(uint256 privateKey,bytes32 hash) internal pure returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(privateKey,hash);return abi.encodePacked(r,s,v);}
    function ticket(uint256 id,uint256 sequence,uint8 mode) internal view returns(Admission.Ticket memory t,T.Binding memory b){
        (uint256 epoch,,)=arena.resultCommitment();
        b=T.Binding(id,99,vm.addr(101),vm.addr(102),vm.addr(1101),vm.addr(1102),uint64(vm.getBlockTimestamp()+7200),uint64(vm.getBlockTimestamp()+7200),mode,true,99,epoch);
        t=Admission.Ticket(address(this),address(arena),epoch,sequence,id,keccak256(abi.encode(b)),uint64(vm.getBlockTimestamp()),uint64(vm.getBlockTimestamp()+90),99,keccak256("source block"),18);
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
    function testResponsiveHumanClassicChaosSameEpoch() public {
        assertEq(arena.RULES_VERSION(),18);
        for(uint8 mode;mode<2;mode++){
            uint256 id=100+mode;admit(id,mode+1,mode);start(id);
            vm.prank(vm.addr(1101));arena.input(1,id,1,1,vm.getBlockNumber()+100);
            int256 beforeY=arena.getSnapshot(id).state.left;
            vm.roll(vm.getBlockNumber()+10);arena.tick(1,id);
            assertEq(arena.getSnapshot(id).state.left-beforeY,30_000_000,"300 units per second");
            vm.prank(vm.addr(1102));arena.concede(1,id);
            assertEq(arena.publishedResult().rules,18);
            assertEq(arena.publishedResult().match_.id,id);
        }
        (uint256 epoch,uint32 count,)=arena.resultCommitment();assertEq(epoch,1);assertEq(count,2);
        assertEq(uint256(hub.statusOf(address(arena),0)),uint256(Types.Status.Active));
    }
    function testRejectsOldRulesTicket() public {
        (Admission.Ticket memory t,T.Binding memory b)=ticket(100,1,0);t.rules=14;
        vm.expectRevert();arena.admit(t,b,sign(BRIDGE,Admission.digest(t)));
    }
    function testRejectsLegacyChaosGraph() public {
        ChaosEffects effects=new ChaosEffects();ChaosDynamics dynamics=new ChaosDynamics(effects,new ChaosModifiers());
        ChaosEngine legacy=new ChaosEngine(new ChaosCodec(),new ChaosPhysics(effects,new ChaosRally(),dynamics,new ChaosContacts(dynamics)),new DrandEvmnet(),new ChaosDrawRules());
        vm.chainId(10143);vm.expectRevert("responsive Chaos rules required");
        new ResponsiveEventsArena(IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE),vm.addr(PRESSURE),legacy,verifier);
    }
}
