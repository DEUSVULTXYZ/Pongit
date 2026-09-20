// Read-only comparison on one disposable, already registered qualification family.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,isAddress,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {publicIndependentManifest,type FamilyGrant} from '../shared/independent';
import {independentReader} from '../shared/independent-read';
import {familyGrantHash,lobbyCommandContext} from '../shared/independent-command';
assert.equal(process.env.PONG_INDEPENDENT_EVENTS_QUALIFICATION,'isolated-vps');
const raw=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));
assert.equal(raw.production,false);const m=publicIndependentManifest(raw);
const player=process.env.PONG_BENCH_PLAYER!;assert(isAddress(player));
const methods:{method:string;ms:number}[]=[];let pinned:bigint|undefined;
const measured:typeof fetch=async(input,init)=>{
 const q=JSON.parse(String(init?.body)),at=performance.now();
 assert(['eth_call','eth_blockNumber','eth_getBlockByNumber','eth_chainId'].includes(q.method),'Read-only RPC allowlist');
 if(q.method==='eth_call'&&/^0x[0-9a-f]+$/i.test(q.params?.[1]))pinned=BigInt(q.params[1]);
 const response=await fetch(input,init);methods.push({method:q.method,ms:performance.now()-at});return response;
};
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{fetchFn:measured,retryCount:0,timeout:12000})});
assert.equal(await base.getChainId(),10143);
const grant=await independentReader(base,m).family('grantOf',[player as Address]),hash=familyGrantHash(m,grant);
const rows=[];
for(let i=0;i<3;i++){
 const begin=performance.now(),block=await base.getBlock(),r=independentReader(base,m,block.number);
 const [current,nonce]:[FamilyGrant,bigint]=await Promise.all([r.family('grantOf',[player]),r.lobby('commandNonces',[hash])]);
 assert.equal(current.key,grant.key);assert.equal(current.expires,grant.expires);
 const previousMs=performance.now()-begin;methods.length=0;const nextAt=performance.now();
 const result=await lobbyCommandContext(base,m,grant),currentMs=performance.now()-nextAt,calls=methods.slice(),observedBlock=pinned;
 assert.equal(result.hash,hash);assert.equal(result.nonce,nonce);assert(observedBlock!==undefined);
 const verified=await base.getBlock({blockNumber:observedBlock});
 assert.equal(result.deadline,verified.timestamp+120n<grant.expires?verified.timestamp+120n:grant.expires);
 rows.push({previousMs,currentMs,calls,block:String(observedBlock),verifiedDeadline:String(result.deadline)});
 await new Promise(resolve=>setTimeout(resolve,500));
}
const report={at:new Date().toISOString(),scope:'Read-only real Monad RPC, three small paired observations; not a load or command-confirmation benchmark',lobby:m.lobby,player,rows,passed:true};
await writeFile('artifacts/independent-candidate/command-benchmark.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
