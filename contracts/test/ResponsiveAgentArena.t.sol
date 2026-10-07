// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IndependentHubFixture} from "./Independent.t.sol";
import {ReusableAgentArena} from "../src/agents/competition/ReusableAgentArena.sol";
import {ReusableAdmission as Admission} from "../src/independent/ReusableAdmission.sol";
import {ReusableAgentView as View} from "../src/agents/competition/ReusableAgentView.sol";
import {ReusableAgentGame as Game} from "../src/agents/competition/ReusableAgentGame.sol";
import {ReusableArenaStorage as S} from "../src/independent/ReusableArenaStorage.sol";
import {PublishedResultVerifier, IReusableAdmissionAuthority} from "../src/independent/PublishedResultVerifier.sol";
import {PublishedResultTree as Tree} from "../src/agents/competition/PublishedResultTree.sol";
import {AgentArenaTypes as T} from "../src/agents/competition/AgentArenaTypes.sol";
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
import {RoomsRules} from "../src/labs/RoomsRules.sol";
import {RoomsState} from "../src/labs/RoomsState.sol";
import {AgentFairPause as Fair} from "../src/agents/competition/AgentFairPause.sol";


import {HousePolicies} from "../src/agents/competition/HousePolicies.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {ChaosState as C} from "../src/chaos/ChaosState.sol";

