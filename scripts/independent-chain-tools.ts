// Private operator execution uses the existing journal and the same nonce lock as production.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,createWalletClient,http,keccak256,parseTransaction,recoverTransactionAddress,encodeDeployData,encodeFunctionData,getContractAddress,type Address,type Hex,type Abi} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {assertDeploymentArtifact,preflightDeploymentArtifacts,deploymentArtifactPath} from '../shared/deployment-artifacts';
import {writerIdentity,type ScopedWriter} from '../shared/scoped-writer';
import {operatorNeedsFunding,operatorFundingMessage} from '../shared/operator-funding';
import {rebroadcastFundedOperation} from '../shared/operator-rebroadcast';
import {prepareSponsoredTransaction} from '../relayer/src/sponsor-prepare';
import {continuousSubmissionGuard} from '../shared/continuous-delegation';

export async function chainTools(prefix:string,fetchFn?:typeof fetch,scope?:ScopedWriter){
 assert.equal(process.env.PONG_INDEPENDENT_WRITE,'authorized-testnet');
 assert(/^[a-z0-9:-]+$/.test(prefix));
 if(scope&&!scope.keyFile)throw Error('Dedicated operator key path required');
 const secret=JSON.parse(await readFile(scope?.keyFile??process.env.ROOMS_LIFECYCLE_KEY_FILE!,'utf8'));
 const account=privateKeyToAccount(secret.privateKey as Hex);
 if(!scope)assert.equal(account.address.toLowerCase(),'0x369158ac444278541322643e46e0d5b45ac21c4c');
 const identity=writerIdentity(account.address,scope);
 const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000,fetchFn}),pollingInterval:1000});
 assert.equal(await base.getChainId(),10143);
 const wallet=createWalletClient({account,chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000,fetchFn})});
 const recovery=process.env.OPERATOR_RECOVERY_RPC_URL?createPublicClient({chain:monadTestnet,
  transport:http(process.env.OPERATOR_RECOVERY_RPC_URL,{retryCount:0,timeout:10000,fetchFn})}):undefined;
 const db=new Pool({connectionString:process.env.DATABASE_URL});
 const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 const continuousCheck=continuousSubmissionGuard(base);
 const check=async(to:Address|undefined,data:Hex,value:bigint)=>{
  if(scope){assert(to,'Scoped roles cannot deploy contracts');scope.allowCall(to,data,value);}
  await continuousCheck(to,data);
 };
 async function submit(name:string,data:Hex,to?:Address,value=0n){
  const id=`${prefix}:${name}`,c=await db.connect(); let locked=false;
  try{
   for(let i=0;i<30&&!locked;i++){locked=(await c.query('SELECT pg_try_advisory_lock($1::bigint) AS ok',[identity.lock])).rows[0].ok;if(!locked)await wait(1000);}
   assert(locked,'Operator is busy; retry without creating another operation');
   let job=(await db.query('SELECT * FROM il_lifecycle_jobs WHERE id=$1',[id])).rows[0];
   if(job){
    assert.equal(job.owner.toLowerCase(),identity.owner,'Operation belongs to another signer');
    const raw=parseTransaction(job.raw);
    assert.equal((await recoverTransactionAddress({serializedTransaction:job.raw})).toLowerCase(),identity.owner,'Operation signer mismatch');
    // viem omits data when decoding an empty-calldata transfer. It is the same
    // signed intent as 0x, including when reconciling an already funded role.
    assert.equal(raw.data??'0x',data,'Operation data changed');assert.equal(raw.to?.toLowerCase(),to?.toLowerCase(),'Operation target changed');
    assert.equal(raw.value??0n,value);assert.equal(raw.chainId,10143);assert.equal(keccak256(job.raw),job.hash);
    assert.notEqual(job.status,'failed','A confirmed revert needs a reviewed new operation');
   }else{
    await check(to,data,value);
    const pending=(await db.query("SELECT id FROM il_lifecycle_jobs WHERE owner=$1 AND status='pending'",[account.address.toLowerCase()])).rows;
    assert.equal(pending.length,0,'Reconcile the existing operator transaction first');
    // Dedicated roles use the same reviewed parallel preparation as sponsoring.
    // The original operator and deployment path keep their existing preparation.
    // Both paths still simulate, reconcile nonces and journal before submission.
    const request=scope&&to?await (async()=>{
     await base.call({account:account.address,to,data,value});
     return prepareSponsoredTransaction(base,account.address,{to,data,value});
    })():await (async()=>{
     const nonce=await base.getTransactionCount({address:account.address,blockTag:'pending'});
     assert.equal(nonce,await base.getTransactionCount({address:account.address,blockTag:'latest'}),'Operator nonce is in use');
     await base.call({account:account.address,...(to?{to}:{}),data,value});
     const request=await wallet.prepareTransactionRequest({...(to?{to}:{}),data,value,nonce});request.gas=request.gas*12n/10n;return request;
    })();
    const nonce=request.nonce;
    // A transaction above the block gas limit can never be mined. Journaled as pending it
    // would hold this shared operator nonce for good, and production's lifecycle with it.
    assert(request.gas<=30_000_000n&&request.gas<=(await base.getBlock()).gasLimit,'Gas limit exceeds the Monad transaction/block limit');
    const maximumFee=request.maxFeePerGas??('gasPrice' in request?request.gasPrice:undefined);
    assert(maximumFee!==undefined,'Transaction fee must be known before signing');
    if(await base.getBalance({address:account.address})<request.gas*maximumFee+value)
     throw Object.assign(Error(operatorFundingMessage),{code:'OPERATOR_GAS_UNAVAILABLE',source:'monad'});
    await check(to,data,value);
    const raw=await wallet.signTransaction(request),hash=keccak256(raw);
    const app=to??getContractAddress({from:account.address,nonce:BigInt(nonce)});
    await db.query("INSERT INTO il_lifecycle_jobs(id,app,owner,nonce,raw,hash,status) VALUES($1,$2,$3,$4,$5,$6,'pending')",
      [id,app,account.address.toLowerCase(),nonce,raw,hash]); job={raw,hash,status:'pending'};
   }
   let receipt=await base.getTransactionReceipt({hash:job.hash}).catch(()=>null);
   if(!receipt){await check(to,data,value);try{await base.sendRawTransaction({serializedTransaction:job.raw});}catch(error){
     // Preserve the signed journal, but surface a definitive gas refusal rather
     // than turning it into an unexplained 45-second receipt timeout.
     if(operatorNeedsFunding(error)&&(!recovery||!await rebroadcastFundedOperation(base,recovery,job,account.address)))
      throw Object.assign(Error(operatorFundingMessage),{code:'OPERATOR_GAS_UNAVAILABLE',source:'monad'});
     /* Only this exact hash can resolve any other uncertain submission. */
    }
    receipt=await base.waitForTransactionReceipt({hash:job.hash,timeout:45000});}
   await db.query('UPDATE il_lifecycle_jobs SET status=$2 WHERE id=$1',[id,receipt.status==='success'?'confirmed':'failed']);
   assert.equal(receipt.status,'success',`Transaction ${receipt.transactionHash} reverted`);
   console.log(JSON.stringify({operation:name,hash:receipt.transactionHash,block:String(receipt.blockNumber),address:receipt.contractAddress}));
   return receipt;
  }finally{if(locked)await c.query('SELECT pg_advisory_unlock($1::bigint)',[identity.lock]);c.release();}
 }
 const deployed:Record<string,Address>={};
 async function artifact(name:string){return JSON.parse(await readFile(deploymentArtifactPath(name),'utf8'));}
 async function deploy(name:string,args:readonly unknown[]=[],instance=name):Promise<Address>{
  if(deployed[instance])return deployed[instance];
  const a=await artifact(name); let code=a.bytecode.object as string;
  assertDeploymentArtifact(name,a);
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
 return {base,account,db,submit,deploy,artifact,write,deployed,preflight:(names:readonly string[])=>preflightDeploymentArtifacts(names,artifact),close:()=>db.end()};
}
