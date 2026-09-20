// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IndependentHubFixture} from "./Independent.t.sol";
import {ReusableAgentArena} from "../src/agents/competition/ReusableAgentArena.sol";
import {ReusableAdmission as Admission} from "../src/independent/ReusableAdmission.sol";
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
import {RoomsState} from "../src/labs/RoomsState.sol";


import {HousePolicies} from "../src/agents/competition/HousePolicies.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {ChaosState as C} from "../src/chaos/ChaosState.sol";

/// Artificial clock-boundary injection is restricted to this test harness.
contract ReusableAgentHarness is ReusableAgentArena {
    constructor(IInterludeHub h,address p,address bridge,HousePolicies policies_,ChaosEngine k,PublishedResultVerifier v)
        ReusableAgentArena(h,p,bridge,policies_,k,v){}
    function nearDeadline(uint64 time,uint8 a,uint8 b) external {
        PhysicsV2.State memory p=Game.state(words,kernel);
        if(p.mode==0){
            p.t=time;p.scoreA=a;p.scoreB=b;p.awaitingServe=false;p.resumeAt=0;
            // Classic never enters the legacy Chaos awaitingServe state.
            // Start away from a goal so the actual physics reaches the clock
            // boundary before the next scoring collision.
            p.x=512e6;p.y=288e6;p.vx=100e6;p.vy=50e6;
            RoomsState.save(words,1,p);
        }
        else {
            C.State memory c=kernel.codec().unpack(Game.packed(words),p.seed,S.get(words,8));
            c.t=time;c.nextForce=time+10_000;c.score.a=a;c.score.b=b;c.balls[0].x=512e12;c.balls[0].y=288e12;
            c.balls[0].vx=100e6;c.balls[0].vy=50e6;c.balls[1].alive=false;
            uint256[8] memory packed=kernel.codec().pack(c);for(uint256 i;i<8;i++)S.set(words,21+i,packed[i]);
        }
    }
}

