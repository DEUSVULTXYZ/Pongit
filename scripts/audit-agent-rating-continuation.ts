// Read-only continuation of a previously verified empty-seed audit. The exact
// audited predecessor file must be pinned by the deployed successor contract.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,keccak256,parseAbi,type Address} from 'viem';
import {baseReadTransport} from '../shared/base-read-transport';
import {verifyHistoricalRuntime} from '../shared/historical-runtime';
import {agentPublishedRatingsAbi} from '../shared/abi-AgentPublishedRatings';
import {assertReviewedRatingContinuation} from '../shared/rating-continuation-audit';

const [ratingText,parentPath,artifactPath,out]=process.argv.slice(2);
assert(/^0x[\da-f]{40}$/i.test(ratingText)&&parentPath&&artifactPath&&out);
const ratings=ratingText as Address,base=createPublicClient({transport:baseReadTransport(process.env.RPC_URL??'https://testnet-rpc.monad.xyz',{intervalMs:200,maxConcurrent:1})});
const report:any={at:new Date().toISOString(),chainId:10143,ratings,complete:false,noSeeds:false,
 scope:'Verified immutable continuation that rejects rating and pair seeds, bound to its canonical predecessor audit. No migration or transaction submission.'};
try{
 assert.equal(await base.getChainId(),10143);
 const parentBytes=await readFile(parentPath),parent=JSON.parse(parentBytes.toString());
 assert(parent.complete===true&&parent.noSeeds===true&&parent.chainId===10143,'Complete predecessor seed evidence required');
 const artifact=JSON.parse(await readFile(artifactPath,'utf8')),anchor=await base.getBlock();assert(anchor.hash);
 report.block=String(anchor.number);report.blockHash=anchor.hash;
 const abi=[...agentPublishedRatingsAbi,...parseAbi([
  'function predecessor() view returns(address)','function predecessorCodeHash() view returns(bytes32)',
  'function predecessorSeal() view returns(bytes32)','function emptySeedAudit() view returns(bytes32)',
  'function sourcePool() view returns(address)','function sourceCount() view returns(uint256)',
  'function imported() view returns(uint256)',
 ])];
 const read=(address:Address,fn:string)=>{report.step=fn;return base.readContract({address,abi,functionName:fn,blockNumber:anchor.number} as any) as Promise<any>;};
 const verified=await verifyHistoricalRuntime(ratings,artifact,address=>base.getCode({address,blockNumber:anchor.number}),async()=>{throw Error('Unexpected rating library');});
 report.runtimeHash=keccak256(verified.code);
 // Preserve the exact historical deployment gate. New instances must match a
 // separately pinned build, including its immutable masks, before their own
 // predecessor/audit bindings are checked below.
 if(report.runtimeHash!=='0xa0c4bdc1933c53e332d29a112c549d0d5da9e829319628cb99a42b38745e7bb4')
  report.templateHash=assertReviewedRatingContinuation(artifact);
 const source=await read(ratings,'predecessor') as Address;
 assert.equal(source.toLowerCase(),String(parent.ratings).toLowerCase());
 assert.equal(await read(ratings,'emptySeedAudit'),keccak256(parentBytes),'Source audit bytes differ from the pinned evidence');
 assert.equal((await base.getBlock({blockNumber:BigInt(parent.block)})).hash,parent.blockHash,'Predecessor audit block reorganized');
 const sourceCode=await base.getCode({address:source,blockNumber:anchor.number});assert(sourceCode&&sourceCode!=='0x');
 assert.equal(keccak256(sourceCode),parent.runtimeHash);assert.equal(await read(ratings,'predecessorCodeHash'),parent.runtimeHash);
 assert.equal(await read(source,'migrationSealed'),true);assert.equal(await read(ratings,'migrationSealed'),true);
 const sourceSeal=await read(source,'migrationEvidence');
 assert.equal(sourceSeal,parent.migrationEvidence);assert.equal(await read(ratings,'predecessorSeal'),sourceSeal);
 assert.equal(await read(ratings,'sourcePool'),await read(source,'lobby'));
 assert.equal(await read(ratings,'migrationOwner'),await read(source,'migrationOwner'));
 assert.equal(await read(ratings,'genesisTime'),await read(source,'genesisTime'));
 assert.equal(await read(ratings,'sourceCount'),await read(ratings,'imported'),'Incomplete source import');
 assert.equal(await read(ratings,'sourceCount'),await read(source,'count'),'Source ledger grew after import');
 // A predecessor report is retained, not rewritten. Recheck all referenced
 // canonical receipts; no signed payload is printed or copied into this report.
 for(const tx of parent.transactions??[]){
  const receipt=await base.getTransactionReceipt({hash:tx.hash});
  assert.equal(String(receipt.blockNumber),String(tx.block));
  assert.equal((await base.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash,'Predecessor receipt reorganized');
 }
 report.predecessor={ratings:source,auditHash:keccak256(parentBytes),block:parent.block,blockHash:parent.blockHash};
 report.migrationEvidence=await read(ratings,'migrationEvidence');report.sourceCount=String(await read(ratings,'sourceCount'));
 assert.equal((await base.getBlock({blockNumber:anchor.number})).hash,anchor.hash,'Continuation audit block reorganized');
 report.complete=true;report.noSeeds=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,180);process.exitCode=1;}
finally{await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({ratings,complete:report.complete,noSeeds:report.noSeeds,error:report.error}));}
