// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {StrategyCode} from "../src/agents/competition/StrategyCode.sol";
import {TrackerStrategy} from "../src/agents/examples/TrackerStrategy.sol";
import {IPongStrategy} from "../src/agents/IPongStrategy.sol";

contract StrategyCodeCheck {function check(address at) external view returns(bytes32){return StrategyCode.verify(at);}}
contract StrategyQualificationCodeTest is Test {
    StrategyCodeCheck gate=new StrategyCodeCheck();
    function testActualCompiledTrackerIsImmutableAndSteersOnPublicView() public {
        // Default artifacts deliberately retain their historical build settings.
        // The release gate runs this test with FOUNDRY_PROFILE=strategies.
        if(keccak256(bytes(vm.envOr("FOUNDRY_PROFILE",string("default"))))!=keccak256("strategies")){vm.skip(true);return;}
        TrackerStrategy tracker=new TrackerStrategy(address(this),4);
        assertEq(gate.check(address(tracker)),address(tracker).codehash);
        IPongStrategy.PongView memory v;v.side=0;v.paddle=100e12;v.balls=new IPongStrategy.PongBall[](1);
        v.balls[0]=IPongStrategy.PongBall(512e12,400e12,-360e6,0);
        assertEq(tracker.decide(v),1);
        v.paddle=500e12;assertEq(tracker.decide(v),-1);
        v.paddle=400e12;assertEq(tracker.decide(v),0);
    }
    function testRuntimeDependenciesAreRejectedEvenBehindUnexecutedBranches() public {
        address sample=address(0xbeef);
        bytes memory forbidden=hex"3132333a3b3c3f404142434445464748494a4b4c4d4e4f54555a5c5da0a1a2a3a4f0f1f2f4f5faff";
        for(uint256 i;i<forbidden.length;i++){
            vm.etch(sample,abi.encodePacked(hex"60006000f3",forbidden[i]));
            vm.expectRevert(abi.encodeWithSelector(StrategyCode.UnsupportedCode.selector,uint256(5),uint8(forbidden[i])));gate.check(sample);
        }
        // A byte resembling an opcode inside a PUSH is an immutable constant.
        vm.etch(sample,hex"605460005260206000f3");assertEq(gate.check(sample),sample.codehash);
    }
}
