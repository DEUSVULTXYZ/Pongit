// Retire a superseded agent arcade whose delegation cannot be closed the usual way.
// A delegation's stake is reserved from the validator's own bond, so a session left
// open, or closed but never released, keeps Interlude's funds and one of its slots
// for as long as it stays that way. This closes it through the hub's liveness escape
// once that escape is legitimately open, then releases the stake. Re-runnable: every
// write goes through the shared operator journal under a fixed name.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,encodeFunctionData,http,parseAbi,zeroHash,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {agentArcadeAbi as abi} from '../shared/abi-PongAgentArcade';

assert.equal(process.env.PONG_AGENT_RETIRE_STUCK,'verified-unrecoverable');
if(!process.env.DATABASE_URL)process.env.DATABASE_URL=`postgresql://pong:${encodeURIComponent(process.env.POSTGRES_PASSWORD!)}@postgres:5432/pong_relayer`;
const stamp=process.env.PONG_AGENT_LAB_STAMP!;assert.match(stamp,/^20\d{6}(-[2-9])?$/,'Name the retired laboratory');
const record=JSON.parse(await readFile(`/secrets/agent-arcade-candidate-${stamp}.json`,'utf8'));
const app=String(record.app).toLowerCase() as Address,hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595' as Address;
assert(/^0x[0-9a-f]{40}$/.test(app)&&app!=='0x78d3341e3452d7ec1add9371de3008639eed8eb0','Never the human application');
// The one this laboratory is retiring must not be the arcade still in use.
const current=JSON.parse(await readFile('/current/agents.json','utf8'));
assert.notEqual(String(current.app).toLowerCase(),app,'This arcade is still the current one');
const hubAbi=parseAbi(['function forceClose(address,bytes32)','function releaseStake(address,bytes32)']);
const t=await chainTools(`agent-arcade-retire-${app.slice(2,10)}-${stamp}`);
try{
 let d=await readHubDelegation(t.base,hub,app);const now=()=>t.base.getBlock().then(b=>b.timestamp);
 const report:any={at:new Date().toISOString(),app,stamp,before:{status:d.status,epoch:String(d.epoch),batches:String(d.batchIndex)}};
 // Measured over nine real releases: gas = 224788 + 83192 * batches, in one block.
 const releaseGas=224788n+83192n*d.batchIndex;report.releaseGasEstimate=String(releaseGas);
 assert(releaseGas<140_000_000n,'The stake could not be released afterwards: do not close what cannot be released');
 if(d.status===1){
  // Show the ordinary route is really shut: the app refuses to close while it still
  // counts a game, and that game cannot move any more.
  let closeBlocked=false;
  try{await t.base.call({account:t.account.address,to:app,data:encodeFunctionData({abi,functionName:'closeEngine'})});}catch{closeBlocked=true;}
  assert(closeBlocked,'closeEngine would succeed: use the ordinary lifecycle instead');
  const node=createPublicClient({transport:http(record.node,{retryCount:0,timeout:10000})});
  const live=await node.readContract({address:app,abi,functionName:'activeCount'}) as bigint;
  report.liveGames=String(live);assert(live>0n,'Nothing is stuck on the node');
  const at=await now(),silentSince=d.lastCommitAt,openAfter=silentSince+d.maxBatchInterval;
  report.lastCommitAt=new Date(Number(silentSince)*1000).toISOString();
  report.escapeOpensAt=new Date(Number(openAfter<d.expiresAt?openAfter:d.expiresAt)*1000).toISOString();
  if(at<openAfter&&at<d.expiresAt){report.waiting='The hub liveness escape is not open yet';console.log(JSON.stringify(report));process.exit(0);}
  report.forceCloseHash=(await t.write('force-close',hub,hubAbi,'forceClose',[app,zeroHash])).transactionHash;
  d=await readHubDelegation(t.base,hub,app);
 }
 if(d.status===2){
  report.releaseAt=new Date(Number(d.stakeUnlockAt)*1000).toISOString();
  if(await now()>=d.stakeUnlockAt){
   report.releaseHash=(await t.write('release',hub,hubAbi,'releaseStake',[app,zeroHash])).transactionHash;
   d=await readHubDelegation(t.base,hub,app);
  }
 }
 report.after={status:d.status,epoch:String(d.epoch)};
 await mkdir('artifacts/agents',{recursive:true});await writeFile(`artifacts/agents/retired-${stamp}.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}finally{await t.close();}
