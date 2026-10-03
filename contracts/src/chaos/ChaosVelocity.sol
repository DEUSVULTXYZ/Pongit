// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosState as T} from "./ChaosState.sol";
import {ChaosGeometry as G} from "./ChaosGeometry.sol";

/// Pure velocity calculation shared by movement and contact search. Keeping it
/// local avoids an ABI round trip of the whole game at every force-grid step.
library ChaosVelocity {
    function has(T.State memory s,uint8 id) private pure returns(bool){
        for(uint8 i;i<2;i++)if(s.effects[i].id==id&&s.t/1000>=s.effects[i].startsAt&&s.t/1000<s.effects[i].expiresAt)return true;return false;
    }
    function velocity(T.State memory s,uint8 ball) internal pure returns(int256 vx,int256 vy){
        T.Ball memory b=s.balls[ball];uint256 n=b.powerN;uint256 d=b.powerD;
        if(d==0||n==0)revert G.NumericRange();
        if(has(s,23)){n*=5;d*=4;}if(b.warp&&has(s,15)){n*=6;d*=5;}
        vx=b.vx*int256(n)/int256(d);vy=b.vy*int256(n)/int256(d);G.check(b.x,b.y,vx,vy);
    }
}
