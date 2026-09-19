// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosState as T} from "./ChaosState.sol";
import {ChaosGeometry as G} from "./ChaosGeometry.sol";
import {ChaosEffects as E} from "./ChaosEffects.sol";
import {ChaosModifiers as M} from "./ChaosModifiers.sol";
import {ChaosRally as R} from "./ChaosRally.sol";
import {ChaosDynamics as D} from "./ChaosDynamics.sol";
import {ChaosContacts as C} from "./ChaosContacts.sol";

/// @notice Chaos kernel used by human rules 9 and agent rules 10. Every earliest
/// contact is considered, including obstacles and contacts at effect/force boundaries.
/// Inputs are contract state, not client-supplied outcomes. Immutable stateless
/// modules preserve the same order when catch-up is split across commands.
contract ChaosPhysics {
    E public immutable effects;R public immutable rallies;D public immutable dynamics;C public immutable contacts;
    int256 private constant P=1e12;uint64 private constant MAX_GAME_US=1800000000;
    /// A call stops once LOG_STOP collisions are logged. One microsecond adds at most
    /// the bounded search's 24 candidates, so 7+24 always fit.
    uint256 public constant LOG_STOP=8;uint256 public constant LOG_CAPACITY=31;
    constructor(E e,R r,D d,C c){effects=e;rallies=r;dynamics=d;contacts=c;}
    function initial(bytes32 seed,uint32 bettingA,uint32 bettingB) external pure returns(T.State memory s){
        s.seed=seed;s.bettingA=bettingA;s.bettingB=bettingB;s.left=288*P;s.right=288*P;s.score.rally=1;return serve(s);
    }
    function serve(T.State memory s) public pure returns(T.State memory){
        delete s.balls;delete s.effects;s.activeMask=0;
        T.Ball memory b;b.x=512*P;b.y=288*P;b.vx=s.score.rally%2==1?int256(192e6):int256(-192e6);
        b.vy=(uint256(s.seed)>>((s.score.rally-1)%256))&1==0?int256(96e6):int256(-96e6);
        b.powerN=1;b.powerD=1;b.alive=true;b.lastHitter=2;s.balls[0]=b;
        return s;
    }
    function advance(T.State memory s,uint64 target,uint16 budget) external view returns(T.State memory,bool,T.Collision[] memory){
        return _advance(s,target,budget,false);
    }
    function advanceUntilPoint(T.State memory s,uint64 target,uint16 budget) external view returns(T.State memory,bool,T.Collision[] memory){
        return _advance(s,target,budget,true);
    }
    function _advance(T.State memory s,uint64 target,uint16 budget,bool stopAtPoint) private view returns(T.State memory,bool,T.Collision[] memory){
        if(target<s.t||budget>512)revert G.NumericRange();
        if(target>MAX_GAME_US){s.cancelled=true;s.cancelReason=2;delete s.effects;delete s.balls;s.activeMask=0;return(s,true,new T.Collision[](0));}
        try this.run(s,target,budget,stopAtPoint) returns(T.State memory next,bool complete,T.Collision[] memory log){return(next,complete,log);}
        catch(bytes memory reason){
            bytes4 selector;uint256 panicCode;
            if(reason.length>=4)assembly("memory-safe"){selector:=mload(add(reason,32))}
            if(reason.length>=36)assembly("memory-safe"){panicCode:=mload(add(reason,36))}
            if(selector==G.NumericRange.selector||selector==bytes4(0x4e487b71)&&panicCode==0x11){
                s.cancelled=true;s.cancelReason=1;delete s.effects;delete s.balls;s.activeMask=0;return(s,true,new T.Collision[](0));
            }
            assembly("memory-safe"){revert(add(reason,32),mload(reason))}
        }
    }
    function run(T.State memory s,uint64 target,uint16 budget,bool stopAtPoint) external view returns(T.State memory,bool,T.Collision[] memory log){
        require(msg.sender==address(this),"kernel only");
        log=new T.Collision[](LOG_CAPACITY);uint256 logs;
        for(uint16 step;step<budget;step++){
            if(s.cancelled||s.score.finished)break;
            s=dynamics.prepare(s);
            bool grid=dynamics.needsGrid(s);
            if(grid){if(s.nextForce<s.t)s.nextForce=(s.t+9999)/10000*10000;if(s.nextForce==s.t)s=dynamics.force(s);}
            else s.nextForce=(s.t/10000+1)*10000;
            (T.Candidate memory hit,uint64[2] memory goals,uint8[2] memory beneficiaries,)=contacts.next(s);
            E.Effect[2] memory searchedEffects=s.effects;
            uint64 boundary=grid?s.nextForce:G.NEVER;
            for(uint8 i;i<2;i++){
                E.Effect memory e=s.effects[i];if(e.id==0)continue;
                uint64 at=uint64(e.startsAt)*1000;if(at>s.t&&at<boundary)boundary=at;
                at=uint64(e.expiresAt)*1000;if(at>s.t&&at<boundary)boundary=at;
            }
            if(boundary<s.t)revert G.NumericRange();
            uint64 remaining=target-s.t;
            if(hit.dt>remaining&&boundary>target){s=dynamics.move(s,target);break;}
            T.Candidate[] memory tied;
            if(hit.dt!=G.NEVER&&hit.dt<=remaining&&hit.dt<=boundary-s.t)(,,,tied)=contacts.nextAll(s);
            if(boundary<=target&&(hit.dt==G.NEVER||boundary-s.t<=hit.dt)){
                uint64 dt=boundary-s.t;s=dynamics.move(s,boundary);
                // Activation and expiry precede every contact at their timestamp,
                // including contacts whose rational time rounded into this microsecond.
                s=dynamics.prepare(s);
                if(dt==hit.dt){
                    uint8 scored;for(uint8 i;i<2;i++)if(s.balls[i].alive&&goals[i]==dt)scored|=beneficiaries[i];
                    if(scored!=0){s=point(s,scored);if(s.score.finished||stopAtPoint)break;continue;}
                    (s,logs)=resolveBatch(s,tied,searchedEffects,true,log,logs);
                    if(logs>=LOG_STOP)break;
                }
                continue;
            }
            if(hit.dt==G.NEVER){s=dynamics.move(s,target);break;}
            if(hit.dt>remaining){s=dynamics.move(s,target);break;}
            s=dynamics.move(s,s.t+hit.dt);
            if(hit.dt==0){s.stalled++;if(s.stalled>32)revert G.NumericRange();}
            uint8 goalsMask;for(uint8 i;i<2;i++)if(s.balls[i].alive&&goals[i]==hit.dt)goalsMask|=beneficiaries[i];
            if(goalsMask!=0){
                s=point(s,goalsMask);if(s.score.finished)break;
                if(stopAtPoint)break;
            }else{
                (s,logs)=resolveBatch(s,tied,searchedEffects,false,log,logs);
                if(logs>=LOG_STOP)break;
            }
        }
        assembly("memory-safe"){mstore(log,logs)}
        bool complete=s.cancelled||s.score.finished;
        if(!complete)s=dynamics.prepare(s);
        if(!complete&&!dynamics.needsGrid(s))s.nextForce=(s.t/10000+1)*10000;
        if(!complete&&s.t==target&&s.nextForce>s.t){(T.Candidate memory pending,,,)=contacts.next(s);complete=pending.dt!=0;}
        return(s,complete,log);
    }
    /// The goals found at the same earliest time, then the next serve or the result.
    function point(T.State memory s,uint8 goalsMask) private view returns(T.State memory){
        (s.score,,)=rallies.resolve(s.score,goalsMask,effects.pointValue(s.effects,uint32(s.t/1000))==2);
        if(s.score.finished){delete s.effects;delete s.balls;s.activeMask=0;return s;}
        return serve(s);
    }
    /// All candidates at the earliest time are resolved in (kind, ball) order.
    /// A prior collision can invalidate a later candidate, but cannot erase a
    /// different ball's contact. A simultaneous opposite-paddle Hot Potato hit
    /// retains the previous holder rather than giving a permanent side advantage.
    function resolveBatch(T.State memory s,T.Candidate[] memory tied,E.Effect[2] memory searched,bool boundary,T.Collision[] memory log,uint256 logs)
        private view returns(T.State memory,uint256)
    {
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
        return(s,logs);
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
