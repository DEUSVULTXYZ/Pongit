// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PhysicsV2} from "../v2/PhysicsV2.sol";

/// Linked codec for the existing rooms storage and snapshot ABI. This module
/// changes neither namespaces nor units; historical decoders remain compatible.
library RoomsState {
    event Snapshot(uint256 indexed id,uint256 version,uint256 status,bytes state);
    function key(uint256 id,uint256 field) private view returns(bytes32){return keccak256(abi.encode(address(this),uint256(0),id,field));}
    function state(mapping(bytes32=>uint256) storage w,uint256 id) external view returns(PhysicsV2.State memory s){
        uint256 xy=w[key(id,4)];uint256 p=w[key(id,7)];uint256 c=w[key(id,8)];uint256 chaos=w[key(id,13)];uint256 meta=w[key(id,0)];
        s.x=int128(uint128(xy));s.y=int128(uint128(xy>>128));s.vx=int256(w[key(id,5)]);s.vy=int256(w[key(id,6)]);
        s.left=int256(uint256(uint64(p)));s.right=int256(uint256(uint64(p>>64)));s.leftDir=int8(uint8(c&3))-1;s.rightDir=int8(uint8(c>>2&3))-1;
        s.t=uint64(p>>128);s.scoreA=uint8(c>>4&15);s.scoreB=uint8(c>>8&15);s.seed=bytes32(w[key(id,3)]);s.finished=(meta>>161&7)>=3;
        s.mode=uint8(meta>>168&1);s.halfA=int256(uint256(uint32(chaos)));s.halfB=int256(uint256(uint32(chaos>>32)));
        s.awaitingServe=chaos>>128&1==1;s.resumeAt=uint64(chaos>>64);
    }
    function save(mapping(bytes32=>uint256) storage w,uint256 id,PhysicsV2.State memory s) external {
        w[key(id,13)]=uint32(uint256(s.halfA))|(uint256(uint32(uint256(s.halfB)))<<32)|(uint256(s.resumeAt)<<64)|(s.awaitingServe?uint256(1)<<128:0);
        require(s.x>=type(int128).min&&s.x<=type(int128).max&&s.y>=type(int128).min&&s.y<=type(int128).max);
        w[key(id,4)]=uint128(int128(s.x))|(uint256(uint128(int128(s.y)))<<128);w[key(id,5)]=uint256(s.vx);w[key(id,6)]=uint256(s.vy);
        w[key(id,7)]=uint64(uint256(s.left))|(uint256(uint64(uint256(s.right)))<<64)|(uint256(s.t)<<128);
        w[key(id,8)]=(w[key(id,8)]&~uint256(65535))|uint8(s.leftDir+1)|(uint256(uint8(s.rightDir+1))<<2)|(uint256(s.scoreA)<<4)|(uint256(s.scoreB)<<8);
    }
    function publish(mapping(bytes32=>uint256) storage w,uint256 id,PhysicsV2.State memory s) external {
        uint256 times=w[key(id,2)];require(uint64(times>>128)<type(uint64).max,"revision overflow");times+=uint256(1)<<128;w[key(id,2)]=times;
        emit Snapshot(id,uint64(times>>128),w[key(id,0)]>>161&7,abi.encode(s));
    }
    struct Header {uint256 id;uint256 revision;uint256 phase;address a;address b;address target;address winner;uint256 head;uint256 clock;uint256 nonceA;uint256 nonceB;uint256 deadline;PhysicsV2.State state;}
    function snapshot(mapping(bytes32=>uint256) storage w,uint256 id,bool ephemeral,PhysicsV2.State memory s) external view returns(bytes memory){
        uint256 m=w[key(id,0)];uint256 t=w[key(id,2)];uint256 c=w[key(id,8)];uint256 phase=m>>161&7;uint256 clock=s.t;
        if(phase==2&&ephemeral&&block.number>=uint64(t)){uint256 elapsed=uint64(t>>192)+(block.number-uint64(t))*10_000;if(elapsed>clock)clock=elapsed;}
        address a=address(uint160(m));address b=address(uint160(w[key(id,1)]));uint256 winner=m>>166&3;
        Header memory h=Header(id,uint64(t>>128),phase,a,b,b,winner==1?a:winner==2?b:address(0),block.number,clock,uint64(c>>16),uint64(c>>80),uint64(t>>64),s);
        return abi.encode(h);
    }
}
