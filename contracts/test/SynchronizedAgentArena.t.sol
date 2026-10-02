// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableAgentArenaTest,ReusableAgentHarness} from "./ReusableAgentArena.t.sol";
import {IInterludeHub} from "../vendor/interlude/interfaces/IInterludeHub.sol";
import {HousePolicies} from "../src/agents/competition/HousePolicies.sol";
import {ChaosEngine} from "../src/chaos/ChaosEngine.sol";
import {PublishedResultVerifier} from "../src/independent/PublishedResultVerifier.sol";
import {AgentFairPause as Fair} from "../src/agents/competition/AgentFairPause.sol";
import {ReusableAgentView as View} from "../src/agents/competition/ReusableAgentView.sol";
import {Vm} from "forge-std/Vm.sol";

contract SynchronizedHarness is ReusableAgentHarness {
    constructor(IInterludeHub h,address p,address bridge,HousePolicies policies_,ChaosEngine k,PublishedResultVerifier v)
        ReusableAgentHarness(h,p,bridge,policies_,k,v){}
    function RULES_VERSION() public pure override returns(uint256){return 16;}
    function publishForTest() external {View.publish(words,kernel);}
}

contract SynchronizedAgentArenaTest is ReusableAgentArenaTest {
    function setUp() public override {
        super.setUp();vm.chainId(10143);
        arena=new SynchronizedHarness(IInterludeHub(address(hub)),address(this),vm.addr(BRIDGE),policies,kernel,verifier);
        registeredArena[address(arena)]=true;arena.openEngine();vm.chainId(4242);
    }
    function pulse() internal {vm.prank(vm.addr(1101));arena.heartbeat(1,1);}
    function resume() internal {vm.prank(vm.addr(1101));arena.resumeReady(1,1);}
    function testLostControlsFreezeBothModesEvenWhileBotTicksContinue() public {
        for(uint8 mode;mode<2;mode++){
            admit(1,mode,false,3,false);start(1,true);uint256 head=vm.getBlockNumber();
            vm.roll(head+20);pulse();vm.roll(head+80);arena.tick(1,1);
            assertEq(arena.getSnapshot(1).state.t,700_000);assertEq(arena.getSnapshot(1).clock,700_000);
            bytes32 frozen=keccak256(abi.encode(arena.getSnapshot(1).state));
            (,uint256 a,uint256 b,,)=arena.synchronization(1,1);
            for(uint256 i;i<20;i++){vm.roll(vm.getBlockNumber()+50);arena.tick(1,1);}
            assertEq(keccak256(abi.encode(arena.getSnapshot(1).state)),frozen);
            (Fair.View memory v,uint256 afterA,uint256 afterB,,)=arena.synchronization(1,1);
            assertEq(v.status,2);assertEq(afterA,a);assertEq(afterB,b);
            vm.roll(v.cancelBlock);arena.tick(1,1);
            assertEq(arena.publishedResult().match_.status,4);assertEq(arena.publishedResult().match_.winner,address(0));
            assertEq(arena.publishedResult().match_.elapsedUs,700_000);
        }
    }
    function testResumeRequiresHumanCountdownAndFreshHeartbeatsWithoutCatchup() public {
        admit(1,0,false,1,false);start(1,true);vm.roll(vm.getBlockNumber()+60);arena.tick(1,1);
        assertEq(arena.getSnapshot(1).state.t,500_000);
        vm.expectRevert("unbound or expired arcade key");arena.resumeReady(1,1);
        resume();(Fair.View memory v,,,,)=arena.synchronization(1,1);assertEq(v.status,3);
        for(uint256 i;i<14;i++){vm.roll(vm.getBlockNumber()+20);pulse();assertEq(arena.getSnapshot(1).state.t,500_000);}
        vm.roll(v.resumeBlock);pulse();assertEq(arena.getSnapshot(1).state.t,500_000);
        vm.roll(vm.getBlockNumber()+20);pulse();assertEq(arena.getSnapshot(1).state.t,700_000);
        (v,,,,)=arena.synchronization(1,1);assertEq(v.status,1);
    }
    function testLateHeartbeatsDoNotResumeOrExtendCancellation() public {
        admit(1,0,false,1,false);start(1,true);vm.roll(vm.getBlockNumber()+51);pulse();
        (Fair.View memory v,,,,)=arena.synchronization(1,1);uint256 cancel=v.cancelBlock;
        for(uint256 i;i<10;i++){vm.roll(vm.getBlockNumber()+100);pulse();}
        (v,,,,)=arena.synchronization(1,1);assertEq(v.status,2);assertEq(v.cancelBlock,cancel);
        vm.roll(cancel);pulse();assertEq(arena.getSnapshot(1).phase,4);
    }
    function testLostConnectionDuringResumeRequiresAnotherFullCountdown() public {
        admit(1,0,false,1,false);start(1,true);vm.roll(vm.getBlockNumber()+51);pulse();resume();
        (Fair.View memory before_,,,,)=arena.synchronization(1,1);
        vm.roll(before_.resumeBlock+1);pulse();
        (Fair.View memory after_,,,,)=arena.synchronization(1,1);
        assertEq(after_.status,2);assertEq(after_.resumeBlock,0);assertEq(after_.cancelBlock,before_.cancelBlock);
        assertEq(arena.getSnapshot(1).state.t,500_000);resume();
        (after_,,,,)=arena.synchronization(1,1);assertEq(after_.resumeBlock,vm.getBlockNumber()+300);
    }
    function testOnlyFriendlyHumanHouseGamesAreProtected() public {
        admit(1,0,false,1,true);start(1,false);(Fair.View memory v,,,,)=arena.synchronization(1,1);assertEq(v.status,0);
        vm.roll(vm.getBlockNumber()+100);arena.tick(1,1);assertEq(arena.getSnapshot(1).state.t,1_000_000);
    }
    function assertPublishedClock() internal returns(uint256 used){
        // Compare the compact notification with the complete historical codec.
        // No browser or transport assumption is involved in this equality.
        uint256 expected=arena.getSnapshot(1).clock;
        vm.recordLogs();uint256 beforeGas=gasleft();
        SynchronizedHarness(address(arena)).publishForTest();used=beforeGas-gasleft();
        Vm.Log[] memory logs=vm.getRecordedLogs();bool found;
        for(uint256 i;i<logs.length;i++)if(logs[i].emitter==address(arena)&&logs[i].topics[0]==keccak256("Synchronization(uint256,uint256,(uint8,uint8,uint64,uint64,uint64,uint64),uint256,uint256,uint256,uint256,uint256,uint256)")){
            uint256[13] memory data=abi.decode(logs[i].data,(uint256[13]));
            assertEq(data[11],expected,"notification clock differs from full state");found=true;
        }
        assertTrue(found,"missing synchronization notification");
    }
    function testPublishedClockMatchesAcrossBothModesAndPauseLifecycle() public {
        for(uint8 mode;mode<2;mode++){
            admit(1,mode,false,1,false);assertPublishedClock();
            start(1,true);uint256 origin=vm.getBlockNumber();assertPublishedClock();
            vm.roll(origin-1);assertPublishedClock();vm.roll(origin+20);pulse();assertPublishedClock();
            vm.roll(origin+80);arena.tick(1,1);assertPublishedClock();resume();assertPublishedClock();
            for(uint256 i;i<15;i++){vm.roll(vm.getBlockNumber()+20);pulse();assertPublishedClock();}
            vm.roll(vm.getBlockNumber()+60);arena.tick(1,1);assertPublishedClock();
            (Fair.View memory v,,,,)=arena.synchronization(1,1);
            vm.roll(v.cancelBlock);arena.tick(1,1);assertPublishedClock();
        }
    }
    function testPublishedClockClassicTournamentGas() public {
        admit(1,0,false,1,true);start(1,false);vm.roll(vm.getBlockNumber()+25);arena.tick(1,1);
        uint256 used=assertPublishedClock();emit log_named_uint("publish gas Classic",used);
        assertLt(used,35_000,"compact clock must not decode a full snapshot");
    }
    function testPublishedClockChaosTournamentGas() public {
        admit(1,1,false,1,true);start(1,false);vm.roll(vm.getBlockNumber()+25);arena.tick(1,1);
        uint256 used=assertPublishedClock();emit log_named_uint("publish gas Chaos",used);
        assertLt(used,30_000,"compact clock must not decode a full snapshot");
    }
}
