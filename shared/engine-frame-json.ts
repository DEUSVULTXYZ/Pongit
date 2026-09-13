import type {EngineState} from './engine-stream';
/** Restore typed values from the bounded replay API, never executable data. */
export function restoreEngineFrame(raw:any):EngineState{
 const value=structuredClone(raw);
 for(const k of ['id','revision','head','clock','nonceA','nonceB','deadline'])value[k]=BigInt(value[k]);
 for(const k of ['x','y','vx','vy','left','right','t','halfA','halfB','resumeAt'])if(value.state[k]!==undefined)value.state[k]=BigInt(value.state[k]);
 if(value.chaos){const c=value.chaos;c.request=BigInt(c.request);c.pending=BigInt(c.pending);
  for(const k of ['left','right','t','nextForce'])c.physics[k]=BigInt(c.physics[k]);
  for(const b of c.physics.balls)for(const k of ['x','y','vx','vy','gravityUsed'])b[k]=BigInt(b[k]);
  for(const h of c.collisions)for(const k of ['at','x','y'])h[k]=BigInt(h[k]);
 }
 return value;
}
