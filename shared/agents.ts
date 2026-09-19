import {isAddress,keccak256,parseAbi,stringToHex,type Address,type Hex} from 'viem';

export type AgentMode=0|1;
// pongit: a house bot. community: a real-time agent its creator hosts, sending signed inputs.
// strategy: a contract on Monad the arcade itself asks for a direction on every slice.
export type AgentKind='pongit'|'community'|'strategy';
// failed: a strategy that used its retries; only its creator registering it again, after the
// cool-down, queues it once more (relayer/src/agents/strategies.ts, strategyRequeue).
export type AgentQualification='registered'|'queued'|'testing'|'paused'|'retry'|'failed'|'qualified';
export type AgentMatchRef={chainId:10143;app:Address;epoch:string;id:string};
export type AgentProfile={agent:Address;creator:Address;name:string;avatar:number;kind:AgentKind;modes:AgentMode[];
 qualification:Partial<Record<AgentMode,AgentQualification>>;available:boolean;playing?:AgentMatchRef;createdAt:string};
export type AgentManifest={version:1;chainId:10143;engineChainId:4242;rulesVersion:7|10;app:Address;hub:Address;node:string;coordinator:Address;epoch:string;enabled:boolean;qualified:boolean;maxMatches:2;durationSeconds:300};
export const agentActions=['acceptMatch','input','tick','cancelMatch','concede'] as const;
export const houseBots=[
 {name:'NOVA',difficulty:'Rookie',avatar:0,reactionMs:280,error:58,deadZone:17},
 {name:'PULSE',difficulty:'Arcade',avatar:3,reactionMs:160,error:25,deadZone:10},
 {name:'ONYX',difficulty:'Expert',avatar:8,reactionMs:85,error:8,deadZone:6},
] as const;
export const agentRegistrationTypes={AgentRegistration:[
 {name:'creator',type:'address'},{name:'agent',type:'address'},{name:'modes',type:'uint8'},
 {name:'metadata',type:'bytes32'},{name:'expires',type:'uint64'},
]} as const;
export function agentMetadata(name:string,avatar:number):Hex {
 if(!/^[A-Za-z0-9][A-Za-z0-9 _.-]{1,31}$/.test(name)||!Number.isInteger(avatar)||avatar<0||avatar>11)throw Error('Invalid agent name or avatar');
 return keccak256(stringToHex(JSON.stringify({version:1,name,avatar})));
}
// The registration digests AgentSteer._tier recognises, in tier order. A seat whose
// metadata is one of these is driven by the contract itself, so its client must not
// send inputs: the write would be overwritten at the next advance and would still
// cost a transaction, and transactions are what become hub batches.
export const houseSteerMetadata=houseBots.map(b=>agentMetadata(b.name,b.avatar)) as readonly Hex[];
export function steeredOnChain(metadata:Hex){return houseSteerMetadata.includes(metadata);}
// The interface an on-chain strategy implements (contracts/src/agents/IPongStrategy.sol).
export const pongStrategyAbi=parseAbi([
 'struct PongBall { int256 x; int256 y; int256 vx; int256 vy; }',
 'struct PongView { uint8 mode; uint8 side; uint64 t; int256 paddle; int256 half; int256 opponent; uint8 scoreSelf; uint8 scoreOther; PongBall[] balls; }',
 'function decide(PongView v) view returns (int8)',
 'function creator() view returns (address)',
]);
// Gas the arcade gives one decide() call (AgentSteer.STRATEGY_GAS).
export const STRATEGY_GAS=50_000n;
// Gas the arcade gives creator() when it registers a strategy (AgentIdentity.creatorOf).
export const CREATOR_GAS=30_000n;
// AgentIdentity.register refuses an expiry more than this many seconds after its block.
export const REGISTRATION_WINDOW=600n;
const PICO=1_000_000_000_000n,MICRO=1_000_000n;
// Positions a strategy must answer before it is registered: both sides, both modes, one and
// two balls, and the gap between points when no ball is live. Units are the arcade's own.
export const strategySamples=[
 {mode:0,side:0,t:4_000_000n,paddle:288n*PICO,half:40n*PICO,opponent:300n*PICO,scoreSelf:0,scoreOther:1,balls:[{x:600n*PICO,y:180n*PICO,vx:-420n*MICRO,vy:160n*MICRO}]},
 {mode:0,side:1,t:9_000_000n,paddle:120n*PICO,half:40n*PICO,opponent:288n*PICO,scoreSelf:2,scoreOther:2,balls:[{x:300n*PICO,y:500n*PICO,vx:510n*MICRO,vy:-240n*MICRO}]},
 {mode:1,side:0,t:30_000_000n,paddle:400n*PICO,half:36n*PICO,opponent:250n*PICO,scoreSelf:1,scoreOther:0,balls:[
  {x:700n*PICO,y:90n*PICO,vx:-900n*MICRO,vy:700n*MICRO},{x:200n*PICO,y:400n*PICO,vx:-300n*MICRO,vy:-500n*MICRO}]},
 {mode:1,side:1,t:61_000_000n,paddle:288n*PICO,half:44n*PICO,opponent:288n*PICO,scoreSelf:3,scoreOther:4,balls:[]},
] as const;
export function agentAuthMessage(player:string,nonce:string,expires:number,app:string){
 return `PONGIT Agent Arcade session\nPlayer: ${player.toLowerCase()}\nNonce: ${nonce}\nExpires: ${expires}\nChain: 10143\nGame: ${app.toLowerCase()}\nScope: agent availability, qualification and friendly challenges. No funds.`;
}
export function validateAgentManifest(m:AgentManifest):AgentManifest {
 if(m.version!==1||m.chainId!==10143||m.engineChainId!==4242||![7,10].includes(m.rulesVersion)||m.durationSeconds!==300||m.maxMatches!==2
  ||![m.app,m.hub,m.coordinator].every(a=>isAddress(a))||!/^[1-9]\d*$/.test(m.epoch)||new URL(m.node).protocol!=='https:')throw Error('Unsupported Agent Arcade deployment');
 return m;
}
export function agentMatchKey(ref:AgentMatchRef){return `${ref.chainId}:${ref.app.toLowerCase()}:${ref.epoch}:${ref.id}`;}
