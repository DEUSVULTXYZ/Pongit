import {indexer,createEffect,S} from 'envio';
import {decodePublishedEntry} from './published-result';
import {retainFinished} from './retention';
const publishedEntry=createEffect({name:'pongitPublishedEntryV1',input:{ledger:S.string,id:S.bigint,block:S.bigint,hash:S.string},output:S.string,rateLimit:{calls:3,per:'second'},cache:true},async({input})=>{
 const rpc=process.env.INDEXER_READ_RPC_URL||'http://rpc:8545';
 const response=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:input.ledger,data:'0xe2095c07'+input.id.toString(16).padStart(64,'0')},{blockHash:input.hash,requireCanonical:true}]}),signal:AbortSignal.timeout(15000)});
 const body=await response.json() as any;
 if(!response.ok||body.error||typeof body.result!=='string')throw Error('Published result lookup unavailable');
 const entry=decodePublishedEntry(body.result);if(entry.first.id!==String(input.id))throw Error('Published result identity mismatch');
 return JSON.stringify(entry);
});
for(const name of ['ResultPublished','ResultCorrected','ResultFinal'] as const){
 indexer.onEvent({contract:'IndependentRatings',event:name},async({event,context})=>{
  const record=JSON.parse(await context.effect(publishedEntry,{ledger:event.srcAddress,id:event.params.id,block:BigInt(event.block.number),hash:event.block.hash}));
  const r=record.latest,first=record.first,id=`10143:${first.arena}:${first.epoch}:${first.id}`;
  const previous=await context.Match.get(id);
  const value={id,deployment:`10143:${event.srcAddress.toLowerCase()}`,rawId:r.id,mode:r.mode,ranked:r.ranked,rulesVersion:4,playerA:r.a,playerB:r.b,tournamentId:'0',status:r.status,winner:r.winner,played:previous?.played||r.status===3,scoreA:r.scoreA,scoreB:r.scoreB,endedAt:previous?.endedAt||`${String(event.block.number).padStart(20,'0')}:${String(event.logIndex).padStart(10,'0')}`,replayAvailability:previous?.replayAvailability||'recording',block:BigInt(event.block.number)};
  // The normal Envio retention handler owns all generations and its writes roll
  // back with chain reorganizations. Published corrections do not add another slot.
  if(!previous)await retainFinished(context,value,value.endedAt);else context.Match.set(value);
  if(name==='ResultCorrected')context.Alert.set({id:`correction:${id}:${event.block.hash}`,kind:'published_result_corrected',detail:`${id}: initial ${first.hash}; corrected ${r.hash}. Early payments are not sent a second time.`,block:BigInt(event.block.number)});
 });
}