contract ReusableAgentArenaTest is Test,IReusableAdmissionAuthority {
    function testAgentBindingCrossLanguageGoldenVector() public pure {
        T.Binding memory b=T.Binding(99,7,4,0,address(1),address(2),1,false,false,
            T.Controller(0,0,0,address(3),7201),T.Controller(bytes32(uint256(123)),0,3,address(0),0));
        bytes32 hash=keccak256(abi.encode(b));
        assertEq(hash,0x71b7de9ac1baef9814b0571a0bb27d45e75a721b025ed4cdcbdf979a6c1ec3d3);
        Admission.Ticket memory t=Admission.Ticket(address(5),address(6),7,1,99,hash,100,220,4,bytes32(uint256(5)),15);
        assertEq(Admission.digest(t),0x7347109fa74117c5134200e8c8749b12999e8b513c555d1980922778883ad1c4);
    }
    mapping(address=>bool) public registeredArena;
    mapping(address=>mapping(uint256=>mapping(uint256=>bytes32))) public issuedTicket;
    IndependentHubFixture hub;ReusableAgentHarness arena;ChaosEngine kernel;PublishedResultVerifier verifier;HousePolicies policies;
    uint256 constant BRIDGE=812;
    function setUp() public {
        vm.chainId(10143);vm.warp(1_800_000_000);vm.roll(100);hub=new IndependentHubFixture();policies=new HousePolicies();
        ChaosEffects effects=new ChaosEffects();ChaosDynamics dynamics=new ChaosDynamics(effects,new ChaosModifiers());
        ChaosPhysics physics=new ChaosPhysics(effects,new ChaosRally(),dynamics,new ChaosContacts(dynamics));
        kernel=new ChaosEngine(new ChaosCodec(),physics,new DrandEvmnet(),new ChaosDrawRules());
        verifier=new PublishedResultVerifier(IReusableAdmissionAuthority(address(this)),IInterludeHub(address(hub)));
        arena=new ReusableAgentHarness(IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE),policies,kernel,verifier);
        registeredArena[address(arena)]=true;arena.openEngine();vm.chainId(4242);
    }
    function signature(bytes32 hash) internal pure returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(BRIDGE,hash);return abi.encodePacked(r,s,v);}
    function admit(uint256 id,uint8 mode,bool overtime,uint8 house,bool bothBots) internal returns(Admission.Ticket memory ticket){
        (uint256 epoch,uint32 count,)=arena.resultCommitment();
        T.Binding memory b=T.Binding(id,epoch,uint64(vm.getBlockNumber()-1),overtime?uint64(3):0,vm.addr(101+id),vm.addr(102+id),mode,false,overtime,
            bothBots?T.Controller(address(policies).codehash,0,1,address(0),0):T.Controller(0,0,0,vm.addr(1101),uint64(vm.getBlockTimestamp()+7200)),
            T.Controller(address(policies).codehash,0,house,address(0),0));
        ticket=Admission.Ticket(address(this),address(arena),epoch,uint256(count)+1,id,keccak256(abi.encode(b)),uint64(vm.getBlockTimestamp()),uint64(vm.getBlockTimestamp()+90),b.preparedBlock,keccak256("source"),15);
        issuedTicket[address(arena)][epoch][ticket.sequence]=Admission.digest(ticket);arena.admit(ticket,b,signature(Admission.digest(ticket)));
    }
    function start(uint256 id,bool human) internal {
        (uint256 epoch,)=arena.currentMatch();if(human){vm.prank(vm.addr(1101));arena.confirmReady(epoch,id);}
        arena.start(epoch,id);vm.warp(vm.getBlockTimestamp()+3);arena.start(epoch,id);
    }
    function testHouseReadinessAndHumanCountdownRemainSeparate() public {
        admit(1,0,false,3,false);(uint8 ready,)=arena.readiness(1);assertEq(ready,2);arena.start(1,1);assertEq(arena.launchAt(1),0);
        vm.prank(vm.addr(1101));arena.confirmReady(1,1);arena.start(1,1);assertEq(arena.launchAt(1),vm.getBlockTimestamp()+3);
        vm.expectRevert("countdown pending");arena.start(1,1);vm.warp(vm.getBlockTimestamp()+3);arena.start(1,1);
        vm.prank(vm.addr(1101));arena.concede(1,1);admit(2,1,false,5,true);(ready,)=arena.readiness(2);assertEq(ready,3);start(2,false);
        vm.expectRevert("unbound or expired arcade key");vm.prank(vm.addr(1101));arena.input(1,2,1,1,vm.getBlockNumber()+100);
    }
    function testAllEightPoliciesUseFixedStorageAndNewMatchesResetControls() public {
        bytes32[] memory union=new bytes32[](86);uint256 n;
        for(uint8 house=1;house<=8;house++){
            uint256 id=9000+house;vm.record();admit(id,house%2,false,house,false);start(id,true);
            uint256 before_=arena.getSnapshot(id).state.t;
            for(uint256 k;k<4;k++){vm.roll(vm.getBlockNumber()+10);arena.tick(1,id);}
            assertGt(arena.getSnapshot(id).state.t,before_);Game.Result memory running=arena.publishedResult();assertGe(uint32(running.brainB>>192),3);assertEq(uint32(running.brainB>>224),0);
            vm.prank(vm.addr(1101));arena.concede(1,id);assertEq(arena.publishedResult().match_.status,3);
            (,bytes32[] memory writes)=vm.accesses(address(arena));
            for(uint256 i;i<writes.length;i++){bool known;for(uint256 j;j<n;j++)if(union[j]==writes[i])known=true;if(!known){assertLt(n,86);union[n++]=writes[i];}}
            vm.expectRevert("stale match reference");arena.tick(1,id-1);
        }
        (,uint32 count,)=arena.resultCommitment();assertEq(count,8);emit log_named_uint("agent short-game distinct keys",n);
    }
    function testFiveMinutesResolvesScoreBeforeAnyLateCatchup() public {
        for(uint8 mode;mode<2;mode++){
            uint256 id=mode+1;admit(id,mode,false,1,true);start(id,false);uint256 beginning=vm.getBlockNumber();
            arena.nearDeadline(299_900_000,4,3);vm.roll(beginning+36_100);arena.tick(1,id);
            Game.Result memory r=arena.publishedResult();assertEq(r.match_.status,3);assertEq(r.match_.elapsedUs,300_000_000);assertEq(r.match_.winner,r.match_.a);
        }
    }
    function testRegulationDrawAndCappedOvertimeDoNotInventWinner() public {
        admit(1,0,false,2,true);start(1,false);uint256 beginning=vm.getBlockNumber();arena.nearDeadline(299_900_000,3,3);vm.roll(beginning+30_000);arena.tick(1,1);
        Game.Result memory r=arena.publishedResult();assertEq(r.match_.status,3);assertEq(r.match_.winner,address(0));assertEq(r.match_.elapsedUs,300_000_000);
        admit(2,0,true,2,true);start(2,false);beginning=vm.getBlockNumber();arena.nearDeadline(299_900_000,3,3);vm.roll(beginning+30_000);arena.tick(1,2);assertEq(arena.getSnapshot(2).phase,2);
        arena.nearDeadline(359_900_000,3,3);vm.roll(beginning+36_100);arena.tick(1,2);r=arena.publishedResult();assertEq(r.match_.status,3);assertEq(r.match_.winner,address(0));assertEq(r.match_.elapsedUs,360_000_000);
    }
    function testNoFinancialPressureAndNoExternalBotControls() public {
        admit(1,1,false,1,true);start(1,false);Flow.LivePressure memory p;
        vm.expectRevert(ReusableAgentArena.NoAgentMarkets.selector);arena.submitLivePressure(p,"");
        Auth.Renewal memory r=Auth.Renewal(arena.boundMatch().a,vm.addr(550),1,1,0,uint64(vm.getBlockTimestamp()+100),uint64(vm.getBlockTimestamp()+50));
        vm.expectRevert("active human controls only");arena.renewActive(r,"");
    }
    function testRootAndGameHaveDeploymentBudgets() public {
        assertLe(address(arena).code.length,32768);emit log_named_uint("agent harness runtime",address(arena).code.length);
    }
}
