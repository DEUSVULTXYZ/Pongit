// Read-only inventory from already-known PONGIT application records. Never
// retires a session or treats financial/history ownership as permission to do so.
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {readHubDelegation} from '../shared/rooms-hub';
const entries=JSON.parse(await readFile('artifacts/qualification/20260919/app-inventory.json','utf8')) as {app:Address;source:string}[];
const client=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:12000})});
if(await client.getChainId()!==10143)throw Error('Read Monad Testnet only');
const apps=[...new Set([...entries.map(x=>x.app),'0x75de1559bedad84755199295a305dd0b8309bf02' as Address])];
const rows=[];
for(const app of apps){
 try{let s;for(let attempt=0;;attempt++){
   try{s=await readHubDelegation(client,'0x3Ef8327F69e09cf721772F345e2A887eA22cD595',app);break;}
   catch(e){if(attempt>=2)throw e;await new Promise(r=>setTimeout(r,2000*(attempt+1)));}
  }
  rows.push({app,status:s.status,epoch:String(s.epoch),batches:String(s.batchIndex),expiresAt:String(s.expiresAt),releaseAt:String(s.stakeUnlockAt)});
 }catch{rows.push({app,status:'read-unavailable'});}
 await new Promise(r=>setTimeout(r,500));
}
const report={at:new Date().toISOString(),readOnly:true,rows};
await writeFile(`artifacts/qualification/20260919/known-app-capacity-${Date.now()}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
