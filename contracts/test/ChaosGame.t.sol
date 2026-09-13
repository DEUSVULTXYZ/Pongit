// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosPhysicsTest} from "./ChaosPhysics.t.sol";
import {PongChaosEvents} from "../src/chaos/PongChaosEvents.sol";
import {ChaosCodec} from "../src/chaos/ChaosCodec.sol";
import {ChaosEngine} from "../src/chaos/ChaosEngine.sol";
import {ChaosDrawRules} from "../src/chaos/ChaosDrawRules.sol";
import {DrandEvmnet} from "../src/chaos/DrandEvmnet.sol";
import {ChaosGameFlow} from "../src/chaos/ChaosGameFlow.sol";
import {PongInterludeRoomsChaos as Rooms} from "../src/labs/PongInterludeRoomsChaos.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {Types} from "../vendor/interlude/interfaces/Types.sol";
import {ChaosState as T} from "../src/chaos/ChaosState.sol";
contract ChaosGameHarness is PongChaosEvents {
    constructor(IInterludeHub h,address admission,address bridge,ChaosEngine module)PongChaosEvents(h,admission,bridge,msg.sender,address(0),module){}
    function fixture(uint256 id,T.State memory s) external {_store(id,codec.pack(s));}
}
contract ChaosGameTest is ChaosPhysicsTest {
    uint256 constant AD=0xc0;uint256 constant A=0xa0;uint256 constant B=0xb0;uint256 constant BR=0xb1;
    address constant HUB=address(0x1234);address constant KA=address(0xabc);address constant KB=address(0xdef);
    ChaosGameHarness game;ChaosEngine module;ChaosCodec codec;
    function setUp() public {
        vm.chainId(10143);vm.warp(1789314000);vm.roll(100);
        codec=new ChaosCodec();module=new ChaosEngine(codec,k,new DrandEvmnet(),new ChaosDrawRules());
        game=new ChaosGameHarness(IInterludeHub(HUB),vm.addr(AD),vm.addr(BR),module);
        epoch(1);vm.mockCall(HUB,abi.encodeWithSelector(IInterludeHub.sessionEpochOf.selector),abi.encode(uint64(0)));vm.chainId(4242);
    }
    function epoch(uint256 n) private {Types.Session memory s;s.epoch=n;s.status=Types.Status.Active;
        vm.mockCall(HUB,abi.encodeWithSelector(IInterludeHub.sessionOf.selector,address(game),Types.GLOBAL),abi.encode(s));}
    function sig(bytes32 hash,uint256 key) private pure returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(key,hash);return abi.encodePacked(r,s,v);}
    function bind(uint256 key,address control) private {
        Types.SessionGrant memory grant=Types.SessionGrant(vm.addr(key),control,uint64(block.timestamp+7200),0,false,new bytes4[](5));
        grant.selectors[0]=game.acceptMatch.selector;grant.selectors[1]=game.input.selector;grant.selectors[2]=game.tick.selector;grant.selectors[3]=game.cancelMatch.selector;grant.selectors[4]=game.concede.selector;
        bytes memory signature=sig(game.sessionDigest(grant),key);vm.prank(control);game.registerControls(abi.encode(grant,signature));
    }
    function start(uint256 id,uint8 mode,bool ranked,uint256 a,uint256 b,address ka,address kb) private {
        bind(a,ka);bind(b,kb);Rooms.Offer memory o=Rooms.Offer(id,bytes32(id),vm.addr(a),vm.addr(b),mode,ranked,uint64(block.timestamp+20),6,bytes32(id));
        bytes memory signature=sig(game.ticketDigest(o),AD);vm.prank(ka);game.acceptMatch(o,signature);vm.prank(kb);game.acceptMatch(o,signature);
    }
    function raw(uint256 id) private view returns(uint256[8] memory w,uint256 q,uint256 draw,bytes32 seed){
        ChaosGameFlow.Header memory h;(h,w,q,draw)=abi.decode(game.chaosState(id),(ChaosGameFlow.Header,uint256[8],uint256,uint256));return(w,q,draw,h.state.seed);
    }
    function state(uint256 id) private view returns(T.State memory s){(uint256[8] memory w,,,bytes32 seed)=raw(id);return codec.unpack(w,seed,5);}
    function testActualRootRuntimeFitsEip170() public {vm.chainId(10143);PongChaosEvents root=new PongChaosEvents(IInterludeHub(HUB),vm.addr(AD),vm.addr(BR),address(this),address(0),module);assertLe(address(root).code.length,24576);}
    function testPublishedPreviousRatingsAreUsedForBothModesAndFirstResult() public {
        address previous=address(0x4567);vm.chainId(10143);
        game=ChaosGameHarness(address(new PongChaosEvents(IInterludeHub(HUB),vm.addr(AD),vm.addr(BR),address(this),previous,module)));
        epoch(1);vm.chainId(4242);
        for(uint8 mode;mode<2;mode++){
            Rooms.Rating memory old=Rooms.Rating(uint32(1300+mode*100),20,12,1);
            vm.mockCall(previous,abi.encodeWithSelector(Rooms.ratingOf.selector,vm.addr(A),mode),abi.encode(old));
            vm.mockCall(previous,abi.encodeWithSelector(Rooms.ratingOf.selector,vm.addr(B),mode),abi.encode(old));
            assertEq(game.ratingOf(vm.addr(A),mode).elo,old.elo);
            start(mode+1,mode,true,A,B,KA,KB);vm.prank(KB);game.concede(mode+1);
            assertEq(game.ratingOf(vm.addr(A),mode).elo,old.elo+16);assertEq(game.ratingOf(vm.addr(A),mode).played,21);
            assertEq(game.ratingOf(vm.addr(B),mode).elo,old.elo-16);
        }
    }
    function testAll276PairsSurviveReconnectAndClearOnConcessionPointOrExpiry() public {
        uint256 id=100;
        for(uint8 first=1;first<=24;first++)for(uint8 second=first+1;second<=24;second++){
            start(++id,1,false,A,B,KA,KB);T.State memory s=state(id);
            (s.effects,)=e.announce(s.effects,first,0,1,1,0);(s.effects,)=e.announce(s.effects,second,1,2,2,0);
            s.t=1000000;s.nextForce=s.t;s=d.prepare(s);game.fixture(id,s);
            T.State memory restored=state(id);assertEq(keccak256(abi.encode(codec.pack(restored))),keccak256(abi.encode(codec.pack(s))));
            // A late observer decodes the same state, then owner concession
            // clears every combination without awarding friendly ELO.
            vm.roll(block.number+200);vm.prank(KB);game.concede(id);T.State memory closed=state(id);
            assertEq(closed.effects[0].id,0);assertEq(closed.effects[1].id,0);assertFalse(closed.balls[0].alive);assertFalse(closed.balls[1].alive);
            assertEq(game.ratingOf(vm.addr(A),1).played,0);
            // Goals beyond all defensive surfaces remove both effect slots.
            s.balls[0].x=1029e12;s.balls[0].y=10e12;s.balls[0].vx=1000e6;s.balls[0].vy=0;s.balls[1].alive=false;
            T.State memory pointed;(pointed,,)=k.advance(s,1002000,128);assertGt(pointed.score.rally,1);
            assertEq(pointed.effects[0].id,0);assertEq(pointed.effects[1].id,0);
            // Expiration itself, independent from score/goal side effects.
            (s.effects,)=e.expire(s.effects,14000);assertEq(s.effects[0].id,0);assertEq(s.effects[1].id,0);
        }
        assertEq(id,376);
    }
    function testCachedControlsBothModesAndNoExpiryFromNetwork() public {
        for(uint8 mode;mode<2;mode++){
            uint256 id=mode+1;start(id,mode,true,A,B,KA,KB);vm.roll(block.number+10);vm.prank(KA);game.input(id,1,1,block.number+10);
            (,,,,,,,,,uint256 nonce,,,)=game.getSnapshot(id);assertEq(nonce,1);vm.prank(KB);game.concede(id);assertEq(game.activeCount(),0);
            if(mode==1){T.State memory ended=state(id);assertFalse(ended.balls[0].alive);assertFalse(ended.balls[1].alive);assertEq(ended.effects[0].id,0);assertEq(ended.effects[1].id,0);}
        }
        Rooms.Rating memory classic=game.ratingOf(vm.addr(A),0);Rooms.Rating memory chaos=game.ratingOf(vm.addr(A),1);assertEq(classic.elo,1032);assertEq(chaos.elo,1032);
    }
    function testTwoGamesFinishWithinPublicationBudgetAndEloOnce() public {
        vm.record();start(1,1,true,A,B,KA,KB);start(2,0,false,0xe0,0xf0,address(0xe),address(0xf));
        vm.roll(block.number+20);game.tick(1);game.tick(2);vm.prank(KB);game.concede(1);vm.prank(address(0xf));game.concede(2);
        (,bytes32[] memory writes)=vm.accesses(address(game));uint256 unique;
        for(uint256 i;i<writes.length;i++){bool seen;for(uint256 j;j<i;j++)if(writes[i]==writes[j])seen=true;if(!seen)unique++;}
        emit log_named_uint("Two games, bindings and final results: slots",unique);assertLe(unique,64);assertEq(game.activeCount(),0);
        vm.prank(KB);vm.expectRevert();game.concede(1);assertEq(game.ratingOf(vm.addr(A),1).played,1);assertEq(game.ratingOf(vm.addr(0xe0),0).played,0);
    }
    function testLatePressureUsesRealRallyAndNeverBlocksBall() public {
        start(1,1,false,A,B,KA,KB);game.tick(1);T.State memory s=state(1);
        ChaosGameFlow.LivePressure memory p=ChaosGameFlow.LivePressure(1,1,s.seed,1,0.003 ether,0,123,bytes32(uint256(1)),uint64(block.timestamp+20));
        game.submitLivePressure(p,sig(game.pressureDigest(p),BR));assertEq(state(1).bettingA,96000000);
        s.balls[0].x=1029e12;s.balls[0].y=10e12;s.balls[0].vx=1000e6;s.balls[0].vy=0;game.fixture(1,s);
        vm.roll(block.number+1);game.tick(1);s=state(1);assertEq(s.score.rally,2);assertEq(s.bettingA,72000000);assertGt(s.t,1000);
        game.submitLivePressure(p,sig(game.pressureDigest(p),BR));assertEq(state(1).bettingA,72000000);
    }
    function testTwoChaosAllWordsPressureAndRankedResultsBudget() public {
        vm.record();start(1,1,true,A,B,KA,KB);start(2,1,true,0xe0,0xf0,address(0xe),address(0xf));
        for(uint256 id=1;id<=2;id++){
            T.State memory s=state(id);(s.effects,)=e.announce(s.effects,21,0,0,1,0);(s.effects,)=e.announce(s.effects,17,1,1,2,0);
            s.t=1000000;s.nextForce=s.t;s=d.prepare(s);game.fixture(id,s);
            ChaosGameFlow.LivePressure memory p=ChaosGameFlow.LivePressure(id,1,s.seed,1,.003 ether,.001 ether,123,bytes32(id),uint64(block.timestamp+20));
            game.submitLivePressure(p,sig(game.pressureDigest(p),BR));
        }
        vm.roll(block.number+120);game.tick(1);game.tick(2);vm.prank(KB);game.concede(1);vm.prank(address(0xf));game.concede(2);
        (,bytes32[] memory writes)=vm.accesses(address(game));uint256 unique;
        for(uint256 i;i<writes.length;i++){bool seen;for(uint256 j;j<i;j++)if(writes[i]==writes[j])seen=true;if(!seen)unique++;}
        emit log_named_uint("Two Chaos, all state words, pressure and ranked results: slots",unique);assertLe(unique,64);
    }
    function testMissingRandomnessKeepsGameMovingAndRequestFixedAcrossPoints() public {
        start(1,1,false,A,B,KA,KB);game.tick(1);(,uint256 q,,)=raw(1);assertGt(uint64(q),0);
        vm.roll(block.number+1500);game.tick(1);(,uint256 afterQ,,)=raw(1);assertEq(afterQ,q);assertGt(state(1).t,0);
        vm.expectRevert();game.submitRandomness(1,q+1,new bytes(64));vm.expectRevert();game.submitRandomness(1,q,new bytes(64));
        epoch(2);vm.expectRevert();game.submitRandomness(1,q,new bytes(64));
    }
    function testFutureProofAnnouncementReplayAndSecondEpoch() public {
        uint64 round=20594892;uint64 published=1727521075+(round-1)*3;
        // Move the whole fixture's genesis before the pinned vector rather than
        // overriding the request. The root must choose this future round itself.
        vm.warp(published-9);vm.chainId(10143);
        game=new ChaosGameHarness(IInterludeHub(HUB),vm.addr(AD),vm.addr(BR),module);epoch(1);vm.chainId(4242);
        start(1,1,false,A,B,KA,KB);game.tick(1);(,uint256 q,,)=raw(1);assertEq(uint64(q),round);
        bytes memory proof=hex"1a8eb35e5dbdfe0e1aa1bda789444774adde84b2d5402468b29bb945ea190c6d105b63491744552e8fe5710764baaed371784f1593ce279c56c60b9268f50f90";
        vm.warp(published);vm.roll(block.number+900);game.submitRandomness(1,q,proof);
        (,,uint256 draw,)=raw(1);assertGe(uint8(draw),1);assertLe(uint8(draw),24);
        assertEq(state(1).effects[0].id,0);vm.expectRevert();game.submitRandomness(1,q,proof);
        vm.roll(block.number+100);game.tick(1);T.State memory s=state(1);assertEq(s.effects[0].id,uint8(draw));assertEq(s.effects[0].startsAt,11000);
        (,uint256 next,,)=raw(1);assertEq(uint32(next>>96),2);assertGt(uint64(next),round);
        assertEq(uint32(next>>128),10000+uint16(draw>>48));vm.expectRevert();game.submitRandomness(1,q,proof);
    }
    function testJackpotSeventhPointRootResultAndSummary() public {
        start(1,1,true,A,B,KA,KB);T.State memory s=state(1);s.score.a=6;
        (s.effects,)=e.announce(s.effects,22,0,0,1,0);s.t=1000000;s.nextForce=s.t;
        s.balls[0].x=1029e12;s.balls[0].y=10e12;s.balls[0].vx=1000e6;s.balls[0].vy=0;game.fixture(1,s);
        vm.roll(201);game.tick(1);(,,uint256 phase,,,,address winner,,,,,,)=game.getSnapshot(1);
        assertEq(phase,3);assertEq(winner,vm.addr(A));assertEq(state(1).score.a,7);assertEq(game.activeCount(),0);assertEq(game.ratingOf(vm.addr(A),1).played,1);
    }
}
