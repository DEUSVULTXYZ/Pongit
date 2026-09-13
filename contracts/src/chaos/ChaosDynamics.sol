// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ChaosState as T} from "./ChaosState.sol";
import {ChaosEffects as E} from "./ChaosEffects.sol";
import {ChaosModifiers as M} from "./ChaosModifiers.sol";
import {ChaosGeometry as G} from "./ChaosGeometry.sol";

/// @notice Movement and force module for candidate rules 6. It stores no state.
contract ChaosDynamics {
    E public immutable effects;
    M public immutable modifiers;
    int256 private constant P=1e12;
    uint64 private constant STEP=10000;
    uint64 private constant FIFTEEN_DEGREES=261799387799;
    constructor(E e,M m){effects=e;modifiers=m;}
    function paddles(T.State memory s) public view returns(M.Paddles memory){
        M.Effect[2] memory es;
        for(uint8 i;i<2;i++){E.Effect memory e=s.effects[i];es[i]=M.Effect(e.id,e.target,e.startsAt,e.expiresAt,false);}
        return modifiers.calculate(s.bettingA,s.bettingB,es,uint64(s.t/1000));
    }
    function has(T.State memory s,uint8 id) public pure returns(bool){
        for(uint8 i;i<2;i++)if(s.effects[i].id==id&&s.t/1000>=s.effects[i].startsAt&&s.t/1000<s.effects[i].expiresAt)return true;return false;
    }
    function variant(T.State memory s,uint8 id) public pure returns(uint32){for(uint8 i;i<2;i++)if(s.effects[i].id==id)return s.effects[i].variant;return 0;}
    function needsGrid(T.State memory s) external pure returns(bool){
        bool wind=has(s,17);bool well=has(s,16);
        for(uint8 i;i<2;i++)if(s.balls[i].alive&&(wind||s.balls[i].curveSteps!=0||well&&s.balls[i].gravity))return true;return false;
    }
    function velocity(T.State memory s,uint8 ball) public pure returns(int256 vx,int256 vy){
        T.Ball memory b=s.balls[ball];uint256 n=b.powerN;uint256 d=b.powerD;
        if(d==0||n==0)revert G.NumericRange();
        if(has(s,23)){n*=5;d*=4;}if(b.warp&&has(s,15)){n*=6;d*=5;}
        vx=b.vx*int256(n)/int256(d);vy=b.vy*int256(n)/int256(d);G.check(b.x,b.y,vx,vy);
    }
    function move(T.State memory s,uint64 to) external view returns(T.State memory){
        if(to<s.t)revert G.NumericRange();if(to>s.t)s.stalled=0;int256 dt=int256(uint256(to-s.t));M.Paddles memory ps=paddles(s);
        for(uint8 i;i<2;i++)if(s.balls[i].alive){(int256 vx,int256 vy)=velocity(s,i);s.balls[i].x+=vx*dt;s.balls[i].y+=vy*dt;G.check(s.balls[i].x,s.balls[i].y,vx,vy);}
        s.left=clamp(s.left+int256(s.leftDir)*int256(ps.speedA)*dt,outer(ps.heightA,ps.splitA));
        s.right=clamp(s.right+int256(s.rightDir)*int256(ps.speedB)*dt,outer(ps.heightB,ps.splitB));s.t=to;return s;
    }
    function outer(uint256 solid,bool split) public pure returns(int256){return int256((solid+(split?16000000:0))*1000000/2);}
    function clamp(int256 y,int256 half) public pure returns(int256){return y<half?half:y>576*P-half?576*P-half:y;}
    function inside(int256 x,int256 y,int256 cx,int256 cy,int256 r) public pure returns(bool){int256 dx=x-cx;int256 dy=y-cy;return dx*dx+dy*dy<=r*r;}
    function portal(uint32 v,uint8 i) public pure returns(int256 x,int256 y){x=i==0?320*P:704*P;y=((v&1)==i)?180*P:396*P;}
    function brickY(uint8 i) public pure returns(int256){return int256(200+88*uint256(i))*P;}
    function overlap(T.State memory s,T.Ball memory b,uint8 bit) public pure returns(bool){
        if(bit==0)return has(s,13)&&inside(b.x,b.y,512*P,288*P,34*P);
        if(bit==1||bit==2){(int256 x,int256 y)=portal(variant(s,14),bit-1);return has(s,14)&&inside(b.x,b.y,x,y,24*P);}
        if(bit==3){if(!has(s,18))return false;int256 dx=b.x-512*P;int256 dy=b.y-288*P;
            int256 sign=variant(s,18)&1==0?int256(-1):int256(1);
            // Unnormalised 45-degree coordinates are exactly linear in time.
            // Rounding a separately rotated velocity would depend on call splits.
            int256 u=dx+sign*dy;int256 v=-sign*dx+dy;int256 tip=44*1414213562373;
            int256 nearest=u< -tip?-tip:u>tip?tip:u;return inside(u,v,nearest,0,10*1414213562373);
        }
        if(bit>=4&&bit<=6)return has(s,19)&&G.abs(b.x-512*P)<=34*uint256(P)&&G.abs(b.y-brickY(bit-4))<=14*uint256(P);
        if(bit==7)return has(s,24)&&inside(b.x,b.y,512*P,120*P,22*P);return false;
    }
    function prepare(T.State memory s) external view returns(T.State memory){
        uint24 mask;for(uint8 i;i<2;i++)if(s.effects[i].id!=0&&s.t/1000>=s.effects[i].startsAt&&s.t/1000<s.effects[i].expiresAt)mask|=uint24(1)<<(s.effects[i].id-1);
        uint24 born=mask&~s.activeMask;
        if(born&(uint24(1)<<20)!=0){s.balls[1]=abi.decode(abi.encode(s.balls[0]),(T.Ball));s.balls[1].vy=-s.balls[0].vy;s.balls[1].alive=true;s.balls[1].trailRevision++;}
        if(mask&(uint24(1)<<20)==0)s.balls[1].alive=false;
        for(uint8 ball;ball<2;ball++)if(s.balls[ball].alive){
            T.Ball memory b=s.balls[ball];
            for(uint8 bit;bit<8;bit++){
                uint8 id=bit==0?13:bit<3?14:bit==3?18:bit<7?19:24;
                bool covered=overlap(s,b,bit);
                if((born&(uint24(1)<<(id-1))!=0||ball==1&&born&(uint24(1)<<20)!=0)&&covered)b.ghost|=uint16(1)<<bit;
                else if(!covered)b.ghost&=~(uint16(1)<<bit);
            }
            if(!has(s,14)||!overlap(s,b,1)&&!overlap(s,b,2))b.portalLock=false;
            b.warp=has(s,15)&&(b.x>480*P&&b.x<544*P||b.x==480*P&&(b.vx>0||b.vx==0&&b.warp)||b.x==544*P&&(b.vx<0||b.vx==0&&b.warp));
            int256 gx=b.x-512*P;int256 gy=b.y-288*P;int256 distance2=gx*gx+gy*gy;int256 radius2=160*P*160*P;
            bool grav=has(s,16)&&(distance2<radius2||distance2==radius2&&gx*b.vx+gy*b.vy<0);if(!grav||!b.gravity)b.gravityUsed=0;b.gravity=grav;
            s.balls[ball]=b;
        }
        s.activeMask=mask;M.Paddles memory ps=paddles(s);s.left=clamp(s.left,outer(ps.heightA,ps.splitA));s.right=clamp(s.right,outer(ps.heightB,ps.splitB));
        (s.effects,)=effects.expire(s.effects,uint32(s.t/1000));
        return s;
    }
    /// Velocity kick at each fixed grid boundary, never on arbitrary RPC reads.
    function force(T.State memory s) external view returns(T.State memory){
        if(s.nextForce!=s.t)revert G.NumericRange();s.nextForce+=STEP;
        for(uint8 i;i<2;i++)if(s.balls[i].alive){
            T.Ball memory b=s.balls[i];
            if(b.curveSteps!=0){
                // 150 kicks total exactly the rounded 20-degree rotation.
                uint256 previous=150-b.curveSteps;int256 angle=int256((previous+1)*349065850399/150-previous*349065850399/150)*b.curveSign;
                (b.vx,b.vy)=G.rotate(b.vx,b.vy,angle);b.curveSteps--;
            }
            if(has(s,16)&&b.gravity&&b.gravityUsed<FIFTEEN_DEGREES){
                int256 dx=512*P-b.x;int256 dy=288*P-b.y;uint256 distance=Math.sqrt(uint256(dx*dx+dy*dy));
                uint256 remaining=FIFTEEN_DEGREES-b.gravityUsed;
                uint256 bend=uint256(FIFTEEN_DEGREES)*(160*uint256(P)-distance)/(160*uint256(P))/100;
                if(bend>remaining)bend=remaining;int256 cross=b.vx*dy-b.vy*dx;
                if(cross!=0&&bend!=0){(b.vx,b.vy)=G.rotate(b.vx,b.vy,cross<0?-int256(bend):int256(bend));b.gravityUsed+=uint64(bend);}
            }
            if(has(s,17)){
                uint256 n=b.powerN;uint256 d=b.powerD;if(has(s,23)){n*=5;d*=4;}if(b.warp&&has(s,15)){n*=6;d*=5;}
                int256 acceleration=int256(240000*d/n);b.vy+=variant(s,17)&1==0?-acceleration:acceleration;
            }
            G.check(b.x,b.y,b.vx,b.vy);s.balls[i]=b;
        }
        return s;
    }
}