import {ResponsiveChaosModifiers} from "../src/chaos/ResponsiveChaosModifiers.sol";
import {ReusableAgentHarness} from "./ReusableAgentArena.t.sol";
contract ResponsiveHarness is ReusableAgentHarness {
 constructor(IInterludeHub h,address p,address bridge,HousePolicies house,ChaosEngine k,PublishedResultVerifier v)
  ReusableAgentHarness(h,p,bridge,house,k,v){}
 function RULES_VERSION() public pure override returns(uint256){return 17;}
}
contract ResponsiveAgentArenaTest is Test {
    mapping(address=>bool) public registeredArena;
    mapping(address=>mapping(uint256=>mapping(uint256=>bytes32))) public issuedTicket;
    IndependentHubFixture hub;ResponsiveHarness arena;ChaosEngine kernel;PublishedResultVerifier verifier;HousePolicies policies;
    uint256 constant BRIDGE=812;
    function setUp() public {
        vm.chainId(10143);vm.warp(1_800_000_000);vm.roll(100);hub=new IndependentHubFixture();policies=new HousePolicies();
        ChaosEffects effects=new ChaosEffects();ChaosDynamics dynamics=new ChaosDynamics(effects,new ResponsiveChaosModifiers());
        ChaosPhysics physics=new ChaosPhysics(effects,new ChaosRally(),dynamics,new ChaosContacts(dynamics));
        kernel=new ChaosEngine(new ChaosCodec(),physics,new DrandEvmnet(),new ChaosDrawRules());
        verifier=new PublishedResultVerifier(IReusableAdmissionAuthority(address(this)),IInterludeHub(address(hub)));
        arena=new ResponsiveHarness(IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE),policies,kernel,verifier);
        registeredArena[address(arena)]=true;arena.openEngine();vm.chainId(4242);
    }
    function signature(bytes32 hash) internal pure returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(BRIDGE,hash);return abi.encodePacked(r,s,v);}
    function admit(uint256 id,uint8 mode,bool overtime,uint8 house,bool bothBots) internal returns(Admission.Ticket memory ticket){
        (uint256 epoch,uint32 count,)=arena.resultCommitment();
        T.Binding memory b=T.Binding(id,epoch,uint64(vm.getBlockNumber()-1),overtime?uint64(3):0,vm.addr(101+id),vm.addr(102+id),mode,false,overtime,
            bothBots?T.Controller(address(policies).codehash,0,1,address(0),0):T.Controller(0,0,0,vm.addr(1101),uint64(vm.getBlockTimestamp()+7200)),
            T.Controller(address(policies).codehash,0,house,address(0),0));
        ticket=Admission.Ticket(address(this),address(arena),epoch,uint256(count)+1,id,keccak256(abi.encode(b)),uint64(vm.getBlockTimestamp()),uint64(vm.getBlockTimestamp()+90),b.preparedBlock,keccak256("source"),arena.RULES_VERSION());
        issuedTicket[address(arena)][epoch][ticket.sequence]=Admission.digest(ticket);arena.admit(ticket,b,signature(Admission.digest(ticket)));
    }
    function start(uint256 id,bool human) internal {
        (uint256 epoch,)=arena.currentMatch();if(human){vm.prank(vm.addr(1101));arena.confirmReady(epoch,id);}
        arena.start(epoch,id);vm.warp(vm.getBlockTimestamp()+3);vm.roll(vm.getBlockNumber()+300);arena.start(epoch,id);
    }

 function testEngineCannotStartPhysicsBeforeFreshHumanPresence() public {
  admit(1,0,false,1,false);start(1,true);
  assertEq(arena.getSnapshot(1).phase,1);
  vm.roll(vm.getBlockNumber()+100);arena.start(1,1);
  assertEq(arena.getSnapshot(1).state.t,0);
  vm.expectRevert("unbound or expired arcade key");arena.heartbeat(1,1);
  vm.prank(vm.addr(1101));arena.heartbeat(1,1);
  assertEq(arena.getSnapshot(1).phase,2);
  (Fair.View memory p,,,,)=arena.synchronization(1,1);
  assertEq(p.deadlineBlock,vm.getBlockNumber()+50);assertEq(p.limitUs,500_000);
 }
 function testEarlyPresenceCannotSkipCountdownOrConsumeCredit() public {
  admit(1,1,false,1,false);vm.prank(vm.addr(1101));arena.confirmReady(1,1);arena.start(1,1);
  vm.prank(vm.addr(1101));arena.heartbeat(1,1);
  assertEq(arena.getSnapshot(1).phase,1);(Fair.View memory p,,,,)=arena.synchronization(1,1);assertEq(p.deadlineBlock,0);
  vm.warp(vm.getBlockTimestamp()+3);vm.roll(vm.getBlockNumber()+299);
  vm.prank(vm.addr(1101));arena.heartbeat(1,1);assertEq(arena.getSnapshot(1).phase,1);
  vm.roll(vm.getBlockNumber()+1);vm.prank(vm.addr(1101));arena.heartbeat(1,1);assertEq(arena.getSnapshot(1).phase,2);
 }
 function testHumanSpeedAndUnchangedDisconnectProtectionInBothModes() public {
  for(uint8 mode;mode<2;mode++){
   uint256 id=mode+1;admit(id,mode,false,1,false);start(id,true);vm.prank(vm.addr(1101));arena.heartbeat(1,id);
   vm.prank(vm.addr(1101));arena.input(1,id,1,1,vm.getBlockNumber()+100);
   vm.roll(vm.getBlockNumber()+20);arena.tick(1,id);
   assertEq(arena.getSnapshot(id).state.left,348_000_000);
   vm.roll(vm.getBlockNumber()+40);arena.tick(1,id);
   assertEq(arena.getSnapshot(id).state.t,500_000);
   bytes32 frozen=keccak256(abi.encode(arena.getSnapshot(id).state));
   vm.roll(vm.getBlockNumber()+100);arena.tick(1,id);assertEq(keccak256(abi.encode(arena.getSnapshot(id).state)),frozen);
   vm.prank(vm.addr(1101));arena.concede(1,id);
   assertEq(arena.publishedResult().rules,17);
  }
 }
 function testAbsentHumanCanExpireWithoutStartingPhysics() public {
  admit(1,0,false,1,false);start(1,true);vm.warp(vm.getBlockTimestamp()+31);arena.cancelUnready(1,1);
  assertEq(arena.publishedResult().match_.status,4);assertEq(arena.publishedResult().match_.elapsedUs,0);
 }
 function testBotVersusBotStillStartsWithoutHumanHeartbeat() public {
  admit(1,0,false,1,true);start(1,false);assertEq(arena.getSnapshot(1).phase,2);
  vm.roll(vm.getBlockNumber()+100);arena.tick(1,1);assertEq(arena.getSnapshot(1).state.t,1_000_000);
 }
 function testOldClassicAndChaosModulesKeepOriginalSpeed() public {
  RoomsRules oldRules=new RoomsRules();PhysicsV2.State memory s=oldRules.initial(bytes32(0),0);s.leftDir=1;s.rightDir=-1;
  (PhysicsV2.State memory prior,)=oldRules.advance(s,500_000,128);
  (PhysicsV2.State memory current,)=oldRules.advanceResponsive(s,500_000,128);
  assertEq(prior.left,378_000_000);assertEq(current.left,438_000_000);assertEq(current.right,138_000_000);
  ChaosModifiers.Effect[2] memory effects;
  assertEq((new ChaosModifiers()).calculate(96e6,96e6,effects,0).speedA,180e6);
  assertEq((new ResponsiveChaosModifiers()).calculate(96e6,96e6,effects,0).speedA,300e6);
 }
}
