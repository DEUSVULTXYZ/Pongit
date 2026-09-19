// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {IndependentHubFixture} from "./Independent.t.sol";
import {SeriesAgentArena} from "../src/agents/competition/SeriesAgentArena.sol";
import {AgentArenaTypes as A} from "../src/agents/competition/AgentArenaTypes.sol";
import {CompetitionTypes as T} from "../src/agents/competition/CompetitionTypes.sol";
import {HousePolicies} from "../src/agents/competition/HousePolicies.sol";
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

contract SeriesHarness is SeriesAgentArena {
    constructor(IInterludeHub h,address p,HousePolicies house,ChaosEngine k) SeriesAgentArena(h,p,house,k,120_000){}
    function terminal(uint256 id,address winner) external {_finish(id,3,winner);}
    function counters(uint256 id,uint256 a,uint256 b) external {_set(id,51,a);_set(id,52,b);}
}

/// Real rules/authorization with a hub fixture; not hosted-capacity evidence.
contract SeriesAgentArenaTest is Test {
    IndependentHubFixture hub;SeriesHarness arena;HousePolicies policies;ChaosEngine kernel;
    address constant PLAYER=address(0x1234);address constant KEY=address(0x4321);address constant BOT=address(0x1000);
    function setUp() public virtual {
        vm.chainId(10143);vm.warp(1_800_000_000);vm.roll(100);hub=new IndependentHubFixture();policies=new HousePolicies();
        ChaosEffects effects=new ChaosEffects();ChaosDynamics dynamics=new ChaosDynamics(effects,new ChaosModifiers());
        ChaosPhysics physics=new ChaosPhysics(effects,new ChaosRally(),dynamics,new ChaosContacts(dynamics));
        kernel=new ChaosEngine(new ChaosCodec(),physics,new DrandEvmnet(),new ChaosDrawRules());
        arena=new SeriesHarness(IInterludeHub(address(hub)),address(this),policies,kernel);
    }
    function plan(uint256 first,uint256 count,uint256 epoch) private view returns(A.Binding[] memory p){
        p=new A.Binding[](count);
        for(uint256 i;i<count;i++)p[i]=A.Binding(first+i,epoch,uint64(block.number),0,PLAYER,BOT,uint8(i%2),false,false,
            A.Controller(0,0,0,KEY,uint64(block.timestamp+7200)),A.Controller(address(policies).codehash,0,1,address(0),0));
    }
    function open(uint256 count) private {
        arena.prepareSeries(plan(1,count,1));vm.roll(uint256(arena.boundMatch().preparedBlock)+1);arena.openEngine();vm.chainId(4242);arena.start();
    }
    function finish() private {uint256 id=arena.boundMatch().id;vm.prank(KEY);arena.concede(id);}
    function testConsecutiveClassicChaosShareEpochAndKeepSeparateResults() public {
        open(3);assertEq(arena.activeCount(),1);finish();(T.Result memory one,,)=arena.resultFor(1);
        assertEq(one.status,3);assertEq(one.winner,BOT);assertEq(one.ref.epoch,1);
        arena.advanceSeries(arena.boundMatch().id);assertEq(arena.boundMatch().id,2);assertEq(arena.matchMode(2),1);assertEq(arena.activeCount(),1);
        vm.prank(KEY);arena.input(2,1,1,block.number+100);finish();(T.Result memory two,,)=arena.resultFor(2);assertEq(two.status,3);assertEq(two.mode,1);
        arena.advanceSeries(arena.boundMatch().id);finish();arena.drainSeries(arena.boundMatch().id);
        (T.Result memory original,,)=arena.resultFor(1);assertEq(original.hash,one.hash);assertEq(original.ref.id,1);
        assertEq(uint8(hub.statusOf(address(arena),0)),uint8(Types.Status.Active));assertTrue(arena.seriesDrained());
        vm.chainId(10143);hub.publish(address(arena));arena.closeEngine();assertEq(uint8(hub.statusOf(address(arena),0)),uint8(Types.Status.Exiting));
    }
    function testCannotSkipLiveMatchOrDrainAnAvailableSeries() public {
        open(2);vm.expectRevert("series cannot advance");arena.advanceSeries(1);
        vm.expectRevert("series not complete/bounded");arena.drainSeries(1);finish();
        vm.expectRevert("series not complete/bounded");arena.drainSeries(1);
        vm.chainId(10143);vm.expectRevert("published drain required");arena.closeEngine();
    }
    function testBudgetReservesWholeNextMatchAndDrainsWithoutStartingIt() public {
        open(2);arena.terminal(1,BOT);vm.roll(block.number+84_001);
        assertFalse(arena.canAdvance());vm.expectRevert("series cannot advance");arena.advanceSeries(1);arena.drainSeries(arena.boundMatch().id);
        assertEq(arena.boundMatch().id,1);assertEq(arena.activeCount(),0);(T.Result memory unstarted,,)=arena.resultFor(2);assertEq(unstarted.status,4);
        vm.chainId(10143);hub.publish(address(arena));arena.closeEngine();
    }
    function testBudgetDrainPublishesOneCancellationPerCommand() public {
        open(4);finish();vm.roll(block.number+84_001);arena.drainSeries(arena.boundMatch().id);
        (T.Result memory second,,)=arena.resultFor(2);(T.Result memory third,,)=arena.resultFor(3);
        assertEq(second.status,4);assertEq(third.status,0);
        vm.chainId(10143);hub.publish(address(arena));vm.expectRevert("publish all series results");arena.closeEngine();
        vm.chainId(4242);arena.drainSeries(arena.boundMatch().id);arena.drainSeries(arena.boundMatch().id);
        vm.chainId(10143);hub.publish(address(arena));arena.closeEngine();
    }
    function testNewDelegationDoesNotOverwritePriorBindingsOrResults() public {
        open(1);finish();arena.drainSeries(arena.boundMatch().id);(T.Result memory old,,)=arena.resultFor(1);
        vm.chainId(10143);hub.publish(address(arena));arena.closeEngine();vm.warp(block.timestamp+3600);hub.releaseStake(address(arena),0);
        A.Binding[] memory reuse=plan(1,1,2);vm.expectRevert("fresh series binding");arena.prepareSeries(reuse);
        arena.prepareSeries(plan(10,2,2));vm.roll(uint256(arena.boundMatch().preparedBlock)+1);arena.openEngine();vm.chainId(4242);arena.start();
        (T.Result memory after_,,)=arena.resultFor(1);
        assertEq(after_.hash,old.hash);assertEq(after_.ref.epoch,1);
    }
    function testAdmissionIsFrozenAndCannotBeExtendedByOperatorOrPlayer() public {
        A.Binding[] memory p=plan(1,2,1);vm.prank(KEY);vm.expectRevert("released series/pool only");arena.prepareSeries(p);
        open(2);vm.expectRevert("released series/pool only");arena.prepareSeries(plan(10,2,1));
        vm.chainId(10143);vm.expectRevert("released series/pool only");arena.prepareSeries(plan(10,2,1));
    }
    function testDuplicateIdsAndAmbiguousControllersRejected() public {
        A.Binding[] memory p=plan(1,2,1);p[1].id=p[0].id;vm.expectRevert("fresh series binding");arena.prepareSeries(p);
        p=plan(1,1,1);p[0].controlB.key=KEY;vm.expectRevert("distinct controllers");arena.prepareSeries(p);
    }
    function testOldCommandsCannotReachNewGameAndFreshNonceIsIndependent() public {
        open(2);vm.prank(KEY);arena.input(1,1,1,block.number+100);finish();arena.advanceSeries(arena.boundMatch().id);
        vm.prank(KEY);vm.expectRevert();arena.input(1,-1,2,block.number+100);
        vm.prank(KEY);arena.input(2,-1,1,block.number+100);
        vm.prank(PLAYER);vm.expectRevert("unbound or expired human control");arena.input(2,1,2,block.number+100);
        finish();vm.expectRevert("series cannot advance");arena.advanceSeries(1);
        vm.expectRevert("series not complete/bounded");arena.drainSeries(1);
    }
    function testBrainLearningFollowsTournamentAcrossTheSeries() public {
        A.Binding[] memory p=plan(1,3,1);p[0].tournament=42;p[1].tournament=42;p[2].tournament=43;
        arena.prepareSeries(p);vm.roll(101);arena.openEngine();vm.chainId(4242);arena.start();
        arena.counters(1,123,456);finish();arena.advanceSeries(1);
        (,uint256 a,uint256 b)=arena.resultFor(2);assertEq(a,123);assertEq(b,456);
        finish();arena.advanceSeries(2);(,a,b)=arena.resultFor(3);assertEq(a,0);assertEq(b,0,"different tournament starts its admitted memory");
    }
    function testRecoveryCannotRewriteAlreadyCompletedGame() public {
        open(2);finish();(T.Result memory before_,,)=arena.resultFor(1);arena.advanceSeries(arena.boundMatch().id);
        vm.chainId(10143);vm.warp(block.timestamp+1 days);hub.forceClose(address(arena),0);vm.warp(block.timestamp+3600);hub.releaseStake(address(arena),0);
        arena.cancelRecovered();(T.Result memory cancelled,,)=arena.resultFor(2);assertEq(cancelled.status,4);
        (T.Result memory after_,,)=arena.resultFor(1);assertEq(after_.hash,before_.hash);assertTrue(arena.seriesDrained());
    }
    function testProductionRuntimeRemainsDeployable() public {
        SeriesAgentArena game=new SeriesAgentArena(IInterludeHub(address(hub)),address(this),policies,kernel,120_000);
        // Monad permits 128 KiB; keep this candidate within a tighter 32 KiB
        // budget. Hosted MonadTen execution is still a separate release gate.
        assertLe(address(game).code.length,32768);
    }
}
