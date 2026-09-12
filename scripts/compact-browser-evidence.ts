// Public proof of the completed HTTPS-origin run; private journals are reduced in memory.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,parseTransaction} from 'viem';
import {readHubDelegation} from '../shared/rooms-hub';
import {abi} from '../shared/abi-independent-IndependentArena';
const m=JSON.parse(await readFile('deployments/independent.json','utf8'));assert.equal(m.lobby.toLowerCase(),'0xf2dad62750aab9eab849182b325211145f663174');
const s=JSON.parse(await readFile('/secrets/independent-browser-v2-compact.json','utf8'));
const report:any={at:new Date().toISOString(),matchRef:s.matchRef,players:[],scope:'Real hosted game through Chromium at an HTTPS origin; virtual PRF authenticators'};
const parts=s.matchRef.split(':'),app=parts[1],epoch=BigInt(parts[2]),id=BigInt(parts[3]);assert(m.arenas.some((a:any)=>a.app.toLowerCase()===app.toLowerCase()));
const base=createPublicClient({transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:10000})});
const d=await readHubDelegation(base,m.hub,app),game=await base.readContract({address:app,abi,functionName:'getSnapshot',args:[id]});
assert.equal(d.epoch,epoch);assert.equal(game[2],3n);assert(d.batchIndex>=2n);
report.published={batches:String(d.batchIndex),score:[game[12].scoreA,game[12].scoreB],winner:game[6],hubStatus:d.status,releaseUTC:new Date(Number(d.stakeUnlockAt)*1000).toISOString()};
for(const player of s.players.slice(0,2)){
 const journal=JSON.parse(player.session['pongit:commands:'+app.toLowerCase()]);assert(journal.length>0);
 assert(journal.every((j:any)=>j.epoch===String(epoch)&&j.match===String(id)&&j.state!=='uncertain'));
 report.players.push({address:player.address,retainedCommands:journal.length,pending:0,actions:[...new Set(journal.map((j:any)=>j.action))],rawByteSizes:[...new Set(journal.map((j:any)=>(j.raw.length-2)/2))],nonces:journal.map((j:any)=>parseTransaction(j.raw).nonce)});
}
await writeFile('artifacts/independent-candidate/compact-browser-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
