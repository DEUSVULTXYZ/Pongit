// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ChaosState as T} from "./ChaosState.sol";
import {ChaosEffects as E} from "./ChaosEffects.sol";
import {ChaosGeometry as G} from "./ChaosGeometry.sol";
import {ChaosDynamics as D} from "./ChaosDynamics.sol";

/// @notice Stable collision search for both balls. A pair of simultaneous goal
/// times is returned separately so one ball cannot score before the other is read.
/// Rules 8: each ball's wall, paddle and shield plane times are returned too, so
/// the kernel can resolve every one of them that falls in the microsecond a move
/// ends in, not only the tie-break winner.
contract ChaosContacts {
    D public immutable dynamics;
    int256 private constant P=1e12;
    constructor(D d){dynamics=d;}
    struct Search { T.Candidate best; T.Candidate[24] tied; uint8 count; }
    function offer(Search memory search,uint64 dt,uint8 kind,uint8 ball,uint8 slot,uint8 obstacle,int256 nx,int256 ny)
        private pure returns(Search memory)
    {
        if(dt==G.NEVER||dt>search.best.dt)return search;
        T.Candidate memory h=T.Candidate(dt,kind,ball,slot,obstacle,nx,ny);
        if(dt<search.best.dt){search.count=0;search.best=h;}
        if(search.count>=24)revert G.NumericRange();
        search.tied[search.count++]=h;
        if(kind<search.best.kind||kind==search.best.kind&&ball<search.best.ball)search.best=h;
        return search;
    }
    /// `planes` holds, per ball, [0] its wall contact (kind 1 or 2), [1] its paddle
    /// contact (3 or 4) and [2] its shield contact (7 or 8), offered below under
    /// exactly these predicates; G.NEVER where the ball does not approach it.
    function offerFast(T.Candidate memory best,uint64 dt,uint8 kind,uint8 ball,uint8 slot,uint8 obstacle,int256 nx,int256 ny)
        private pure returns(T.Candidate memory)
    {
        if(dt<best.dt||dt==best.dt&&(kind<best.kind||kind==best.kind&&ball<best.ball))return T.Candidate(dt,kind,ball,slot,obstacle,nx,ny);return best;
    }
    function next(T.State memory s) external view returns(T.Candidate memory best,uint64[2] memory goals,uint8[2] memory beneficiaries,uint64[3][2] memory planes){
        best.dt=G.NEVER;best.kind=type(uint8).max;goals=[G.NEVER,G.NEVER];
        for(uint8 ball;ball<2;ball++){
            planes[ball]=[G.NEVER,G.NEVER,G.NEVER];if(!s.balls[ball].alive)continue;
            T.Ball memory b=s.balls[ball];(int256 vx,int256 vy)=dynamics.velocity(s,ball);
            if(vx!=0){goals[ball]=G.plane(b.x,vx,vx<0?-6*P:1030*P);beneficiaries[ball]=vx<0?2:1;
                best=offerFast(best,goals[ball],vx<0?5:6,ball,0,0,0,0);
                if(vx<0&&b.x>=40*P){planes[ball][1]=G.plane(b.x,vx,40*P);best=offerFast(best,planes[ball][1],3,ball,0,0,1,0);}
                if(vx>0&&b.x<=984*P){planes[ball][1]=G.plane(b.x,vx,984*P);best=offerFast(best,planes[ball][1],4,ball,0,0,-1,0);}
            }
            if(vy!=0){planes[ball][0]=G.plane(b.y,vy,vy<0?6*P:570*P);best=offerFast(best,planes[ball][0],vy<0?1:2,ball,0,0,0,vy<0?int256(1):int256(-1));}
            for(uint8 slot;slot<2;slot++){
                E.Effect memory e=s.effects[slot];if(e.id==0||s.t/1000<e.startsAt||s.t/1000>=e.expiresAt)continue;
                if(e.id==3){
                    if(e.target==0&&vx<0&&b.x>=16*P){planes[ball][2]=G.plane(b.x,vx,16*P);best=offerFast(best,planes[ball][2],7,ball,slot,0,1,0);}
                    if(e.target==1&&vx>0&&b.x<=1008*P){planes[ball][2]=G.plane(b.x,vx,1008*P);best=offerFast(best,planes[ball][2],8,ball,slot,0,-1,0);}
                }else if(e.id==13&&b.ghost&1==0){
                    G.Hit memory h=G.circle(b.x-512*P,b.y-288*P,vx,vy,34*P,false);best=offerFast(best,h.dt,9,ball,slot,0,h.nx,h.ny);
                }else if(e.id==14){
                    for(uint8 portal;portal<2;portal++){
                        (int256 x,int256 y)=dynamics.portal(e.variant,portal);bool leaving=(b.portalLock||b.ghost&(uint16(1)<<(portal+1))!=0)&&dynamics.inside(b.x,b.y,x,y,24*P);
                        if(!b.portalLock&&b.ghost&(uint16(1)<<(portal+1))==0||leaving){
                            G.Hit memory h=G.circle(b.x-x,b.y-y,vx,vy,24*P,leaving);
                            best=offerFast(best,h.dt,leaving?19:10+portal,ball,slot,portal,h.nx,h.ny);
                        }
                    }
                }else if(e.id==15){
                    uint64 dt=G.NEVER;
                    if(b.warp&&vx!=0)dt=G.plane(b.x,vx,vx>0?544*P:480*P);
                    else if(vx>0&&b.x<480*P)dt=G.plane(b.x,vx,480*P);
                    else if(vx<0&&b.x>544*P)dt=G.plane(b.x,vx,544*P);
                    best=offerFast(best,dt,12,ball,slot,0,0,0);
                }else if(e.id==16){
                    G.Hit memory h=G.circle(b.x-512*P,b.y-288*P,vx,vy,160*P,b.gravity);best=offerFast(best,h.dt,13,ball,slot,0,h.nx,h.ny);
                }else if(e.id==18&&b.ghost&8==0){
                    G.Hit memory h=deflector(b.x,b.y,vx,vy,e.variant);
                    best=offerFast(best,h.dt,14,ball,slot,0,h.nx,h.ny);
                }else if(e.id==19){
                    for(uint8 brick;brick<3;brick++)if(e.remaining&(uint8(1)<<brick)!=0&&b.ghost&(uint16(1)<<(brick+4))==0){
                        G.Hit memory h=G.rect(b.x-512*P,b.y-dynamics.brickY(brick),vx,vy,34*P,14*P);
                        best=offerFast(best,h.dt,15+brick,ball,slot,brick,h.nx,h.ny);
                    }
                }else if(e.id==24&&b.lastHitter<=1&&b.ghost&128==0){
                    G.Hit memory h=G.circle(b.x-512*P,b.y-120*P,vx,vy,22*P,false);best=offerFast(best,h.dt,18,ball,slot,0,h.nx,h.ny);
                }
            }
        }
    }
    function nextAll(T.State memory s) external view returns(T.Candidate memory best,uint64[2] memory goals,uint8[2] memory beneficiaries,T.Candidate[] memory tied){
        Search memory search;(search,goals,beneficiaries,)=scan(s);best=search.best;
        tied=new T.Candidate[](search.count);
        for(uint256 i;i<search.count;i++)tied[i]=search.tied[i];
        // Stable total order, independent of slot iteration and caller budget.
        for(uint256 i=1;i<tied.length;i++){T.Candidate memory h=tied[i];uint256 j=i;
            while(j>0&&(tied[j-1].kind>h.kind||tied[j-1].kind==h.kind&&tied[j-1].ball>h.ball)){
                tied[j]=tied[j-1];j--;}
            tied[j]=h;
        }
    }
    function scan(T.State memory s) private view returns(Search memory search,uint64[2] memory goals,uint8[2] memory beneficiaries,uint64[3][2] memory planes){
        search.best.dt=G.NEVER;search.best.kind=type(uint8).max;goals=[G.NEVER,G.NEVER];
        for(uint8 ball;ball<2;ball++){
            planes[ball]=[G.NEVER,G.NEVER,G.NEVER];if(!s.balls[ball].alive)continue;
            T.Ball memory b=s.balls[ball];(int256 vx,int256 vy)=dynamics.velocity(s,ball);
            if(vx!=0){goals[ball]=G.plane(b.x,vx,vx<0?-6*P:1030*P);beneficiaries[ball]=vx<0?2:1;
                search=offer(search,goals[ball],vx<0?5:6,ball,0,0,0,0);
                if(vx<0&&b.x>=40*P){planes[ball][1]=G.plane(b.x,vx,40*P);search=offer(search,planes[ball][1],3,ball,0,0,1,0);}
                if(vx>0&&b.x<=984*P){planes[ball][1]=G.plane(b.x,vx,984*P);search=offer(search,planes[ball][1],4,ball,0,0,-1,0);}
            }
            if(vy!=0){planes[ball][0]=G.plane(b.y,vy,vy<0?6*P:570*P);search=offer(search,planes[ball][0],vy<0?1:2,ball,0,0,0,vy<0?int256(1):int256(-1));}
            for(uint8 slot;slot<2;slot++){
                E.Effect memory e=s.effects[slot];if(e.id==0||s.t/1000<e.startsAt||s.t/1000>=e.expiresAt)continue;
                if(e.id==3){
                    if(e.target==0&&vx<0&&b.x>=16*P){planes[ball][2]=G.plane(b.x,vx,16*P);search=offer(search,planes[ball][2],7,ball,slot,0,1,0);}
                    if(e.target==1&&vx>0&&b.x<=1008*P){planes[ball][2]=G.plane(b.x,vx,1008*P);search=offer(search,planes[ball][2],8,ball,slot,0,-1,0);}
                }else if(e.id==13&&b.ghost&1==0){
                    G.Hit memory h=G.circle(b.x-512*P,b.y-288*P,vx,vy,34*P,false);search=offer(search,h.dt,9,ball,slot,0,h.nx,h.ny);
                }else if(e.id==14){
                    for(uint8 portal;portal<2;portal++){
                        (int256 x,int256 y)=dynamics.portal(e.variant,portal);bool leaving=(b.portalLock||b.ghost&(uint16(1)<<(portal+1))!=0)&&dynamics.inside(b.x,b.y,x,y,24*P);
                        if(!b.portalLock&&b.ghost&(uint16(1)<<(portal+1))==0||leaving){
                            G.Hit memory h=G.circle(b.x-x,b.y-y,vx,vy,24*P,leaving);
                            search=offer(search,h.dt,leaving?19:10+portal,ball,slot,portal,h.nx,h.ny);
                        }
                    }
                }else if(e.id==15){
                    uint64 dt=G.NEVER;
                    if(b.warp&&vx!=0)dt=G.plane(b.x,vx,vx>0?544*P:480*P);
                    else if(vx>0&&b.x<480*P)dt=G.plane(b.x,vx,480*P);
                    else if(vx<0&&b.x>544*P)dt=G.plane(b.x,vx,544*P);
                    search=offer(search,dt,12,ball,slot,0,0,0);
                }else if(e.id==16){
                    G.Hit memory h=G.circle(b.x-512*P,b.y-288*P,vx,vy,160*P,b.gravity);search=offer(search,h.dt,13,ball,slot,0,h.nx,h.ny);
                }else if(e.id==18&&b.ghost&8==0){
                    G.Hit memory h=deflector(b.x,b.y,vx,vy,e.variant);
                    search=offer(search,h.dt,14,ball,slot,0,h.nx,h.ny);
                }else if(e.id==19){
                    for(uint8 brick;brick<3;brick++)if(e.remaining&(uint8(1)<<brick)!=0&&b.ghost&(uint16(1)<<(brick+4))==0){
                        G.Hit memory h=G.rect(b.x-512*P,b.y-dynamics.brickY(brick),vx,vy,34*P,14*P);
                        search=offer(search,h.dt,15+brick,ball,slot,brick,h.nx,h.ny);
                    }
                }else if(e.id==24&&b.lastHitter<=1&&b.ghost&128==0){
                    G.Hit memory h=G.circle(b.x-512*P,b.y-120*P,vx,vy,22*P,false);search=offer(search,h.dt,18,ball,slot,0,h.nx,h.ny);
                }
            }
        }
    }
    function deflector(int256 x,int256 y,int256 vx,int256 vy,uint32 variant) private pure returns(G.Hit memory h){
        int256 sign=variant&1==0?int256(-1):int256(1);int256 dx=x-512*P;int256 dy=y-288*P;
        int256 u=dx+sign*dy;int256 v=-sign*dx+dy;int256 vu=vx+sign*vy;int256 vv=-sign*vx+vy;
        int256 length=44*1414213562373;int256 radius=10*1414213562373;
        h=G.rect(u,v,vu,vv,length,radius);
        for(uint8 tip;tip<2;tip++){G.Hit memory end=G.circle(u+(tip==0?length:-length),v,vu,vv,radius,false);if(end.dt<h.dt)h=end;}
        int256 nx=h.nx-sign*h.ny;h.ny=sign*h.nx+h.ny;h.nx=nx;
    }
}
