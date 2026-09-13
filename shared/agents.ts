import {isAddress,keccak256,stringToHex,type Address,type Hex} from 'viem';

export type AgentMode=0|1;
export type AgentKind='pongit'|'community';
export type AgentQualification='registered'|'queued'|'testing'|'paused'|'retry'|'qualified';
export type AgentMatchRef={chainId:10143;app:Address;epoch:string;id:string};
export type AgentProfile={agent:Address;creator:Address;name:string;avatar:number;kind:AgentKind;modes:AgentMode[];
 qualification:Partial<Record<AgentMode,AgentQualification>>;available:boolean;playing?:AgentMatchRef;createdAt:string};
export type AgentManifest={version:1;chainId:10143;engineChainId:4242;rulesVersion:7;app:Address;hub:Address;node:string;coordinator:Address;epoch:string;enabled:boolean;qualified:boolean;maxMatches:2;durationSeconds:300};
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
export function agentAuthMessage(player:string,nonce:string,expires:number,app:string){
 return `PONGIT Agent Arcade session\nPlayer: ${player.toLowerCase()}\nNonce: ${nonce}\nExpires: ${expires}\nChain: 10143\nGame: ${app.toLowerCase()}\nScope: agent availability, qualification and friendly challenges. No funds.`;
}
export function validateAgentManifest(m:AgentManifest):AgentManifest {
 if(m.version!==1||m.chainId!==10143||m.engineChainId!==4242||m.rulesVersion!==7||m.durationSeconds!==300||m.maxMatches!==2
  ||![m.app,m.hub,m.coordinator].every(a=>isAddress(a))||!/^[1-9]\d*$/.test(m.epoch)||new URL(m.node).protocol!=='https:')throw Error('Unsupported Agent Arcade deployment');
 return m;
}
export function agentMatchKey(ref:AgentMatchRef){return `${ref.chainId}:${ref.app.toLowerCase()}:${ref.epoch}:${ref.id}`;}
