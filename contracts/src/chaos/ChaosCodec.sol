// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosState as T} from "./ChaosState.sol";
import {ChaosEffects as E} from "./ChaosEffects.sol";
import {ChaosGeometry as G} from "./ChaosGeometry.sol";
import {PhysicsV2} from "../v2/PhysicsV2.sol";

/// Eight publication words for both balls, both effects and the complete kernel
/// state. Seed, player nonces and current directions remain in the match header.
/// Every narrowing conversion is checked; overflow cannot silently change play.
contract ChaosCodec {
    function pack(T.State memory s) external pure returns(uint256[8] memory w) {
        for(uint8 i;i<2;i++) {
            T.Ball memory b=s.balls[i];G.check(b.x,b.y,b.vx,b.vy);
            w[i*2]=uint56(int56(b.x))|(uint256(uint56(int56(b.y)))<<56)
                |(uint256(b.powerN)<<112)|(uint256(b.powerD)<<128)|(uint256(b.curveSteps)<<144)
                |(uint256(uint8(b.curveSign))<<160)|(uint256(b.lastHitter)<<168)|(uint256(b.ghost)<<176)
                |(b.portalLock?1<<192:0)|(b.warp?1<<193:0)|(b.gravity?1<<194:0)|(b.alive?1<<195:0);
            w[i*2+1]=uint80(int80(b.vx))|(uint256(uint80(int80(b.vy)))<<80)
                |(uint256(b.gravityUsed)<<160)|(uint256(b.trailRevision)<<224);
            E.Effect memory e=s.effects[i];
            w[4+i]=e.id|(uint256(e.target)<<8)|(uint256(e.remaining)<<16)|(uint256(e.serial)<<24)
                |(uint256(e.startsAt)<<56)|(uint256(e.expiresAt)<<88)|(uint256(e.variant)<<120);
        }
        if(s.left<0||s.right<0||s.left>576e12||s.right>576e12||s.score.a>7||s.score.b>7
            ||s.score.winner>2||s.lastLeft< -1||s.lastLeft>1||s.lastRight< -1||s.lastRight>1)revert G.NumericRange();
        w[6]=uint56(uint256(s.left))|(uint256(uint56(uint256(s.right)))<<56)|(uint256(s.t)<<112)|(uint256(s.nextForce)<<176);
        w[7]=s.score.a|(uint256(s.score.b)<<3)|(uint256(s.score.rally)<<6)|(s.score.finished?1<<38:0)
            |(uint256(s.score.winner)<<39)|(uint256(uint8(s.lastLeft+1))<<41)|(uint256(uint8(s.lastRight+1))<<43)
            |(uint256(s.activeMask)<<45)|(uint256(s.collisionSequence)<<69)|(uint256(s.bettingA)<<101)
            |(uint256(s.bettingB)<<133)|(s.cancelled?1<<165:0)|(uint256(s.cancelReason)<<166)|(uint256(s.stalled)<<174);
    }
    function unpack(uint256[8] memory w,bytes32 seed,uint256 control) public pure returns(T.State memory s) {
        for(uint8 i;i<2;i++) {
            uint256 a=w[i*2];uint256 b=w[i*2+1];T.Ball memory ball;
            ball.x=int56(uint56(a));ball.y=int56(uint56(a>>56));ball.powerN=uint16(a>>112);ball.powerD=uint16(a>>128);
            ball.curveSteps=uint16(a>>144);ball.curveSign=int8(uint8(a>>160));ball.lastHitter=uint8(a>>168);ball.ghost=uint16(a>>176);
            ball.portalLock=a&(1<<192)!=0;ball.warp=a&(1<<193)!=0;ball.gravity=a&(1<<194)!=0;ball.alive=a&(1<<195)!=0;
            ball.vx=int80(uint80(b));ball.vy=int80(uint80(b>>80));ball.gravityUsed=uint64(b>>160);ball.trailRevision=uint32(b>>224);
            s.balls[i]=ball;uint256 e=w[4+i];
            s.effects[i]=E.Effect(uint8(e),uint8(e>>8),uint8(e>>16),uint32(e>>24),uint32(e>>56),uint32(e>>88),uint32(e>>120));
        }
        s.left=int256(uint256(uint56(w[6])));s.right=int256(uint256(uint56(w[6]>>56)));s.t=uint64(w[6]>>112);s.nextForce=uint64(w[6]>>176);
        uint256 meta=w[7];s.score.a=uint8(meta&7);s.score.b=uint8(meta>>3&7);s.score.rally=uint32(meta>>6);
        s.score.finished=meta&(1<<38)!=0;s.score.winner=uint8(meta>>39&3);s.lastLeft=int8(uint8(meta>>41&3))-1;s.lastRight=int8(uint8(meta>>43&3))-1;
        s.activeMask=uint24(meta>>45);s.collisionSequence=uint32(meta>>69);s.bettingA=uint32(meta>>101);s.bettingB=uint32(meta>>133);
        s.cancelled=meta&(1<<165)!=0;s.cancelReason=uint8(meta>>166);s.stalled=uint8(meta>>174);s.seed=seed;
        s.leftDir=int8(uint8(control&3))-1;s.rightDir=int8(uint8(control>>2&3))-1;
    }
    /// Stable compatibility view for old financial readers. Actual renderers use
    /// the packed rules-6 snapshot, including its second ball and exact geometry.
    function legacy(uint256[8] memory w,bytes32 seed,uint256 control,bool finished) external pure returns(PhysicsV2.State memory v) {
        T.State memory s=unpack(w,seed,control);T.Ball memory b=s.balls[0];
        v.x=b.x/1e6;v.y=b.y/1e6;v.vx=b.vx;v.vy=b.vy;v.left=s.left/1e6;v.right=s.right/1e6;
        v.leftDir=s.leftDir;v.rightDir=s.rightDir;v.t=s.t;v.scoreA=s.score.a;v.scoreB=s.score.b;v.seed=seed;
        v.finished=finished;v.mode=1;v.halfA=int256(uint256(s.bettingA))/2;v.halfB=int256(uint256(s.bettingB))/2;
    }
}
