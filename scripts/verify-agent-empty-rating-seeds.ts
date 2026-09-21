// Read-only audit of every owner nonce between creation and the immutable seal.
// No signing key or transaction payload is written to the report.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,decodeFunctionData,decodeAbiParameters,keccak256,toHex,type Address} from 'viem';
import {agentPublishedRatingsAbi as abi} from '../shared/abi-AgentPublishedRatings';

const [prefix,ledger,out,artifactFile]=process.argv.slice(2);
assert(/^reusable-agents-\d{8}-\d+$/.test(prefix)&&/^0x[\da-f]{40}$/i.test(ledger)&&out&&artifactFile);
const db=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
const rpc=createPublicClient({transport:http(process.env.RPC_URL,{timeout:15000,retryCount:0})});
const report:any={at:new Date().toISOString(),ledger,prefix,passed:false,transactions:[],
 scope:'Complete canonical EOA nonce interval proves no initial rating or repeat-pair seed calls before the immutable migration seal. Not an authority migration.'};
const save=()=>writeFile(out,JSON.stringify(report,null,2));
try{
 await save();
 assert.equal(await rpc.getChainId(),10143);
 const jobs=(await db.query('SELECT id,owner,nonce,hash,status FROM il_lifecycle_jobs WHERE id=ANY($1::text[])',
  [[prefix+':deploy-agentpublishedratings',prefix+':empty-agent-season']])).rows;
 const creation=jobs.find(x=>x.id.endsWith(':deploy-agentpublishedratings')),seal=jobs.find(x=>x.id.endsWith(':empty-agent-season'));
 assert(creation?.status==='confirmed'&&seal?.status==='confirmed'&&creation.owner===seal.owner,'Confirmed creation/seal required');
 const first=BigInt(creation.nonce),last=BigInt(seal.nonce);assert(last>first&&last-first<256n,'Review a larger nonce interval');
 const interval=(await db.query('SELECT id,nonce,hash,status FROM il_lifecycle_jobs WHERE owner=$1 AND nonce BETWEEN $2 AND $3 ORDER BY nonce',
  [creation.owner,String(first),String(last)])).rows;
 assert.equal(BigInt(interval.length),last-first+1n,'An unknown owner nonce prevents proof of empty seeds');
 const artifact=JSON.parse(await readFile(artifactFile,'utf8'));
 const runtime=await rpc.getCode({address:ledger as Address});assert(runtime&&runtime!=='0x');report.runtimeHash=keccak256(runtime);
 let sealBlock:bigint|undefined,seedCalls=0;
 for(let i=0;i<interval.length;i++){
  const job=interval[i];assert.equal(BigInt(job.nonce),first+BigInt(i));
  const tx=await rpc.getTransaction({hash:job.hash}),receipt=await rpc.getTransactionReceipt({hash:job.hash});
  assert.equal(tx.from.toLowerCase(),creation.owner.toLowerCase());assert.equal(BigInt(tx.nonce),BigInt(job.nonce));
  const block=await rpc.getBlock({blockNumber:receipt.blockNumber});assert.equal(receipt.blockHash,block.hash,'Reorganized receipt');
  assert(!(await rpc.getCode({address:tx.from,blockNumber:receipt.blockNumber}))?.replace(/^0x$/,''),'Owner must be an EOA at every audited block');
  let operation='other-owner-transaction';
  if(i===0){
   assert.equal(receipt.status,'success');assert.equal(receipt.contractAddress?.toLowerCase(),ledger.toLowerCase());assert.equal(tx.to,null);
   assert(tx.input.startsWith(artifact.bytecode.object),'Creation bytecode differs from the reviewed original artifact');
   const args=('0x'+tx.input.slice(artifact.bytecode.object.length)) as `0x${string}`;
   const [pool,admin,genesis]=decodeAbiParameters([{type:'address'},{type:'address'},{type:'uint256'}],args);
   assert.equal(admin.toLowerCase(),creation.owner.toLowerCase());report.pool=pool;report.genesis=String(genesis);operation='create-ledger';
  }else if(tx.to?.toLowerCase()===ledger.toLowerCase()){
   const call=decodeFunctionData({abi,data:tx.input});operation=call.functionName;
   if(call.functionName==='seed'||call.functionName==='seedPairCounts')seedCalls++;
   if(i===interval.length-1){
    assert.equal(operation,'sealMigration');assert.equal(receipt.status,'success');sealBlock=receipt.blockNumber;
    assert.equal(call.args?.[0],keccak256(toHex(`${prefix}:new-agent-season:1000`)));
   }
  }
  report.transactions.push({nonce:String(job.nonce),hash:job.hash,block:String(receipt.blockNumber),blockHash:receipt.blockHash,status:receipt.status,operation});
  await save();
 }
 assert.equal(seedCalls,0,'Seeded source requires a separate complete migration, never assume an empty season');assert(sealBlock);
 const read=(functionName:string,args:readonly unknown[]=[])=>rpc.readContract({address:ledger as Address,abi,functionName,args,blockNumber:sealBlock} as any) as Promise<any>;
 assert.equal((await read('migrationOwner')).toLowerCase(),creation.owner.toLowerCase());assert.equal((await read('lobby')).toLowerCase(),report.pool.toLowerCase());
 assert.equal(await read('migrationSealed'),true);assert.equal(await read('count'),0n);assert.equal(await read('generation'),1n);assert.equal(await read('buildGeneration'),0n);
 for(let mode=0;mode<2;mode++)assert.equal((await read('playerPage',[mode,0n,1n]))[1],0n);
 for(const row of report.transactions)assert.equal((await rpc.getBlock({blockNumber:BigInt(row.block)})).hash,row.blockHash,'Reorganized audit interval');
 report.sealBlock=String(sealBlock);report.seedCalls=seedCalls;report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{80,}/gi,'[omitted]').slice(0,250);process.exitCode=1;}
finally{await db.end();report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({passed:report.passed,transactions:report.transactions.length,error:report.error}));}
