// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosState as T} from "./ChaosState.sol";
import {ChaosCodec} from "./ChaosCodec.sol";
import {ChaosPhysics} from "./ChaosPhysics.sol";
import {ChaosEffects as E} from "./ChaosEffects.sol";
import {ChaosDrawRules as D} from "./ChaosDrawRules.sol";
import {DrandEvmnet} from "./DrandEvmnet.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";

/// Immutable orchestration module. It cannot persist game state or choose a
/// beacon. The application stores the request before its round becomes public.
contract ChaosEngine {
    ChaosCodec public immutable codec;ChaosPhysics public immutable physics;
    DrandEvmnet public immutable beacon;D public immutable draws;E public immutable effects;
    constructor(ChaosCodec c,ChaosPhysics p,DrandEvmnet b,D d){codec=c;physics=p;beacon=b;draws=d;effects=p.effects();}
    struct Progress {uint256[8] words;bool complete;uint8 outcome;uint32 appliedRally;uint256[] collisions;}
    function initial(bytes32 seed) external view returns(uint256[8] memory){return codec.pack(physics.initial(seed,96000000,96000000));}
    function advance(uint256[8] calldata words,bytes32 seed,uint256 control,uint64 target,uint128 paidA,uint128 paidB)
        external view returns(Progress memory p)
    {
        T.State memory s=codec.unpack(words,seed,control);
        if(s.leftDir!=0)s.lastLeft=s.leftDir;if(s.rightDir!=0)s.lastRight=s.rightDir;
        p.collisions=new uint256[](32);uint256 length;
        for(uint256 step;step<4;step++){
            uint32 rally=s.score.rally;T.Collision[] memory hits;uint64 previous=s.t;
            (s,p.complete,hits)=physics.advanceUntilPoint(s,target,128);
            for(uint256 i;i<hits.length;i++){
                T.Collision memory h=hits[i];
                p.collisions[length++]=h.sequence|(uint256(h.rally)<<32)|(uint256(h.ball)<<64)|(uint256(h.kind)<<72)
                    |(uint256(h.obstacle)<<80)|(uint256(h.at)<<88)|(uint256(uint32(int32(h.x/1e6)))<<152)|(uint256(uint32(int32(h.y/1e6)))<<184);
            }
            if(s.score.rally!=rally&&!s.score.finished&&!s.cancelled){
                (int256 a,int256 b)=PhysicsV2.handicap(paidA,paidB);s.bettingA=uint32(uint256(a)*2);s.bettingB=uint32(uint256(b)*2);
                // Re-clamp for a larger paddle at this point boundary before
                // processing any part of the next rally.
                s=physics.dynamics().prepare(s);p.appliedRally=s.score.rally;
            }
            if(p.complete||s.t==previous)break;
        }
        uint256[] memory log=p.collisions;assembly("memory-safe"){mstore(log,length)}
        p.words=codec.pack(s);p.outcome=s.cancelled?4:s.score.finished?3:0;
    }
    function request(uint64 epoch,uint32 index,uint32 due,uint24 exclusionMask,uint32 delayMs) external view returns(uint256 packed){
        require(epoch>0&&epoch<=type(uint32).max&&delayMs>=8000&&delayMs<=12000,"draw schedule");
        // The request is fixed several seconds before the future beacon. Its
        // eligibility never depends on a browser clock or a submitted timestamp.
        uint64 round=beacon.roundAfter(uint64(block.timestamp+(delayMs+999)/1000-3));
        return round|(uint256(epoch)<<64)|(uint256(index)<<96)|(uint256(due)<<128)|(uint256(exclusionMask)<<160);
    }
    function context(address app,uint256 id,uint256 requestWord) public pure returns(D.Request memory r){
        r=D.Request(app,uint32(requestWord>>64),id,uint32(requestWord>>96),uint64(requestWord),uint24(requestWord>>160));
    }
    function prove(address app,uint256 id,uint256 requestWord,bytes calldata signature) external view returns(uint256 value,bytes32 randomness){
        D.Request memory r=context(app,id,requestWord);randomness=beacon.verify(r.round,signature);
        D.Draw memory d=draws.reveal(r,draws.commitment(r),randomness);
        value=d.eventId|(uint256(d.target)<<8)|(uint256(d.variant)<<16)|(uint256(d.intervalMs)<<48);
    }
    function excluded(uint256[8] calldata words,bytes32 seed,uint256 control) external view returns(uint24){
        T.State memory s=codec.unpack(words,seed,control);return effects.excluded(s.effects,uint32(s.t/1000));
    }
    function announce(uint256[8] memory words,bytes32 seed,uint256 control,uint256 draw,uint32 serial)
        external view returns(uint256[8] memory,bool)
    {
        T.State memory s=codec.unpack(words,seed,control);uint32 nowMs=uint32(s.t/1000);
        (s.effects,)=effects.expire(s.effects,nowMs);uint8 id=uint8(draw);
        if(s.effects[0].id!=0&&s.effects[1].id!=0||s.effects[0].id==id||s.effects[1].id==id)return(words,false);
        (s.effects,)=effects.announce(s.effects,id,uint8(draw>>8),uint32(draw>>16),serial,nowMs);
        return(codec.pack(s),true);
    }
    function wakeAt(uint256[8] calldata words,uint64 target) external pure returns(uint64){
        // A pending draw whose two slots are occupied may wait for a consumed
        // charge or expiry, but never prevents the ball from advancing.
        for(uint8 i;i<2;i++)if(uint8(words[4+i])!=0){uint64 end=uint64(uint32(words[4+i]>>88))*1000;if(end<target)target=end;}
        return target;
    }
}
