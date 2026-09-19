// Read-only comparison of confirmed deployment calldata with the exact compiled
// candidate, including linked libraries and immutable constructor arguments.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {encodeDeployData,parseTransaction,keccak256,zeroAddress,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {chaosQualificationRecord} from './chaos-qualification-record';

const {prefix,record:r}=await chaosQualificationRecord(),t=await chainTools(prefix);
const report:any={at:new Date().toISOString(),app:r.app,deployments:[],passed:false};
async function deployment(name:string,args:readonly unknown[]=[]):Promise<string>{
 const artifact=await t.artifact(name);let code=artifact.bytecode.object as string;
 for(const libraries of Object.values(artifact.bytecode.linkReferences??{}) as any[])
  for(const [library,ranges] of Object.entries(libraries) as Array<[string,Array<{start:number;length:number}>]>){
   const address=await deployment(library);
   for(const range of ranges){assert.equal(range.length,20);const at=2+range.start*2;code=code.slice(0,at)+address.slice(2).toLowerCase()+code.slice(at+40);}
  }
 assert(/^0x[\da-f]+$/i.test(code));
 const expected=encodeDeployData({abi:artifact.abi,bytecode:code as Hex,args});
 const job=(await t.db.query('SELECT raw,hash,status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':deploy-'+name.toLowerCase()])).rows[0];
 assert.equal(job?.status,'confirmed');assert.equal(keccak256(job.raw),job.hash);
 const tx=parseTransaction(job.raw);assert.equal(tx.chainId,10143);assert(!tx.to);assert(tx.data===expected,`${name}: compiled deployment differs from its journal`);
 const receipt=await t.base.getTransactionReceipt({hash:job.hash});assert.equal(receipt.status,'success');assert(receipt.contractAddress);
 const deployed=await t.base.getCode({address:receipt.contractAddress});assert(deployed&&deployed!=='0x');
 report.deployments.push({name,address:receipt.contractAddress,creationHash:keccak256(expected),runtimeHash:keccak256(deployed)});
 return receipt.contractAddress;
}
try{
 for(const [name,args] of [
  ['ChaosEffects',[]],['ChaosModifiers',[]],['ChaosRally',[]],['ChaosDynamics',['ChaosEffects','ChaosModifiers']],
  ['ChaosContacts',['ChaosDynamics']],['ChaosPhysics',['ChaosEffects','ChaosRally','ChaosDynamics','ChaosContacts']],
  ['ChaosCodec',[]],['DrandEvmnet',[]],['ChaosDrawRules',[]],['ChaosEngine',['ChaosCodec','ChaosPhysics','DrandEvmnet','ChaosDrawRules']],
 ] as const)assert.equal((await deployment(name,args.map(n=>r.modules[n]))).toLowerCase(),r.modules[name].toLowerCase());
 const root=await deployment('PongChaosEvents',['0x3Ef8327F69e09cf721772F345e2A887eA22cD595',privateKeyToAccount(r.keys[4]).address,privateKeyToAccount(r.keys[5]).address,t.account.address,zeroAddress,r.modules.ChaosEngine]);
 assert.equal(root.toLowerCase(),r.app.toLowerCase());report.passed=true;
}finally{await writeFile('artifacts/drand/candidate-bytecode.json',JSON.stringify(report,null,2));await t.close();console.log(JSON.stringify({app:r.app,passed:report.passed,contracts:report.deployments.length}));}
