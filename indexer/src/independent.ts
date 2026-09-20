import {indexer,createEffect,S} from 'envio';
import {decodePublishedEntry} from './published-result';
import {applyIndependentArchive} from './independent-archive';
import {independentArchiveDeployments} from './independent-deployments';
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
  await applyIndependentArchive(context,event,record,independentArchiveDeployments);
 });
}
