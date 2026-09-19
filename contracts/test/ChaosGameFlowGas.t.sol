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

// The 2026-09-18 freeze, against the real patched ChaosGameFlow (gas-bounded slicing) and the
// rules-8 kernel. Ported from the investigation's HumanChaosTickGas.t.sol, which checked the same
// loop in a test-side wrapper; nothing here wraps or overrides the advance path.

/// The production class plus one test-only setter that places a mid-rally state.
contract ChaosGasHarness is PongChaosEvents {
    constructor(IInterludeHub h,address admission,address bridge,ChaosEngine module)
        PongChaosEvents(h,admission,bridge,msg.sender,address(0),module){}
    function fixture(uint256 id,T.State memory s) external {_store(id,codec.pack(s));}
}

/// Every game command is signed with 15,000,000 gas in release 853f174; 14,800,000 is what is
/// left for execution after intrinsic gas, rounded down. The target advances 10 ms per engine block.
contract ChaosGameFlowGasTest is Test {
    uint256 constant AD=0xc0;uint256 constant A=0xa0;uint256 constant B=0xb0;uint256 constant BR=0xb1;
    address constant HUB=address(0x1234);address constant KA=address(0xabc);address constant KB=address(0xdef);
    uint256 constant ID=1;
    uint256 constant COMMAND_GAS=14_800_000;
    uint256 constant UNBOUNDED=1_000_000_000;
    uint64 constant T0=12_000_000;// the rally under test is 12 s into the match
    E e;D d;ChaosCodec codec;ChaosEngine module;ChaosGasHarness game;
    // Via IR may reuse one read of block.number across vm.roll: the tests track the block here.
    uint256 startBlock;uint256 engineBlock;uint256[8] baseWords;bytes32 seed;

    function setUp() public {
        vm.chainId(10143);vm.warp(1789314000);vm.roll(100);
        e=new E();d=new D(e,new M());C c=new C(d);ChaosPhysics k=new ChaosPhysics(e,new R(),d,c);
        codec=new ChaosCodec();module=new ChaosEngine(codec,k,new DrandEvmnet(),new ChaosDrawRules());
        game=new ChaosGasHarness(IInterludeHub(HUB),vm.addr(AD),vm.addr(BR),module);
        Types.Session memory s;s.epoch=1;s.status=Types.Status.Active;
        vm.mockCall(HUB,abi.encodeWithSelector(IInterludeHub.sessionOf.selector,address(game),Types.GLOBAL),abi.encode(s));
        vm.mockCall(HUB,abi.encodeWithSelector(IInterludeHub.sessionEpochOf.selector),abi.encode(uint64(0)));
        vm.chainId(4242);
        bind(A,KA);bind(B,KB);
        Rooms.Offer memory o=Rooms.Offer(ID,bytes32(ID),vm.addr(A),vm.addr(B),1,true,uint64(block.timestamp+20),game.RULES_VERSION(),bytes32(ID));
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
    function words() internal view returns(uint256[8] memory w){(,w)=header();}
    function gameTime() internal view returns(uint64){return uint64(words()[6]>>112);}
    function phase() internal view returns(uint256){(ChaosGameFlow.Header memory h,)=header();return h.phase;}
    function live() internal view returns(T.State memory){return codec.unpack(words(),seed,5);}
    function place(T.State memory s) internal {game.fixture(ID,d.prepare(s));}
    /// A long rally: the ball is left of centre and heading right, so no point is due for ~4.6 s.
    function rally() internal view returns(T.State memory s){
        s=codec.unpack(baseWords,seed,5);
        T.Ball memory b=s.balls[0];b.x=100e12;b.y=288e12;b.vx=192e6;b.vy=96e6;s.balls[0]=b;s.t=T0;s.nextForce=T0;
    }
    /// `id` became active exactly at T0 (announced one second earlier), so its whole duration remains.
    function announced(T.State memory s,uint8 id) internal view returns(T.State memory){
        (s.effects,)=e.announce(s.effects,id,0,0,id,uint32(T0/1000)-1000);return s;
    }
    /// The force-grid states: wind; the well with the ball inside; a curve shot in flight; and
    /// with Multiball's second ball, which starts as a copy of the first: two balls in the wind,
    /// two in the well, and two curving (Multiball starting during a curve shot) in the wind or
    /// in the well.
    function grid(uint8 kind) internal view returns(T.State memory s){
        s=rally();
        if(kind==0||kind==3||kind==5)s=announced(s,17);
        if(kind==1||kind==4||kind==6){s=announced(s,16);s.balls[0].x=400e12;}
        if(kind==2)s=announced(s,5);
        if(kind==2||kind==5||kind==6){s.balls[0].curveSteps=150;s.balls[0].curveSign=1;}
        if(kind>=3)s=announced(s,21);
    }
    function label(uint8 kind) internal pure returns(string memory){
        return ["wind","well, ball inside","curve shot","wind, two balls","well, two balls inside","wind, two balls curving","well, two balls curving"][kind];
    }
    /// Engine block at which the block-derived target is `gapMs` ahead of the processed clock T0.
    function blockAt(uint256 gapMs) internal view returns(uint256){return startBlock+T0/10_000+gapMs/10;}
    function roll(uint256 n) internal {engineBlock=n;vm.roll(n);}
    /// One tick `gapMs` after the last processed state, under `gas`, with cold storage.
    function tickAt(uint256 gapMs,uint256 gas) internal returns(uint256 used){
        roll(blockAt(gapMs));vm.cool(address(game));
        uint256 before=gasleft();game.tick{gas:gas}(ID);used=before-gasleft();
    }

    /// The freeze: rules 6 reverted any grid gap above ~0.73 s at 14.8M (0.60 s with two balls
    /// in the wind), and every later command needed more. Now no gap reverts: a command processes
    /// what fits, reports incomplete, and the next resumes. Nothing is skipped or replayed.
    function testNoGapRevertsUnderCommandGas() public {
        uint256[6] memory gaps=[uint256(300),900,1200,3000,10_000,60_000];
        for(uint8 kind;kind<7;kind++){
            T.State memory s=grid(kind);place(s);
            if(kind>=3)assertTrue(live().balls[1].alive,"Multiball spawned a second ball");
            for(uint256 i;i<gaps.length;i++){
                uint256 snap=vm.snapshotState();
                uint256 used=tickAt(gaps[i],COMMAND_GAS);uint64 done=gameTime()-T0;
                emit log_named_uint(string.concat(label(kind),", gap ms ",vm.toString(gaps[i]),", processed ms"),done/1000);
                emit log_named_uint("    gas",used);
                assertGt(done,0,"progress");assertLe(done,gaps[i]*1000);assertEq(phase(),2);
                if(gaps[i]==300)assertEq(done,300_000,"a normal cadence is processed in full");
                vm.revertToState(snap);
            }
        }
    }

    /// Where commands stop never changes play: bounded commands reach the same eight words,
    /// bit for bit, as the unsliced rules-6 flow (the engine called to the target until
    /// complete) and as one unbounded command. The window covers wind, a goal, a serve and
    /// plain play afterwards.
    function testSlicedCommandsMatchOneUnslicedAdvance() public {
        T.State memory s=grid(0);place(s);
        uint64 end=T0+7_000_000;
        uint256[8] memory whole=codec.pack(d.prepare(s));bool complete;
        for(uint256 i;i<8&&!complete;i++){ChaosEngine.Progress memory p=module.advance(whole,seed,5,end,0,0);whole=p.words;complete=p.complete||p.outcome!=0;}
        assertTrue(complete);assertGt(codec.unpack(whole,seed,5).score.rally,live().score.rally,"the window includes a point");
        uint256 snap=vm.snapshotState();
        tickAt(7000,UNBOUNDED);
        uint256[8] memory one=words();assertEq(gameTime(),end);
        vm.revertToState(snap);
        uint256 ticks;
        for(uint256 gap=1200;gap<7000;gap+=1200){tickAt(gap,COMMAND_GAS);ticks++;}
        while(gameTime()<end){tickAt(7000,COMMAND_GAS);ticks++;require(ticks<100,"no catch-up");}
        uint256[8] memory sliced=words();
        emit log_named_uint("bounded commands for the same 7 s",ticks);
        for(uint256 i;i<8;i++){
            assertEq(sliced[i],whole[i],string.concat("unsliced flow, word ",vm.toString(i)));
            assertEq(one[i],whole[i],string.concat("one unbounded command, word ",vm.toString(i)));
        }
    }

    /// The reserve covers the costliest slice plus a ranked result and its publication: a
    /// seventh point in any 10 ms position of the two-ball wind finishes, rates once and
    /// publishes, or the command stops before it and the next one does.
    function finishAt(uint256 offset) private {
        uint256 snap=vm.snapshotState();
        T.State memory s=grid(3);s.score.a=6;s.score.b=6;
        // Both balls cross A's goal line `offset` ms after T0, far from B's paddle.
        s.balls[0].x=1030e12-int256(192e6*offset*1000);s.balls[0].y=150e12;s.balls[0].vy=0;place(s);
        tickAt(3000,COMMAND_GAS);
        assertTrue(phase()==3||gameTime()<T0+offset*1000,"finished, or stopped before the point");
        if(phase()==2){tickAt(3000,COMMAND_GAS);assertEq(phase(),3);}
        assertEq(game.ratingOf(vm.addr(A),1).played,1,"rated once");
        assertNotEq(game.resultHashes(ID),bytes32(0),"result published");
        vm.revertToState(snap);
    }
    function testRankedFinishFitsInEarlySlices() public {for(uint256 offset=100;offset<=450;offset+=10)finishAt(offset);}
    function testRankedFinishFitsInLateSlices() public {for(uint256 offset=460;offset<=800;offset+=10)finishAt(offset);}

    /// The costliest 100 ms slice with the rules-8 kernel, per force-grid state, against the
    /// reserve a command keeps for its last slice, a ranked result and the publication. Each
    /// figure is a whole cold command, root and publication included, so it overstates the slice.
    function testCostliestSliceFitsTheReserve() public {
        uint256 worst;
        for(uint8 kind;kind<7;kind++){
            place(grid(kind));uint256 snap=vm.snapshotState();
            uint256 used=tickAt(100,COMMAND_GAS);
            emit log_named_uint(string.concat("one 100 ms command, ",label(kind),", gas"),used);
            if(used>worst)worst=used;
            vm.revertToState(snap);
        }
        // The same costliest state, with the seventh point in the command's last 10 ms.
        place(grid(5));T.State memory s=live();s.score.a=6;s.score.b=6;
        s.balls[1].x=1030e12-int256(192e6*95_000);s.balls[1].y=150e12;s.balls[1].vy=0;s.balls[1].curveSteps=0;place(s);
        uint256 finishing=tickAt(100,COMMAND_GAS);assertEq(phase(),3);assertEq(game.ratingOf(vm.addr(A),1).played,1);
        emit log_named_uint("costliest 100 ms command",worst);
        emit log_named_uint("the same, finishing a ranked match",finishing);
        emit log_named_uint("ADVANCE_RESERVE",ChaosGameFlow.ADVANCE_RESERVE);
        assertLt(worst,ChaosGameFlow.ADVANCE_RESERVE);assertLt(finishing,ChaosGameFlow.ADVANCE_RESERVE);
    }

    /// The backup ticking every ~450 ms after a 1.2 s takeover gap, and after a 10 s Retry-After:
    /// the processed clock catches up with the target, and inputs are accepted again.
    function testBackupCatchesUpThroughTheWind() public {
        uint256[2] memory stalls=[uint256(1200),10_000];
        for(uint256 k;k<stalls.length;k++){
            uint256 snap=vm.snapshotState();
            place(grid(0));
            uint256 gap=stalls[k];uint256 ticks;
            while(true){
                tickAt(gap,COMMAND_GAS);ticks++;
                if(gameTime()==T0+gap*1000||phase()!=2)break;
                // An input needs the clock caught up; it reverts, recoverably, meanwhile.
                if(ticks==1){vm.cool(address(game));vm.prank(KB);vm.expectRevert(Rooms.CatchUpRequired.selector);game.input{gas:COMMAND_GAS}(ID,1,1,engineBlock+10);}
                gap+=450;require(ticks<200,"no catch-up");
            }
            emit log_named_uint(string.concat("stall ms ",vm.toString(stalls[k]),": commands to catch up"),ticks);
            emit log_named_uint("    engine ms behind before catching up",gap);
            roll(engineBlock+1);vm.prank(KB);game.input{gas:COMMAND_GAS}(ID,1,1,engineBlock+10);
            vm.revertToState(snap);
        }
    }

    /// The production sequence of 2026-09-18: one late tick in the wind used to freeze the
    /// match until the 30-minute cancel. Now play goes on and the match can finish normally.
    function testALateTickNoLongerFreezesTheMatch() public {
        place(grid(0));
        tickAt(1200,COMMAND_GAS);assertGt(gameTime(),T0);
        uint256 gap=1200;
        while(gameTime()<T0+gap*1000){gap+=300;tickAt(gap,COMMAND_GAS);}
        roll(engineBlock+1);vm.prank(KA);game.concede{gas:COMMAND_GAS}(ID);
        (ChaosGameFlow.Header memory h,)=header();
        assertEq(h.phase,3);assertEq(h.winner,vm.addr(B));assertEq(game.ratingOf(vm.addr(A),1).played,1);
    }
}
