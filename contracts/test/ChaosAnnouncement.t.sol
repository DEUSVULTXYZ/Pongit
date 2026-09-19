// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosGameFlowGasTest} from "./ChaosGameFlowGas.t.sol";
import {ChaosGameFlow} from "../src/chaos/ChaosGameFlow.sol";
import {ChaosEngine} from "../src/chaos/ChaosEngine.sol";
import {ChaosState as T} from "../src/chaos/ChaosState.sol";
import {ChaosEffects as E} from "../src/chaos/ChaosEffects.sol";

contract ChaosAnnouncementTest is ChaosGameFlowGasTest {
    function pending() private view returns(uint256 q,uint256 draw){
        (,,q,draw)=abi.decode(game.chaosState(ID),(ChaosGameFlow.Header,uint256[8],uint256,uint256));
    }
    function testOccupiedSlotsRetryOnAbsoluteGridNotCallerEndpoint() public {
        T.State memory s=rally();
        s.effects[0]=E.Effect(1,0,0,1,11000,12155,0);
        s.effects[1]=E.Effect(2,1,0,2,11000,18000,0);
        place(s);(uint256 q,)=pending();
        q=(q&~(uint256(type(uint32).max)<<128))|(uint256(12000)<<128);
        game.drawFixture(ID,q,uint256(7)|(uint256(8000)<<48));
        uint256 snap=vm.snapshotState();
        tickAt(400,30_000_000);bytes32 expected=keccak256(abi.encode(words()));
        assertEq(live().effects[0].startsAt,13200,"announcement 12.2 s, activation 13.2 s");
        assertTrue(vm.revertToState(snap));
        tickAt(160,COMMAND_GAS);assertEq(live().effects[0].id,0,"expired slot is free, but 12.16 s is not an announcement boundary");
        tickAt(170,COMMAND_GAS);assertEq(live().effects[0].id,0);
        tickAt(400,COMMAND_GAS);assertEq(keccak256(abi.encode(words())),expected);
    }
    function testLateProofCannotActivateAtPartiallyCaughtUpClock() public {
        place(grid(3));(uint256 q,)=pending();bytes memory proof=new bytes(64);
        uint256 draw=uint256(7)|(uint256(8000)<<48);
        vm.mockCall(address(module),abi.encodeCall(ChaosEngine.prove,(address(game),ID,q,proof)),abi.encode(draw,bytes32(uint256(5))));
        roll(blockAt(3000));uint256 snap=vm.snapshotState();
        game.submitRandomness{gas:COMMAND_GAS}(ID,q,proof);
        (,uint256 stored)=pending();assertEq(stored,0);assertLt(gameTime(),T0+3_000_000);
        for(uint256 i;i<100&&stored==0;i++){
            game.submitRandomness{gas:COMMAND_GAS}(ID,q,proof);(,stored)=pending();
        }
        assertEq(stored,draw);assertEq(gameTime(),T0+3_000_000);
        bytes32 expected=keccak256(abi.encode(words()));
        assertTrue(vm.revertToState(snap));
        game.submitRandomness{gas:200_000_000}(ID,q,proof);
        (,stored)=pending();assertEq(stored,draw);assertEq(keccak256(abi.encode(words())),expected);
    }
}
