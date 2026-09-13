// Read-only proof that public browser results reached the Monad publication.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {roomsCompactAbi as abi} from '../shared/abi-PongRoomsCompact';
import {readHubDelegation} from '../shared/rooms-hub';
const m=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
const run=JSON.parse(await readFile('artifacts/intro/compact-intro-20260913.json','utf8'));assert(run.passed);
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
const config:any=await(await fetch('https://pongit.xyz/api/interlude/config')).json();
assert.equal(config.app,m.app);assert(config.online&&config.admission&&!config.publication&&!config.error);
const d=await readHubDelegation(base,m.hub,m.app);assert.equal(d.status,1);assert(d.batchIndex>32n);
const results=[];
for(const game of run.scenarios){
 const s:any=await base.readContract({address:m.app,abi,functionName:'getSnapshot',args:[BigInt(game.match)]});
 assert.equal(s[2],3n);assert.notEqual(s[6],'0x0000000000000000000000000000000000000000');
 results.push({mode:game.mode,match:game.match,winner:s[6],score:[s[12].scoreA,s[12].scoreB],published:true});
}
const pages=[];for(const route of ['/','/docs','/docs/technical/contracts']){
 const response=await fetch('https://pongit.xyz'+route);pages.push({route,status:response.status});assert(response.ok);
}
const report={at:new Date().toISOString(),app:m.app,batch:String(d.batchIndex),results,pages,online:config.online,admission:config.admission,passed:true};
const text=JSON.stringify(report,null,2);await writeFile('artifacts/realtime/compact-post-release.json',text);console.log(text);
