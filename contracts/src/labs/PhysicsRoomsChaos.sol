// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PhysicsV2} from "../v2/PhysicsV2.sol";

/// @notice Chaos physics for the next rooms deployment, not wired to the live arena.
/// Paid totals must come from the future verified market adapter, never player input.
library PhysicsRoomsChaos {
    function speed(PhysicsV2.State memory s) private pure returns(PhysicsV2.State memory) {
        s.vx=s.vx*3/2; s.vy=s.vy*3/2; return s;
    }
    function initial(bytes32 seed) internal pure returns(PhysicsV2.State memory) {
        return speed(PhysicsV2.initial(seed,1));
    }
    function resume(PhysicsV2.State memory s,uint64 at,uint256 paidA,uint256 paidB) internal pure returns(PhysicsV2.State memory) {
        require(s.mode==1 && !s.finished,"chaos state");
        return speed(PhysicsV2.resume(s,at,paidA,paidB));
    }
    function advance(PhysicsV2.State memory s,uint64 target,uint256 limit) internal pure returns(PhysicsV2.State memory,bool) {
        require(s.mode==1 && target>=s.t,"chaos clock");
        for(uint256 i;i<limit;i++) {
            // Stop at the boundary: the next rally needs a fresh, verified pressure snapshot.
            if(s.finished || s.awaitingServe) return(s,true);
            PhysicsV2.Event memory e=PhysicsV2.next(s);
            if(e.at>target) return PhysicsV2.advance(s,target,1);
            int256 previous=s.vx;
            (s,)=PhysicsV2.advance(s,e.at,1);
            if((e.kind==3 || e.kind==4) && s.vx!=previous) {
                int256 v=(s.vx<0?-s.vx:s.vx)*110/100;
                s.vx=s.vx<0?-v:v; s.vy=s.vy<0?-(v/2):v/2;
            }
        }
        return(s,s.finished || s.awaitingServe || s.t==target && PhysicsV2.next(s).at>target);
    }
}
contract PhysicsRoomsChaosHarness {
    function initial(bytes32 seed) external pure returns(PhysicsV2.State memory) {return PhysicsRoomsChaos.initial(seed);}
    function advance(PhysicsV2.State memory s,uint64 target,uint256 limit) external pure returns(PhysicsV2.State memory,bool) {return PhysicsRoomsChaos.advance(s,target,limit);}
    function resume(PhysicsV2.State memory s,uint64 at,uint256 paidA,uint256 paidB) external pure returns(PhysicsV2.State memory) {return PhysicsRoomsChaos.resume(s,at,paidA,paidB);}
}
