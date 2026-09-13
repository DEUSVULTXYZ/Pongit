import {encodeAbiParameters,keccak256,stringToHex,type Address,type Hex} from 'viem';
import {chaosEvents,type ChaosEventId} from './chaos-events';
export const DRAND_CHAIN_HASH='0x04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3' as const;
export const DRAND_GENESIS=1727521075n;
export const DRAND_PERIOD=3n;
const DOMAIN=keccak256(stringToHex('PONGIT_CHAOS_EVENTS_6'));
export type ChaosDrawRequest={app:Address;epoch:bigint;matchId:bigint;index:number;round:bigint;excluded:number};
const requestType={type:'tuple',components:[{name:'app',type:'address'},{name:'epoch',type:'uint64'},{name:'matchId',type:'uint256'},{name:'index',type:'uint32'},{name:'round',type:'uint64'},{name:'excluded',type:'uint24'}]} as const;
export function chaosDrawCommitment(r:ChaosDrawRequest):Hex {
 if(BigInt(r.app)===0n||r.epoch===0n||r.matchId===0n||r.round===0n)throw Error('Invalid draw context');
 return keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'},{type:'bytes32'},requestType],[DOMAIN,10143n,DRAND_CHAIN_HASH,r]));
}
function uniform(seed:Hex,bound:bigint){
 const minimum=(1n<<256n)%bound;let n=BigInt(seed);
 for(let attempt=0n;attempt<8n;attempt++){
  if(n>=minimum)return n%bound;
  n=BigInt(keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'}],[seed,attempt])));
 }
 throw Error('Invalid draw context');
}
/** This does not verify a beacon. Call it only with contract-verified randomness. */
export function deriveChaosDraw(r:ChaosDrawRequest,stored:Hex,verifiedRandomness:Hex){
 const c=chaosDrawCommitment(r);if(c!==stored)throw Error('Invalid draw context');
 const available=chaosEvents.filter(e=>(r.excluded&(1<<(e.id-1)))===0);
 const total=available.reduce((s,e)=>s+e.weight,0);if(!total)throw Error('Invalid draw context');
 const field=(name:string)=>keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'string'}],[c,verifiedRandomness,name]));
 let choice=Number(uniform(field('event'),BigInt(total)));
 let eventId:ChaosEventId|undefined;
 for(const e of available){if(choice<e.weight){eventId=e.id;break;}choice-=e.weight;}
 if(!eventId)throw Error('Invalid draw context');
 return {eventId,target:Number(BigInt(field('target'))&1n) as 0|1,variant:Number(BigInt(field('variant'))&0xffffffffn),intervalMs:8000+10*Number(uniform(field('interval'),401n))};
}
export function drandRoundAfter(timestamp:bigint){return timestamp<DRAND_GENESIS?1n:(timestamp-DRAND_GENESIS)/DRAND_PERIOD+2n;}
