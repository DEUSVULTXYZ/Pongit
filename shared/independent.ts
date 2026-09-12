import {getAddress,isAddress,type Address,type Hex} from 'viem';
export type IndependentManifest={
 chainId:10143;hub:Address;family:Address;lobby:Address;ratings:Address;settlement:Address;
 vault:Address;market:Address;profiles:Address;privateData:Address;pressureSigner:Address;
 arenas:Array<{app:Address;index:number;node?:string}>;genesis:number;createdAt:string;startBlock?:string;
};
const fields=['hub','family','lobby','ratings','settlement','vault','market','profiles','privateData','pressureSigner'] as const;
/** Explicit public allowlist: private deployment files are never serialized to clients. */
export function publicIndependentManifest(raw:any):IndependentManifest{
 if(raw?.chainId!==10143||!Array.isArray(raw.arenas)||raw.arenas.length<3||raw.arenas.length>16)throw Error('Invalid independent deployment');
 const addresses=Object.fromEntries(fields.map(f=>{if(!isAddress(raw[f]))throw Error(`Invalid ${f} address`);return[f,getAddress(raw[f])];}));
 const arenas=raw.arenas.map((a:any,index:number)=>{
  if(!isAddress(a.app))throw Error('Invalid arena address');
  // Hosted addresses are pinned at deployment, never supplied by an API caller.
  const node=a.node??`https://il-${a.app.slice(2,18).toLowerCase()}.fly.dev`;
  if(!/^https:\/\/il-[a-f0-9]+\.fly\.dev$/.test(node))throw Error('Unapproved hosted node');
  return {app:getAddress(a.app),index,node};
 });
 if(new Set(arenas.map((a:{app:Address})=>a.app.toLowerCase())).size!==arenas.length)throw Error('Duplicate arena');
 if(raw.startBlock!==undefined&&!/^\d{1,20}$/.test(String(raw.startBlock)))throw Error('Invalid deployment block');
 return {...addresses,chainId:10143,arenas,genesis:Number(raw.genesis),createdAt:String(raw.createdAt),...(raw.startBlock!==undefined?{startBlock:String(raw.startBlock)}:{})} as IndependentManifest;
}
export type FamilyGrant={player:Address;key:Address;issuedAt:bigint;expires:bigint;revision:bigint};
export const familyGrantTypes={ArcadeFamilyGrant:[{name:'player',type:'address'},{name:'key',type:'address'},{name:'issuedAt',type:'uint64'},{name:'expires',type:'uint64'},{name:'revision',type:'uint256'}]} as const;
export const lobbyCommandTypes={LobbyCommand:[{name:'grantHash',type:'bytes32'},{name:'dataHash',type:'bytes32'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint64'}]} as const;
export const ownerWriteTypes={OwnerWrite:[{name:'player',type:'address'},{name:'action',type:'bytes32'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint64'}]} as const;
export type ChainOperation={id:string;status:'queued'|'pending'|'confirmed'|'failed';hash?:Hex;error?:string};
export function arenaReference(app:Address,epoch:bigint|number|string,id:bigint|number|string){return `10143:${app.toLowerCase()}:${epoch}:${id}`;}
export function roomReference(lobby:Address,id:bigint|number|string){return `${lobby.toLowerCase()}:${id}`;}
export const independentCreditMessage=(player:Address,vault:Address,expires:number)=>`PONGIT test betting credit\nPlayer: ${player.toLowerCase()}\nVault: ${vault.toLowerCase()}\nChain: 10143\nAmount: 0.02 MON\nExpires: ${expires}`;
export const independentDiagnosticsMessage=(family:Address,player:Address,instance:string,expires:number,digest:Hex)=>`PONGIT network diagnostics\nFamily: ${family.toLowerCase()}\nPlayer: ${player.toLowerCase()}\nChain: 10143\nInstance: ${instance}\nExpires: ${expires}\nSamples: ${digest}`;
export function parseRoomReference(value:string,lobby:Address){
 const [address,id,...extra]=value.split(':');
 if(extra.length||address.toLowerCase()!==lobby.toLowerCase()||!/^\d+$/.test(id)||BigInt(id)===0n)throw Error('This room belongs to another deployment. Open its original link.');
 return BigInt(id);
}
