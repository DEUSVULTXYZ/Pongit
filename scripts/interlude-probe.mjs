import {readFile,writeFile,mkdir} from "node:fs/promises";
import assert from "node:assert/strict";
import {createPublicClient,createWalletClient,http,parseAbi,isAddress,zeroAddress,zeroHash,keccak256,toHex,pad} from "viem";
import {generatePrivateKey,privateKeyToAccount} from "viem/accounts";
import {monadTestnet} from "viem/chains";
import {createInterludeClient,memoryStore} from "@interludelayer-sdk/sdk";

const mode=process.argv[2] || "inspect";
assert(["inspect","play"].includes(mode),"Use inspect (read-only) or play (creates experimental matches).");
const artifact=JSON.parse(await readFile("contracts/out/PongInterlude.sol/PongInterlude.json","utf8"));
const manifestPath=process.argv[3] || "deployments/interlude-lab.json";
const manifest=JSON.parse(await readFile(manifestPath,"utf8").catch(()=>{
  throw new Error("A verified ship manifest is required. See docs/INTERLUDE_LAB.md; do not retry an unresolved deployment.");
}));
const {app,node:url,hub:expectedHub}=manifest;
assert(isAddress(app) && app!==zeroAddress && isAddress(expectedHub) && expectedHub!==zeroAddress,"Invalid app or hub.");
assert.equal(manifest.baseChainId,10143);
assert.equal(manifest.tickUs,10000);
assert.equal(manifest.rulesVersion,3);
const endpoint=new URL(url);
assert(endpoint.protocol==="https:" && !endpoint.username && !endpoint.password,"Use the public HTTPS app node returned by ship, without credentials.");
assert.notEqual(endpoint.hostname,"rpc.interludelayer.xyz","The Room demonstration node does not serve PONGIT.");
const base=createPublicClient({chain:monadTestnet,transport:http("https://testnet-rpc.monad.xyz",{retryCount:0,timeout:15000})});
const node=createInterludeClient({app,abi:artifact.abi,node:url,base,store:memoryStore()});
const snapshot=()=>node.read("getSnapshot");
const report={app,url,checkedAt:new Date().toISOString()};
const status=await node.status();
assert.equal(status.app.toLowerCase(),app.toLowerCase());
assert.notEqual(status.chainId,10143);
report.status=status;
report.hub=await node.hubAddress();
assert.equal(report.hub.toLowerCase(),expectedHub.toLowerCase());
const runtime=await base.getCode({address:app});
assert(runtime && runtime!=="0x","No deployed contract at this address.");
// Hub is this contract's only immutable; check the full deployed runtime, not just its ABI.
const references=Object.values(artifact.deployedBytecode.immutableReferences);
assert.equal(references.length,1,"Review bytecode verification after adding another immutable.");
let expected=artifact.deployedBytecode.object.slice(2);
for(const {start,length} of references[0]){
  assert.equal(length,32);
  expected=expected.slice(0,start*2)+pad(report.hub,{size:32}).slice(2)+expected.slice((start+length)*2);
}
assert.equal(runtime.toLowerCase(),("0x"+expected).toLowerCase(),"The base-chain app differs from the compiled prototype.");
assert.equal((await node.node.getCode({address:app})).toLowerCase(),runtime.toLowerCase(),"The engine serves different bytecode.");
report.codeHash=keccak256(runtime);
assert.equal(await node.read("TICK_US"),10000n);
assert.equal(await node.read("RULES_VERSION"),3n);
report.owner=await base.readContract({address:app,abi:parseAbi(["function owner() view returns (address)"]),functionName:"owner"});
const hubArtifact=JSON.parse(await readFile("node_modules/@interludelayer-sdk/cli/artifacts/InterludeHub.sol/InterludeHub.json","utf8"));
report.terms=await base.readContract({address:report.hub,abi:hubArtifact.abi,functionName:"termsOf",args:[status.validator]});
report.delegation=await base.readContract({address:report.hub,abi:hubArtifact.abi,functionName:"sessionOf",args:[app,zeroHash]});
assert.equal(report.delegation.status,1);
const headers=await fetch(url,{method:"OPTIONS",headers:{Origin:"https://pongit.xyz","Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"content-type"}});
report.cors={status:headers.status,origin:headers.headers.get("access-control-allow-origin"),methods:headers.headers.get("access-control-allow-methods"),headers:headers.headers.get("access-control-allow-headers")};
assert(headers.ok && ["*","https://pongit.xyz"].includes(report.cors.origin),"Hosted node does not allow the PONGIT browser origin.");
assert(report.cors.methods?.split(/\s*,\s*/).some(x=>x==="POST"||x==="*"),"CORS must permit POST.");
assert(report.cors.headers?.toLowerCase().split(/\s*,\s*/).some(x=>x==="content-type"||x==="*"),"CORS must permit content-type.");
const clockStart=await node.status(),start=performance.now(),head=clockStart.ephemeralBlock;
await new Promise(r=>setTimeout(r,10000));
const end=await node.status();
report.clock={seconds:(performance.now()-start)/1000,blocks:end.ephemeralBlock-head};
report.clock.blocksPerSecond=report.clock.blocks/report.clock.seconds;
assert(Math.abs(report.clock.blocksPerSecond-100)<10,"Hosted block cadence is incompatible with the 10 ms prototype clock.");
await mkdir("artifacts/interlude",{recursive:true});
const dump=(name,value)=>writeFile("artifacts/interlude/"+name+".json",JSON.stringify(value,(_,v)=>typeof v==="bigint"?v.toString():v,2));
await dump("probe",report);
console.log(JSON.stringify({app,url,owner:report.owner,clock:report.clock,cors:report.cors}));
if(mode!=="play")process.exit(0);
const beforePlay=await snapshot();
assert([0n,3n,4n].includes(beforePlay[2]),"The experimental arena is busy. Do not replace another player's invitation.");
const scope=["createMatch","acceptMatch","cancelMatch","input","tick","concede","expire"];
const accounts=[privateKeyToAccount(generatePrivateKey()),privateKeyToAccount(generatePrivateKey())];
const clients=accounts.map(()=>createInterludeClient({app,abi:artifact.abi,node:url,base,store:memoryStore()}));
const sessions=await Promise.all(accounts.map((account,i)=>clients[i].openSession({wallet:createWalletClient({account,chain:monadTestnet,transport:http()}),scope,expirySeconds:1800,assertDigest:true})));
await sessions[0].send("createMatch",[accounts[1].address,toHex(crypto.getRandomValues(new Uint8Array(32)))]);
let s=await snapshot(),id=s[0];
await sessions[1].send("acceptMatch",[id]);
const rows=[];
const completed=[];
async function recordResult(state){
  const hash=await node.read("resultHashes",[state[0]]);
  assert.notEqual(hash,zeroHash);
  completed.push({id:state[0],resultHash:hash,liveObservedAt:new Date().toISOString()});
}
for(let i=0;i<200;i++){
  const who=i%2; s=await snapshot();
  if(s[2]===3n){
    await recordResult(s);
    assert(completed.length<16,"Too many short games; inspect engine cadence before continuing.");
    await sessions[0].send("createMatch",[accounts[1].address,toHex(crypto.getRandomValues(new Uint8Array(32)))]);
    s=await snapshot();id=s[0];
    await sessions[1].send("acceptMatch",[id]);s=await snapshot();
  }
  assert.equal(s[2],2n,"The game left its active state unexpectedly.");
  const direction=Math.floor(i/2)%2===0?-1:1;
  const before=performance.now();
  const result=await sessions[who].send("input",[id,direction,s[who===0?9:10]+1n,s[7]+150n]);
  const after=await snapshot();
  assert.equal(after[0],id);
  assert.equal(after[who===0?9:10],s[who===0?9:10]+(after[2]===2n?1n:0n));
  rows.push({i,id,who,direction,latencyMs:result.latencyMs,observedMs:performance.now()-before,hash:result.hash,head:after[7],version:after[1]});
  await new Promise(r=>setTimeout(r,20));
}
s=await snapshot();
if(s[2]===2n)await sessions[0].send("concede",[id]);
s=await snapshot();
assert.equal(s[2],3n);
await recordResult(s);
const resultAt=performance.now();
for(let i=0;i<45;i++){
  for(const result of completed.filter(x=>!x.committedObservedAt)){
    result.committedHash=await node.readSettled("resultHashes",[result.id]);
    if(result.committedHash===result.resultHash)result.committedObservedAt=new Date().toISOString();
  }
  if(completed.every(x=>x.committedObservedAt))break;
  await new Promise(r=>setTimeout(r,2000));
}
const q=(key,p)=>{const a=rows.map(r=>r[key]).sort((a,b)=>a-b);return a[Math.max(0,Math.ceil(a.length*p)-1)]};
await dump("engine-match",{players:accounts.map(a=>a.address),rows,snapshot:s,completed,commitWaitMs:performance.now()-resultAt,metrics:{samples:rows.length,p50:q("latencyMs",.5),p95:q("latencyMs",.95),p99:q("latencyMs",.99)}});
assert.equal(rows.length,200);
assert(completed.every(x=>x.committedObservedAt),"Result did not reach Monad within the 90 second observation budget.");
sessions.forEach(s=>s.discard());
console.log("PASS: two scoped SDK players, 200 inputs and result hashes committed to Monad. Challenge finality is not measured by this probe.");
