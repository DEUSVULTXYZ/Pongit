// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReusableArenaStorage as S} from "../../independent/ReusableArenaStorage.sol";
import {PhysicsV2} from "../../v2/PhysicsV2.sol";
import {RoomsState} from "../../labs/RoomsState.sol";
import {ChaosEngine} from "../../chaos/ChaosEngine.sol";
import {AgentFairPause as Fair} from "./AgentFairPause.sol";

/// Atomic reads and compact notifications share the same authoritative clock.
/// Kept outside the game root/module so every deployed runtime fits its budget.
library ReusableAgentView {
    uint256 private constant SLOT=1;
    event Snapshot(uint256 indexed id,uint256 version,uint256 status,bytes state);
    event Synchronization(uint256 indexed id,uint256 version,Fair.View pause,uint256 brainA,uint256 brainB,uint256 decision,uint256 pendingControls,uint256 clock,uint256 controllers);
    function phase(mapping(bytes32=>uint256) storage w) internal view returns(uint8){return uint8(S.get(w,0)>>161&7);}
    function packed(mapping(bytes32=>uint256) storage w) internal view returns(uint256[8] memory p){for(uint256 i;i<8;i++)p[i]=S.get(w,21+i);}
    function encodedState(mapping(bytes32=>uint256) storage w,ChaosEngine kernel,uint256 id,bool ephemeral) public view returns(bytes memory){
        S.assertMatch(w,S.get(w,31),id);
        return abi.encode(snapshot(w,kernel,ephemeral),packed(w),S.get(w,29),S.get(w,30));
    }
    function synchronization(mapping(bytes32=>uint256) storage w) external view returns(Fair.View memory,uint256,uint256,uint256,uint256){
        return(Fair.inspect(w),S.get(w,51),S.get(w,52),S.get(w,53),S.get(w,0)>>176);
    }
    function synchronizedState(mapping(bytes32=>uint256) storage w,ChaosEngine kernel,uint256 id,bool ephemeral) external view returns(bytes memory){
        S.assertMatch(w,S.get(w,31),id);
        return abi.encode(snapshot(w,kernel,ephemeral),packed(w),S.get(w,29),S.get(w,30),
            Fair.inspect(w),S.get(w,51),S.get(w,52),S.get(w,53),S.get(w,0)>>176,S.get(w,66)|(uint256(uint64(S.get(w,63)))<<16));
    }
    function state(mapping(bytes32=>uint256) storage w,ChaosEngine kernel) public view returns(PhysicsV2.State memory){
        if(S.get(w,0)>>168&1==0)return RoomsState.state(w,SLOT);
        return kernel.codec().legacy(packed(w),bytes32(S.get(w,3)),S.get(w,8),phase(w)>=3);
    }
    function publish(mapping(bytes32=>uint256) storage w,ChaosEngine kernel) public {
        uint256 times=S.get(w,2);require(uint64(times>>128)<type(uint64).max,"revision overflow");
        times+=uint256(1)<<128;S.set(w,2,times);
        bytes memory encoded=S.get(w,0)>>168&1==0?abi.encode(state(w,kernel)):abi.encode(uint8(6),S.get(w,8),packed(w));
        emit Snapshot(S.get(w,37),uint64(times>>128),phase(w),encoded);
        if(Fair.rules(w)>=16){
            Fair.View memory paused=Fair.inspect(w);
            emit Synchronization(S.get(w,37),uint64(times>>128),paused,S.get(w,51),S.get(w,52),S.get(w,53),S.get(w,0)>>176,notificationClock(w,times,paused),S.get(w,66)|(uint256(uint64(S.get(w,63)))<<16));
        }
    }
    function notificationClock(mapping(bytes32=>uint256) storage w,uint256 times,Fair.View memory paused) private view returns(uint256 clock){
        // Exact scalar layouts used by the Classic and Chaos codecs. A compact
        // notification must not decode and ABI-roundtrip the whole game merely
        // to read this clock. Keep its semantics identical to RoomsState.snapshot.
        clock=S.get(w,0)>>168&1==0?uint64(S.get(w,7)>>128):uint64(S.get(w,27)>>112);
        if(phase(w)==2&&block.number>=uint64(times)){
            uint256 elapsed=uint64(times>>192)+(block.number-uint64(times))*10_000;
            if(elapsed>clock)clock=elapsed;
        }
        if(paused.human!=0&&clock>paused.limitUs)clock=paused.limitUs;
    }
    function snapshot(mapping(bytes32=>uint256) storage w,ChaosEngine kernel,bool ephemeral) public view returns(RoomsState.Header memory h){
        h=abi.decode(RoomsState.snapshot(w,SLOT,ephemeral,state(w,kernel)),(RoomsState.Header));h.id=S.get(w,37);
        Fair.View memory paused=Fair.inspect(w);
        if(paused.human!=0&&h.clock>paused.limitUs)h.clock=paused.limitUs;
    }
}
