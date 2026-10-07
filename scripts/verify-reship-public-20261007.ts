// Read-only verification of the authorized October 7 public reship.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,parseEther,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {independentRules} from '../shared/independent-rules';
import {readHubDelegation} from '../shared/rooms-hub';
import {canonicalContractReads} from '../shared/canonical-contract-reads';

assert.equal(process.env.PONG_PUBLIC_RESHIP_VERIFY,'read-only-20261007');
const root='artifacts/reship-20261007';
const human=JSON.parse(await readFile(root+'/human-public-manifest.json','utf8'));
const addresses=JSON.parse(await readFile(root+'/new-addresses.json','utf8'));
const retired=JSON.parse(await readFile(root+'/retirement-final.json','utf8'));
const browser=JSON.parse(await readFile('artifacts/independent-candidate/browser-chaos-reship7pvp2/report.json','utf8'));
assert(browser.passed&&browser.bet&&browser.lobby.toLowerCase()===human.lobby.toLowerCase());
assert.equal(addresses.agent.contracts.pool.toLowerCase(),'0x89906fadc63704b003c5e5ca8e090f4dca757902');
const attempt=Number(process.env.PONG_PUBLIC_RESHIP_ATTEMPT??1);assert(Number.isInteger(attempt)&&attempt>=1&&attempt<=3);
const base=createPublicClient({chain:monadTestnet,transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:15000})});
const anchor=await base.getBlock();assert(anchor.hash);
const read=canonicalContractReads(base,anchor.hash).read;
const report:any={at:new Date().toISOString(),block:String(anchor.number),blockHash:anchor.hash,passed:false,newArenas:[],retiredArenas:[]};
try{
 for(const arena of [...addresses.agent.arenas,...human.arenas]){
  const d=await readHubDelegation(base,human.hub,arena.app,anchor.number);
  assert(d.status===1&&d.epoch===1n&&d.expiresAt===0n);
  report.newArenas.push({app:arena.app,epoch:String(d.epoch),status:d.status,batches:String(d.batchIndex)});
 }
 assert.equal(report.newArenas.length,11);
 for(const arena of retired.arenas){
  const d=await readHubDelegation(base,human.hub,arena.app,anchor.number);
  assert.equal(d.status,0);assert.equal(String(d.epoch),arena.epoch);
  report.retiredArenas.push({app:arena.app,epoch:String(d.epoch),status:d.status});
 }
 assert.equal(report.retiredArenas.length,11);
 const market=independentRules(human).market,id=BigInt(browser.bet.matchId),player=browser.bet.player as Address;
 const position=await read(human.market,market,'positions',[id,player]);
 const payoutId=await read(human.market,market,'payoutId',[0,id,player]);
 const payout=await read(human.market,market,'payouts',[payoutId]);
 assert.equal(position[3],true);assert.equal(payout[0].toLowerCase(),player.toLowerCase());
 assert.equal(payout[1],parseEther('.006'));assert.equal(payout[2],2);assert.equal(payout[3],1);
 assert.equal(await base.getBalance({address:player,blockNumber:anchor.number}),payout[1]);
 const duplicateChecks=[];
 for(const [method,args,reason] of [['claim',[id,player],'claim'],['retryPayout',[payoutId],'not pending']] as const){
  let rejected=false;
  try{await base.simulateContract({address:human.market,abi:market,functionName:method,args:args as any,blockNumber:anchor.number});}
  catch(e){assert(String((e as any).shortMessage??(e as Error).message).includes(reason));rejected=true;}
  assert(rejected);duplicateChecks.push(method);
 }
 report.payment={matchId:String(id),player,payoutId,amount:String(payout[1]),attempts:payout[3],duplicateChecks,beneficiaryBrowserDisconnected:true};
 const response=await fetch('https://pongit.xyz/api/agents/matches/0xe54eb61b664ced190b4663e3a3e5c11d7f12b748/9/837');assert(response.ok);
 const old=await response.json() as any;
 assert.equal(old.ref.id,'837');assert.equal(old.result.status,3);assert.equal(old.result.finality,true);
 report.historicalMatch={ref:old.ref,result:old.result};
 assert.equal((await base.getBlock({blockNumber:anchor.number})).hash,anchor.hash);
 report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].slice(0,300);process.exitCode=1;}
await writeFile(root+'/public-readonly-'+attempt+'.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));
