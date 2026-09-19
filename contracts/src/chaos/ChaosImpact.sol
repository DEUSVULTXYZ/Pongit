// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosState as T} from "./ChaosState.sol";
import {ChaosGeometry as G} from "./ChaosGeometry.sol";
import {ChaosEffects as E} from "./ChaosEffects.sol";
import {ChaosModifiers as M} from "./ChaosModifiers.sol";
import {ChaosDynamics as D} from "./ChaosDynamics.sol";

/// Immutable stateless collision resolution, split from the timeline kernel so
/// both runtimes fit EIP-170. There is no administrative or state-writing method.
contract ChaosImpact {
    E public immutable effects;D public immutable dynamics;int256 private constant P=1e12;
    constructor(E e,D d){effects=e;dynamics=d;}
    /// All candidates at the earliest time are resolved in (kind, ball) order.
    /// A prior collision can invalidate a later candidate, but cannot erase a
    /// different ball's contact. A simultaneous opposite-paddle Hot Potato hit
    /// retains the previous holder rather than giving a permanent side advantage.
    function resolveBatch(T.State memory s,T.Candidate[] memory tied,E.Effect[2] memory searched,bool boundary)
        external view returns(T.State memory,T.Collision[] memory log)
    {
        log=new T.Collision[](24);uint256 logs;
        E.Effect[2] memory beforeHits=s.effects;uint8 paddleMask;uint8 teleported;
        for(uint256 n;n<tied.length;n++){
            T.Candidate memory h=tied[n];uint8 k=h.kind;T.Ball memory b=s.balls[h.ball];
            if(!b.alive||teleported&(uint8(1)<<h.ball)!=0||k==5||k==6)continue;
            if(k==1&&!(b.vy<0&&b.y<=6*P)||k==2&&!(b.vy>0&&b.y>=570*P)
                ||k==3&&!(b.vx<0&&b.x<=40*P)||k==4&&!(b.vx>0&&b.x>=984*P))continue;
            if(k>=7){
                E.Effect memory e=s.effects[h.slot];
                if(e.id==0||e.id!=searched[h.slot].id||e.serial!=searched[h.slot].serial||!effects.active(e,uint32(s.t/1000)))continue;
                if(k==7&&!(b.vx<0&&b.x<=16*P&&shielded(s,0))||k==8&&!(b.vx>0&&b.x>=1008*P&&shielded(s,1)))continue;
                if(k==9&&b.ghost&1!=0||k==14&&b.ghost&8!=0||k>=15&&k<=17&&(b.ghost&(uint16(1)<<(h.obstacle+4))!=0||e.remaining&(uint8(1)<<h.obstacle)==0))continue;
                if((k==9||k==14||k>=15&&k<=17)&&b.vx*h.nx+b.vy*h.ny>=0)continue;
                if((k==10||k==11)&&(b.portalLock||b.ghost&(uint16(1)<<(h.obstacle+1))!=0))continue;
                if(k==18&&(b.lastHitter>1||b.ghost&128!=0))continue;
                // prepare has already reconciled these occupancy flags at a boundary.
                if(boundary&&(k==12||k==13||k==19))continue;
            }
            bool physical;(s,physical)=collideEffect(s,h);
            if(k==10||k==11)teleported|=uint8(1)<<h.ball;
            if(physical){
                if(k==3||k==4)paddleMask|=uint8(1)<<(k-3);
                s.collisionSequence++;log[logs++]=T.Collision(s.collisionSequence,s.score.rally,h.ball+1,k,h.obstacle,s.t,s.balls[h.ball].x,s.balls[h.ball].y);
            }
        }
        if(paddleMask==3)for(uint8 i;i<2;i++)if(beforeHits[i].id==10&&s.effects[i].id==10&&beforeHits[i].serial==s.effects[i].serial)s.effects[i].target=beforeHits[i].target;
        assembly("memory-safe"){mstore(log,logs)}
        return(s,log);
    }
    function shielded(T.State memory s,uint8 side) private pure returns(bool){
        for(uint8 i;i<2;i++){E.Effect memory e=s.effects[i];if(e.id==3&&e.target==side&&s.t/1000>=e.startsAt&&s.t/1000<e.expiresAt)return true;}
        return false;
    }
    function collideEffect(T.State memory s,T.Candidate memory h) private view returns(T.State memory,bool physical){
        T.Ball memory b=s.balls[h.ball];uint8 k=h.kind;
        if(k<=2||k==7||k==8||k==9||k==14||k>=15&&k<=17){
            b.powerN=1;b.powerD=1;physical=true;
        }
        if(k==1||k==2){
            b.y=k==1?6*P:570*P;b.vy=-b.vy;
            if(dynamics.has(s,20)){uint256 speed=G.speed(b.vx,b.vy);(b.vx,b.vy)=G.normalize(b.vx,b.vy*5/4,speed);}
        }else if(k==3||k==4){
            uint8 side=k==3?0:1;M.Paddles memory ps=dynamics.paddles(s);uint256 height=side==0?ps.heightA:ps.heightB;bool split=side==0?ps.splitA:ps.splitB;
            // At an effect boundary move() used the previous size. Re-clamp the
            // centre for the current hitbox before resolving an overshot plane.
            // Do not prepare unrelated effects here: multiball/forces keep their order.
            int256 centre=dynamics.clamp(side==0?s.left:s.right,dynamics.outer(height,split));
            if(side==0)s.left=centre;else s.right=centre;
            int256 solid=int256(height)*1000000;int256 delta=b.y-centre;
            bool touches=split?(delta+6*P>=-8*P-solid/2&&delta-6*P<=-8*P)||(delta+6*P>=8*P&&delta-6*P<=8*P+solid/2):G.abs(delta)<=uint256(solid/2+6*P);
            if(touches){
                b.powerN=1;b.powerD=1;physical=true;
                b.vx=-b.vx*11/10;b.vy=b.vy*11/10;b.lastHitter=side;
                E.Shot memory shot;(s.effects,shot)=effects.paddleHit(s.effects,side,side==0?s.lastLeft:s.lastRight,b.vy,G.abs(delta)<=uint256(solid/8),uint32(s.t/1000));
                b.powerN=uint16(shot.numerator);b.powerD=uint16(shot.denominator);if(shot.curveSign!=0){b.curveSteps=150;b.curveSign=shot.curveSign;}
            }else{physical=false;b.x+=b.vx<0?int256(-1):int256(1);}
        }else if(k==7||k==8){
            bool saved;(s.effects,saved,)=effects.shield(s.effects,k==7?0:1,uint32(s.t/1000));if(!saved)revert G.NumericRange();b.vx=-b.vx;
        }else if(k==9||k==14||k>=15&&k<=17){
            (b.vx,b.vy)=G.reflect(b.vx,b.vy,h.nx,h.ny);
            if(k>=15&&k<=17)s.effects=effects.breakBrick(s.effects,h.slot,h.obstacle,uint32(s.t/1000));
            b.x+=h.nx<0?int256(-1):h.nx>0?int256(1):int256(0);b.y+=h.ny<0?int256(-1):h.ny>0?int256(1):int256(0);
        }else if(k==10||k==11){
            uint32 variant=s.effects[h.slot].variant;(int256 fromX,int256 fromY)=dynamics.portal(variant,h.obstacle);(int256 toX,int256 toY)=dynamics.portal(variant,1-h.obstacle);
            b.x=toX+(b.x-fromX);b.y=toY+(b.y-fromY);b.portalLock=true;b.trailRevision++;
        }else if(k==12){b.warp=!b.warp;
        }else if(k==13){b.gravity=!b.gravity;b.gravityUsed=0;
        }else if(k==18){(s.effects,)=effects.collect(s.effects,h.slot,b.lastHitter,uint32(s.t/1000));
        }else if(k==19){b.portalLock=false;b.ghost&=~uint16(6);b.x+=h.nx<0?int256(-1):h.nx>0?int256(1):int256(0);b.y+=h.ny<0?int256(-1):h.ny>0?int256(1):int256(0);}
        G.check(b.x,b.y,b.vx,b.vy);s.balls[h.ball]=b;return(s,physical);
    }
}
