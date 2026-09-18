// Failure/race tests use an actual isolated PostgreSQL database and mock chain reads.
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {ContractFunctionRevertedError,createPublicClient,custom,encodeAbiParameters,encodeErrorResult,zeroAddress,zeroHash,type Address,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {sessionGrantTypedData} from '@interludelayer-sdk/sdk';
import {toFunctionSelector} from 'viem';
import {startAgentService} from '../relayer/src/agents/server';
import {createAgentAuth} from '../relayer/src/agents/auth';
import {AgentReplays} from '../relayer/src/agents/replays';
import {initializeAgents} from '../relayer/src/agents/schema';
import {agentArcadeAbi as abi} from '../shared/abi-PongAgentArcade';
import {agentActions,agentAuthMessage,agentMetadata,agentRegistrationTypes,type AgentManifest} from '../shared/agents';
import {initial} from '../shared/physics-interlude';
assert.equal(process.env.PONG_AGENT_INTEGRATION_TEST,'isolated-vps');
assert.match(new URL(process.env.DATABASE_URL!).hostname,/^pongit-agent-db-20\d{6}(-[2-9])?$/,'Run against a dedicated agent database');
// The hosted candidate that shares this database. Its rows must survive the cleanup.
const liveCandidate=(process.env.PONG_AGENT_APP??'').toLowerCase();
assert.match(liveCandidate,/^0x[0-9a-f]{40}$/,'Name the hosted candidate sharing this database in PONG_AGENT_APP');
const db=new Pool({connectionString:process.env.DATABASE_URL,max:6});await initializeAgents(db);
const key=generatePrivateKey(),creator=privateKeyToAccount(generatePrivateKey()),agent=privateKeyToAccount(generatePrivateKey()),player=privateKeyToAccount(generatePrivateKey()),sessionKey=privateKeyToAccount(generatePrivateKey());
const m:AgentManifest={version:1,chainId:10143,engineChainId:4242,rulesVersion:7,app:privateKeyToAccount(key).address,hub:zeroAddress,coordinator:privateKeyToAccount(key).address,node:'https://not-a-real-agent-node.invalid',epoch:'1',maxMatches:2,durationSeconds:300,enabled:false,qualified:false};
let revoked=false,unavailable=false,nonce=0n,phase=2,id=0n;
// Registrations the mocked engine holds, per agent, and what the mocked engine and Monad say
// about one on-chain strategy: its creator, and whether this epoch's pinned state contains it.
const registrations=new Map<string,any>(),written:{name:string;args:any[]}[]=[];
const strategy='0x5eed5eed5eed5eed5eed5eed5eed5eed5eed5eed',strategyCreator=privateKeyToAccount(generatePrivateKey());let pinnedBeforeStrategy=false;
const base=createPublicClient({transport:custom({request:async({method,params}:any)=>{
 if(unavailable)throw Error('Simulated RPC outage');
 const to=String(method==='eth_getCode'?params[0]:params?.[0]?.to).toLowerCase();
 if(to===strategy){
  if(method==='eth_getCode')return '0x6080';
  // creator() has no arguments; decide() always carries a view. Answer "hold" to every position.
  return params[0].data.length===10?encodeAbiParameters([{type:'address'}],[strategyCreator.address]):encodeAbiParameters([{type:'int8'}],[0]);
 }
 return encodeAbiParameters([{type:'uint256'}],[revoked?1n:0n]);
}})});
const frame=()=>({id,revision:nonce+1n,phase,a:player.address,b:agent.address,target:agent.address,winner:zeroAddress,head:100n,clock:0n,nonceA:nonce,nonceB:2n,deadline:0n,observedAt:Date.now(),state:{...initial(zeroHash),t:nonce*1000000n}});
const replays=new AgentReplays(db),coordinator:any={base,feed:{read:async()=>frame()},
 client:{read:async(_name:string,[agent]:[string])=>{const r=registrations.get(agent.toLowerCase());return r?[r.creator,r.modes,0,r.metadata]:[zeroAddress,0,0,zeroHash];},
  status:async()=>({baseBlock:63602747}),
  node:{simulateContract:async()=>{if(pinnedBeforeStrategy)throw new ContractFunctionRevertedError({abi:abi as any,functionName:'registerAgent',data:encodeErrorResult({abi:abi as any,errorName:'InvalidRegistration'})});}}},
 writer:{send:async(_op:string,name:string,args:any[])=>{assert.equal(name,'registerAgent');written.push({name,args});registrations.set(String(args[0].agent).toLowerCase(),args[0]);}},replays,health:()=>({stage:'online'}),cycle:async()=>{},stop:async()=>{}};
const auth=createAgentAuth(db,base,m,abi),service=await startAgentService({db,manifest:m,key,rpcUrl:'http://unused.invalid',port:0,origin:'https://pongit.xyz',dependencies:{coordinator,auth}});
const url=`http://127.0.0.1:${(service.server.address() as any).port}`;let token='';
const api=async(path:string,body?:unknown,override?:string)=>{const r=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',authorization:`Bearer ${override??token}`},body:body===undefined?undefined:JSON.stringify(body,(_,x)=>typeof x==='bigint'?String(x):x)});return {status:r.status,value:await r.json()};};
const grant={granter:player.address,sessionKey:sessionKey.address,expiry:BigInt(Math.floor(Date.now()/1000)+7100),epoch:0n,anyFunction:false,
 selectors:abi.filter(x=>x.type==='function'&&(agentActions as readonly string[]).includes(x.name)).map(x=>toFunctionSelector(x as any))};
async function login(){const challenge=(await api('/auth/challenge',{player:player.address})).value;
 const body={player:player.address,nonce:challenge.nonce,grant,grantSignature:await player.signTypedData(sessionGrantTypedData(grant,{app:m.app,baseChainId:10143})),
 signature:await sessionKey.signMessage({message:agentAuthMessage(player.address,challenge.nonce,challenge.expires,m.app)})};
 const result=await api('/auth/session',body);assert.equal(result.status,200);token=result.value.token;return body;
}
const checks:string[]=[];
try{
 const proofBody=await login();assert.equal((await api('/auth/session',proofBody)).status,401);checks.push('authentication proof replay rejected');
 const expires=BigInt(Math.floor(Date.now()/1000)+300),r={creator:creator.address,agent:agent.address,modes:3,metadata:agentMetadata('Test Agent',0),expires};
 const typed={domain:{name:'PONGIT Agent Arcade',version:'1',chainId:10143,verifyingContract:m.app},types:agentRegistrationTypes,primaryType:'AgentRegistration' as const,message:r};
 const register={...r,name:'Test Agent',avatar:0,creatorProof:await creator.signTypedData(typed),agentProof:await agent.signTypedData(typed)};
 const registered=await Promise.all([api('/register',register),api('/register',register)]);assert(registered.every(x=>x.status===200));
 assert.equal((await db.query('SELECT count(*) FROM agent_arcade.identities WHERE app=$1',[m.app.toLowerCase()])).rows[0].count,'1');checks.push('concurrent dual-proof registration is unique');
 {
  const sr={creator:strategyCreator.address,agent:strategy as Address,modes:3,metadata:agentMetadata('Tracker',4),expires};
  const signed=async(message:any)=>({...message,name:'Tracker',avatar:4,creatorProof:await strategyCreator.signTypedData({...typed,message})});
  // Deployed after this epoch's pinned block: refused with the reason, and nothing written.
  pinnedBeforeStrategy=true;const early=await api('/register',await signed(sr));
  assert.equal(early.status,409);assert.equal(early.value.code,'AGENT_STRATEGY_NEXT_EPOCH');assert.match(early.value.error,/63602747/);
  assert.equal(written.length,1);assert.equal((await db.query('SELECT count(*) FROM agent_arcade.identities WHERE app=$1 AND agent=$2',[m.app.toLowerCase(),strategy])).rows[0].count,'0');
  checks.push('a strategy the pinned epoch cannot see is refused with the reason and nothing written');
  // Only the creator signs; a strategy is queued for both modes at once and needs no presence.
  pinnedBeforeStrategy=false;const accepted=await api('/register',await signed(sr));
  assert.equal(accepted.status,200);assert.equal(accepted.value.kind,'strategy');assert.deepEqual(accepted.value.qualification,{0:'queued',1:'queued'});
  assert.equal(written.at(-1)!.args[2],'0x');
  const listed=(await api('/catalog')).value.agents.find((x:any)=>x.agent===strategy);assert.equal(listed.kind,'strategy');assert.equal(listed.available,true);
  checks.push('a strategy registers on its creator signature alone, queued and available without presence');
  // A signature from anyone else is refused, and a creator re-signing requeues only a retry.
  const forged={...sr,expires:expires+1n,name:'Tracker',avatar:4,creatorProof:await agent.signTypedData({...typed,message:{...sr,expires:expires+1n}})};
  const refused=await api('/register',forged);assert.equal(refused.status,403);assert.equal(refused.value.code,'AGENT_REGISTRATION_SIGNATURE');
  await db.query(`UPDATE agent_arcade.identities SET qualification='{"0":"retry","1":"qualified"}' WHERE app=$1 AND agent=$2`,[m.app.toLowerCase(),strategy]);
  const again=await api('/register',await signed({...sr,expires:expires+2n}));assert.equal(again.status,200);assert.deepEqual(again.value.qualification,{0:'queued',1:'qualified'});
  assert.equal(written.length,2);checks.push('only the creator signs a strategy, and signing again requeues only a mode to retry');
 }
 {
  // A service with hosted real-time agents closed, as a public arcade is by default: it says so
  // in its configuration and refuses a dual-proof registration before reading or writing anything.
  const closedKey=generatePrivateKey(),closedApp=privateKeyToAccount(closedKey).address;
  const closedManifest={...m,app:closedApp,coordinator:closedApp};
  const closed=await startAgentService({db,manifest:closedManifest,key:closedKey,rpcUrl:'http://unused.invalid',port:0,origin:'https://pongit.xyz',realtimeAgents:false,
   dependencies:{coordinator,auth:createAgentAuth(db,base,closedManifest,abi)}});
  try{
   const at=`http://127.0.0.1:${(closed.server.address() as any).port}`;
   const config=await (await fetch(at+'/config')).json();assert.deepEqual(config.registration,{strategies:true,realtimeAgents:false});
   const before=written.length,response=await fetch(at+'/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(register,(_,x)=>typeof x==='bigint'?String(x):x)});
   assert.equal(response.status,403);assert.equal((await response.json()).code,'AGENT_REALTIME_CLOSED');assert.equal(written.length,before);
   assert.equal((await db.query('SELECT count(*) FROM agent_arcade.identities WHERE app=$1',[closedApp.toLowerCase()])).rows[0].count,'0');
   checks.push('a service with real-time agents closed says so and refuses one before writing anything');
  }finally{await closed.close();for(const table of ['health','control'])await db.query(`DELETE FROM agent_arcade.${table} WHERE app=$1`,[closedApp.toLowerCase()]);}
 }
 await db.query("UPDATE agent_arcade.identities SET qualification='{\"0\":\"qualified\"}' WHERE app=$1",[m.app.toLowerCase()]);
 await db.query('INSERT INTO agent_arcade.presence(app,player,available) VALUES($1,$2,true)',[m.app.toLowerCase(),agent.address.toLowerCase()]);
 const operation=crypto.randomUUID(),request={agent:agent.address,mode:0,operation};
 const challenges=await Promise.all([api('/challenges',request),api('/challenges',request)]);assert(challenges.every(x=>x.status===200));assert.equal(challenges[0].value.id,challenges[1].value.id);
 assert.equal((await db.query('SELECT count(*) FROM agent_arcade.challenges WHERE app=$1',[m.app.toLowerCase()])).rows[0].count,'1');
 const restored=await api('/challenges',request);assert.equal(restored.status,200);checks.push('duplicate challenge operation restores one reservation');
 await api('/challenges/cancel',{id:restored.value.id});assert.equal((await api('/me')).value.request.status,'cancelled');
 id=BigInt((await db.query("INSERT INTO agent_arcade.matches(app,epoch,kind,mode,a,b,ranked,status) VALUES($1,1,'qualification',0,$2,$3,false,'active') RETURNING id",[m.app.toLowerCase(),player.address.toLowerCase(),agent.address.toLowerCase()])).rows[0].id);
 await db.query('INSERT INTO agent_arcade.occupancy VALUES($1,$2,$3)',[m.app.toLowerCase(),player.address.toLowerCase(),String(id)]);
 {const me=(await api('/me')).value;assert.equal(me.match.kind_b,'community');assert.equal(me.match.kind_a,null);assert.equal(me.qualification,null);checks.push('a match names the kind of each seat, and the player its own qualification');}
 assert.equal((await api('/qualification/checkpoint',{})).status,409);nonce=2n;assert.equal((await api('/qualification/checkpoint',{})).value.resumed,false);
 assert.equal((await api('/qualification/checkpoint',{})).value.resumed,false);await login();nonce=3n;assert.equal((await api('/qualification/checkpoint',{})).value.resumed,true);
 const check=(await db.query('SELECT * FROM agent_arcade.qualification_checks WHERE match_id=$1',[String(id)])).rows[0];assert.notEqual(check.initial_token,check.resumed_token);checks.push('qualification requires an authenticated reconnect after valid controls');
 nonce=5n;replays.capture(frame());await replays.flush();phase=3;nonce=6n;replays.capture(frame());await replays.flush();
 await db.query("UPDATE agent_arcade.challenges SET status='offered',match_id=$2 WHERE id=$1",[restored.value.id,String(id)]);
 const nextRequest={...request,operation:crypto.randomUUID()},next=await Promise.all([api('/challenges',nextRequest),api('/challenges',nextRequest)]);
 assert(next.every(r=>r.status===200));assert.equal(next[0].value.id,next[1].value.id);
 assert.equal((await db.query('SELECT match_id::text FROM agent_arcade.occupancy WHERE app=$1 AND player=$2',[m.app.toLowerCase(),player.address.toLowerCase()])).rows[0].match_id,String(id));
 assert.equal((await db.query('SELECT status FROM agent_arcade.challenges WHERE id=$1',[restored.value.id])).rows[0].status,'completing');
 await api('/challenges/cancel',{id:next[0].value.id});checks.push('a terminal engine result allows one next reservation while publication retains old occupancy');
 await db.query("UPDATE agent_arcade.matches SET status='complete' WHERE id=$1",[String(id)]);await replays.finish(String(id));
 assert.equal((await replays.read(String(id))).frames.length,2);checks.push('verified replay packs once and retains a recent shared result');
 assert.equal((await api(`/replay?id=${id}&app=${m.app}&epoch=2`)).status,404);checks.push('wrong replay epoch cannot resolve a different match');
 unavailable=true;const freshAuth=createAgentAuth(db,base,m,abi);await assert.rejects(()=>freshAuth.require({headers:{authorization:`Bearer ${token}`}} as any));
 assert.equal((await db.query('SELECT count(*) FROM agent_arcade.sessions WHERE app=$1',[m.app.toLowerCase()])).rows[0].count,'2');unavailable=false;checks.push('RPC outage preserves stored authorization');
 const keyRevocation=createAgentAuth(db,base,m,abi,async()=>BigInt(player.address));await assert.rejects(()=>keyRevocation.require({headers:{authorization:`Bearer ${token}`}} as any),/revoked/);checks.push('a compact-key revocation also rejects API access without revoking every owner session');
 revoked=true;const revocationAuth=createAgentAuth(db,base,m,abi);await assert.rejects(()=>revocationAuth.require({headers:{authorization:`Bearer ${token}`}} as any),/revoked/);checks.push('confirmed revocation rejects further API access');
 console.log(JSON.stringify({at:new Date().toISOString(),scope:'isolated PostgreSQL and HTTP with explicitly mocked chain responses',checks,passed:checks.length}));
}finally{
 await Promise.all([service.close(),service.close()]);
 // Only this test's random application. Never leave simulated results in the
 // database used by the separately pinned hosted candidate's qualification.
 // The address is freshly generated above, so this only has to exclude the two
 // real applications that may share this database. The candidate is required at
 // start-up, so this comparison can never silently be against an empty string.
 const testApp=m.app.toLowerCase();assert.notEqual(testApp,'0x78d3341e3452d7ec1add9371de3008639eed8eb0');
 assert.notEqual(testApp,liveCandidate);
 const cleanup=await db.connect();try{await cleanup.query('BEGIN');
  for(const table of ['frames','replays','qualification_checks'])await cleanup.query(`DELETE FROM agent_arcade.${table} WHERE match_id IN (SELECT id FROM agent_arcade.matches WHERE app=$1)`,[testApp]);
  for(const table of ['occupancy','challenges','sessions','auth_nonces','presence','identities','ratings','engine_jobs','health','control','lifecycle','matches'])await cleanup.query(`DELETE FROM agent_arcade.${table} WHERE app=$1`,[testApp]);
  await cleanup.query('COMMIT');
 }catch(e){await cleanup.query('ROLLBACK');throw e;}finally{cleanup.release();await db.end();}
}
