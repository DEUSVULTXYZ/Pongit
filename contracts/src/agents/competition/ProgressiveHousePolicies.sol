// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {HousePolicies} from "./HousePolicies.sol";
import {HouseController as H} from "../HouseController.sol";

/// A new immutable controller, never a rewrite of a running tournament policy.
/// Difficulty is monotonic; style indices retain their historical identities.
contract ProgressiveHousePolicies is HousePolicies {
    int256 private constant U=1e12;
    function difficulty(uint8 style) public pure returns(uint8){
        require(style<8,"house style");
        // NOVA, GLITCH, DRIFT, PULSE, ECHO, VECTOR, VIPER, ONYX.
        if(style==0)return 0;if(style==6)return 1;if(style==4)return 2;
        if(style==1)return 3;if(style==5)return 4;if(style==3)return 5;
        if(style==7)return 6;return 7;
    }
    function mistakePercent(uint8 style) public pure returns(uint8){return 55-7*difficulty(style);}
    function tuning(uint8 style) public pure override returns(Tuning memory){
        uint8 level=difficulty(style);
        return Tuning(uint32(450000-50000*uint256(level)),int256(18-2*uint256(level))*U,int256(14-uint256(level))*U);
    }
    function decide(uint8 style,View memory v,Memory memory brain) public pure override returns(int8,Memory memory){
        Tuning memory tune=tuning(style);
        require(v.side<2&&v.half>0&&v.half<=120*U&&v.balls.length<=2,"policy view");
        if(v.t<brain.nextDecision)return(brain.held,brain);
        brain.nextDecision=(v.t/tune.reactionUs+1)*tune.reactionUs;
        uint8 level=difficulty(style);
        (int256 target,bool incoming,uint256 arrival)=H.aim(v.balls,v.side,1);
        uint256 chosen;uint256 best=type(uint256).max;int256 plane=v.side==0?40*U:984*U;
        for(uint256 i;i<v.balls.length;i++){
            H.Ball memory b=v.balls[i];int256 d=plane-b.x;
            if(b.vx==0||d!=0&&(d<0)!=(b.vx<0))continue;
            uint256 eta=uint256(d<0?-d:d)/uint256(b.vx<0?-b.vx:b.vx);
            if(eta<best){best=eta;chosen=i;}
        }
        if(incoming){
            H.Ball memory ball=v.balls[chosen];
            // Rookie follows what it can see nearby, not a perfect wall-bounce
            // solution several seconds in advance. The horizon grows linearly.
            uint256 horizon=250000+150000*uint256(level);
            if(arrival>horizon)target=H.reflect(ball.y+ball.vy*int256(horizon));
            if(style==5){
                brain.meanVy=brain.samples==0?ball.vy:(3*brain.meanVy+ball.vy)/4;
                if(brain.samples<type(uint16).max)brain.samples++;
                // A small bounded adaptation preserves ECHO's observed-history
                // style without granting a longer horizon than its level.
                int256 lead=(brain.meanVy-ball.vy)*int256(arrival<horizon?arrival:horizon)/8;
                if(lead>6*U)lead=6*U;if(lead< -6*U)lead= -6*U;target+=lead;
            }
        }else if(style==4){
            int256 sweep=int256(uint256((v.t/10000)%120));if(sweep>60)sweep=120-sweep;
            target=258*U+sweep*U;
        }
        // One deterministic error decision per rally, using public state only.
        // Shared draws across levels make their mistake sets strictly nested.
        uint256 draw=uint256(keccak256(abi.encode(v.seed,v.rally,v.side,v.tournament)));
        if(incoming&&draw%100<mistakePercent(style)){
            // Aim visibly off target, toward room inside the court. Never
            // change the paddle's speed, collision box, ball or result.
            target+=target<288*U?110*U:-110*U;
        }else if(style==7&&incoming){target+=v.opponent<288*U?12*U:-12*U;}
        uint256 noise=style==6?uint256(keccak256(abi.encode(draw,v.t/tune.reactionUs))):draw>>16;
        target+=int256(noise%uint256(2*tune.error+1))-tune.error;
        if(target<v.half)target=v.half;if(target>576*U-v.half)target=576*U-v.half;
        brain.lastTarget=target;int256 gap=target-v.paddle;
        brain.held=gap>tune.deadZone?int8(1):gap< -tune.deadZone?int8(-1):int8(0);
        return(brain.held,brain);
    }
}
