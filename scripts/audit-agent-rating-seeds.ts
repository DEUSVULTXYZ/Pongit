// Read-only audit of every owner nonce from deployment through the seed seal.
// The source owner must be an EOA. Missing journal coverage fails closed; no
// private keys, signatures or transaction input are emitted in this evidence.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,toFunctionSelector,keccak256,type Address,type Hex} from 'viem';
import {agentPublishedRatingsAbi as abi} from '../shared/abi-AgentPublishedRatings';

const [ratingText,out]=process.argv.slice(2);assert(/^0x[\da-f]{40}$/i.test(ratingText)&&out);
const ratings=ratingText as Address,base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
assert.equal(await base.getChainId(),10143);
const db=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const report:any={at:new Date().toISOString(),chainId:10143,ratings,complete:false,noSeeds:false,transactions:[],
 scope:'Canonical EOA owner nonces from deployment through sealing. No operator-selected rating values are imported.'};
try{
 const anchor=await base.getBlock();assert(anchor.hash);report.block=String(anchor.number);report.blockHash=anchor.hash;
 const read=(functionName:string)=>base.readContract({address:ratings,abi:abi as any,functionName,blockNumber:anchor.number}) as Promise<any>;
 const owner=await read('migrationOwner') as Address;report.owner=owner;
 assert(!(await base.getCode({address:owner,blockNumber:anchor.number}))?.replace(/^0x$/,''),'Source migration owner is not an EOA');
 assert.equal(await read('migrationSealed'),true);report.migrationEvidence=await read('migrationEvidence');
 const candidates=(await db.query('SELECT DISTINCT hash,nonce FROM il_lifecycle_jobs WHERE lower(app)=lower($1) AND lower(owner)=lower($2) ORDER BY nonce',[ratings,owner])).rows;
 const seals=[];let deployment:any;
 for(const row of candidates){
  const receipt=await base.getTransactionReceipt({hash:row.hash});if(receipt.status!=='success')continue;
  const tx=await base.getTransaction({hash:row.hash});assert.equal(tx.from.toLowerCase(),owner.toLowerCase());
  if(receipt.contractAddress?.toLowerCase()===ratings.toLowerCase())deployment={tx,receipt};
  if(tx.to?.toLowerCase()===ratings.toLowerCase()&&tx.input.startsWith(toFunctionSelector('sealMigration(bytes32)')))seals.push({tx,receipt});
 }
 assert(deployment&&seals.length===1,'Exact deployment and seal receipts required');
 const sealed=seals[0];assert(sealed.tx.nonce>=deployment.tx.nonce);
 report.createdAtBlock=String(deployment.receipt.blockNumber);report.sealedAtBlock=String(sealed.receipt.blockNumber);
 report.deploymentHash=deployment.tx.hash;report.sealHash=sealed.tx.hash;
 for(const blockNumber of [deployment.receipt.blockNumber,sealed.receipt.blockNumber])
  assert(!(await base.getCode({address:owner,blockNumber}))?.replace(/^0x$/,''),'Owner is not an EOA throughout the audited endpoints');
 const rows=(await db.query('SELECT DISTINCT hash,nonce FROM il_lifecycle_jobs WHERE lower(owner)=lower($1) AND nonce BETWEEN $2 AND $3 ORDER BY nonce',[owner,deployment.tx.nonce,sealed.tx.nonce])).rows;
 const mined=new Map<number,any>();
 for(const row of rows){
  const receipt=await base.getTransactionReceipt({hash:row.hash});const tx=await base.getTransaction({hash:row.hash});
  assert(tx.from.toLowerCase()===owner.toLowerCase()&&tx.nonce===Number(row.nonce));
  assert.equal((await base.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash,'Owner transaction reorganized');
  assert(!mined.has(tx.nonce),'Two canonical transactions for one nonce');
  mined.set(tx.nonce,{tx,receipt});
 }
 const forbidden=[toFunctionSelector('seed(address[],uint8,(uint32,uint32,uint32,uint32)[])'),toFunctionSelector('seedPairCounts(bytes32[],uint8[])')];
 for(let nonce=deployment.tx.nonce;nonce<=sealed.tx.nonce;nonce++){
  const item=mined.get(nonce);assert(item,`Missing canonical owner nonce ${nonce}`);
  assert(item.receipt.blockNumber>=deployment.receipt.blockNumber&&item.receipt.blockNumber<=sealed.receipt.blockNumber);
  assert(!(item.receipt.status==='success'&&item.tx.to?.toLowerCase()===ratings.toLowerCase()&&forbidden.some(s=>item.tx.input.startsWith(s))),'Source used rating seeds');
  report.transactions.push({nonce,hash:item.tx.hash,block:String(item.receipt.blockNumber),status:item.receipt.status});
 }
 const runtime=await base.getCode({address:ratings,blockNumber:anchor.number});assert(runtime&&runtime!=='0x');report.runtimeHash=keccak256(runtime as Hex);
 assert.equal((await base.getBlock({blockNumber:anchor.number})).hash,anchor.hash,'Audit block reorganized');
 report.complete=true;report.noSeeds=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,180);process.exitCode=1;}
finally{await db.end();await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({complete:report.complete,noSeeds:report.noSeeds,ownerTransactions:report.transactions.length,ratings,error:report.error}));
