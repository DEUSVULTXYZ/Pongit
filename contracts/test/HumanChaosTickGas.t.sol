// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {PongChaosEvents} from "../src/chaos/PongChaosEvents.sol";
import {ChaosCodec} from "../src/chaos/ChaosCodec.sol";
import {ChaosEngine} from "../src/chaos/ChaosEngine.sol";
import {ChaosDrawRules} from "../src/chaos/ChaosDrawRules.sol";
import {DrandEvmnet} from "../src/chaos/DrandEvmnet.sol";
import {ChaosGameFlow} from "../src/chaos/ChaosGameFlow.sol";
import {ChaosState as T} from "../src/chaos/ChaosState.sol";
import {ChaosEffects as E} from "../src/chaos/ChaosEffects.sol";
import {ChaosModifiers as M} from "../src/chaos/ChaosModifiers.sol";
import {ChaosRally as R} from "../src/chaos/ChaosRally.sol";
import {ChaosDynamics as D} from "../src/chaos/ChaosDynamics.sol";
import {ChaosContacts as C} from "../src/chaos/ChaosContacts.sol";
import {ChaosPhysics} from "../src/chaos/ChaosPhysics.sol";
import {PongInterludeRoomsChaos as Rooms} from "../src/labs/PongInterludeRoomsChaos.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";

// Investigation of 2026-09-18: a human Chaos match freezes when one advancing command has to simulate
// more force-grid time than its gas can pay for. Copied from the investigation branch without its
// sliced-library candidate: that candidate overrides a hook the deployed class does not mark virtual,
// and it is the complete fix, which needs a new app. The interim at 30,000,000 gas is measured by
// HumanChaosInterimGasTest below and recorded in docs/validation/human-chaos-interim-2026-09-18.md.

interface IChaosFixture {function fixture(uint256 id,T.State memory s) external;}

/// The human application's own class (rules 6, deployed as 0x78d3...8eb0) plus one
/// test-only setter that places a mid-rally state. Nothing on the advance path is overridden.
contract HumanChaosFreezeHarness is PongChaosEvents {
    constructor(IInterludeHub h,address admission,address bridge,ChaosEngine module)
        PongChaosEvents(h,admission,bridge,msg.sender,address(0),module){}
    function fixture(uint256 id,T.State memory s) external {_store(id,codec.pack(s));}
}

