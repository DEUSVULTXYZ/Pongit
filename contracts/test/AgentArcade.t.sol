// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosPhysicsTest} from "./ChaosPhysics.t.sol";
import {PongAgentArcade} from "../src/agents/PongAgentArcade.sol";
import {AgentIdentity} from "../src/agents/AgentIdentity.sol";
import {AgentSteer} from "../src/agents/AgentSteer.sol";
import {AgentResultArchive} from "../src/agents/AgentResultArchive.sol";
import {ChaosCodec} from "../src/chaos/ChaosCodec.sol";
import {ChaosEngine} from "../src/chaos/ChaosEngine.sol";
import {ChaosDrawRules} from "../src/chaos/ChaosDrawRules.sol";
import {DrandEvmnet} from "../src/chaos/DrandEvmnet.sol";
import {ChaosGameFlow} from "../src/chaos/ChaosGameFlow.sol";
import {PongInterludeRoomsChaos as Rooms} from "../src/labs/PongInterludeRoomsChaos.sol";
import {PhysicsV2} from "../src/v2/PhysicsV2.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {ChaosState as T} from "../src/chaos/ChaosState.sol";

contract AgentHarness is PongAgentArcade {
    constructor(IInterludeHub h,address admission,ChaosEngine module)PongAgentArcade(h,admission,msg.sender,module){}
    function nearEnd(uint256 id,uint8 a,uint8 b,uint64 time) external {
        if(matchMode(id)==0){PhysicsV2.State memory s=_state(id);s.scoreA=a;s.scoreB=b;s.t=time;s.x=512e6;s.y=288e6;s.vx=192e6;s.vy=96e6;_save(id,s);}
        else {T.State memory s=codec.unpack(_packed(id),bytes32(_get(id,3)),_get(id,8));s.score.a=a;s.score.b=b;s.t=time;s.nextForce=time;_store(id,codec.pack(s));}
    }
    function chaosFixture(uint256 id,T.State memory s) external {_store(id,codec.pack(s));}
    function controlWord(uint256 id) external view returns(uint256){return _get(id,8);}
    function probe(uint256 id,uint64 target) external returns(uint64){return AgentSteer.steer(words,id,matchMode(id),target);}
    function gameTime(uint256 id) external view returns(uint64){return uint64(_get(id,7)>>128);}
    function gameTime1(uint256 id) external view returns(uint64){return uint64(_get(id,27)>>112);}
    function brain(uint256 id) external view returns(uint256){return AgentSteer.brainOf(words,id,matchMode(id));}
    function setScore(uint256 id,uint8 a,uint8 b) external {uint256 c=_get(id,8);c=(c&~(uint256(15)<<4))|(uint256(a)<<4);c=(c&~(uint256(15)<<8))|(uint256(b)<<8);_set(id,8,c);}
    function meta(address a) external view returns(bytes32){return bytes32(_get(uint160(a),41));}
    function phaseOf(uint256 id) external view returns(uint256){return _phase(id);}
    function setLegacyBall(uint256 id,int256 x,int256 y,int256 vx,int256 vy,uint64 t) external {PhysicsV2.State memory s=_state(id);s.x=x;s.y=y;s.vx=vx;s.vy=vy;s.t=t;_save(id,s);}
    function rawWord(uint256 id,uint256 field) external view returns(uint256){return _get(id,field);}
    function speedOf(uint256 id,uint256 i) external view returns(uint256){
        uint256 b=_get(id,22+i*2);int256 vx=int80(uint80(b));int256 vy=int80(uint80(b>>80));
        uint256 sq=uint256(vx*vx+vy*vy);uint256 r=sq;uint256 x=sq/2+1;while(x<r){r=x;x=(sq/x+x)/2;}return r;
    }
    function goalBound(uint256 id,uint8 a,uint8 b,uint64 time) external {
        PhysicsV2.State memory s=_state(id);s.scoreA=a;s.scoreB=b;s.t=time;s.x=60e6;s.y=20e6;s.vx=-900e6;s.vy=5e6;_save(id,s);
    }
}
contract AgentArcadeTest is ChaosPhysicsTest {
    uint256 constant AD=0xc0;uint256 constant A=0xa0;uint256 constant B=0xb0;uint256 constant C1=0xc1;uint256 constant C2=0xc2;
    address constant HUB=address(0x1234);address constant KA=address(0xabc);address constant KB=address(0xdef);
    AgentHarness game;ChaosEngine module;ChaosCodec codec;
    function setUp() public {
        vm.chainId(10143);vm.warp(1789314000);vm.roll(100);
        codec=new ChaosCodec();module=new ChaosEngine(codec,k,new DrandEvmnet(),new ChaosDrawRules());
        game=new AgentHarness(IInterludeHub(HUB),vm.addr(AD),module);
        Types.Session memory s;s.epoch=1;s.status=Types.Status.Active;
        vm.mockCall(HUB,abi.encodeWithSelector(IInterludeHub.sessionOf.selector),abi.encode(s));
        vm.mockCall(HUB,abi.encodeWithSelector(IInterludeHub.sessionEpochOf.selector),abi.encode(uint64(0)));vm.chainId(4242);
    }
    function sig(bytes32 hash,uint256 key) private pure returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(key,hash);return abi.encodePacked(r,s,v);}
    function registration(uint256 creator,uint256 agent,uint8 modes) private view returns(AgentIdentity.Registration memory){
        return AgentIdentity.Registration(vm.addr(creator),vm.addr(agent),modes,keccak256(abi.encode(agent)),uint64(block.timestamp+300));
    }
    function register(uint256 creator,uint256 agent) private {
        AgentIdentity.Registration memory r=registration(creator,agent,3);bytes32 h=game.registrationDigest(r);
        game.registerAgent(r,sig(h,creator),sig(h,agent));
    }
    function registerHouse(uint256 creator,uint256 agent,bytes32 metadata) private {
        AgentIdentity.Registration memory r=AgentIdentity.Registration(vm.addr(creator),vm.addr(agent),3,metadata,uint64(block.timestamp+300));
        bytes32 h=game.registrationDigest(r);game.registerAgent(r,sig(h,creator),sig(h,agent));
    }
    /// A seat is steered by the contract only when its registration metadata is one of the three
    /// house bots. A community agent keeps whatever direction its own worker submitted.
    function testContractSteersAHouseSeatAndLeavesACommunitySeatAlone() public {
        bytes32 NOVA=0x6617df9037f631e02f64cd64398d7d83f4b85341a624f0b884f04c8129823770;
        registerHouse(C1,A,NOVA);register(C2,B);
        start(1,0,false);
        assertEq(game.meta(vm.addr(A)),NOVA,"the house seat must carry house metadata on chain");
        game.nearEnd(1,0,0,1_120_000);
        uint64 t=game.gameTime(1);
        assertEq(t,1_120_000,"the clock should be on a NOVA reaction boundary");
        uint256 before=game.controlWord(1);
        uint64 next=game.probe(1,t+300_000);
        assertEq(next,t+100_000,"the library should have taken one slice, not skipped to the target");
        uint256 got=game.controlWord(1);
        assertTrue(int8(uint8(got&3))-1!=0,"the house seat should have been given a direction");
        assertEq((got>>2)&3,(before>>2)&3,"the community seat must be left alone");
    }
    /// Two community seats mean the steering path is inert: it must not touch the control word.
    function testTwoCommunitySeatsAreNeverSteered() public {
        register(C1,A);register(C2,B);start(2,0,false);
        game.nearEnd(2,0,0,1_000_000);
        vm.prank(KA);game.input(2,1,1,block.number+10);
        uint256 before=game.controlWord(2);
        vm.roll(block.number+30);
        vm.prank(KA);game.tick(2);
        uint256 got=game.controlWord(2);
        assertEq(got&3,before&3,"left seat untouched");
        assertEq((got>>2)&3,(before>>2)&3,"right seat untouched");
    }
    /// Chaos keeps its own packing and can run two balls, so it is decoded directly rather than
    /// projected through codec.legacy, which collapses to one ball and would hide MULTIBALL.
    function testChaosHouseSeatIsSteeredToo() public {
        bytes32 NOVA=0x6617df9037f631e02f64cd64398d7d83f4b85341a624f0b884f04c8129823770;
        registerHouse(C1,A,NOVA);register(C2,B);
        start(3,1,false);
        uint256 before=game.controlWord(3);
        // NOVA re-decides every 280 ms. Its aim error is drawn per rally, so sweep a few of its
        // boundaries rather than betting on one landing outside the dead zone.
        bool steered;
        for(uint64 k=4;k<12&&!steered;k++){
            uint64 t=280_000*k;
            game.nearEnd(3,0,0,t);
            assertEq(game.gameTime1(3),t,"the chaos clock should sit on a NOVA boundary");
            assertEq(game.probe(3,t+300_000),t+100_000,"the library should take one slice in chaos as well");
            if(int8(uint8(game.controlWord(3)&3))-1!=0)steered=true;
        }
        assertTrue(steered,"the chaos house seat should have been given a direction");
        assertEq((game.controlWord(3)>>2)&3,(before>>2)&3,"the chaos community seat must be left alone");
    }
    /// A bot that keeps conceding recovers toward its label; a bot that keeps scoring eases off.
    /// The label is a ceiling: the trims never move to the hard side of it.
    function testConcedingAndScoringMoveTheTrimsOnlyTowardTheSoftSide() public {
        bytes32 NOVA=0x6617df9037f631e02f64cd64398d7d83f4b85341a624f0b884f04c8129823770;
        registerHouse(C1,A,NOVA);register(C2,B);
        start(4,0,false);
        game.nearEnd(4,0,0,1_120_000);
        game.probe(4,1_420_000);
        assertEq(game.brain(4)&0xffff,0,"a fresh tournament starts at the published label");
        // The community seat takes four points off the house seat, one probe at a time.
        for(uint8 k=1;k<=4;k++){
            game.setScore(4,0,k);
            game.nearEnd(4,0,k,1_120_000+uint64(k)*280_000);
            game.probe(4,1_120_000+uint64(k)*280_000+300_000);
        }
        uint256 after1=game.brain(4);
        // The word also carries the match tag and the seen counters, so a non-zero word alone
        // proves nothing. Assert the conceding seat's own integrators actually moved.
        int8 late=int8(uint8(after1>>24));int8 blind=int8(uint8(after1>>32));
        assertTrue(late!=0||blind!=0,"the conceding seat must have attributed its losses");
        assertEq(uint256((after1>>224)&15),0,"its own score was nil");
        assertEq(uint256((after1>>228)&15),4,"four conceded points were counted exactly once each");
        // Strength trims are one-sided: they can only ever be at or above the label, never below.
        assertLe(after1&31,6,"the reaction trim stays inside its band");
        assertLe((after1>>5)&31,6,"the dead-zone trim stays inside its band");
    }

    /// A ranked match plays the published label exactly, because ELO assumes a stationary opponent.
    function testRankedMatchesNeverLearn() public {
        bytes32 NOVA=0x6617df9037f631e02f64cd64398d7d83f4b85341a624f0b884f04c8129823770;
        registerHouse(C1,A,NOVA);register(C2,B);
        qualify(A,0);qualify(B,0);
        start(5,0,true);
        for(uint8 k=1;k<=4;k++){
            game.setScore(5,0,k);
            game.nearEnd(5,0,k,1_120_000+uint64(k)*280_000);
            game.probe(5,1_120_000+uint64(k)*280_000+300_000);
        }
        assertEq(game.brain(5),0,"a ranked match must leave the learned word untouched");
    }
    function qualify(uint256 agent,uint8 mode) private {vm.prank(vm.addr(AD));game.qualifyAgent(vm.addr(agent),mode,true,bytes32(uint256(1)));}
    function bind(uint256 key,address control) private {
        Types.SessionGrant memory grant=Types.SessionGrant(vm.addr(key),control,uint64(block.timestamp+7200),0,false,new bytes4[](5));
        grant.selectors[0]=game.acceptMatch.selector;grant.selectors[1]=game.input.selector;grant.selectors[2]=game.tick.selector;grant.selectors[3]=game.cancelMatch.selector;grant.selectors[4]=game.concede.selector;
        bytes memory signature=sig(game.sessionDigest(grant),key);vm.prank(control);game.registerControls(abi.encode(grant,signature));
    }
    function offer(uint256 id,uint8 mode,bool ranked) private view returns(Rooms.Offer memory){
        return Rooms.Offer(id,bytes32(id),vm.addr(A),vm.addr(B),mode,ranked,uint64(block.timestamp+20),7,bytes32(id));
    }
    bytes32 constant NOVA_META=0x6617df9037f631e02f64cd64398d7d83f4b85341a624f0b884f04c8129823770;
    bytes32 constant ONYX_META=0xab988c929327e00ef2ffef823a9578430c6237e0f21da503f90f62fd0b7d3a8f;
    /// One tick catches the clock up to the chain, a slice at a time. It used to stop after the
    /// first slice that landed, so a house match advanced 100 ms per tick whatever the gap, fell
    /// behind the block clock, and was then advanced whole and unsteered.
    function testOneTickCatchesUpTheWholeGapWhileSteering() public {
        registerHouse(C1,A,NOVA_META);registerHouse(C2,B,ONYX_META);
        for(uint8 mode;mode<2;mode++){
            uint256 id=500+mode;start(id,mode,false);
            game.nearEnd(id,0,0,2_000_000);
            // Track the block by hand: under via-IR a second block.number read can be served
            // from the first, which silently makes the second roll one block short.
            uint256 bn=block.number;
            vm.roll(bn+1);vm.prank(KA);game.tick(id);
            uint64 t0=mode==0?game.gameTime(id):game.gameTime1(id);
            vm.roll(bn+101);vm.prank(KA);game.tick(id);
            uint64 t1=mode==0?game.gameTime(id):game.gameTime1(id);
            assertEq(t1-t0,1_000_000,string.concat("mode ",vm.toString(mode),": one tick must cover the whole one-second gap"));
            vm.prank(KB);game.concede(id);
        }
    }
    /// A game command carries 15 M gas. Effect 17 alone costs about 16 M per second of play, so a
    /// catch-up that is not cut on gas reverts, the gap grows, and every later tick reverts too:
    /// the match freezes for good, because the arcade caps its clock at the five-minute deadline
    /// and so never reaches the 30-minute cancellation. Every effect, one and two balls, and gaps
    /// well past the coordinator's cadence must fit, must progress, and must then catch up.
    function sweepEffects(uint8 from,uint8 to) private {
        registerHouse(C1,A,NOVA_META);registerHouse(C2,B,ONYX_META);
        uint64[3] memory gaps=[uint64(50),100,300];uint256 bn=block.number;
        for(uint8 balls=1;balls<=2;balls++)for(uint8 fx=from;fx<=to;fx++)for(uint256 g;g<gaps.length;g++){
            uint256 m=10_000+uint256(balls)*1000+uint256(fx)*10+g;start(m,1,false);
            T.State memory s=k.initial(bytes32(m),96000000,72000000);
            (s.effects,)=e.announce(s.effects,fx,0,0,fx,0);s.t=1000000;s.nextForce=1000000;
            s.balls[0].x=300e12;s.balls[0].y=200e12;s.balls[0].vx=900e6;s.balls[0].vy=300e6;
            if(balls==2){s.balls[1]=copyBall(s.balls[0]);s.balls[1].x=700e12;s.balls[1].vx=-900e6;s.balls[1].vy=-250e6;s.balls[1].alive=true;}
            game.chaosFixture(m,s);
            bn+=1;vm.roll(bn);vm.prank(KA);game.tick{gas:14_800_000}(m);
            for(uint256 r;r<3&&game.phaseOf(m)==2;r++){
                uint64 before=game.gameTime1(m);
                bn+=gaps[g];vm.roll(bn);vm.prank(KA);game.tick{gas:14_800_000}(m);
                if(game.phaseOf(m)==2)assertGt(game.gameTime1(m),before,string.concat("effect ",vm.toString(fx)," must progress"));
            }
            // A lagging match recovers: at a fixed target, repeated ticks close the gap, after
            // which conceding (which needs a caught-up clock) goes through.
            for(uint256 c;c<40&&game.phaseOf(m)==2;c++){uint64 was=game.gameTime1(m);vm.prank(KA);game.tick{gas:14_800_000}(m);if(game.gameTime1(m)==was)break;}
            if(game.phaseOf(m)==2){vm.prank(KB);game.concede(m);}
        }
    }
    function testNoSteeredTickOutspendsAGameCommandEffects1To8() public {sweepEffects(1,8);}
    function testNoSteeredTickOutspendsAGameCommandEffects9To15() public {sweepEffects(9,15);}
    function testNoSteeredTickOutspendsAGameCommandEffect16() public {sweepEffects(16,16);}
    function testNoSteeredTickOutspendsAGameCommandEffect17() public {sweepEffects(17,17);}
    function testNoSteeredTickOutspendsAGameCommandEffects18To24() public {sweepEffects(18,24);}
    /// The deadline reached inside a heavy catch-up still settles under a real command's gas: the
    /// last slice can leave the loop at its reserve, and the finish, the rating of a ranked match and
    /// the publication all have to fit in what remains, or the deciding tick reverts every time.
    function testDeadlineInsideAHeavyCatchUpSettlesUnderTheCommandLimit() public {
        registerHouse(C1,A,NOVA_META);registerHouse(C2,B,ONYX_META);qualify(A,1);qualify(B,1);
        // Several distances from the deadline, so the last slice lands at different points
        // relative to the reserve, including just above it.
        uint64[6] memory before=[uint64(400_000),900_000,1_300_000,1_700_000,2_300_000,3_100_000];
        for(uint8 balls=1;balls<=2;balls++)for(uint8 fx=16;fx<=17;fx++)for(uint256 o;o<before.length;o++){
            uint256 m=20_000+uint256(balls)*1000+uint256(fx)*10+o;
            // Ranked, so the heaviest finish path runs: ratings for both seats.
            start(m,1,true);
            T.State memory s=k.initial(bytes32(m),96000000,72000000);
            uint64 near=uint64(game.MATCH_DURATION_US())-before[o];s.t=near;s.nextForce=near;
            // An announced effect starts one second later, so announce it one second before.
            (s.effects,)=e.announce(s.effects,fx,0,0,fx,uint32(near/1000)-1000);
            s.balls[0].x=300e12;s.balls[0].y=200e12;s.balls[0].vx=900e6;s.balls[0].vy=300e6;
            if(balls==2){s.balls[1]=copyBall(s.balls[0]);s.balls[1].x=700e12;s.balls[1].vx=-900e6;s.balls[1].vy=-250e6;s.balls[1].alive=true;}
            game.chaosFixture(m,s);
            uint256 bn=block.number;vm.roll(bn+1);vm.prank(KA);game.tick{gas:14_800_000}(m);
            vm.roll(bn+1+before[o]/10_000+100);
            for(uint256 r;r<30&&game.phaseOf(m)==2;r++){vm.prank(KA);game.tick{gas:14_800_000}(m);}
            assertEq(game.phaseOf(m),3,string.concat("effect ",vm.toString(fx)," from ",vm.toString(before[o]/1000),"ms out must settle"));
        }
    }
    /// A deep copy: assigning one memory struct to another only copies the reference, so
    /// `s.balls[1]=s.balls[0]` followed by edits to balls[1] silently moved balls[0] too.
    function copyBall(T.Ball memory a) private pure returns(T.Ball memory){return abi.decode(abi.encode(a),(T.Ball));}
    /// Chaos multiplies a ball's speed by 1.1 at every paddle hit, with no ceiling short of a 2^72
    /// representation guard. People miss long before that; two near-perfect house bots on a slope
    /// where the ball returns to the same height every round trip do not, and reached 25,000 px/s
    /// in review. There, one 100 ms slice holds more collisions than a command can pay for, and the
    /// same slice replays on every retry. Whatever speed a rally has reached, a tick must fit.
    function testAnEscalatedRallyNeverOutspendsACommand() public {
        registerHouse(C1,A,ONYX_META);registerHouse(C2,B,NOVA_META);
        uint64[4] memory speeds=[uint64(1_000),8_000,25_000,60_000];uint256 bn=block.number;
        for(uint8 wellAndSplit;wellAndSplit<2;wellAndSplit++)for(uint256 i;i<speeds.length;i++){
            uint256 m=40_000+uint256(wellAndSplit)*10+i;start(m,1,false);
            T.State memory s=k.initial(bytes32(m),96000000,72000000);s.t=1000000;s.nextForce=1000000;
            if(wellAndSplit==1){(s.effects,)=e.announce(s.effects,21,0,0,21,0);(s.effects,)=e.announce(s.effects,16,1,0,16,0);}
            int256 v=int256(uint256(speeds[i]))*1e6;
            // Flat through the middle, where both paddles already sit: the simplest resonance, the
            // ball comes back to the same height every crossing and nobody has to move to return it.
            s.balls[0].x=400e12;s.balls[0].y=288e12;s.balls[0].vx=v;s.balls[0].vy=0;
            if(wellAndSplit==1){s.balls[1]=copyBall(s.balls[0]);s.balls[1].x=620e12;s.balls[1].vx=-v;s.balls[1].alive=true;}
            game.chaosFixture(m,s);
            bn+=1;vm.roll(bn);vm.prank(KA);game.tick{gas:14_800_000}(m);
            for(uint256 r;r<4&&game.phaseOf(m)==2;r++){
                uint64 before=game.gameTime1(m);
                bn+=100;vm.roll(bn);vm.prank(KA);game.tick{gas:14_800_000}(m);
                if(game.phaseOf(m)==2)assertGt(game.gameTime1(m),before,string.concat(vm.toString(speeds[i])," px/s must progress"));
            }
            for(uint256 c;c<40&&game.phaseOf(m)==2;c++){uint64 was=game.gameTime1(m);vm.prank(KA);game.tick{gas:14_800_000}(m);if(game.gameTime1(m)==was)break;}
            if(game.phaseOf(m)==2){vm.prank(KB);game.concede(m);}
        }
    }
    /// Two community seats and nobody ticking: the coordinator's fallback then arrives seconds late.
    /// Advanced in one call, effect 17 over that gap outspends a command and freezes the match for
    /// good. Sliced, every tick fits and progresses, and the match can still be conceded.
    function testCommunityChaosCannotFreezeWhenItsPlayersGoQuiet() public {
        register(C1,A);register(C2,B);uint256 bn=block.number;
        for(uint8 balls=1;balls<=2;balls++)for(uint8 fx=16;fx<=17;fx++){
            uint256 m=30_000+uint256(balls)*100+fx;start(m,1,false);
            T.State memory s=k.initial(bytes32(m),96000000,72000000);
            (s.effects,)=e.announce(s.effects,fx,0,0,fx,0);s.t=1000000;s.nextForce=1000000;
            s.balls[0].x=300e12;s.balls[0].y=200e12;s.balls[0].vx=900e6;s.balls[0].vy=300e6;
            if(balls==2){s.balls[1]=copyBall(s.balls[0]);s.balls[1].x=700e12;s.balls[1].vx=-900e6;s.balls[1].vy=-250e6;s.balls[1].alive=true;}
            game.chaosFixture(m,s);
            uint256 control=game.controlWord(m);
            bn+=1;vm.roll(bn);vm.prank(KA);game.tick{gas:14_800_000}(m);
            bn+=300;vm.roll(bn);
            // Each tick either moves the clock or finds it already caught up with the chain.
            for(uint256 r;r<8&&game.phaseOf(m)==2&&game.gameTime1(m)<4_000_000;r++){
                uint64 before=game.gameTime1(m);vm.prank(KA);game.tick{gas:14_800_000}(m);
                if(game.phaseOf(m)==2)assertGt(game.gameTime1(m),before,string.concat("effect ",vm.toString(fx)," must progress"));
            }
            if(game.phaseOf(m)==2)assertEq(game.gameTime1(m),4_000_000,"the whole three-second gap is caught up");
            assertEq(game.controlWord(m)&15,control&15,"community seats are sliced, never steered");
            for(uint256 c;c<40&&game.phaseOf(m)==2;c++){uint64 was=game.gameTime1(m);vm.prank(KA);game.tick{gas:14_800_000}(m);if(game.gameTime1(m)==was)break;}
            if(game.phaseOf(m)==2){vm.prank(KB);game.concede(m);}
        }
    }
    /// The cap rescales an over-fast ball to the limit along the same line, and touches nothing else
    /// in its words: position, gravity use, trail revision and a ball under the cap stay exactly as
    /// they were. Checked on the library alone, so the engine's own bookkeeping cannot blur it.
    function testTheSpeedCapKeepsDirectionAndEverythingElse() public {
        register(C1,A);register(C2,B);start(800,1,false);
        T.State memory s=k.initial(bytes32(uint256(800)),96000000,72000000);s.t=1000000;s.nextForce=1000000;
        s.balls[0].x=512e12;s.balls[0].y=288e12;s.balls[0].vx=9_000e6;s.balls[0].vy=-4_500e6;
        s.balls[0].gravityUsed=77;s.balls[0].trailRevision=5;
        s.balls[1]=copyBall(s.balls[0]);s.balls[1].x=300e12;s.balls[1].vx=-1_200e6;s.balls[1].vy=500e6;s.balls[1].alive=true;
        game.chaosFixture(800,s);
        uint256 fast=game.rawWord(800,22);uint256 slow=game.rawWord(800,24);uint256 position=game.rawWord(800,21);
        game.probe(800,1_300_000);
        uint256 w=game.rawWord(800,22);
        int256 vx=int80(uint80(w));int256 vy=int80(uint80(w>>80));
        assertEq(vx,-2*vy,"the direction must be kept");
        assertLe(game.speedOf(800,0),3_000e6);assertGe(game.speedOf(800,0),2_999e6);
        assertEq(w>>160,fast>>160,"gravity use and trail revision must survive");
        assertEq(game.rawWord(800,21),position,"the position word is untouched");
        assertEq(game.rawWord(800,24),slow,"a ball under the cap is left exactly as it was");
        // And a second pass finds nothing left to do.
        game.probe(800,1_300_000);assertEq(game.rawWord(800,22),w);
    }
    bytes32 constant PULSE_META=0xe2fe7a5c52d5a1364cd893cde1191c36cd3e34c41ce55e0316950b9ba9be49df;
    /// End to end, not just the decision: a steered house seat must actually move its paddle and
    /// hold rallies. Every earlier test stopped right after steer wrote a direction, and in Classic
    /// the loop read the state before that write, advanced the old directions and saved them back
    /// over the new ones: the paddles never moved, and a match went 7-6 in 35 s of play.
    function testSteeredClassicPaddlesMoveAndHoldRallies() public {
        registerHouse(C1,A,ONYX_META);registerHouse(C2,B,PULSE_META);start(900,0,false);
        uint256 bn=block.number;bool moved;
        for(uint256 r;r<30&&game.phaseOf(900)==2;r++){
            bn+=100;vm.roll(bn);vm.prank(KA);game.tick(900);
            (,,PhysicsV2.State memory st)=snapshot(900);
            if(st.left!=288e6||st.right!=288e6)moved=true;
        }
        (,,PhysicsV2.State memory end)=snapshot(900);
        assertTrue(moved,"the steered paddles must move");
        assertEq(end.t,30_000_000,"thirty seconds of play");
        assertLe(uint256(end.scoreA)+end.scoreB,3,"an expert and an arcade bot must hold most of their rallies");
    }
    /// The same for Chaos, whose engine reads the control word from storage rather than from the
    /// state handed to it: its paddles must move under steering too.
    function testSteeredChaosPaddlesMove() public {
        registerHouse(C1,A,ONYX_META);registerHouse(C2,B,PULSE_META);start(901,1,false);
        uint256 start27=game.rawWord(901,27);uint256 bn=block.number;bool moved;
        for(uint256 r;r<20&&game.phaseOf(901)==2;r++){
            bn+=100;vm.roll(bn);vm.prank(KA);game.tick(901);
            uint256 p=game.rawWord(901,27);
            if(uint56(p)!=uint56(start27)||uint56(p>>56)!=uint56(start27>>56))moved=true;
        }
        assertTrue(moved,"the steered chaos paddles must move");
    }
    /// Classic gets the same speed cap, along the same line, and a ball under it is left alone.
    function testTheClassicSpeedCapKeepsDirection() public {
        register(C1,A);register(C2,B);start(902,0,false);
        game.setLegacyBall(902,512e6,288e6,6_000e6,-8_000e6,2_000_000);
        game.probe(902,2_100_000);
        int256 vx=int256(game.rawWord(902,5));int256 vy=int256(game.rawWord(902,6));
        // Integer scaling truncates each component by at most one unit of 1e-6 px/s.
        assertLe(vx*4+vy*3<0?uint256(-(vx*4+vy*3)):uint256(vx*4+vy*3),7,"the direction must be kept");
        uint256 sq=uint256(vx*vx+vy*vy);assertLe(sq,uint256(3_000e6)*3_000e6);assertGe(sq,uint256(2_999e6)*2_999e6);
        game.setLegacyBall(902,512e6,288e6,300e6,-200e6,2_000_000);
        game.probe(902,2_100_000);
        assertEq(int256(game.rawWord(902,5)),300e6);assertEq(int256(game.rawWord(902,6)),-200e6);
    }
    /// A point that ends the match inside a multi-slice catch-up ends it cleanly. Slicing on past
    /// it would call _finish a second time, which reverts, so the deciding tick could never land.
    function testFinishingInsideACatchUpEndsTheMatchCleanly() public {
        registerHouse(C1,A,NOVA_META);registerHouse(C2,B,ONYX_META);
        start(600,0,false);
        game.goalBound(600,0,6,2_000_000);
        vm.roll(block.number+1);vm.prank(KA);game.tick(600);
        if(game.phaseOf(600)==2){vm.roll(block.number+100);vm.prank(KA);game.tick(600);}
        assertEq(game.phaseOf(600),3,"the seventh point must finish the match");
    }
    function start(uint256 id,uint8 mode,bool ranked) private {
        bind(A,KA);bind(B,KB);Rooms.Offer memory o=offer(id,mode,ranked);bytes memory signature=sig(game.ticketDigest(o),AD);
        vm.prank(KA);game.acceptMatch(o,signature);vm.prank(KB);game.acceptMatch(o,signature);
    }
    function snapshot(uint256 id) private view returns(uint256 phase,address winner,PhysicsV2.State memory s){(,,phase,,,,winner,,,,,,s)=game.getSnapshot(id);}
    function testAgentRuntimeFits() public {vm.chainId(10143);PongAgentArcade root=new PongAgentArcade(IInterludeHub(HUB),vm.addr(AD),address(this),module);assertLe(address(root).code.length,24576);}
    function testAgentArchiveOnlyPublishedResultsAndNoDuplicate() public {
        register(C1,A);start(1,0,false);vm.chainId(10143);AgentResultArchive archive=new AgentResultArchive(game);
        vm.expectRevert("result not published");archive.recordMatch(1);
        vm.chainId(4242);vm.prank(KB);game.concede(1);
        vm.expectRevert("published Monad state only");archive.recordMatch(1);
        vm.chainId(10143);archive.recordMatch(1);assertEq(archive.recordedHash(1),game.resultHashes(1));
        vm.expectRevert("result already recorded");archive.recordMatch(1);
        vm.expectRevert("unknown match");archive.recordMatch(99);
    }
    function testRegistrationRequiresBothOwnersAndIsImmutable() public {
        AgentIdentity.Registration memory r=registration(C1,A,3);bytes32 h=game.registrationDigest(r);
        vm.expectRevert();game.registerAgent(r,sig(h,C2),sig(h,A));vm.expectRevert();game.registerAgent(r,sig(h,C1),sig(h,B));
        register(C1,A);(address first,uint256 count)=game.agentAt(0);assertEq(count,1);assertEq(first,vm.addr(A));
        (address creator,uint8 modes,uint8 passed,)=game.agentIdentity(vm.addr(A));assertEq(creator,vm.addr(C1));assertEq(modes,3);assertEq(passed,0);
        vm.expectRevert();game.registerAgent(r,sig(h,C1),sig(h,A));(address past,)=game.agentAt(1);assertEq(past,address(0),"past the end is zero, not a revert");
    }
    function testWrongAppExpiryAndModeRegistrationRejected() public {
        AgentIdentity.Registration memory r=registration(C1,A,3);bytes32 h=game.registrationDigest(r);r.modes=1;
        vm.expectRevert();game.registerAgent(r,sig(h,C1),sig(h,A));r=registration(C1,A,4);h=game.registrationDigest(r);
        vm.expectRevert();game.registerAgent(r,sig(h,C1),sig(h,A));r=registration(C1,A,3);h=game.registrationDigest(r);vm.warp(block.timestamp+301);
        vm.expectRevert();game.registerAgent(r,sig(h,C1),sig(h,A));
    }
    function testHumanOnlyAndUnqualifiedRankedDenied() public {
        bind(A,KA);Rooms.Offer memory o=offer(1,0,false);bytes memory proof=sig(game.ticketDigest(o),AD);
        vm.prank(KA);vm.expectRevert();game.acceptMatch(o,proof);register(C1,A);register(C2,B);o.ranked=true;proof=sig(game.ticketDigest(o),AD);
        vm.prank(KA);vm.expectRevert();game.acceptMatch(o,proof);assertEq(game.activeCount(),0);
    }
    function testSameCreatorAndHumanChallengesStayFriendly() public {
        register(C1,A);start(1,0,false);vm.prank(KB);game.concede(1);assertEq(game.ratingOf(vm.addr(A),0).elo,1000);assertEq(game.ratingOf(vm.addr(B),0).elo,1000);
        register(C1,B);qualify(A,0);qualify(B,0);Rooms.Offer memory o=offer(2,0,true);bytes memory proof=sig(game.ticketDigest(o),AD);
        vm.prank(KA);vm.expectRevert();game.acceptMatch(o,proof);start(2,0,false);vm.prank(KB);game.concede(2);assertEq(game.ratingOf(vm.addr(A),0).played,0);
    }
    function testNoPressureOrQualificationThroughGameKey() public {
        register(C1,A);bind(A,KA);vm.prank(KA);vm.expectRevert();game.qualifyAgent(vm.addr(A),0,true,bytes32(uint256(1)));
        ChaosGameFlow.LivePressure memory pressure;vm.expectRevert(PongAgentArcade.FinancialPressureDisabled.selector);game.submitLivePressure(pressure,hex"");
        (uint256 a,uint256 b,,)=game.queuedPressure(1);assertEq(a+b,0);
    }
    function testBothModesTimedLeaderDrawAndEloIsolation() public {
        register(C1,A);register(C2,B);uint256 blockHead=100;
        for(uint8 mode;mode<2;mode++){
            qualify(A,mode);qualify(B,mode);uint256 id=uint256(mode)*3+1;
            start(id,mode,true);game.nearEnd(id,4,3,299990000);vm.roll(blockHead+=30000);game.tick(id);
            (uint256 phase,address winner,PhysicsV2.State memory s)=snapshot(id);assertEq(phase,3);assertEq(winner,vm.addr(A));assertEq(s.t,300000000);assertEq(s.scoreA,4);
            assertEq(game.ratingOf(vm.addr(A),mode).elo,1032);assertEq(game.ratingOf(vm.addr(B),mode).elo,968);
            start(id+1,mode,true);game.nearEnd(id+1,4,4,299990000);vm.roll(blockHead+=30000);game.tick(id+1);
            (phase,winner,s)=snapshot(id+1);assertEq(phase,3);assertEq(winner,address(0));assertEq(s.t,300000000);
            assertEq(game.ratingOf(vm.addr(A),mode).elo,1032);assertEq(game.ratingOf(vm.addr(B),mode).elo,968);assertEq(game.ratingOf(vm.addr(A),mode).played,1);
            (uint32 ba,uint32 bb,uint32 aa,uint32 ab)=game.ratingChange(id+1);assertEq(ba,aa);assertEq(bb,ab);assertEq(game.activeCount(),0);
            vm.prank(KB);vm.expectRevert();game.concede(id+1);
        }
    }
    function testAgentIdentityProofCannotMoveToAnotherApplication() public {
        AgentIdentity.Registration memory r=registration(C1,A,3);bytes32 h=game.registrationDigest(r);
        vm.chainId(10143);AgentHarness other=new AgentHarness(IInterludeHub(HUB),vm.addr(AD),module);vm.chainId(4242);
        vm.expectRevert();other.registerAgent(r,sig(h,C1),sig(h,A));
        bytes32 own=other.registrationDigest(r);other.registerAgent(r,sig(own,C1),sig(own,A));(,uint256 mine)=game.agentAt(0);(,uint256 theirs)=other.agentAt(0);assertEq(mine,0);assertEq(theirs,1);
    }
    function testTwoModesAreIsolatedAndThirdWaitsForAFreeSlot() public {
        register(C1,A);start(1,0,false);
        uint256 c=0xe1;uint256 d=0xe2;address kc=address(0xaaaa);address kd=address(0xbbbb);
        register(C1,c);bind(c,kc);bind(d,kd);
        Rooms.Offer memory o=Rooms.Offer(2,bytes32(uint256(2)),vm.addr(c),vm.addr(d),1,false,uint64(block.timestamp+20),7,bytes32(uint256(2)));
        bytes memory proof=sig(game.ticketDigest(o),AD);vm.prank(kc);game.acceptMatch(o,proof);vm.prank(kd);game.acceptMatch(o,proof);
        assertEq(game.activeCount(),2);vm.prank(KA);vm.expectRevert();game.input(2,1,1,uint64(block.number+100));
        uint256 third=0xe3;register(C2,third);bind(third,address(0xcccc));
        o=Rooms.Offer(3,bytes32(uint256(3)),vm.addr(third),vm.addr(0xe4),0,false,uint64(block.timestamp+20),7,bytes32(uint256(3)));
        proof=sig(game.ticketDigest(o),AD);vm.prank(address(0xcccc));vm.expectRevert();game.acceptMatch(o,proof);
        vm.prank(KB);game.concede(1);assertEq(game.activeCount(),1);
        (uint256 phase,,)=snapshot(2);assertEq(phase,2);
        vm.prank(address(0xcccc));game.acceptMatch(o,proof);assertEq(game.activeCount(),2);
    }
    function testLongDisconnectHonorsFiveMinutesInsteadOfTechnicalCancellation() public {
        register(C1,A);start(1,0,false);game.nearEnd(1,2,5,299990000);vm.roll(block.number+190000);game.tick(1);
        (uint256 phase,address winner,PhysicsV2.State memory s)=snapshot(1);assertEq(phase,3);assertEq(winner,vm.addr(B));assertEq(s.t,300000000);
    }
    function testJackpotSeventhPointStillWinsImmediately() public {
        register(C1,A);start(1,1,false);ChaosGameFlow.Header memory header;uint256[8] memory w;
        (header,w,,)=abi.decode(game.chaosState(1),(ChaosGameFlow.Header,uint256[8],uint256,uint256));T.State memory s=codec.unpack(w,header.state.seed,5);
        s.score.a=5;(s.effects,)=e.announce(s.effects,22,0,0,1,0);s.t=1000000;s.nextForce=s.t;
        s.balls[0].x=1029e12;s.balls[0].y=10e12;s.balls[0].vx=1000e6;s.balls[0].vy=0;game.chaosFixture(1,s);vm.roll(201);game.tick(1);
        (uint256 phase,address winner,PhysicsV2.State memory finalState)=snapshot(1);assertEq(phase,3);assertEq(winner,vm.addr(A));assertEq(finalState.scoreA,7);assertLt(finalState.t,300000000);
    }
}
