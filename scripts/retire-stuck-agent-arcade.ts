// Retire a superseded agent arcade and release its stake. A delegation's stake is
// reserved from the validator's own bond, so a session left open, or closed but never
// released, keeps Interlude's funds and one of its slots for as long as it stays that
// way. A healthy predecessor closes itself with closeEngine once it has drained; a
// frozen one is closed through the hub's liveness escape once that is legitimately
// open. Re-runnable: every write goes through the shared operator journal by name.
//
// Stop the retired laboratory's keeper, service and bots first. The script also leaves
// a tombstone its lifecycle honours, so a keeper left running cannot reopen the arcade.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,encodeFunctionData,http,parseAbi,zeroHash,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {agentArcadeAbi as abi} from '../shared/abi-PongAgentArcade';

// verified-unrecoverable: the frozen case, closed through the hub's escape.
// superseded: a healthy predecessor, drained like any renewal, closed by its own closeEngine.
const mode=process.env.PONG_AGENT_RETIRE_STUCK;
assert(mode==='verified-unrecoverable'||mode==='superseded','Say which kind of retirement this is');
if(!process.env.DATABASE_URL)process.env.DATABASE_URL=`postgresql://pong:${encodeURIComponent(process.env.POSTGRES_PASSWORD!)}@postgres:5432/pong_relayer`;
const stamp=process.env.PONG_AGENT_LAB_STAMP!;assert.match(stamp,/^20\d{6}(-[2-9])?$/,'Name the retired laboratory');
const record=JSON.parse(await readFile(`/secrets/agent-arcade-candidate-${stamp}.json`,'utf8'));
const app=String(record.app).toLowerCase() as Address,hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595' as Address;
assert(/^0x[0-9a-f]{40}$/.test(app)&&app!=='0x78d3341e3452d7ec1add9371de3008639eed8eb0','Never the human application');
// The one this laboratory is retiring must not be the arcade still in use. A pointer with no
// address would compare as the string "undefined" and pass, so it has to name one.
const current=JSON.parse(await readFile('/current/agents.json','utf8'));
const currentApp=String(current.app).toLowerCase();
assert.match(currentApp,/^0x[0-9a-f]{40}$/,'The current pointer names no arcade');
assert.notEqual(currentApp,app,'This arcade is still the current one');
const hubAbi=parseAbi(['function forceClose(address,bytes32)','function releaseStake(address,bytes32)']);
const t=await chainTools(`agent-arcade-retire-${app.slice(2,10)}-${stamp}`);
const lab=mode==='superseded'?new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:2}):undefined;
try{
 let d=await readHubDelegation(t.base,hub,app);const now=()=>t.base.getBlock().then(b=>b.timestamp);
 const report:any={at:new Date().toISOString(),app,stamp,mode,before:{status:d.status,epoch:String(d.epoch),batches:String(d.batchIndex)}};
 // Measured over nine real releases: gas = 224788 + 83192 * batches, in one block. The operator
 // journal signs 1.2 times the estimate, and a transaction above the block limit is never mined.
 const releaseGas=224788n+83192n*d.batchIndex;report.releaseGasEstimate=String(releaseGas);
 assert(releaseGas*12n/10n<140_000_000n,'The stake could not be released afterwards: do not close what cannot be released');
 if(d.status===1){
  // A tombstone the retired laboratory's lifecycle checks before any renewEngine, so a keeper
  // left running cannot reopen what this closes.
  const tomb='/secrets/ops/retired.json';
  await writeFile(tomb+'.next',JSON.stringify({app,epoch:String(d.epoch),at:report.at,mode}),{mode:0o600});await rename(tomb+'.next',tomb);
 }
 if(d.status===1&&mode==='superseded'){
  // A live arcade commits every half second or so while it plays. Ten minutes of silence is the
  // signal, independent of any pointer file, that its laboratory really has stopped.
  assert((await now())-d.lastCommitAt>=600n,'This arcade committed in the last ten minutes: stop its laboratory before retiring it');
  // The same drain rule as an ordinary renewal: admissions off for longer than any offer lives,
  // nothing preparing, offered, active or publishing, no uncertain command, no pending diff.
  await lab!.query("INSERT INTO agent_arcade.control(app,admissions,reason) VALUES($1,false,'Retirement') ON CONFLICT(app) DO UPDATE SET admissions=false,reason='Retirement',updated_at=now() WHERE agent_arcade.control.admissions",[app]);
  const control=(await lab!.query("SELECT extract(epoch FROM now()-updated_at)::int AS age FROM agent_arcade.control WHERE app=$1",[app])).rows[0];
  const games=Number((await lab!.query("SELECT count(*) FROM agent_arcade.matches WHERE app=$1 AND status IN ('preparing','offered','active','publishing')",[app])).rows[0].count);
  const uncertain=Number((await lab!.query("SELECT count(*) FROM agent_arcade.engine_jobs WHERE app=$1 AND state IN ('prepared','uncertain')",[app])).rows[0].count);
  const node=createPublicClient({transport:http(record.node,{retryCount:0,timeout:10000})});
  const session:any=await node.request({method:'interlude_session',params:[]} as any);
  const health:any=await fetch(record.node+'/health',{signal:AbortSignal.timeout(10000)}).then(r=>r.json());
  const [live,published]=await Promise.all([node.readContract({address:app,abi,functionName:'activeCount'}),t.base.readContract({address:app,abi,functionName:'activeCount'})]) as [bigint,bigint];
  Object.assign(report,{drainingSeconds:control.age,games,uncertain,pendingDiffs:session.pendingDiffs.length,liveGames:String(live),publishedGames:String(published)});
  assert(session.app.toLowerCase()===app&&session.chainId===4242&&String(session.epoch)===String(d.epoch)&&!health.halted,'The node does not serve this epoch');
  if(control.age<60||games||uncertain||session.pendingDiffs.length||live!==0n||published!==0n){report.waiting='Still draining';console.log(JSON.stringify(report));process.exit(0);}
  report.closeHash=(await t.write(`close-${d.epoch}`,app,abi,'closeEngine')).transactionHash;
  d=await readHubDelegation(t.base,hub,app);
 }
 if(d.status===1){
  // Show the ordinary route is really shut: the app refuses to close while it still
  // counts a game, and that game cannot move any more.
  let closeBlocked=false;
  try{await t.base.call({account:t.account.address,to:app,data:encodeFunctionData({abi,functionName:'closeEngine'})});}catch{closeBlocked=true;}
  assert(closeBlocked,'closeEngine would succeed: retire it as superseded instead');
  const node=createPublicClient({transport:http(record.node,{retryCount:0,timeout:10000})});
  const live=await node.readContract({address:app,abi,functionName:'activeCount'}) as bigint;
  report.liveGames=String(live);assert(live>0n,'Nothing is stuck on the node');
  const at=await now(),silentSince=d.lastCommitAt,openAfter=silentSince+d.maxBatchInterval;
  report.lastCommitAt=new Date(Number(silentSince)*1000).toISOString();
  report.escapeOpensAt=new Date(Number(openAfter<d.expiresAt?openAfter:d.expiresAt)*1000).toISOString();
  if(at<openAfter&&at<d.expiresAt){report.waiting='The hub liveness escape is not open yet';console.log(JSON.stringify(report));process.exit(0);}
  report.forceCloseHash=(await t.write(`force-close-${d.epoch}`,hub,hubAbi,'forceClose',[app,zeroHash])).transactionHash;
  d=await readHubDelegation(t.base,hub,app);
 }
 if(d.status===2){
  report.releaseAt=new Date(Number(d.stakeUnlockAt)*1000).toISOString();
  if(await now()>=d.stakeUnlockAt){
   report.releaseHash=(await t.write(`release-${d.epoch}`,hub,hubAbi,'releaseStake',[app,zeroHash])).transactionHash;
   d=await readHubDelegation(t.base,hub,app);
  }
 }
 report.after={status:d.status,epoch:String(d.epoch)};
 await mkdir('artifacts/agents',{recursive:true});await writeFile(`artifacts/agents/retired-${stamp}.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}finally{await t.close();await lab?.end();}
