// Isolated testnet qualification. Never edits the active game's configuration.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createPublicClient,http,keccak256,encodeFunctionData,toFunctionSelector,parseAbiItem,zeroHash} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {readHubDelegation} from '../shared/rooms-hub';

assert.equal(process.env.PONG_DRAND_QUALIFY,'authorized-testnet');
const mode=process.argv[2];assert(['provision','verify'].includes(mode));
const path=process.env.PONG_DRAND_JOURNAL!;assert(path?.startsWith('/secrets/'));
const artifact=JSON.parse(await readFile('contracts/out/DrandHostedProbe.sol/DrandHostedProbe.json','utf8'));
const codeHash=keccak256(artifact.bytecode.object);
const byteSize=(artifact.deployedBytecode.object.length-2)/2;assert(byteSize<=24576);
const chainHash='04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3';
const safe=(e:any)=>String(e.shortMessage||e.details||e.message||e).split('Request body')[0].replace(/0x[\da-f]{130,}/gi,'[hex omitted]').slice(0,1500);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let record:any;
try{record=JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
async function save(){await writeFile(path+'.next',JSON.stringify(record,null,2),{mode:0o600});await rename(path+'.next',path);}

if(mode==='provision'){
 if(record){assert.equal(record.codeHash,codeHash);assert(record.app,'Creation uncertain; inspect before another attempt');}
 else{
  record={purpose:'DrandHostedProbe',chainId:10143,codeHash,byteSize,state:'sending',at:new Date().toISOString()};await save();
  try{
   const response=await fetch('https://control.interludelayer.xyz/apps',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({name:'PONGIT drand verification probe',bytecode:artifact.bytecode.object,abi:artifact.abi.filter((x:any)=>x.type==='constructor'||x.type==='function'&&x.name==='delegateAll')}),signal:AbortSignal.timeout(120000)});
   const body:any=await response.json().catch(()=>null);record.http=response.status;record.app=body?.app;record.node=body?.url;
   record.state=response.ok&&record.app?'answered':'inspection';if(body?.error)record.error=safe(body.error);
   await save();
  }catch(e){record.state='uncertain';record.error=safe(e);await save();}
 }
 console.log(JSON.stringify({state:record.state,app:record.app,node:record.node,http:record.http,error:record.error,codeHash,byteSize}));
 assert(record.state==='answered'&&record.app&&record.node,'Hosted probe creation not confirmed');
}else{
 assert(record?.app&&record.node);assert.equal(record.codeHash,codeHash);
 const reportPath=process.env.PONG_DRAND_REPORT||'artifacts/drand/hosted.json';assert(reportPath.startsWith('artifacts/'));
 await mkdir('artifacts/drand',{recursive:true});
 const report:any={startedAt:new Date().toISOString(),app:record.app,node:record.node,codeHash,byteSize,checks:[],passed:false};
 const flush=()=>writeFile(reportPath,JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2));
 const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
 const node=createPublicClient({transport:http(record.node,{retryCount:0,timeout:10000})});
 const read=(client:any,fn:string,args:any[]=[])=>client.readContract({address:record.app,abi:artifact.abi,functionName:fn,args});
 try{
  assert.equal(await base.getChainId(),10143);assert.equal(await node.getChainId(),4242);
  const info:any=await fetch(`https://api.drand.sh/${chainHash}/info`).then(r=>r.json());
  assert.equal(info.hash,chainHash);assert.equal(info.period,3);assert.equal(info.genesis_time,1727521075);assert.equal(info.schemeID,'bls-bn254-unchained-on-g1');
  const vector:any=await fetch(`https://api.drand.sh/${chainHash}/public/20594892`).then(r=>r.json());
  assert.equal(vector.randomness,'c1f2d208f143ffd619d40fde95838c4f49b3d44cb37d6daf68d45b124ba00c7e');
  for(const [label,client] of [['Monad',base],['Interlude',node]] as const){
   const at=performance.now();const value=await read(client,'verifyOnly',[BigInt(vector.round),`0x${vector.signature}`]);
   assert.equal(value,`0x${vector.randomness}`);report.checks.push({network:label,valid:true,ms:performance.now()-at});await flush();
   let rejected=false;try{await read(client,'verifyOnly',[BigInt(vector.round)+1n,`0x${vector.signature}`]);}catch(e:any){
    for(let c=e;c;c=c.cause)if(c.data?.startsWith?.(toFunctionSelector('InvalidBeacon()'))||c.data?.errorName==='InvalidBeacon')rejected=true;
   }
   assert(rejected,'Wrong round accepted');report.checks.push({network:label,wrongRoundRejected:true});
  }
  const round=await read(base,'expectedRound'),committedAt=await read(base,'committedAt');
  assert.equal(round,await read(node,'expectedRound'));
  const availableAt=1727521075n+(round-1n)*3n;assert(availableAt>committedAt);
  report.round=round;report.committedAt=committedAt;report.availableAt=availableAt;await flush();
  const hub=await read(base,'hub');const before=await readHubDelegation(base,hub,record.app);
  report.epoch=before.epoch;report.initialBatch=before.batchIndex;
  record.baseStartBlock??=String(await base.getBlockNumber());await save();
  const until=Date.now()+240000;let beacon:any;
  while(Date.now()<until){
   if(BigInt(Math.floor(Date.now()/1000))>=availableAt){
    const r=await fetch(`https://api.drand.sh/${chainHash}/public/${round}`,{signal:AbortSignal.timeout(8000)});
    if(r.ok){beacon=await r.json();break;}
   }
   await sleep(3000);
  }
  assert(beacon&&BigInt(beacon.round)===round,'Expected beacon not available; keep its round');
  assert.equal(await read(node,'verifyOnly',[round,`0x${beacon.signature}`]),`0x${beacon.randomness}`);
  record.privateKey??=generatePrivateKey();await save();const signer=privateKeyToAccount(record.privateKey);
  if(!record.tx){
   const prior=await read(node,'result');assert.equal(prior[2],0n,'Probe already used; reconcile its existing evidence');
   const nonce=await node.getTransactionCount({address:signer.address,blockTag:'pending'});
   assert.equal(nonce,await node.getTransactionCount({address:signer.address,blockTag:'latest'}));
   const data=encodeFunctionData({abi:artifact.abi,functionName:'prove',args:[round,`0x${beacon.signature}`]});
   await node.call({account:signer.address,to:record.app,data,gas:2000000n});
   const raw=await signer.signTransaction({chainId:4242,type:'eip1559',to:record.app,data,nonce,gas:2000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n,value:0n});
   record.tx={raw,hash:keccak256(raw),nonce,state:'prepared',round:String(round),randomness:`0x${beacon.randomness}`};await save();
  }
  const tx=record.tx;assert.equal(tx.round,String(round));assert.equal(keccak256(tx.raw),tx.hash);
  let receipt:any=await node.getTransactionReceipt({hash:tx.hash}).catch(()=>null);
  if(!receipt){
   tx.state='sending';await save();const at=performance.now();
   // The hosted write surface returns the applied receipt directly. Preserve
   // exactly the same signed bytes if an earlier transport reply was lost.
   try{receipt=await node.request({method:'interlude_sendTransaction',params:[tx.raw]} as any);}catch(e:any){
    tx.responseError=safe(e);report.writeErrors=[];
    for(let c=e;c;c=c.cause)report.writeErrors.push({name:c.name,code:c.code,data:c.data,message:safe(c)});
    await save();await flush();
   }
   if(!receipt)receipt=await node.waitForTransactionReceipt({hash:tx.hash,timeout:45000,pollingInterval:500});
   report.commandMs=performance.now()-at;
  }
  assert.equal(receipt.transactionHash.toLowerCase(),tx.hash.toLowerCase());
  assert(['success','0x1'].includes(receipt.status));tx.state='confirmed';await save();
  report.transaction={hash:tx.hash,rawBytes:(tx.raw.length-2)/2,gasUsed:receipt.gasUsed,logs:receipt.logs.length};
  report.live=await read(node,'result');assert.equal(report.live[0],tx.randomness);await flush();
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
   report.published=await read(base,'result');
   if(report.published[0]===tx.randomness){
    assert.deepEqual(report.published,report.live);const d=await readHubDelegation(base,hub,record.app);report.publishedBatch=d.batchIndex;
    assert(d.batchIndex>0n,'A live receipt is not evidence of a published batch');
    assert.equal(d.epoch,report.epoch,'Delegation epoch changed during qualification');
    const publishedAt=await base.getBlockNumber();
    const commits=await base.getLogs({address:hub,event:parseAbiItem('event Committed(address indexed app, bytes32 indexed partition, uint256 batchIndex, bytes32 stateRoot, bytes32 txRoot)'),
      args:{app:record.app,partition:zeroHash},fromBlock:BigInt(record.baseStartBlock),toBlock:publishedAt});
    const commit=[...commits].reverse().find(x=>x.args.batchIndex===d.batchIndex);
    assert(commit,'Published state must have its actual Monad commit transaction');
    const publication=await base.getTransactionReceipt({hash:commit.transactionHash});
    assert.equal(publication.status,'success');
    const call=await base.getTransaction({hash:commit.transactionHash});
    report.publication={hash:commit.transactionHash,block:String(commit.blockNumber),gasUsed:String(publication.gasUsed),
      calldataBytes:(call.input.length-2)/2,logs:publication.logs.length,stateRoot:commit.args.stateRoot,txRoot:commit.args.txRoot};
    report.passed=true;break;
   }
   const health:any=await fetch(`${record.node}/health`).then(r=>r.json());if(health.halted)throw Error(String(health.halted));
   await sleep(2000);
  }
  assert(report.passed,'Verified live beacon not published on Monad');
 }catch(e){report.error=safe(e);process.exitCode=1;}
 finally{report.finishedAt=new Date().toISOString();await flush();console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v));}
}
