// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {SynchronizedAgentArenaTest} from "./SynchronizedAgentArena.t.sol";
import {RoomsState} from "../src/labs/RoomsState.sol";

/// Reproducible local execution cost, not hosted latency or engine clock proof.
contract AgentTickWorkTest is SynchronizedAgentArenaTest {
    function sample(uint8 mode,bool wind) internal {
        admit(1,mode,false,8,true);start(1,false);
        if(wind){
            // Test-only injection of an already announced Solar Wind. Production
            // activation still requires the committed future beacon proof.
            bytes32 key=keccak256(abi.encode(address(arena),uint256(0),uint256(1),uint256(25)));
            bytes32 slot=keccak256(abi.encode(key,uint256(0)));
            vm.store(address(arena),slot,bytes32(uint256(17)|(uint256(1)<<16)|(uint256(1)<<24)|(uint256(8000)<<88)));
            (,uint256[8] memory packed,,)=abi.decode(arena.chaosState(1),(RoomsState.Header,uint256[8],uint256,uint256));
            assertEq(uint8(packed[4]),17);
        }
        uint256 used;
        for(uint256 i;i<20;i++){
            vm.roll(vm.getBlockNumber()+30);
            uint256 before_=gasleft();arena.tick(1,1);used+=before_-gasleft();
        }
        assertEq(arena.getSnapshot(1).state.t,6_000_000);
        emit log_named_uint("twenty ticks gas",used);
        emit log_named_bytes32("physics digest",keccak256(arena.chaosState(1)));
    }
    function testTickWorkClassic() public {sample(0,false);}
    function testTickWorkChaos() public {sample(1,false);}
    function testTickWorkChaosWind() public {sample(1,true);}
}
