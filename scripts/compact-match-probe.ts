// Hosted qualification only. Records sizes, not replayable signed bytes.
import assert from 'node:assert/strict';
import {decodeFunctionData,parseTransaction,type Hex} from 'viem';
import {delegatableAbi} from '@interludelayer-sdk/sdk';
import {readHubDelegation} from '../shared/rooms-hub';
type Options={client:any;match:any;send:(side:number,name:string,args:any[])=>Promise<any>;t:any;m:any;report:any;flush:()=>Promise<void>};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export async function probeCompactMatch({client,match,send,t,m,report,flush}:Options){
 const id=BigInt(match.id),start=Date.now(),end=start+15*60_000;
 const row:any={app:match.app,id:match.id,mode:match.mode,startedAt:new Date().toISOString(),batches:[],scores:[],commands:[0,0]};
 report.probes??=[];report.probes.push(row);await flush();
 const measured=new Set<number>();let lastScore='',lastInspect=0,lastPause=false;
 while(Date.now()<end){
  const s:any=await client.read('getSnapshot',[id]),state=s[12],score=`${state.scoreA}:${state.scoreB}`;
  if(score!==lastScore){row.scores.push({at:new Date().toISOString(),score});lastScore=score;console.log(JSON.stringify({probe:match.mode,score}));await flush();}
  if(Date.now()-lastInspect>10000||s[2]!==2n){
   lastInspect=Date.now();const status=await client.status();const hub=await readHubDelegation(t.base,m.hub,match.app);
   row.nodeBatches=status.committedBatches;row.monadBatches=String(hub.batchIndex);
   for(let n=1;n<=Number(hub.batchIndex);n++)if(!measured.has(n)){
    const batch:any=await client.node.request({method:'interlude_getBatch',params:[n]});assert(batch&&Array.isArray(batch.transactions),'Published batch unavailable for accounting');
    const b:any={index:n,transactions:batch.transactions.length,rawBytes:0,withSession:0,jsonBytes:Buffer.byteLength(JSON.stringify(batch))};
    for(const tx of batch.transactions){const raw=tx.raw as Hex;b.rawBytes+=(raw.length-2)/2;
     try{if(decodeFunctionData({abi:delegatableAbi,data:parseTransaction(raw).data!}).functionName==='withSession')b.withSession++;}catch{}
    }
    row.batches.push(b);measured.add(n);console.log(JSON.stringify({publishedBatch:b,app:match.app}));
   }
   await flush();
  }
  if(s[2]!==2n){assert.equal(s[2],3n,'Natural game did not finish with a winner');assert(state.scoreA===7||state.scoreB===7);row.finalScore=score;row.finishedAt=new Date().toISOString();await flush();return;}
  if(state.awaitingServe){
   // Finance runs separately; never fabricate a pressure checkpoint to finish a test.
   if(!lastPause){console.log(JSON.stringify({waitingForChaosCheckpoint:score,app:match.app}));lastPause=true;}
   await sleep(2000);continue;
  }
  lastPause=false;
  // Follow the projected interception for the first 100 seconds so that the
  // sample spans multiple publications. Afterwards miss naturally, no concession.
  for(const side of [0,1]){
   const fresh:any=side?await client.read('getSnapshot',[id]):s;
   if(fresh[2]!==2n||fresh[12].awaitingServe)break;
   const v=fresh[12],p=Number(side?v.right:v.left)/1e6;
   let target=side?528:48;
   if(Date.now()-start<100000){
    const x=Number(v.x)/1e6,y=Number(v.y)/1e6,vx=Number(v.vx)/1e6,vy=Number(v.vy)/1e6;
    const distance=((side?984:40)-x)/vx;
    const projected=distance>0?y+vy*distance:288;
    const period=1128,fold=((projected-6)%period+period)%period;target=6+(fold>564?1128-fold:fold);
   }
   const direction=Math.abs(target-p)<14?0:target>p?1:-1;
   const previous=Number(side?v.rightDir:v.leftDir);
   if(direction!==previous){const receipt=await send(side,'input',[id,direction,fresh[side?10:9]+1n,fresh[7]+150n]);row.commands[side]++;assert(receipt.hash);}
   else if(side===0)await send(0,'tick',[id]);
  }
  await sleep(300);
 }
 throw Error('Compact match did not reach its natural result in 15 minutes');
}
