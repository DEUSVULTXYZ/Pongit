import assert from 'node:assert/strict';
import {encodeAbiParameters,keccak256,zeroHash,type Address,type Hex} from 'viem';

export type HumanRatingSeed={elo:number;played:number;wins:number;season:number};
export type HumanSeedCall={kind:'players';accounts:Address[];mode:number;values:HumanRatingSeed[]}|{kind:'pairs';pairs:Hex[];values:number[]};
const rating={type:'tuple[]',components:[{name:'elo',type:'uint32'},{name:'played',type:'uint32'},{name:'wins',type:'uint32'},{name:'season',type:'uint32'}]} as const;
export function humanSeedDigest(calls:HumanSeedCall[]){
 let digest:Hex=zeroHash;
 for(const c of calls){
  if(c.kind==='players')digest=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint8'},{type:'address[]'},{type:'uint8'},rating],[digest,0,c.accounts,c.mode,c.values]));
  else digest=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint8'},{type:'bytes32[]'},{type:'uint8[]'}],[digest,1,c.pairs,c.values]));
 }
 return digest;
}
export function humanSeedState(calls:HumanSeedCall[]){
 const players=new Map<string,HumanRatingSeed>(),pairs=new Map<Hex,number>();
 for(const c of calls){
  if(c.kind==='players'){
   assert(c.mode===0||c.mode===1);assert.equal(c.accounts.length,c.values.length);assert(c.accounts.length<=100);
   c.accounts.forEach((account,i)=>{const key=`${account.toLowerCase()}:${c.mode}`,v=c.values[i];
    assert(!players.has(key),'Duplicate immutable player seed');assert(BigInt(account)>0n&&v.elo>=100&&v.season>0);
    for(const n of Object.values(v))assert(Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff);
    players.set(key,v);
   });
  }else{
   assert.equal(c.pairs.length,c.values.length);assert(c.pairs.length<=100);
   c.pairs.forEach((pair,i)=>{const key=pair.toLowerCase() as Hex,n=c.values[i];
    assert(!pairs.has(key),'Duplicate immutable pair seed');assert(BigInt(pair)>0n&&Number.isInteger(n)&&n>0&&n<=8);pairs.set(key,n);
   });
  }
 }
 return{players,pairs,digest:humanSeedDigest(calls)};
}
export function humanPlayerSeedSlot(player:Address,mode:number){
 const inner=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'}],[player,4n]));
 return keccak256(encodeAbiParameters([{type:'uint8'},{type:'bytes32'}],[mode,inner]));
}
export function humanPairSeedSlot(pair:Hex){return keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'}],[pair,7n]));}
export function packedHumanSeed(v:HumanRatingSeed){return BigInt(v.elo)|(BigInt(v.played)<<32n)|(BigInt(v.wins)<<64n)|(BigInt(v.season)<<96n);}
