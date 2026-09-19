// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {HouseController as H} from "../HouseController.sol";

/// Eight deterministic policies. All observations are supplied public game state;
/// neither a future beacon nor any private player input is accessible here.
contract HousePolicies {
    struct Memory {uint64 nextDecision;int8 held;int256 meanVy;uint16 samples;int256 lastTarget;}
    struct View {
        H.Ball[] balls;uint8 side;uint64 t;int256 paddle;int256 half;int256 opponent;
        bytes32 seed;uint32 rally;uint64 tournament;
    }
    struct Tuning {uint32 reactionUs;int256 error;int256 deadZone;}
    int256 private constant P=1e12;
    function tuning(uint8 style) public pure returns(Tuning memory){
        require(style<8,"house style");
        if(style==0)return Tuning(280000,58*P,17*P); // NOVA
        if(style==1)return Tuning(160000,25*P,10*P); // PULSE
        if(style==2)return Tuning(85000,8*P,6*P); // ONYX
        if(style==3)return Tuning(120000,12*P,7*P); // VECTOR
        if(style==4)return Tuning(110000,20*P,9*P); // DRIFT
        if(style==5)return Tuning(140000,15*P,8*P); // ECHO
        if(style==6)return Tuning(130000,42*P,8*P); // GLITCH
        return Tuning(105000,10*P,5*P); // VIPER
    }
    function _error(View memory v,uint8 style,int256 span,uint64 step) private pure returns(int256){
        return int256(uint256(keccak256(abi.encode(v.seed,v.rally,v.side,v.tournament,style,step)))%uint256(2*span+1))-span;
    }
    function _observedBall(View memory v) private pure returns(uint256 chosen){
        uint256 soonest=type(uint256).max;int256 plane=v.side==0?40*P:984*P;
        for(uint256 i;i<v.balls.length;i++){
            H.Ball memory b=v.balls[i];int256 distance=plane-b.x;
            if(b.vx==0||distance!=0&&(distance<0)!=(b.vx<0))continue;
            uint256 arrival=uint256(distance<0?-distance:distance)/uint256(b.vx<0?-b.vx:b.vx);
            if(arrival<soonest){soonest=arrival;chosen=i;}
        }
    }
    function decide(uint8 style,View memory v,Memory memory brain) external pure returns(int8,Memory memory){
        Tuning memory t=tuning(style);require(v.side<2&&v.half>0&&v.half<=120*P&&v.balls.length<=2,"policy view");
        if(v.t<brain.nextDecision)return(brain.held,brain);
        brain.nextDecision=(v.t/t.reactionUs+1)*t.reactionUs;
        (int256 target,bool incoming,uint256 arrival)=H.aim(v.balls,v.side,style==0?0:1);
        if(style==4&&!incoming){
            // Return across the central band instead of camping at one coordinate.
            int256 sweep=int256(uint256((v.t/10_000)%240));if(sweep>120)sweep=240-sweep;
            target=228*P+sweep*P;
        }
        if(style==5&&v.balls.length>0){
            // A time-sampled moving average survives decisions within this match.
            // Recent observations, not an unrevealed Chaos effect, change its lead.
            H.Ball memory ball=v.balls[_observedBall(v)];int256 observed=ball.vy;
            brain.meanVy=brain.samples==0?observed:(3*brain.meanVy+observed)/4;
            if(brain.samples<type(uint16).max)brain.samples++;
            if(incoming&&arrival<1_000_000){
                int256 predicted=ball.y+(brain.meanVy+3*observed)/4*int256(arrival);
                target=H.reflect(predicted);
            }
        }
        if(style==3&&incoming&&arrival>600_000){
            // VECTOR commits to the complete reflected intercept earlier; ONYX
            // also predicts, but reacts faster and carries a narrower aim error.
            target=H.reflect(target);
        }
        if(style==7&&incoming){
            int256 edge=v.half*3/5;target+=v.opponent<288*P?edge:-edge;
        }
        uint64 phase=style==6?uint64(v.t/t.reactionUs):0;
        target+=_error(v,style,t.error,phase);
        if(target<v.half)target=v.half;if(target>576*P-v.half)target=576*P-v.half;
        brain.lastTarget=target;
        int256 gap=target-v.paddle;brain.held=gap>t.deadZone?int8(1):gap< -t.deadZone?int8(-1):int8(0);
        return(brain.held,brain);
    }
    function pack(Memory calldata brain) external pure returns(uint256){
        require(brain.nextDecision<1<<40&&brain.held>=-1&&brain.held<=1&&brain.meanVy>=type(int48).min&&brain.meanVy<=type(int48).max
            &&brain.lastTarget>=0&&brain.lastTarget<=576*P,"policy memory range");
        return uint256(brain.nextDecision)|(uint256(uint8(brain.held+1))<<40)|(uint256(uint48(int48(brain.meanVy)))<<42)
            |(uint256(brain.samples)<<90)|(uint256(uint56(uint256(brain.lastTarget)))<<106);
    }
    function unpack(uint256 word) external pure returns(Memory memory){
        if(word==0)return Memory(0,0,0,0,0);
        return Memory(uint64(uint40(word)),int8(uint8(word>>40&3))-1,int48(uint48(word>>42)),uint16(word>>90),int256(uint256(uint56(word>>106))));
    }
}