/// In release 853f174 every game command, human or relayer, is signed with gas 15,000,000; 14,800,000
/// is what is left for execution after intrinsic gas, rounded down. The target advances 10 ms per
/// engine block.
abstract contract HumanChaosGasBase is Test {
    uint256 constant AD=0xc0;uint256 constant A=0xa0;uint256 constant B=0xb0;uint256 constant BR=0xb1;
    address constant HUB=address(0x1234);address constant KA=address(0xabc);address constant KB=address(0xdef);
    uint256 constant ID=1;
    uint256 constant COMMAND_GAS=14_800_000;
    // 15,000,000 minus 21,000 intrinsic and 36 non-zero calldata bytes for tick(uint256).
    uint256 constant EXACT_BUDGET=14_978_424;
    uint256 constant UNBOUNDED=1_000_000_000;
    uint64 constant T0=12_000_000;// the rally under test is 12 s into the match
    E e;D d;ChaosCodec codec;ChaosEngine module;PongChaosEvents game;
    uint256 startBlock;uint256[8] baseWords;bytes32 seed;

    function deploy() internal virtual returns(PongChaosEvents);

    function setUp() public {
        vm.chainId(10143);vm.warp(1789314000);vm.roll(100);
        e=new E();d=new D(e,new M());C c=new C(d);ChaosPhysics k=new ChaosPhysics(e,new R(),d,c);
        codec=new ChaosCodec();module=new ChaosEngine(codec,k,new DrandEvmnet(),new ChaosDrawRules());
        game=deploy();
        Types.Session memory s;s.epoch=1;s.status=Types.Status.Active;
        vm.mockCall(HUB,abi.encodeWithSelector(IInterludeHub.sessionOf.selector,address(game),Types.GLOBAL),abi.encode(s));
        vm.mockCall(HUB,abi.encodeWithSelector(IInterludeHub.sessionEpochOf.selector),abi.encode(uint64(0)));
        vm.chainId(4242);
        bind(A,KA);bind(B,KB);
        Rooms.Offer memory o=Rooms.Offer(ID,bytes32(ID),vm.addr(A),vm.addr(B),1,true,uint64(block.timestamp+20),6,bytes32(ID));
        bytes memory signature=sig(game.ticketDigest(o),AD);vm.prank(KA);game.acceptMatch(o,signature);vm.prank(KB);game.acceptMatch(o,signature);
        startBlock=block.number;
        // The first advance files the beacon request; a live rally 12 s in already has one.
        vm.roll(startBlock+1);game.tick(ID);
        (ChaosGameFlow.Header memory h,uint256[8] memory w)=header();baseWords=w;seed=h.state.seed;
    }

    function sig(bytes32 hash,uint256 key) internal pure returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(key,hash);return abi.encodePacked(r,s,v);}
    function bind(uint256 key,address control) private {
        Types.SessionGrant memory grant=Types.SessionGrant(vm.addr(key),control,uint64(block.timestamp+7200),0,false,new bytes4[](5));
        grant.selectors[0]=game.acceptMatch.selector;grant.selectors[1]=game.input.selector;grant.selectors[2]=game.tick.selector;
        grant.selectors[3]=game.cancelMatch.selector;grant.selectors[4]=game.concede.selector;
        bytes memory signature=sig(game.sessionDigest(grant),key);vm.prank(control);game.registerControls(abi.encode(grant,signature));
    }
    function header() internal view returns(ChaosGameFlow.Header memory h,uint256[8] memory w){
        (h,w,,)=abi.decode(game.chaosState(ID),(ChaosGameFlow.Header,uint256[8],uint256,uint256));
    }
    function gameTime() internal view returns(uint64){(,uint256[8] memory w)=header();return uint64(w[6]>>112);}
    function phase() internal view returns(uint256){(ChaosGameFlow.Header memory h,)=header();return h.phase;}
    function live() internal view returns(T.State memory){(ChaosGameFlow.Header memory h,uint256[8] memory w)=header();return codec.unpack(w,h.state.seed,5);}
    function place(T.State memory s) internal {IChaosFixture(address(game)).fixture(ID,d.prepare(s));}
    /// A long rally: the ball is left of centre and heading right, so no point is due for ~4.6 s.
    function rally() internal view returns(T.State memory s){
        s=codec.unpack(baseWords,seed,5);
        T.Ball memory b=s.balls[0];b.x=100e12;b.y=288e12;b.vx=192e6;b.vy=96e6;s.balls[0]=b;s.t=T0;s.nextForce=T0;
    }
    /// `id` became active exactly at T0 (announced one second earlier), so its whole duration remains.
    function announced(T.State memory s,uint8 id) internal view returns(T.State memory){
        (s.effects,)=e.announce(s.effects,id,0,0,id,uint32(T0/1000)-1000);return s;
    }
    function withEffect(uint8 id) internal {place(announced(rally(),id));}
    /// Engine block at which the block-derived target is `gapMs` ahead of the processed clock T0.
    function blockAt(uint256 gapMs) internal view returns(uint256){return startBlock+T0/10_000+gapMs/10;}

    /// One tick `gapMs` after the last processed state, under `gas`. Leaves the state as it finds it.
    function probe(uint256 gapMs,uint256 gas) internal returns(bool ok,uint256 used){(ok,used,)=probeData(gapMs,gas);}
    function probeData(uint256 gapMs,uint256 gas) internal returns(bool ok,uint256 used,bytes memory reason){
        uint256 snap=vm.snapshotState();
        vm.roll(blockAt(gapMs));vm.cool(address(game));
        uint256 before=gasleft();
        try game.tick{gas:gas}(ID){ok=true;}catch(bytes memory data){reason=data;}
        used=before-gasleft();
        vm.revertToState(snap);
    }
    /// Largest gap, at the 10 ms engine-block resolution, that one tick can still absorb.
    function largestGap(uint256 gas) internal returns(uint256){
        uint256 lo=1;uint256 hi=1000;
        while(hi-lo>1){uint256 mid=(lo+hi)/2;(bool ok,)=probe(mid*10,gas);if(ok)lo=mid;else hi=mid;}
        return lo*10;
    }
}

