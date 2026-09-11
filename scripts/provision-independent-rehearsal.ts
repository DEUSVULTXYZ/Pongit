// Hosted capability rehearsal, not a production manifest migration.
// Persist each creation attempt before HTTP. Never repeat an ambiguous POST.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,http,keccak256,parseAbi,type Address} from 'viem';
import {readHubDelegation} from '../shared/rooms-hub';
import {monadTestnet} from 'viem/chains';
assert.equal(process.env.PONG_ARENA_PROVISION,'qualification-only');
const path=process.env.PONG_ARENA_PROVISION_JOURNAL!;
assert(path?.startsWith('/secrets/'));
const index=Number(process.env.PONG_ARENA_INDEX);
assert(Number.isInteger(index)&&index>=0&&index<3);
const game=JSON.parse(await readFile('contracts/out/PongRoomsTestnet.sol/PongRoomsTestnetRelease.json','utf8'));
const hubArtifact=JSON.parse(await readFile(process.env.PONG_HUB_ARTIFACT||'node_modules/@interludelayer-sdk/cli/artifacts/InterludeHub.sol/InterludeHub.json','utf8'));
const hub:Address='0x3Ef8327F69e09cf721772F345e2A887eA22cD595';
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL||'https://testnet-rpc.monad.xyz',{retryCount:0,timeout:8000})});
assert.equal(await base.getChainId(),10143);
let state:any={purpose:'independent-hosted-rehearsal',chainId:10143,hub,arenas:[]};
try{state=JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
assert.equal(state.purpose,'independent-hosted-rehearsal');assert.equal(state.hub,hub);assert.equal(state.chainId,10143);
const save=async()=>{await writeFile(path+'.next',JSON.stringify(state,null,2),{mode:0o600});await rename(path+'.next',path);};
const codeHash=keccak256(game.bytecode.object);
let record=state.arenas[index];
if(record?.app){
 console.log(JSON.stringify({index,app:record.app,node:record.node,state:record.state}));
}else{
 assert(!record||record.state==='waiting','Creation response is uncertain; inspect the existing attempt instead of deploying again');
 assert((game.deployedBytecode.object.length-2)/2<=24576);
 const validator=await base.readContract({address:hub,abi:hubArtifact.abi,functionName:'defaultValidator'}) as Address;
 const terms:any=await base.readContract({address:hub,abi:hubArtifact.abi,functionName:'termsOf',args:[validator]});
 record=state.arenas[index]={index,state:'waiting',codeHash,at:new Date().toISOString()};await save();
 // Use a released diagnostic contract: an EOA simulation fails the hub's
 // application callback even when validator capacity is available.
 const probe:Address='0xe4f978d978cbafe6682d0ac056d773fe2c950c94';
 assert.equal((await readHubDelegation(base,hub,probe)).status,0,'Admission probe must be released');
 const probeAbi=parseAbi(['function owner() view returns(address)','function delegateAll() payable']);
 const owner=await base.readContract({address:probe,abi:probeAbi,functionName:'owner'});
 try{await base.simulateContract({address:probe,abi:[...probeAbi,...hubArtifact.abi.filter((x:any)=>x.type==='error')],functionName:'delegateAll',account:owner,value:terms.delegationFee});}
 catch(e){let cause:any=e,name='Undecoded admission revert';for(let n=0;cause&&n<8;n++,cause=cause.cause)if(cause.data?.errorName)name=cause.data.errorName;record.admissionError=name;await save();throw Error(name);}
 record.state='sending';record.requestedAt=new Date().toISOString();await save();
 try{
  const response=await fetch('https://control.interludelayer.xyz/apps',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'PongRoomsTestnetRelease',bytecode:game.bytecode.object,abi:game.abi.filter((x:any)=>x.type==='constructor'||x.type==='function'&&x.name==='delegateAll')}),signal:AbortSignal.timeout(120000)});
  const body=await response.json().catch(()=>null) as any;
  record.http=response.status;
  if(body?.app){record.app=body.app;record.node=body.url;record.state=response.ok?'answered':'inspection';}
  else record.state='uncertain';
  record.error=typeof body?.error==='string'?body.error.replace(/0x[\da-f]{130,}/gi,'[hex omitted]').slice(0,400):undefined;
  await save();
  console.log(JSON.stringify({index,http:record.http,app:record.app,node:record.node,state:record.state,error:record.error}));
  assert(response.ok&&record.app&&record.node,'Hosted creation is not confirmed; no automatic second POST');
 }catch(e){if(record.state==='sending'){record.state='uncertain';await save();}throw e;}
}
