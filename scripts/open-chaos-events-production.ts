// Open only the already-deployed candidate after public admissions have drained.
// Production manifests are written separately after the node and publication pass.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,http,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {roomsEventsAbi as abi} from '../shared/abi-PongChaosEvents';
assert.equal(process.env.PONG_CHAOS_DEPLOY,'authorized-testnet-candidate');
const prefix='chaos-events-production-20260913',file=`/secrets/${prefix}.json`,r=JSON.parse(await readFile(file,'utf8'));
const publicFile='artifacts/drand/production-manifests.json',report=JSON.parse(await readFile(publicFile,'utf8')),m=report.game;
assert.equal(r.app,'0x78d3341e3452d7ec1add9371de3008639eed8eb0');assert.equal(r.previous,'0x695307022ac7add03117e8f3b59369d7ee7a4724');assert.equal(m.app,r.app);
const fixture=JSON.parse(await readFile('/secrets/chaos-events-integration-20260913.json','utf8'));assert.equal(fixture.state,'released-qualified');
const old=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));assert.equal(old.app,r.previous);
const save=async()=>{await writeFile(file+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(file+'.next',file);};
const t=await chainTools(prefix);
try{
 const config:any=await(await fetch('https://pongit.xyz/api/interlude/config',{signal:AbortSignal.timeout(15000)})).json();assert.equal(config.app,old.app);assert.equal(config.admission,false,'Freeze old admissions before pinning published ratings');
 const previousNode=createPublicClient({transport:http(old.node,{retryCount:0,timeout:12000})});
 const health:any=await(await fetch(old.node+'/health',{signal:AbortSignal.timeout(15000)})).json();assert(!health.halted&&health.pendingDiffs===0);
 assert.equal(await previousNode.readContract({address:old.app,abi,functionName:'activeCount'}),0n);assert.equal(await t.base.readContract({address:old.app,abi,functionName:'activeCount'}),0n);
 const lobby=(await t.db.query('SELECT document FROM il_lobby WHERE app=$1',[old.app])).rows[0]?.document;assert(lobby);
 const now=(await t.base.getBlock()).timestamp;
 for(const room of Object.values(lobby.rooms) as any[]){if(room.offer)assert(BigInt(room.offer.expires)+3n<now||['complete','cancelled'].includes(room.offer.status)&&BigInt(room.offer.expires)<now,'Previously signed offer can still be accepted');}
 const d=await readHubDelegation(t.base,m.hub,r.app);
 if(d.status===0){r.openHash=(await t.write('open-production-candidate',r.app,abi,'renewEngine')).transactionHash;await save();}
 const opened=await readHubDelegation(t.base,m.hub,r.app);assert.equal(opened.status,1);assert.equal(opened.epoch,1n);assert(opened.expiresAt>now+7200n);
 const lookup=await fetch(`https://control.interludelayer.xyz/sessions/${r.app}`,{signal:AbortSignal.timeout(15000)});let session:any=await lookup.json();
 if(lookup.status===404){assert(!r.nodeRequestAt,'Reconcile uncertain hosted creation before retry');r.nodeRequestAt=new Date().toISOString();await save();
  const response=await fetch('https://control.interludelayer.xyz/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app:r.app}),signal:AbortSignal.timeout(60000)});session=await response.json();r.nodeHttp=response.status;await save();assert(response.ok,`Hosted creation returned ${response.status}`);
 }else assert(lookup.ok);
 const node=session.url||session.node;assert(typeof node==='string'&&new URL(node).protocol==='https:');if(r.node)assert.equal(r.node,node);r.node=node;r.epoch='1';r.state='provisioned';await save();
 const engine=createPublicClient({transport:http(node,{retryCount:0,timeout:12000})});assert.equal(await engine.getChainId(),4242);assert.equal(await engine.readContract({address:r.app,abi,functionName:'RULES_VERSION'}),6n);
 const players=(await t.db.query('SELECT player FROM profiles ORDER BY player LIMIT 250')).rows;let checked=0;
 for(const {player} of players)for(const mode of [0,1]){const prior:any=await t.base.readContract({address:old.app,abi,functionName:'ratingOf',args:[player as Address,mode]});const next:any=await engine.readContract({address:r.app,abi,functionName:'ratingOf',args:[player as Address,mode]});assert.deepEqual({...next,season:prior.season},prior);checked++;}
 m.node=node;report.opening={at:new Date().toISOString(),hash:r.openHash,epoch:1,ratingsChecked:checked,baseBlock:String(opened.baseBlock)};
 await writeFile(publicFile,JSON.stringify(report,null,2));console.log(JSON.stringify({app:r.app,node,opening:report.opening,releaseReady:false}));
}finally{await t.close();}
