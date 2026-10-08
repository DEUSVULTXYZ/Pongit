// Re-admit recovered nodes without opening, closing or replacing a delegation.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createPublicClient,http,keccak256,type Address} from 'viem';
import {readHubDelegations} from '../shared/rooms-hub';
import {verifyHostedArenaEvidence} from '../shared/hosted-arena-identity';
import {independentRules} from '../shared/independent-rules';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {agentPoolAdmissionAbi} from '../shared/agent-house-instances';
const action=process.argv[2];assert.equal(action,'verify');
const output=process.env.PONG_RECOVERED_REPORT!;assert(output?.endsWith('.json'));
const report:any={at:new Date().toISOString(),action,passed:false,rows:[],transactions:[],delegationClosures:0};
const serialize=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2)+'\n';
await writeFile(output,serialize(report),{flag:'wx'});
const base=createPublicClient({transport:http(process.env.RPC_URL??'https://testnet-rpc.monad.xyz',{retryCount:0,timeout:10000})});
const json=async(url:string)=>{const r=await fetch(url,{signal:AbortSignal.timeout(10000)});assert(r.ok);return r.json();};
try{
 const [agents,human]=await Promise.all([json('https://pongit.xyz/api/agents/config'),json('https://pongit.xyz/api/independent/config')]);
 const m=human.manifest;
 assert.equal(agents.pool.toLowerCase(),'0xe01c31f482113367c510a04816ff371676477fa3');
 assert.equal(m.lobby.toLowerCase(),'0xdf44e1cae317bc9d8bafcf9b292b08bb90996fb7');
 assert.equal(agents.rulesVersion,17);assert.equal(m.rulesVersion,18);assert.equal(agents.hub.toLowerCase(),m.hub.toLowerCase());
 const arenas=[...agents.arenas.map((a:any)=>({...a,role:'agent',rules:17,abi:arenaAbi})),
  ...m.arenas.map((a:any)=>({...a,role:'human',rules:18,abi:independentRules(m).arena}))];
 assert.equal(arenas.length,11);
 const block=await base.getBlock();report.block=block.number;report.blockHash=block.hash;
 const states=await readHubDelegations(base,agents.hub,arenas.map(a=>a.app as Address),block.number);
 for(let i=0;i<arenas.length;i++){
  const a=arenas[i],d=states[i];report.checking=a.app;assert(d.status===1&&d.epoch===1n&&d.expiresAt===0n&&d.batchIndex>0n);
  const node=createPublicClient({transport:http(a.node,{retryCount:0,timeout:10000})});
  const [session,version,code,health,directory]=await Promise.all([
   node.request({method:'interlude_session',params:[]} as any),
   node.readContract({address:a.app,abi:a.abi,functionName:'RULES_VERSION'}),
   base.getCode({address:a.app,blockNumber:block.number}),json(a.node+'/health'),
   json('https://control.interludelayer.xyz/sessions/'+a.app)]);
  assert(code&&code!=='0x');const hash=keccak256(code);
  if(a.runtimeHash)assert.equal(hash,a.runtimeHash);
  else assert.equal((await base.readContract({address:a.app,abi:a.abi,functionName:'lobby',blockNumber:block.number}) as string).toLowerCase(),m.lobby.toLowerCase());
  assert.equal(directory.app.toLowerCase(),a.app.toLowerCase());assert.equal(directory.status,'live');
  assert.equal(new URL(directory.url).origin,new URL(a.node).origin);
  const identity=verifyHostedArenaEvidence({app:a.app,epoch:d.epoch,chainId:4242,baseBlock:d.baseBlock,rulesVersion:BigInt(a.rules),runtimeHash:hash},
   {session,rulesVersion:version as bigint,runtimeHash:hash,health});
  const row:any={app:a.app,role:a.role,epoch:d.epoch,batches:d.batchIndex,...identity};
  if(a.role==='agent'){
   const [checkpoint,enabled]=await Promise.all([
    base.readContract({address:a.app,abi:arenaAbi,functionName:'publicationCheckpoint',blockNumber:block.number}),
    base.readContract({address:agents.pool,abi:agentPoolAdmissionAbi,functionName:'arenaAdmissionEnabled',args:[a.app,d.epoch],blockNumber:block.number})]);
   assert.equal(checkpoint,d.epoch);row.checkpoint=checkpoint;row.enabled=enabled;
  }
  report.rows.push(row);await writeFile(output,serialize(report));
  await new Promise(resolve=>setTimeout(resolve,400));
 }
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash);
 report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);report.details=String((e as any).details??(e as any).cause?.shortMessage??'').replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,350);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(output,serialize(report));console.log(serialize({passed:report.passed,rows:report.rows.length,checking:report.checking,error:report.error,details:report.details}));}
