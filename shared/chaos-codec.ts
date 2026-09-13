import {decodeAbiParameters,type Abi,type Hex} from 'viem';
import {initialChaosEvents,type ChaosPhysicsState,type ChaosPhysicsCollision} from './physics-chaos-events';
import type {State} from './physics-v2';
const bits=(n:bigint,at:number,size:number)=>n>>BigInt(at)&((1n<<BigInt(size))-1n);
const number=(n:bigint,at:number,size:number)=>Number(bits(n,at,size));
const signed=(n:bigint,at:number,size:number)=>BigInt.asIntN(size,bits(n,at,size));
export type ChaosDecoded={physics:ChaosPhysicsState;request:bigint;pending:bigint;collisions:ChaosPhysicsCollision[]};
/** Eight fixed words, matching ChaosCodec exactly. Directions/nonces travel in
 * the header control word, so peers never infer a nonce from a movement event. */
export function unpackChaos(w:readonly bigint[],seed:Hex,control:bigint):ChaosPhysicsState{
 if(w.length!==8||w.some(x=>x<0n||x>=1n<<256n))throw Error('Invalid Chaos state');
 const s=initialChaosEvents(seed);
 for(let i=0;i<2;i++){
  const a=w[i*2],b=w[i*2+1];s.balls[i]={x:signed(a,0,56),y:signed(a,56,56),vx:signed(b,0,80),vy:signed(b,80,80),
   powerN:number(a,112,16),powerD:number(a,128,16),curveSteps:number(a,144,16),curveSign:Number(signed(a,160,8)),
   lastHitter:number(a,168,8),ghost:number(a,176,16),portalLock:bits(a,192,1)!==0n,warp:bits(a,193,1)!==0n,
   gravity:bits(a,194,1)!==0n,alive:bits(a,195,1)!==0n,gravityUsed:bits(b,160,64),trailRevision:number(b,224,32)};
  const e=w[4+i];s.effects[i]={id:number(e,0,8),target:number(e,8,8),remaining:number(e,16,8),serial:number(e,24,32),
   startsAt:number(e,56,32),expiresAt:number(e,88,32),variant:number(e,120,32)};
 }
 s.left=bits(w[6],0,56);s.right=bits(w[6],56,56);s.t=bits(w[6],112,64);s.nextForce=bits(w[6],176,64);
 const m=w[7];s.score={a:number(m,0,3),b:number(m,3,3),rally:number(m,6,32),finished:bits(m,38,1)!==0n,winner:number(m,39,2)};
 s.lastLeft=number(m,41,2)-1;s.lastRight=number(m,43,2)-1;s.activeMask=number(m,45,24);s.collisionSequence=number(m,69,32);
 s.bettingA=number(m,101,32);s.bettingB=number(m,133,32);s.cancelled=bits(m,165,1)!==0n;s.cancelReason=number(m,166,8);s.stalled=number(m,174,8);
 s.leftDir=number(control,0,2)-1;s.rightDir=number(control,2,2)-1;
 if(s.score.rally===0||s.bettingA<72000000||s.bettingA>96000000||s.bettingB<72000000||s.bettingB>96000000
  ||s.effects.some(e=>e.id>24||e.target>2)||s.leftDir>1||s.rightDir>1)throw Error('Invalid Chaos rules state');
 return s;
}
export function chaosLegacy(s:ChaosPhysicsState,finished=s.score.finished||s.cancelled):State{
 const b=s.balls[0];return{x:b.x/1000000n,y:b.y/1000000n,vx:b.vx,vy:b.vy,left:s.left/1000000n,right:s.right/1000000n,
  leftDir:s.leftDir,rightDir:s.rightDir,t:s.t,scoreA:s.score.a,scoreB:s.score.b,seed:s.seed,finished,mode:1,
  halfA:BigInt(s.bettingA)/2n,halfB:BigInt(s.bettingB)/2n,awaitingServe:false,resumeAt:0n};
}
export function decodeChaosRead(abi:Abi,value:Hex):readonly unknown[]{
 const getter=abi.find(x=>x.type==='function'&&x.name==='getSnapshot');if(!getter||getter.type!=='function')throw Error('Missing snapshot ABI');
 // The library returns the complete old getter tuple plus the new packed words
 // atomically. All historical fields retain their order and meaning.
 const [header,words,request,pending]=decodeAbiParameters([
  {type:'tuple',components:getter.outputs.map((o,i)=>({...o,name:`f${i}`}))},{type:'uint256[8]'},{type:'uint256'},{type:'uint256'},
 ],value) as unknown as [Record<string,unknown>,readonly bigint[],bigint,bigint];
 const v=Array.from({length:13},(_,i)=>header[`f${i}`]);const legacy=v[12] as State;
 if(legacy.mode!==1)return v;
 const control=BigInt(legacy.leftDir+1)|(BigInt(legacy.rightDir+1)<<2n);
 const chaos:ChaosDecoded={physics:unpackChaos(words,legacy.seed,control),request,pending,collisions:[]};
 return [...v,chaos];
}
export function unpackChaosCollision(value:bigint):ChaosPhysicsCollision{
 return {sequence:number(value,0,32),rally:number(value,32,32),ball:number(value,64,8),kind:number(value,72,8),obstacle:number(value,80,8),
  at:bits(value,88,64),x:signed(value,152,32)*1000000n,y:signed(value,184,32)*1000000n};
}
