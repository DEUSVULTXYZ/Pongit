/** Positions: 1e12 units. Velocities: 1e6 units/second. Time: microseconds. */
export const CHAOS_POSITION=1000000000000n,CHAOS_VELOCITY=1000000n,NEVER=(1n<<64n)-1n;
const MAX_P=1n<<53n,MAX_V=1n<<72n,TRIG=1000000000000n;
export type GeometryHit={dt:bigint;nx:bigint;ny:bigint};
const none=():GeometryHit=>({dt:NEVER,nx:0n,ny:0n});
export const abs=(x:bigint)=>x<0n?-x:x;
export function geometryCheck(x:bigint,y:bigint,vx:bigint,vy:bigint){if(abs(x)>MAX_P||abs(y)>MAX_P||abs(vx)>MAX_V||abs(vy)>MAX_V)throw Error('Numeric range');}
export function integerSqrt(n:bigint){if(n<0n)throw Error('Numeric range');if(n<2n)return n;let x=1n<<BigInt(Math.ceil(n.toString(2).length/2));for(;;){const next=(x+n/x)/2n;if(next>=x)return x;x=next;}}
export function geometryCeil(n:bigint,d:bigint){if(!d)return NEVER;const q=n/d+(n%d?1n:0n);return q>=NEVER?NEVER:q;}
export function planeTime(p:bigint,v:bigint,boundary:bigint){if(!v)return NEVER;const d=boundary-p;if(d!==0n&&(d<0n)!==(v<0n))return NEVER;return geometryCeil(abs(d),abs(v));}
export function circleHit(x:bigint,y:bigint,vx:bigint,vy:bigint,radius:bigint,exit=false):GeometryHit{
 geometryCheck(x,y,vx,vy);if(radius<=0n||radius>MAX_P)throw Error('Numeric range');
 const a=vx*vx+vy*vy;if(!a)return none();const b=x*vx+y*vy,c=x*x+y*y-radius*radius;
 if(!exit&&(c<0n||b>=0n)||exit&&c>0n)return none();
 const discriminant=b*b-a*c;if(discriminant<0n)return none();const root=integerSqrt(discriminant),n=exit?-b+root:-b-root;if(n<0n)return none();
 const dt=geometryCeil(n,a);return dt===NEVER?none():{dt,nx:x+vx*dt,ny:y+vy*dt};
}
export function rectHit(x:bigint,y:bigint,vx:bigint,vy:bigint,halfX:bigint,halfY:bigint):GeometryHit{
 geometryCheck(x,y,vx,vy);if(halfX<=0n||halfY<=0n||halfX>MAX_P||halfY>MAX_P)throw Error('Numeric range');let hit=none();
 if(vx){const boundary=vx>0n?-halfX:halfX,dt=planeTime(x,vx,boundary);if(dt!==NEVER&&abs(y+vy*dt)<=halfY)hit={dt,nx:vx>0n?-1n:1n,ny:0n};}
 if(vy){const boundary=vy>0n?-halfY:halfY,dt=planeTime(y,vy,boundary);if(dt<hit.dt&&abs(x+vx*dt)<=halfX)hit={dt,nx:0n,ny:vy>0n?-1n:1n};}
 return hit;
}
export function vectorSpeed(vx:bigint,vy:bigint){geometryCheck(0n,0n,vx,vy);return integerSqrt(vx*vx+vy*vy);}
export function normalize(vx:bigint,vy:bigint,length:bigint):[bigint,bigint]{const current=vectorSpeed(vx,vy);if(!current)return[0n,0n];if(length>MAX_V)throw Error('Numeric range');return[vx*length/current,vy*length/current];}
export function reflectVelocity(vx:bigint,vy:bigint,nx:bigint,ny:bigint):[bigint,bigint]{
 geometryCheck(nx,ny,vx,vy);const norm=nx*nx+ny*ny;if(!norm)throw Error('Numeric range');const dot=vx*nx+vy*ny;
 return normalize(vx-2n*dot*nx/norm,vy-2n*dot*ny/norm,vectorSpeed(vx,vy));
}
export function rotateVelocity(vx:bigint,vy:bigint,angle:bigint):[bigint,bigint]{
 geometryCheck(0n,0n,vx,vy);if(abs(angle)>349065850400n)throw Error('Numeric range');const a2=angle*angle/TRIG;
 const sin=angle-angle*a2/TRIG/6n+angle*a2/TRIG*a2/TRIG/120n-angle*a2/TRIG*a2/TRIG*a2/TRIG/5040n;
 const cos=TRIG-a2/2n+a2*a2/TRIG/24n-a2*a2/TRIG*a2/TRIG/720n+a2*a2/TRIG*a2/TRIG*a2/TRIG/40320n;
 return normalize((vx*cos-vy*sin)/TRIG,(vx*sin+vy*cos)/TRIG,vectorSpeed(vx,vy));
}
