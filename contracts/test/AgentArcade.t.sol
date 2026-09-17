// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosPhysicsTest} from "./ChaosPhysics.t.sol";
import {PongAgentArcade} from "../src/agents/PongAgentArcade.sol";
import {AgentIdentity} from "../src/agents/AgentIdentity.sol";
import {AgentSteer} from "../src/agents/HouseController.sol";
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
    function meta(address a) external view returns(bytes32){return bytes32(_get(uint160(a),41));}
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
    function qualify(uint256 agent,uint8 mode) private {vm.prank(vm.addr(AD));game.qualifyAgent(vm.addr(agent),mode,true,bytes32(uint256(1)));}
    function bind(uint256 key,address control) private {
        Types.SessionGrant memory grant=Types.SessionGrant(vm.addr(key),control,uint64(block.timestamp+7200),0,false,new bytes4[](5));
        grant.selectors[0]=game.acceptMatch.selector;grant.selectors[1]=game.input.selector;grant.selectors[2]=game.tick.selector;grant.selectors[3]=game.cancelMatch.selector;grant.selectors[4]=game.concede.selector;
        bytes memory signature=sig(game.sessionDigest(grant),key);vm.prank(control);game.registerControls(abi.encode(grant,signature));
    }
    function offer(uint256 id,uint8 mode,bool ranked) private view returns(Rooms.Offer memory){
        return Rooms.Offer(id,bytes32(id),vm.addr(A),vm.addr(B),mode,ranked,uint64(block.timestamp+20),7,bytes32(id));
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
        register(C1,A);assertEq(game.agentCount(),1);assertEq(game.agentAt(0),vm.addr(A));
        (address creator,uint8 modes,uint8 passed,)=game.agentIdentity(vm.addr(A));assertEq(creator,vm.addr(C1));assertEq(modes,3);assertEq(passed,0);
        vm.expectRevert();game.registerAgent(r,sig(h,C1),sig(h,A));vm.expectRevert();game.agentAt(1);
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
        bytes32 own=other.registrationDigest(r);other.registerAgent(r,sig(own,C1),sig(own,A));assertEq(game.agentCount(),0);assertEq(other.agentCount(),1);
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
