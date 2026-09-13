import {chaosEvent} from './chaos-events';
export type RuntimeEffect={id:number;target:number;remaining:number;serial:number;startsAt:number;expiresAt:number;variant:number};
export type EffectPair=[RuntimeEffect,RuntimeEffect];
export const emptyEffect=():RuntimeEffect=>({id:0,target:0,remaining:0,serial:0,startsAt:0,expiresAt:0,variant:0});
export const emptyEffects=():EffectPair=>[emptyEffect(),emptyEffect()];
const clone=(e:readonly [RuntimeEffect,RuntimeEffect]):EffectPair=>[{...e[0]},{...e[1]}];
const u32=(x:number)=>{if(!Number.isSafeInteger(x)||x<0||x>0xffffffff)throw Error('Invalid effect');return x;};
const charges=(id:number)=>id===19?7:[3,4,5].includes(id)?1:0;
export function activeEffect(e:RuntimeEffect,nowMs:number){return e.id!==0&&nowMs>=e.startsAt&&nowMs<e.expiresAt;}
export function expireEffects(source:EffectPair,nowMs:number):[EffectPair,number]{
 const effects=clone(source);let mask=0;
 for(let i=0;i<2;i++)if(effects[i].id!==0&&nowMs>=effects[i].expiresAt){effects[i]=emptyEffect();mask|=1<<i;}
 return[effects,mask];
}
export function excludedEffects(effects:EffectPair,nowMs:number){return effects.reduce((mask,e)=>e.id!==0&&nowMs<e.expiresAt?mask|(1<<(e.id-1)):mask,0);}
export function announceEffect(source:EffectPair,id:number,target:number,variant:number,serial:number,nowMs:number):[EffectPair,number]{
 if(target!==0&&target!==1)throw Error('Invalid effect');
 const length=chaosEvent(id).durationMs,[effects]=expireEffects(source,nowMs);
 if(effects.some(e=>e.id===id))throw Error('Duplicate effect');
 const slot=effects[0].id===0?0:effects[1].id===0?1:2;if(slot===2)throw Error('No effect slot');
 const start=u32(nowMs+1000);
 effects[slot]={id,target:id>=12?2:target,remaining:charges(id),serial:u32(serial),startsAt:start,expiresAt:u32(start+length),variant:u32(variant)};
 return[effects,slot];
}
export function effectPaddleHit(source:EffectPair,side:number,lastDirection:number,outgoingVy:bigint,central:boolean,nowMs:number){
 if(side!==0&&side!==1||![0,1,-1].includes(lastDirection))throw Error('Invalid effect');
 const effects=clone(source),shot={numerator:1,denominator:1,curveSign:0,consumedMask:0};
 for(let i=0;i<2;i++){
  const e=effects[i];if(!activeEffect(e,nowMs))continue;
  if(e.id===10&&nowMs<e.startsAt+4000){e.target=side;continue;}
  if(e.target!==side)continue;
  if(e.id===4||e.id===9){shot.numerator*=6;shot.denominator*=5;}
  if(e.id===6&&central){shot.numerator*=13;shot.denominator*=10;}
  if(e.id===5)shot.curveSign=lastDirection!==0?lastDirection:outgoingVy<0n?-1:1;
  if(e.id===4||e.id===5){effects[i]=emptyEffect();shot.consumedMask|=1<<i;}
 }
 return[effects,shot] as const;
}
export function consumeShield(source:EffectPair,side:number,nowMs:number):[EffectPair,boolean,number]{
 if(side!==0&&side!==1)throw Error('Invalid effect');const effects=clone(source);
 for(let i=0;i<2;i++)if(activeEffect(effects[i],nowMs)&&effects[i].id===3&&effects[i].target===side){effects[i]=emptyEffect();return[effects,true,i];}
 return[effects,false,0];
}
export function breakChaosBrick(source:EffectPair,slot:number,brick:number,nowMs:number):EffectPair{
 const effects=clone(source);
 if(![0,1].includes(slot)||![0,1,2].includes(brick)||!activeEffect(effects[slot],nowMs)||effects[slot].id!==19)throw Error('Invalid effect');
 const bit=1<<brick;if((effects[slot].remaining&bit)===0)throw Error('Invalid effect');
 effects[slot].remaining&=~bit;if(effects[slot].remaining===0)effects[slot]=emptyEffect();return effects;
}
export function chaosPointValue(effects:EffectPair,nowMs:number){return effects.some(e=>activeEffect(e,nowMs)&&e.id===22)?2:1;}
export function collectChaosPickup(source:EffectPair,slot:number,lastHitter:number,nowMs:number):[EffectPair,number]{
 const effects=clone(source);
 if(![0,1].includes(slot)||![0,1].includes(lastHitter)||!activeEffect(effects[slot],nowMs)||effects[slot].id!==24)throw Error('Invalid effect');
 const e=effects[slot],reward=(e.variant&3)+1,other=1-slot;
 const updated:RuntimeEffect={id:reward,target:lastHitter,remaining:charges(reward),serial:e.serial,startsAt:u32(nowMs),expiresAt:u32(nowMs+chaosEvent(reward).durationMs),variant:e.variant};
 if(effects[other].id===reward&&nowMs<effects[other].expiresAt){effects[other]=updated;effects[slot]=emptyEffect();}
 else effects[slot]=updated;
 return[effects,reward];
}
