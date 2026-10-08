// Read-only completeness proof for the exact human migration snapshot.
// Signed calldata/grants are decoded in memory only; reports contain counts.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,decodeFunctionData,decodeEventLog,keccak256,type Address,type Hex} from 'viem';
import {abi as familyAbi} from '../shared/abi-independent-ArcadeFamily';
import {publicIndependentManifest} from '../shared/independent';
import {independentReader} from '../shared/independent-read';
import {independentRules} from '../shared/independent-rules';
import {resumeSocialPages,type SocialAnchor} from '../shared/human-social-pages';

assert.equal(process.env.PONG_RESPONSIVE_SOCIAL,'audit-public-rules18-20261007');
const input=await readFile(process.env.PONG_HUMAN_SOCIAL_SNAPSHOT!,'utf8'),snapshot=JSON.parse(input);
const m=publicIndependentManifest(snapshot.source),blockNumber=BigInt(snapshot.sourceBlock);
const snapshotHash=keccak256(new TextEncoder().encode(input));
assert.equal(m.lobby.toLowerCase(),'0x71a49c00ba733724cb33d7590134d4ae96426156');
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:20000})});
const db=new Pool({connectionString:process.env.PONG_INDEPENDENT_DATABASE_URL,statement_timeout:10000});
const operator=new Pool({connectionString:process.env.PONG_OPERATOR_DATABASE_URL,statement_timeout:10000});
async function map<A,B>(items:readonly A[],fn:(a:A)=>Promise<B>):Promise<B[]>{
 const out:B[]=[];for(let i=0;i<items.length;i+=8)out.push(...await Promise.all(items.slice(i,i+8).map(fn)));return out;
}
let stage='source-anchor';
try{
 assert.equal(await base.getChainId(),10143);const block=await base.getBlock({blockNumber});assert.equal(block.hash,snapshot.sourceHash);
 const reader=independentReader(base,m,blockNumber),abi=independentRules(m).lobby;
 for(const address of [m.lobby,m.family])assert.equal(keccak256((await base.getCode({address,blockNumber}))!),snapshot.codeHashes[address]);
 stage='creation-journal';const jobs=(await operator.query("SELECT hash FROM il_lifecycle_jobs WHERE lower(app)=$1 AND status='confirmed' ORDER BY nonce",[m.lobby.toLowerCase()])).rows;
 // The deployment precedes lifecycle calls. Stop when its canonical receipt
 // is found instead of hydrating every later keeper transaction.
 let creation:Awaited<ReturnType<typeof base.getTransactionReceipt>>|undefined;
 for(const j of jobs){const receipt=await base.getTransactionReceipt({hash:j.hash});if(receipt.contractAddress?.toLowerCase()===m.lobby.toLowerCase()){creation=receipt;break;}}
 assert(creation&&creation.status==='success');
 const created=await base.getBlock({blockNumber:creation.blockNumber});
 // Every accepted grant lasts at most two hours and cannot be registered
 // before issuedAt. No earlier grant can execute against this new lobby.
 stage='grant-prefix';const earliest=created.timestamp>7200n?created.timestamp-7200n:0n;
 // Search only the recent two-hour prefix. Some RPCs do not retain unrelated
 // ancient blocks; a search starting at genesis needlessly depended on them.
 let low=creation.blockNumber,high=creation.blockNumber,step=10000n;
 while((await base.getBlock({blockNumber:low})).timestamp>=earliest&&low>0n){
  assert(creation.blockNumber-low<1_000_000n,'Grant prefix exceeds bounded audit');
  low=low>step?low-step:0n;step*=2n;
 }
 while(low<high){const mid=(low+high)/2n;if((await base.getBlock({blockNumber:mid})).timestamp<earliest)low=mid+1n;else high=mid;}
 // A delayed deployment may span several days. Retain every page; each worker
 // is still bounded externally and resumes only a verified canonical prefix.
 const first=low;assert(blockNumber-first<1_000_000n,'Social audit exceeds the reviewed window');
 type EventRef={transactionHash:Hex;blockHash:Hex;blockNumber:string;logIndex:number};
 const cachePath=process.env.PONG_HUMAN_SOCIAL_CACHE!;assert(cachePath.startsWith('/evidence/'));
 let cache={schema:'responsive-social-pages-v1',snapshotHash,first:String(first),next:String(first),events:[] as EventRef[]};
 try{cache=JSON.parse(await readFile(cachePath,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const anchor=(s:any,hash:Hex):SocialAnchor=>({snapshotHash:hash,block:BigInt(s.sourceBlock),hash:s.sourceHash,
  lobby:s.source.lobby,family:s.source.family,chainId:s.chainId});
 let previous:SocialAnchor|undefined;
 if(cache.snapshotHash!==snapshotHash&&process.env.PONG_HUMAN_SOCIAL_PREVIOUS_SNAPSHOT){
  const bytes=await readFile(process.env.PONG_HUMAN_SOCIAL_PREVIOUS_SNAPSHOT,'utf8');previous=anchor(JSON.parse(bytes),keccak256(new TextEncoder().encode(bytes)));
 }
 cache=await resumeSocialPages(cache,anchor(snapshot,snapshotHash),first,previous,async number=>(await base.getBlock({blockNumber:number})).hash);
 const resume=BigInt(cache.next);assert(resume>=first&&resume<=blockNumber+1n&&Array.isArray(cache.events));
 for(const event of cache.events)assert(BigInt(event.blockNumber)>=first&&BigInt(event.blockNumber)<resume);
 const checkpoint=async()=>{await writeFile(cachePath+'.next',JSON.stringify(cache)+'\n',{mode:0o600});await rename(cachePath+'.next',cachePath);};
 // Learn one accepted range before scheduling the scan. Repeating rejected
 // 1,000-block queries for every page exhausted the previous bounded audit.
 const grantLogs=(fromBlock:bigint,toBlock:bigint)=>base.getContractEvents({address:m.family,abi:familyAbi,eventName:'Granted',fromBlock,toBlock,strict:true});
 const rangeRejected=(error:unknown)=>{let cause:any=error;for(let i=0;cause&&i<5;i++,cause=cause.cause)if(cause.code===-32062)return true;return false;};
 let pageSize=100n;
 stage='grant-range-probe';
 if(resume<=blockNumber)for(;;){try{await grantLogs(resume,resume+pageSize-1n<blockNumber?resume+pageSize-1n:blockNumber);break;}
  catch(error){if(!rangeRejected(error)||pageSize===1n)throw error;pageSize=(pageSize+1n)/2n;}}
 const ranges:bigint[]=[];for(let n=resume;n<=blockNumber;n+=pageSize)ranges.push(n);
 console.log(JSON.stringify({phase:'grant-range',first:String(first),resume:String(resume),last:String(blockNumber),pageSize:String(pageSize),pages:ranges.length}));
 const logsIn=async(fromBlock:bigint,toBlock:bigint):Promise<Awaited<ReturnType<typeof grantLogs>>>=>{
  try{return await grantLogs(fromBlock,toBlock);}catch(error){
   if(!rangeRejected(error)||fromBlock===toBlock)throw error;
   // Split only this documented range rejection. Never skip a failed range,
   // turn an RPC error into empty history, or increase concurrent requests.
   const mid=(fromBlock+toBlock)/2n;
   return [...await logsIn(fromBlock,mid),...await logsIn(mid+1n,toBlock)];
  }
 };
 stage='grant-logs';for(let i=0;i<ranges.length;i+=8){
  const group=ranges.slice(i,i+8),pages=await map(group,n=>logsIn(n,n+pageSize-1n<blockNumber?n+pageSize-1n:blockNumber));
  // Preserve only public event references, never grants or signed calldata.
  // A failed/partial group advances nothing. A later bounded audit can resume
  // these exact contiguous pages at the same canonical snapshot hash.
  cache.events.push(...pages.flat().map(e=>({transactionHash:e.transactionHash,blockHash:e.blockHash,blockNumber:String(e.blockNumber),logIndex:e.logIndex})));
  assert(cache.events.length<=2000,'Social grant population requires separate bounded review');
  const end=group.at(-1)!+pageSize;cache.next=String(end>blockNumber?blockNumber+1n:end);await checkpoint();
  if(i%80===0)console.log(JSON.stringify({phase:'grant-pages',complete:i+group.length,total:ranges.length}));
 }
 assert.equal(cache.next,String(blockNumber+1n));
 const logs=cache.events.sort((a,b)=>BigInt(a.blockNumber)<BigInt(b.blockNumber)?-1:BigInt(a.blockNumber)>BigInt(b.blockNumber)?1:a.logIndex-b.logIndex);
 assert(logs.length<=2000,'Social grant population requires separate bounded review');
 console.log(JSON.stringify({phase:'grant-history',ranges:ranges.length,events:logs.length}));
 stage='grant-registry';const registry=await map(logs,async log=>{
  const [tx,receipt]=await Promise.all([base.getTransaction({hash:log.transactionHash}),base.getTransactionReceipt({hash:log.transactionHash})]);
  assert.equal(receipt.blockHash,log.blockHash);assert.equal(String(receipt.blockNumber),log.blockNumber);assert.equal(receipt.status,'success');
  const event=receipt.logs.find(e=>e.logIndex===log.logIndex);assert(event&&event.address.toLowerCase()===m.family.toLowerCase());
  const decoded=decodeEventLog({abi:familyAbi,eventName:'Granted',data:event.data,topics:event.topics});
  // An indirect registration needs an explicit trace audit; never omit it.
  assert.equal(tx.to?.toLowerCase(),m.family.toLowerCase(),'Indirect family registration requires trace audit');
  const call=decodeFunctionData({abi:familyAbi,data:tx.input});assert.equal(call.functionName,'register');
  if(call.functionName!=='register')throw Error('Unexpected family registration');
  const grant=call.args[0];assert.equal(grant.player.toLowerCase(),decoded.args.player.toLowerCase());
  assert.equal(grant.key.toLowerCase(),decoded.args.key.toLowerCase());assert.equal(grant.expires,decoded.args.expires);assert.equal(grant.revision,decoded.args.revision);
  const digest=await base.readContract({address:m.family,abi:familyAbi,functionName:'grantDigest',args:[grant],blockNumber});
  return {player:grant.player,digest,block:receipt.blockNumber,index:receipt.transactionIndex};
 });
 stage='command-journal';const rows=(await db.query("SELECT hash,data FROM independent_operations WHERE target=$1 AND status='confirmed' AND hash IS NOT NULL",[m.lobby.toLowerCase()])).rows;
 const commands=await map(rows,async row=>{
  const receipt=await base.getTransactionReceipt({hash:row.hash});if(receipt.blockNumber>blockNumber)return;
  assert.equal(receipt.status,'success');const tx=await base.getTransaction({hash:row.hash});assert.equal(tx.to?.toLowerCase(),m.lobby.toLowerCase());assert.equal(tx.input,row.data);
  const call=decodeFunctionData({abi,data:tx.input});if(call.functionName!=='relay')return;
  const [player,data,nonce]=call.args as readonly [Address,Hex,bigint,...unknown[]];
  const grant=registry.filter(g=>g.player.toLowerCase()===player.toLowerCase()&&(g.block<receipt.blockNumber||g.block===receipt.blockNumber&&g.index<receipt.transactionIndex)).at(-1);
  assert(grant,'No preceding canonical grant for a successful command');
  return{player,digest:grant.digest,nonce,method:decodeFunctionData({abi,data}).functionName};
 });
 const nonces=new Map<Hex,Set<bigint>>();for(const c of commands){if(!c)continue;const known=nonces.get(c.digest)??new Set<bigint>();assert(!known.has(c.nonce),'Duplicate journal command');known.add(c.nonce);nonces.set(c.digest,known);}
 const digests=[...new Set(registry.map(g=>g.digest))];
 let total=0n;
 stage='nonce-coverage';await map(digests,async digest=>{
  const used=await reader.lobby('commandNonces',[digest]),known=nonces.get(digest)??new Set<bigint>();
  assert.equal(BigInt(known.size),used,'Unjournaled social commands require a canonical transaction audit');
  for(const n of known)assert(n>=0n&&n<used,'Non-contiguous social nonces');total+=used;
 });
 const actors=[...new Set(registry.map(g=>g.player.toLowerCase() as Address))];
 stage='social-state';const social=await map(actors,async player=>{
  const queue=await reader.lobby('queueOf',[player]);let invitations=0;
  for(let offset=0n;;offset+=32n){
   const [ids,count]=await reader.lobby('invitationPage',[player,true,offset,32n]);assert(count<=2000n);
   const entries=await map(ids as bigint[],id=>reader.lobby('invitation',[id]));
   invitations+=entries.filter(e=>e.status===1&&BigInt(e.expires)>=block.timestamp).length;if(offset+32n>=count)break;
  }
  return{queued:queue[1]>0n&&queue[2]>=block.timestamp,invitations};
 });
 assert.equal((await base.getBlock({blockNumber})).hash,block.hash);
 const blockCommands=commands.filter(c=>c?.method==='blockPlayer').length;
 const proof={schema:'responsive-human-social-v1',complete:true,snapshotHash,sourceLobby:m.lobby,
  sourceBlock:String(blockNumber),sourceHash:block.hash,firstGrantBlock:String(first),registrationEvents:logs.length,grantDigests:digests.length,
  actors:actors.length,canonicalCommands:String(total),journalCommands:commands.filter(Boolean).length,blockCommands,
  activeQueues:social.filter(s=>s.queued).length,pendingInvitations:social.reduce((n,s)=>n+s.invitations,0),at:new Date().toISOString()};
 await writeFile(process.env.PONG_HUMAN_SOCIAL_OUTPUT!,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify(proof));
}catch(e){
 const failures=[];let cause:any=e;
 for(let i=0;cause&&i<5;i++,cause=cause.cause)failures.push({name:cause.name,code:cause.code,
  detail:String(cause.details??cause.shortMessage??cause.message).split('\n')[0].replace(/https?:\/\/\S+/g,'[endpoint]').replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220)});
 console.error(JSON.stringify({stage,failures}));process.exitCode=1;
}
finally{await db.end();await operator.end();}
