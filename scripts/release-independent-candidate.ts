// Releases only the completed qualification manifest, after the real hub deadline.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {zeroHash} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
const path=process.env.PONG_INDEPENDENT_MANIFEST!;
assert(path?.startsWith('/secrets/'));
const m=JSON.parse(await readFile(path,'utf8'));
assert(m.production===false&&m.prefix.startsWith('independent-qualification-'));
const t=await chainTools(m.prefix);
const hub=await t.artifact('IInterludeHub'),lobby=await t.artifact('IndependentLobby'),arena=await t.artifact('IndependentArena');
const results=[];
try{
 for(const a of m.arenas){
  const d=await readHubDelegation(t.base,m.hub,a.app);
  const b:any=await t.base.readContract({address:a.app,abi:arena.abi,functionName:'boundMatch'});
  assert(b.epoch>0n,'Never delegated; not this recovery');
  if(d.status===2){
   assert((await t.base.getBlock()).timestamp>=d.stakeUnlockAt,'Actual challenge window is not over');
   await t.write(`release-arena-${a.index}-epoch-${b.epoch}`,m.hub,hub.abi,'releaseStake',[a.app,zeroHash]);
  }else assert.equal(d.status,0,'Active or challenged arena requires reviewed recovery');
  await t.write(`capture-final-arena-${a.index}-epoch-${b.epoch}`,m.lobby,lobby.abi,'capture',[b.id]);
  const after=await readHubDelegation(t.base,m.hub,a.app);assert.equal(after.status,0);
  results.push({app:a.app,epoch:String(b.epoch),id:String(b.id),status:'released'});
 }
 await writeFile('artifacts/independent-candidate/release.json',JSON.stringify({at:new Date().toISOString(),arenas:results},null,2));
}finally{await t.close();}
