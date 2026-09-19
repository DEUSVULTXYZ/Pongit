// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosState as T} from "./ChaosState.sol";
import {ChaosGeometry as G} from "./ChaosGeometry.sol";
import {ChaosEffects as E} from "./ChaosEffects.sol";
import {ChaosModifiers as M} from "./ChaosModifiers.sol";
import {ChaosRally as R} from "./ChaosRally.sol";
import {ChaosDynamics as D} from "./ChaosDynamics.sol";
import {ChaosContacts as C} from "./ChaosContacts.sol";
import {ChaosImpact} from "./ChaosImpact.sol";

/// @notice Chaos kernel used by human rules 9 and agent rules 10. Every earliest
/// contact is considered, including obstacles and contacts at effect/force boundaries.
/// Inputs are contract state, not client-supplied outcomes. Immutable stateless
/// modules preserve the same order when catch-up is split across commands.
contract ChaosPhysics {
    E public immutable effects;R public immutable rallies;D public immutable dynamics;C public immutable contacts;ChaosImpact public immutable impacts;
    int256 private constant P=1e12;uint64 private constant MAX_GAME_US=1800000000;
    /// A call stops once LOG_STOP collisions are logged. One microsecond adds at most
    /// the bounded search's 24 candidates, so 7+24 always fit.
    uint256 public constant LOG_STOP=8;uint256 public constant LOG_CAPACITY=31;
    constructor(E e,R r,D d,C c){effects=e;rallies=r;dynamics=d;contacts=c;impacts=new ChaosImpact(e,d);}
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
                    (s,logs)=resolve(s,tied,searchedEffects,true,log,logs);
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
                (s,logs)=resolve(s,tied,searchedEffects,false,log,logs);
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
    function resolve(T.State memory s,T.Candidate[] memory tied,E.Effect[2] memory searched,bool boundary,T.Collision[] memory log,uint256 logs)
        private view returns(T.State memory,uint256)
    {
        T.Collision[] memory hits;(s,hits)=impacts.resolveBatch(s,tied,searched,boundary);
        for(uint256 i;i<hits.length;i++)log[logs++]=hits[i];
        return(s,logs);
    }
}
