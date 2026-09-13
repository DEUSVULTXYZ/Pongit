// Read-only inspection of the specific failed creation; never duplicates it.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,toFunctionSelector,decodeErrorResult} from 'viem';
import {monadTestnet} from 'viem/chains';
import {privateKeyToAccount} from 'viem/accounts';
import {readHubDelegation} from '../shared/rooms-hub';
const record=JSON.parse(await readFile(process.env.PONG_DRAND_JOURNAL!,'utf8'));
const app=record.app||record.error?.match(/delegateAll reverted on (0x[\da-f]{40})/i)?.[1];assert(app);
const artifact=JSON.parse(await readFile('contracts/out/DrandHostedProbe.sol/DrandHostedProbe.json','utf8'));
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
const read=(functionName:string,args:any[]=[])=>base.readContract({address:app,abi:artifact.abi,functionName,args});
const report:any={at:new Date().toISOString(),app,creationHttp:record.http};
report.hub=await read('hub');report.owner=await read('owner');report.verifier=await read('verifier');
report.round=await read('expectedRound');report.committedAt=await read('committedAt');report.delegation=await readHubDelegation(base,report.hub,app);
try{await base.call({account:report.owner,to:app,data:encodeFunctionData({abi:artifact.abi,functionName:'delegateAll'})});report.simulation='ok';}
catch(e:any){report.simulation={message:e.shortMessage,causes:[]};for(let c=e;c;c=c.cause)report.simulation.causes.push({name:c.name,message:c.shortMessage||c.details,data:c.data,code:c.code});}
report.knownSelectors={ValidatorAtCapacity:toFunctionSelector('ValidatorAtCapacity()')};
report.previousDiagnostics=[];
for(const candidate of [
 '0x4ce249014a54A8260Fe0b8C5A6fde3E0c9c8FfB3','0x39259f34e209Cf00D12E1576f9F9eD9CA75ca69A','0xf44c1Eb74247547214c1901d981dd5E59601994A',
 '0xc6afe5524ecad2e11a5082a2a5d850b8d8c9c773','0xbbf6a28b7f527f98cf1628949a83efe4d7bbf006','0xc93452a9d1da1db01e79d99f531a34104b76fe97',
 '0xe4f978d978cbafe6682d0ac056d773fe2c950c94','0x6d5db79aef6f551319a867d881a019e017bd9263','0x526ef5822169ff21da4e5323d36426df0462dfcb'
] as const){
 const d=await readHubDelegation(base,report.hub,candidate);
 report.previousDiagnostics.push({app:candidate,status:d.status,epoch:d.epoch,releaseAt:d.stakeUnlockAt,expiresAt:d.expiresAt});
}
report.archivedGames=[];
for(const candidate of ['0xfd1693294fed77304662f08e827b043b0ba386a3','0xb3f9c323ffb8ec6a8cd7d06ae239bc3d7bebd59a'] as const){
 const d=await readHubDelegation(base,report.hub,candidate);
 report.archivedGames.push({app:candidate,status:d.status,epoch:d.epoch,releaseAt:d.stakeUnlockAt,expiresAt:d.expiresAt});
}
const r=await fetch('https://control.interludelayer.xyz/sessions/'+app);report.hostedSession={http:r.status,body:await r.json()};
if(record.node){
 const node=createPublicClient({transport:http(record.node,{retryCount:0,timeout:10000})});
 report.live=await node.readContract({address:app,abi:artifact.abi,functionName:'result'});
 report.health=await fetch(record.node+'/health').then(r=>r.json());
 if(record.tx){
  report.transaction={hash:record.tx.hash,state:record.tx.state,responseError:record.tx.responseError,nonce:record.tx.nonce};
  report.receipt=await node.getTransactionReceipt({hash:record.tx.hash}).catch(()=>null);
  report.nonce=await node.getTransactionCount({address:privateKeyToAccount(record.privateKey).address});
 }
}
const vector:any=await fetch('https://api.drand.sh/04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3/public/20594892').then(r=>r.json());
const at=performance.now();report.monadRandomness=await read('verifyOnly',[BigInt(vector.round),`0x${vector.signature}`]);report.monadVerificationMs=performance.now()-at;
assert.equal(report.monadRandomness,`0x${vector.randomness}`);
await writeFile('artifacts/drand/creation-diagnostic.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v));