/// Questions 1 and 3 against the production class.
contract HumanChaosTickGasTest is HumanChaosGasBase {
    function deploy() internal override returns(PongChaosEvents){
        return new HumanChaosFreezeHarness(IInterludeHub(HUB),vm.addr(AD),vm.addr(BR),module);
    }

    function testWind17TickGapsUnderCommandGas() public {
        withEffect(17);
        uint256[5] memory gaps=[uint256(300),900,1200,1500,3000];
        bool[5] memory expected=[true,false,false,false,false];
        for(uint256 i;i<gaps.length;i++){
            (bool ok,uint256 used,bytes memory reason)=probeData(gaps[i],COMMAND_GAS);
            (bool unbounded,uint256 needed)=probe(gaps[i],UNBOUNDED);
            emit log_named_uint(string.concat("gap ms ",vm.toString(gaps[i]),ok?" OK, gas needed":" REVERTS at 14.8M, gas needed"),needed);
            assertEq(ok,expected[i],"tick outcome under 14.8M");
            assertTrue(unbounded,"the same tick is valid with enough gas");
            if(!ok){
                // Exhausted inside the kernel's nested frame: an empty revert bubbles up while
                // each outer frame keeps its 1/64, so the receipt shows less than the limit.
                assertEq(reason.length,0,"no rule rejected the tick");assertGt(needed,COMMAND_GAS);
                emit log_named_uint("    gas consumed by the reverted tick",used);
            }
        }
        uint256 limit=largestGap(COMMAND_GAS);uint256 exact=largestGap(EXACT_BUDGET);
        emit log_named_uint("largest wind gap ms at 14.8M",limit);
        emit log_named_uint("largest wind gap ms at 15M - intrinsic",exact);
        assertLt(limit,900,"the backup's 900 ms takeover can never fit");
    }

    /// Gas grows faster than the gap: one kernel call replays up to 128 grid steps in one
    /// memory frame, so memory expansion is paid quadratically within each call.
    function testWindGasSweep() public {
        withEffect(17);
        for(uint256 gap=100;gap<=1500;gap+=100){(,uint256 needed)=probe(gap,UNBOUNDED);emit log_named_uint(string.concat("  wind gap ms ",vm.toString(gap)),needed);}
    }

    /// What one tick would need to unfreeze later: bounded by the wind's end, the next point and
    /// the flow's own step budget (3 attempts x 4 kernel calls x 128 steps), not by the gap.
    function testWindGasNeededForLongGaps() public {
        uint256[4] memory long=[uint256(5000),8000,20_000,60_000];
        for(uint256 i;i<long.length;i++){
            withEffect(17);
            (bool ok,uint256 needed)=probe(long[i],200_000_000);
            emit log_named_uint(string.concat("  wind gap ms ",vm.toString(long[i]),", gas needed"),needed);
            assertTrue(ok);
        }
    }

    function testSameGapsWithoutGridEffectAreCheap() public {
        withEffect(22);// jackpot: scoring only, no force grid
        (bool ok,)=probe(3000,COMMAND_GAS);(,uint256 needed)=probe(3000,UNBOUNDED);
        emit log_named_uint("gap 3000 ms, no grid effect, gas needed",needed);
        assertTrue(ok);assertLt(needed,4_000_000);
    }

    /// Effect 17 is the only effect that grids unconditionally. Effect 16 grids while a ball
    /// is inside the well, and any curve shot (effect 5) grids for its 150 kicks.
    function testOtherForceGridStates() public {
        T.State memory s=announced(rally(),16);s.balls[0].x=400e12;place(s);
        (bool ok,)=probe(1200,COMMAND_GAS);(,uint256 needed)=probe(1200,UNBOUNDED);uint256 limit=largestGap(COMMAND_GAS);
        emit log_named_uint("effect 16, ball in the well, gap 1200 ms, gas needed",needed);
        emit log_named_uint("effect 16, ball in the well, largest gap ms at 14.8M",limit);
        assertFalse(ok);assertLt(limit,900);

        s=announced(rally(),5);s.balls[0].curveSteps=150;s.balls[0].curveSign=1;place(s);
        (ok,)=probe(1200,COMMAND_GAS);(,needed)=probe(1200,UNBOUNDED);limit=largestGap(COMMAND_GAS);
        emit log_named_uint("curve shot in flight, gap 1200 ms, gas needed",needed);
        emit log_named_uint("curve shot in flight, largest gap ms at 14.8M",limit);
        assertFalse(ok);assertLt(limit,900);

        place(announced(announced(rally(),17),21));
        assertTrue(live().balls[1].alive,"multiball spawned a second ball");
        limit=largestGap(COMMAND_GAS);
        emit log_named_uint("wind with two balls, largest gap ms at 14.8M",limit);
        assertLt(limit,900);
    }

    function testOneRevertFreezesTheMatchUntilTheThirtyMinuteCancel() public {
        withEffect(17);
        // The backup's takeover tick: 900 ms of observed stall plus stream and send latency.
        vm.roll(blockAt(1200));vm.expectRevert();game.tick{gas:COMMAND_GAS}(ID);
        assertEq(gameTime(),T0,"nothing was processed");
        uint256[7] memory later=[uint256(1500),3000,10_000,60_000,600_000,1_200_000,1_788_000];
        for(uint256 i;i<later.length;i++){
            vm.roll(blockAt(later[i]));vm.cool(address(game));
            vm.expectRevert();game.tick{gas:COMMAND_GAS}(ID);
            // Neither player can move or concede, and no betting pressure can be queued:
            // each of these paths advances the same clock first.
            vm.prank(KB);vm.expectRevert();game.input{gas:COMMAND_GAS}(ID,1,1,block.number+10);
            vm.prank(KA);vm.expectRevert();game.concede{gas:COMMAND_GAS}(ID);
            ChaosGameFlow.LivePressure memory p=ChaosGameFlow.LivePressure(ID,1,seed,1,.003 ether,0,uint64(123+i),bytes32(i+1),uint64(block.timestamp+20));
            bytes memory proof=sig(game.pressureDigest(p),BR);
            vm.expectRevert();game.submitLivePressure{gas:COMMAND_GAS}(p,proof);
            assertEq(gameTime(),T0,"still frozen");assertEq(phase(),2,"still live, so still open for bets");
        }
        (ChaosGameFlow.Header memory h,)=header();
        assertEq(h.clock,uint256(T0)+1_788_000_000,"the displayed clock keeps running");
        assertEq(game.activeCount(),1,"the frozen match holds one of the two arena slots");
        // Last block before the cancel: the target equals 30 minutes, still simulated, still reverts.
        vm.roll(startBlock+180_000);vm.expectRevert();game.tick{gas:COMMAND_GAS}(ID);
        // One block later the root cancels before simulating anything.
        vm.roll(startBlock+180_001);vm.cool(address(game));
        uint256 before=gasleft();game.tick{gas:COMMAND_GAS}(ID);uint256 used=before-gasleft();
        emit log_named_uint("cancelling tick gas",used);
        (h,)=header();
        assertEq(h.phase,4,"cancelled");assertEq(h.winner,address(0),"no winner");assertEq(game.activeCount(),0);
        assertEq(game.ratingOf(vm.addr(A),1).played,0,"no rating for either player");
        assertNotEq(game.resultHashes(ID),bytes32(0),"a cancelled result is published for refunds");
        assertLt(used,1_000_000);
    }

    /// The only earlier release: a node restart that exposes a lower block counter re-anchors
    /// the clock at processed game time, which resets the gap.
    function testLowerEngineBlockCounterReanchorsAndUnfreezes() public {
        withEffect(17);
        vm.roll(blockAt(1200));vm.expectRevert();game.tick{gas:COMMAND_GAS}(ID);
        vm.roll(startBlock-50);game.tick{gas:COMMAND_GAS}(ID);
        assertEq(gameTime(),T0,"re-anchored without skipping or replaying time");
        vm.roll(startBlock-50+30);game.tick{gas:COMMAND_GAS}(ID);
        assertEq(gameTime(),T0+300_000,"play resumes at the normal cadence");
    }
}

