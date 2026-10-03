// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AgentSteer as S} from "../AgentSteer.sol";
import {HousePolicies as P} from "./HousePolicies.sol";
import {HousePolicyMemory as Memory} from "./HousePolicyMemory.sol";
import {AgentArenaTypes as A} from "./AgentArenaTypes.sol";
import {ChaosEngine} from "../../chaos/ChaosEngine.sol";
import {ChaosModifiers as M} from "../../chaos/ChaosModifiers.sol";
import {IPongStrategy} from "../IPongStrategy.sol";

library PoolSteer {
    function steer(mapping(bytes32=>uint256) storage w,A.Binding memory b,P policies,ChaosEngine kernel,uint64 target) external returns(uint64){
        uint64 nowUs=uint64(w[S._key(b.id,b.mode==0?7:27)]>>(b.mode==0?128:112));
        if(nowUs>=target)return target;
        // Decisions occur on the absolute 100 ms game grid. Partial catch-up and
        // small commands do not create additional strategy observations.
        uint64 next=(nowUs/100_000+1)*100_000;if(next>target)next=target;
        if(w[S._key(b.id,53)]==uint256(nowUs/100_000)+1)return next;
        w[S._key(b.id,53)]=uint256(nowUs/100_000)+1;
        if(b.mode==0)S._capLegacySpeed(w,b.id);else S._capSpeed(w,b.id);
        uint256 control=w[S._key(b.id,8)];M.Paddles memory ps;
        if(b.mode==1)ps=paddles(w,b.id,kernel,nowUs);
        for(uint8 side;side<2;side++){
            A.Controller memory controller=side==0?b.controlA:b.controlB;
            if(controller.codeHash==0)continue; // human, explicitly bound by pool
            S.Seat memory seat=b.mode==0?S._legacy(w,b.id,side):S._chaos(w,b.id,side);
            if(b.mode==1)seat.half=int256((side==0?ps.heightA:ps.heightB)*500_000);
            int8 direction;bool valid=true;uint256 prior=w[S._key(b.id,51+side)];
            if(controller.house!=0){
                direction=houseDecision(w,b,policies,seat,side,controller.house-1);
            }else{
                address strategy=side==0?b.a:b.b;require(strategy.codehash==controller.codeHash,"strategy code changed");
                IPongStrategy.PongView memory v=S._view(w,b.id,b.mode,side);v.half=seat.half;
                (direction,valid)=ask(strategy,v,int8(uint8((control>>(side*2))&3))-1);
            }
            uint256 shift=valid?192:224;uint256 count=uint32(prior>>shift);if(count<type(uint32).max)count++;
            uint256 counters=(prior>>192)<<192;counters=(counters&~(uint256(type(uint32).max)<<shift))|(count<<shift);
            w[S._key(b.id,51+side)]=(w[S._key(b.id,51+side)]&((uint256(1)<<192)-1))|counters;
            control=(control&~(uint256(3)<<(side*2)))|(uint256(uint8(direction+1))<<(side*2));
        }
        w[S._key(b.id,8)]=control;return next;
    }
    function houseDecision(mapping(bytes32=>uint256) storage w,A.Binding memory b,P policies,S.Seat memory seat,uint8 side,uint8 style)
        private returns(int8 direction)
    {
        P.View memory v=P.View(seat.balls,side,seat.nowUs,seat.position,seat.half,
            opponent(w,b.id,b.mode,side),bytes32(w[S._key(b.id,3)]),uint32(seat.rally),b.tournament);
        P.Memory memory brain=Memory.unpack(w[S._key(b.id,51+side)]);
        (direction,brain)=policies.decide(style,v,brain);
        w[S._key(b.id,51+side)]=Memory.pack(brain);
    }
    // Steering needs paddle modifiers, not a second decoding/copy of both balls,
    // collision history and score. Keep the same immutable modifier authority.
    function paddles(mapping(bytes32=>uint256) storage w,uint256 id,ChaosEngine kernel,uint64 nowUs)
        internal view returns(M.Paddles memory)
    {
        M.Effect[2] memory effects;
        for(uint8 i;i<2;i++){
            uint256 e=w[S._key(id,25+i)];
            effects[i]=M.Effect(uint8(e),uint8(e>>8),uint32(e>>56),uint32(e>>88),false);
        }
        uint256 meta=w[S._key(id,28)];
        return kernel.physics().dynamics().modifiers().calculate(uint32(meta>>101),uint32(meta>>133),effects,nowUs/1000);
    }
    function opponent(mapping(bytes32=>uint256) storage w,uint256 id,uint8 mode,uint8 side) internal view returns(int256){
        if(mode==0)return int256(uint256(uint64(w[S._key(id,7)]>>(side==0?64:0))))*1_000_000;
        return int256(uint256(uint56(w[S._key(id,27)]>>(side==0?56:0))));
    }
    function ask(address strategy,IPongStrategy.PongView memory v,int8 held) private view returns(int8,bool){
        bytes memory data=abi.encodeCall(IPongStrategy.decide,(v));bool ok;uint256 size;int256 direction;
        assembly("memory-safe"){let p:=mload(0x40) ok:=staticcall(50000,strategy,add(data,32),mload(data),p,32) size:=returndatasize() direction:=mload(p)}
        bool valid=ok&&size==32&&direction>=-1&&direction<=1;return(valid?int8(direction):held,valid);
    }
}
