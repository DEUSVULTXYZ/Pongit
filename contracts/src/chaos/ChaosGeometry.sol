// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Candidate continuous-collision primitives. Positions use 1e12 arena
/// units, velocities 1e6 units/second and time microseconds. Therefore movement
/// is exactly p += v * dt, without truncation accumulating between RPC calls.
library ChaosGeometry {
    int256 internal constant P=1e12;
    int256 internal constant V=1e6;
    int256 internal constant TRIG=1e12;
    int256 internal constant C45=707106781187;
    uint64 internal constant NEVER=type(uint64).max;
    // Representation guard, not a gameplay speed cap. Beyond these integer
    // ranges the kernel must cancel technically instead of inventing a result.
    int256 internal constant MAX_POSITION=1<<53;
    int256 internal constant MAX_VELOCITY=1<<72;
    error NumericRange();
    struct Hit {uint64 dt;int256 nx;int256 ny;}
    function abs(int256 x) internal pure returns(uint256){if(x==type(int256).min)revert NumericRange();return uint256(x<0?-x:x);}
    function check(int256 x,int256 y,int256 vx,int256 vy) internal pure {
        if(abs(x)>uint256(MAX_POSITION)||abs(y)>uint256(MAX_POSITION)||abs(vx)>uint256(MAX_VELOCITY)||abs(vy)>uint256(MAX_VELOCITY))revert NumericRange();
    }
    function ceil(uint256 n,uint256 d) internal pure returns(uint64){
        if(d==0)return NEVER;uint256 q=n/d+(n%d==0?0:1);return q>=NEVER?NEVER:uint64(q);
    }
    function plane(int256 position,int256 velocity,int256 boundary) internal pure returns(uint64){
        if(velocity==0)return NEVER;int256 d=boundary-position;
        if(d!=0&&(d<0)!=(velocity<0))return NEVER;return ceil(abs(d),abs(velocity));
    }
    /// Circle entry or exit. An overlapping entry is intentionally ignored;
    /// obstacle activation registers its ghost state separately.
    function circle(int256 x,int256 y,int256 vx,int256 vy,int256 radius,bool exit) internal pure returns(Hit memory hit){
        check(x,y,vx,vy);if(radius<=0||radius>MAX_POSITION)revert NumericRange();
        hit.dt=NEVER;
        int256 a=vx*vx+vy*vy;if(a==0)return hit;
        int256 b=x*vx+y*vy;int256 c=x*x+y*y-radius*radius;
        if(!exit&&(c<0||b>=0))return hit;
        if(exit&&c>0)return hit;
        int256 discriminant=b*b-a*c;if(discriminant<0)return hit;
        int256 root=int256(Math.sqrt(uint256(discriminant)));
        int256 n=exit?-b+root:-b-root;if(n<0)return hit;
        hit.dt=ceil(uint256(n),uint256(a));
        if(hit.dt==NEVER)return hit;
        hit.nx=x+vx*int256(uint256(hit.dt));hit.ny=y+vy*int256(uint256(hit.dt));
    }
    /// Axis-aligned rectangle Minkowski-expanded by the ball radius. Tied corner
    /// contacts use X first. Inputs are relative to the rectangle's centre.
    function rect(int256 x,int256 y,int256 vx,int256 vy,int256 halfX,int256 halfY) internal pure returns(Hit memory hit){
        check(x,y,vx,vy);hit.dt=NEVER;
        if(halfX<=0||halfY<=0||halfX>MAX_POSITION||halfY>MAX_POSITION)revert NumericRange();
        if(vx!=0){
            int256 boundary=vx>0?-halfX:halfX;
            uint64 dt=plane(x,vx,boundary);
            if(dt!=NEVER&&abs(y+vy*int256(uint256(dt)))<=uint256(halfY))hit=Hit(dt,vx>0?int256(-1):int256(1),0);
        }
        if(vy!=0){
            int256 boundary=vy>0?-halfY:halfY;
            uint64 dt=plane(y,vy,boundary);
            if(dt<hit.dt&&abs(x+vx*int256(uint256(dt)))<=uint256(halfX))hit=Hit(dt,0,vy>0?int256(-1):int256(1));
        }
    }
    function speed(int256 vx,int256 vy) internal pure returns(uint256){check(0,0,vx,vy);return Math.sqrt(uint256(vx*vx+vy*vy));}
    function normalize(int256 vx,int256 vy,uint256 length) internal pure returns(int256,int256){
        uint256 current=speed(vx,vy);if(current==0)return(0,0);
        if(length>uint256(MAX_VELOCITY))revert NumericRange();
        return(vx*int256(length)/int256(current),vy*int256(length)/int256(current));
    }
    function reflect(int256 vx,int256 vy,int256 nx,int256 ny) internal pure returns(int256,int256){
        check(nx,ny,vx,vy);int256 norm=nx*nx+ny*ny;if(norm==0)revert NumericRange();
        int256 dot=vx*nx+vy*ny;
        // Positions up to 2^53 and velocities up to 2^72 keep this product <2^182.
        return normalize(vx-2*dot*nx/norm,vy-2*dot*ny/norm,speed(vx,vy));
    }
    /// Signed radians scaled by 1e12. Polynomial error is below one nanoradian
    /// in the permitted +/-20 degree range; all arithmetic is deterministic.
    function rotate(int256 vx,int256 vy,int256 angle) internal pure returns(int256,int256){
        check(0,0,vx,vy);if(abs(angle)>349065850400)revert NumericRange();
        int256 a2=angle*angle/TRIG;
        int256 sin=angle-angle*a2/TRIG/6+angle*a2/TRIG*a2/TRIG/120-angle*a2/TRIG*a2/TRIG*a2/TRIG/5040;
        int256 cos=TRIG-a2/2+a2*a2/TRIG/24-a2*a2/TRIG*a2/TRIG/720+a2*a2/TRIG*a2/TRIG*a2/TRIG/40320;
        return normalize((vx*cos-vy*sin)/TRIG,(vx*sin+vy*cos)/TRIG,speed(vx,vy));
    }
}

contract ChaosGeometryHarness {
    function circle(int256 x,int256 y,int256 vx,int256 vy,int256 radius,bool exit) external pure returns(ChaosGeometry.Hit memory){return ChaosGeometry.circle(x,y,vx,vy,radius,exit);}
    function rect(int256 x,int256 y,int256 vx,int256 vy,int256 a,int256 b) external pure returns(ChaosGeometry.Hit memory){return ChaosGeometry.rect(x,y,vx,vy,a,b);}
    function reflect(int256 vx,int256 vy,int256 nx,int256 ny) external pure returns(int256,int256){return ChaosGeometry.reflect(vx,vy,nx,ny);}
    function rotate(int256 vx,int256 vy,int256 angle) external pure returns(int256,int256){return ChaosGeometry.rotate(vx,vy,angle);}
}