/// The interim of 2026-09-18, with no contract change: the relayer's public commands and the
/// browser's game commands are signed with 30,000,000 gas, the largest transaction the hosted node
/// accepts. Same production class, same fixtures and the same cold-storage probes as above.
contract HumanChaosInterimGasTest is HumanChaosGasBase {
    // 30,000,000 minus 21,000 intrinsic and 36 non-zero calldata bytes for tick(uint256).
    uint256 constant INTERIM_BUDGET=29_978_424;
    // input(uint256,int8,uint256,uint256) carries 132 calldata bytes, all counted as non-zero.
    uint256 constant INTERIM_INPUT_BUDGET=29_976_888;

    function deploy() internal override returns(PongChaosEvents){
        return new HumanChaosFreezeHarness(IInterludeHub(HUB),vm.addr(AD),vm.addr(BR),module);
    }

    /// The backup player's first movement `gapMs` after the last processed state. input advances
    /// the same clock before it applies the direction, so it meets the same limit as tick.
    /// The deadline derives from blockAt, not block.number: via-IR may reuse one block.number
    /// read across the repeated rolls of a search.
    function probeInput(uint256 gapMs,uint256 gas) internal returns(bool ok){
        uint256 snap=vm.snapshotState();
        uint256 at=blockAt(gapMs);
        vm.roll(at);vm.cool(address(game));
        vm.prank(KB);
        try game.input{gas:gas}(ID,1,1,at+10){ok=true;}catch{}
        vm.revertToState(snap);
    }
    function sweep(string memory label,uint256 from,uint256 to) internal {
        for(uint256 gap=from;gap<=to;gap+=100){
            (,uint256 needed)=probe(gap,UNBOUNDED);
            emit log_named_uint(string.concat("  ",label," gap ms ",vm.toString(gap),", gas needed"),needed);
        }
    }
    function largestInputGap(uint256 gas) internal returns(uint256){
        uint256 lo=1;uint256 hi=1000;
        while(hi-lo>1){uint256 mid=(lo+hi)/2;if(probeInput(mid*10,gas))lo=mid;else hi=mid;}
        return lo*10;
    }

    function testWindGapsUnderInterimGas() public {
        withEffect(17);
        uint256[8] memory gaps=[uint256(300),730,900,1000,1200,1300,1400,1500];
        bool[8] memory expected=[true,true,true,true,true,true,true,false];
        for(uint256 i;i<gaps.length;i++){
            (bool ok,uint256 used)=probe(gaps[i],INTERIM_BUDGET);
            emit log_named_uint(string.concat("wind gap ms ",vm.toString(gaps[i]),ok?" fits 30M, gas used":" REVERTS at 30M, gas consumed"),used);
            assertEq(ok,expected[i],"tick outcome under 30M");
        }
        uint256 before=largestGap(EXACT_BUDGET);uint256 limit=largestGap(INTERIM_BUDGET);
        uint256 inputGap=largestInputGap(INTERIM_INPUT_BUDGET);
        emit log_named_uint("largest wind gap ms at 15M - intrinsic",before);
        emit log_named_uint("largest wind gap ms at 30M - intrinsic",limit);
        emit log_named_uint("largest wind gap ms for the backup's input at 30M - intrinsic",inputGap);
        assertEq(before,730,"release tolerance");
        assertGe(limit,1400,"the 900 ms backup takeover and the relayer guard both fit");
        assertLt(limit,1500,"still finite: a longer stall still freezes the match");
        assertGe(inputGap+10,limit,"input tolerates the same gap, within one engine block");
        assertLe(inputGap,limit+10,"and no more");
    }

    /// The most expensive grid state measured: wind with a second ball (effect 21). The sweep
    /// drops after 1.4 s because this fixture's balls score, and serve() clears every effect.
    function testTwoBallWindUnderInterimGas() public {
        place(announced(announced(rally(),17),21));
        assertTrue(live().balls[1].alive,"multiball spawned a second ball");
        sweep("two-ball wind",800,1400);
        uint256 before=largestGap(EXACT_BUDGET);uint256 limit=largestGap(INTERIM_BUDGET);
        emit log_named_uint("wind with two balls, largest gap ms at 15M - intrinsic",before);
        emit log_named_uint("wind with two balls, largest gap ms at 30M - intrinsic",limit);
        assertGe(before,600);assertLt(before,700,"release tolerance");
        assertGe(limit,1100,"the relayer guard's worst case at a normal round trip fits");
        assertLt(limit,1200);
        (bool ok,)=probe(1200,INTERIM_BUDGET);assertFalse(ok,"1.2 s of two-ball wind still freezes");
    }

    /// The well grids only while a ball is inside it. In this fixture the ball leaves after about
    /// 1.25 s, so the cost stops growing below 30M; while inside, it grows as fast as the wind.
    /// A curve shot grids for its 1.5 s of kicks and then stops, above 30M.
    function testWellAndCurveUnderInterimGas() public {
        T.State memory s=announced(rally(),16);s.balls[0].x=400e12;place(s);
        sweep("well, ball inside",1000,1600);
        (bool ok,)=probe(1200,INTERIM_BUDGET);assertTrue(ok,"1.2 s inside the well now fits");
        (ok,)=probe(1200,EXACT_BUDGET);assertFalse(ok,"it did not at 15M");

        s=announced(rally(),5);s.balls[0].curveSteps=150;s.balls[0].curveSign=1;place(s);
        sweep("curve shot",1000,1600);
        uint256 limit=largestGap(INTERIM_BUDGET);
        emit log_named_uint("curve shot in flight, largest gap ms at 30M - intrinsic",limit);
        assertGe(limit,1300);assertLt(limit,1400);
    }

    /// The most expensive grid state measured so far: both balls inside the gravity well (effect
    /// 16 with effect 21's second ball, which spawns on the first ball's position). Each ball in
    /// the well is kicked at every grid step, so this costs more per 100 ms than two balls in the
    /// wind. It sets the worst-case tolerance the relayer guard's timing budget is checked against
    /// (CHAOS_GAP_TOLERANCE_MS.twoBallWell in shared/engine-gas.ts).
    function testTwoBallsInTheWellUnderInterimGas() public {
        T.State memory s=announced(announced(rally(),16),21);s.balls[0].x=400e12;place(s);
        T.State memory l=live();
        assertTrue(l.balls[1].alive,"multiball spawned a second ball");
        assertEq(l.balls[1].x,l.balls[0].x,"on the first ball's position, inside the well");
        sweep("two balls in the well",400,1200);
        uint256 before=largestGap(EXACT_BUDGET);uint256 limit=largestGap(INTERIM_BUDGET);
        emit log_named_uint("two balls in the well, largest gap ms at 15M - intrinsic",before);
        emit log_named_uint("two balls in the well, largest gap ms at 30M - intrinsic",limit);
        assertEq(before,540,"release tolerance, below the two-ball wind's 610 ms");
        assertEq(limit,1030,"interim tolerance, below the two-ball wind's 1,140 ms");
        (bool ok,)=probe(1100,INTERIM_BUDGET);assertFalse(ok,"1.1 s with both balls in the well freezes");
    }

    /// The resume risk of the 2026-09-18 recovery: the next epoch's node starts from Monad's
    /// published state, where the frozen match is still live in its grid state. A node whose block
    /// counter starts below the published anchor re-anchors on the first command, which then
    /// simulates nothing. From there the cadence decides: the relayer guard's (about 0.84 s at a
    /// normal round trip) fits; the release's maintenance loop (1.5 s without progress, checked
    /// every 2 s) freezes the match again.
    function testResumedGridMatchNeedsTheGuardCadence() public {
        withEffect(17);
        vm.roll(blockAt(1500));vm.cool(address(game));vm.expectRevert();game.tick{gas:INTERIM_BUDGET}(ID);
        assertEq(gameTime(),T0,"frozen");
        uint256 fresh=startBlock-50;// the next epoch's node, below the published anchor
        vm.roll(fresh);vm.cool(address(game));game.tick{gas:INTERIM_BUDGET}(ID);
        assertEq(gameTime(),T0,"re-anchored at the published clock; nothing simulated");
        vm.roll(fresh+84);vm.cool(address(game));game.tick{gas:INTERIM_BUDGET}(ID);
        assertEq(gameTime(),T0+840_000,"a guard tick 840 ms later fits");
        vm.roll(fresh+84+200);vm.cool(address(game));vm.expectRevert();game.tick{gas:INTERIM_BUDGET}(ID);
        assertEq(gameTime(),T0+840_000,"a 2 s maintenance-loop gap freezes it again");
        assertEq(phase(),2);
    }

    /// Past the new tolerance nothing has changed: one revert still freezes the match, and each
    /// retry now executes about twice as much on the shared node as it did at 15M.
    function testFreezeBeyondTheInterimTolerance() public {
        withEffect(17);
        vm.roll(blockAt(2000));vm.cool(address(game));
        uint256 before=gasleft();bool ok;
        try game.tick{gas:INTERIM_BUDGET}(ID){ok=true;}catch{}
        uint256 used=before-gasleft();
        emit log_named_uint("gas consumed by a reverted 30M tick",used);
        assertFalse(ok,"a 2 s wind gap does not fit");
        assertEq(gameTime(),T0,"nothing was processed");
        vm.roll(blockAt(2300));vm.cool(address(game));vm.expectRevert();game.tick{gas:INTERIM_BUDGET}(ID);
        assertEq(gameTime(),T0,"still frozen");assertEq(phase(),2);
    }
}

