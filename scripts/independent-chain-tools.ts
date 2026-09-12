// Private operator execution uses the existing journal and the same nonce lock as production.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,createWalletClient,http,keccak256,parseTransaction,encodeDeployData,encodeFunctionData,getContractAddress,type Address,type Hex,type Abi} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';

export async function chainTools(prefix:string){
 assert.equal(process.env.PONG_INDEPENDENT_WRITE,'authorized-testnet');
 assert(/^[a-z0-9:-]+$/.test(prefix));
 const secret=JSON.parse(await readFile(process.env.ROOMS_LIFECYCLE_KEY_FILE!,'utf8'));
 const account=privateKeyToAccount(secret.privateKey as Hex);
 assert.equal(account.address.toLowerCase(),'0x369158ac444278541322643e46e0d5b45ac21c4c');
 const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000}),pollingInterval:1000});
 assert.equal(await base.getChainId(),10143);
 const wallet=createWalletClient({account,chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
 const db=new Pool({connectionString:process.env.DATABASE_URL});
 const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 async function submit(name:string,data:Hex,to?:Address,value=0n){
  const id=`${prefix}:${name}`,c=await db.connect(); let locked=false;
  try{
   for(let i=0;i<30&&!locked;i++){locked=(await c.query('SELECT pg_try_advisory_lock(701340) AS ok')).rows[0].ok;if(!locked)await wait(1000);}
   assert(locked,'Operator is busy; retry without creating another operation');
   let job=(await db.query('SELECT * FROM il_lifecycle_jobs WHERE id=$1',[id])).rows[0];
   if(job){
    const raw=parseTransaction(job.raw);
    assert.equal(raw.data,data,'Operation data changed');assert.equal(raw.to?.toLowerCase(),to?.toLowerCase(),'Operation target changed');
    assert.equal(raw.value??0n,value);assert.equal(raw.chainId,10143);assert.equal(keccak256(job.raw),job.hash);
    assert.notEqual(job.status,'failed','A confirmed revert needs a reviewed new operation');
   }else{
    const pending=(await db.query("SELECT id FROM il_lifecycle_jobs WHERE owner=$1 AND status='pending'",[account.address.toLowerCase()])).rows;
    assert.equal(pending.length,0,'Reconcile the existing operator transaction first');
    const nonce=await base.getTransactionCount({address:account.address,blockTag:'pending'});
    assert.equal(nonce,await base.getTransactionCount({address:account.address,blockTag:'latest'}),'Operator nonce is in use');
    await base.call({account:account.address,...(to?{to}:{}),data,value});
    const request=await wallet.prepareTransactionRequest({...(to?{to}:{}),data,value,nonce});request.gas=request.gas*12n/10n;
    const raw=await wallet.signTransaction(request),hash=keccak256(raw);
    const app=to??getContractAddress({from:account.address,nonce:BigInt(nonce)});
    await db.query("INSERT INTO il_lifecycle_jobs(id,app,owner,nonce,raw,hash,status) VALUES($1,$2,$3,$4,$5,$6,'pending')",
      [id,app,account.address.toLowerCase(),nonce,raw,hash]); job={raw,hash,status:'pending'};
   }
   let receipt=await base.getTransactionReceipt({hash:job.hash}).catch(()=>null);
   if(!receipt){try{await base.sendRawTransaction({serializedTransaction:job.raw});}catch{/* Only this exact hash can resolve the intent. */}
    receipt=await base.waitForTransactionReceipt({hash:job.hash,timeout:45000});}
   await db.query('UPDATE il_lifecycle_jobs SET status=$2 WHERE id=$1',[id,receipt.status==='success'?'confirmed':'failed']);
   assert.equal(receipt.status,'success',`Transaction ${receipt.transactionHash} reverted`);
   console.log(JSON.stringify({operation:name,hash:receipt.transactionHash,block:String(receipt.blockNumber),address:receipt.contractAddress}));
   return receipt;
  }finally{if(locked)await c.query('SELECT pg_advisory_unlock(701340)');c.release();}
 }
 const deployed:Record<string,Address>={};
 async function artifact(name:string){const source=name==='LMSRV2'?'MarketV2':name;return JSON.parse(await readFile(`contracts/out/${source}.sol/${name}.json`,'utf8'));}
 async function deploy(name:string,args:readonly unknown[]=[],instance=name):Promise<Address>{
  if(deployed[instance])return deployed[instance];
  const a=await artifact(name); let code=a.bytecode.object as string;
  assert((a.deployedBytecode.object.length-2)/2<=24576,`${name} exceeds EIP-170`);
  for(const libs of Object.values(a.bytecode.linkReferences??{}) as any[]){
   for(const [lib,refs] of Object.entries(libs) as Array<[string,Array<{start:number,length:number}>]>){
    const address=await deploy(lib);
    for(const ref of refs){assert.equal(ref.length,20);const at=2+ref.start*2;code=code.slice(0,at)+address.slice(2).toLowerCase()+code.slice(at+40);}
   }
  }
  assert(/^0x[\da-f]+$/i.test(code),'Unlinked bytecode');
  const data=encodeDeployData({abi:a.abi,bytecode:code as Hex,args});
  const receipt=await submit(`deploy-${instance.toLowerCase()}`,data);assert(receipt.contractAddress);
  deployed[instance]=receipt.contractAddress;
  return receipt.contractAddress;
 }
 async function write(name:string,at:Address,abi:Abi,method:string,args:readonly unknown[]=[],value=0n){
  return submit(name,encodeFunctionData({abi,functionName:method,args}),at,value);
 }
 return {base,account,db,submit,deploy,artifact,write,deployed,close:()=>db.end()};
}
