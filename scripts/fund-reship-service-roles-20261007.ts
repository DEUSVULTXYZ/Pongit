// Reuse owned test-MON reserves. Every sender retains its existing signer journal.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEther,formatEther,type Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
assert.equal(process.env.PONG_PUBLIC_ROLE_FUNDING,'reship-new-roles-20261007');
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
assert.equal(r.prefix,'reusable-agents-20261007-1');assert.equal(r.phase,'deployed-closed');
assert.equal(r.continuation.pool.toLowerCase(),'0x1f7d8a7b470a724df48d1b72723d7782d8e6014a');
const proof=JSON.parse(await readFile('/evidence/public-import-1.json','utf8'));assert(proof.passed&&proof.results===837);
const report:any={at:new Date().toISOString(),pool:r.common.pool,transfers:[],passed:false};
try{
 // Sponsoring keeps its existing signer, database binding and nonce journal.
 report.sponsorRetained='0x03CaceFD5522f27Ee20322aAA03E76745518FAd1';
 for(const source of ['maintenance'] as const){
  const sender='0xbeeb456231E970aC08420488a2dB91Bfe257686A' as Address;
  const roles=['maintenance','admission','archive'];
  const value=parseEther('10'),reserve=parseEther('5');
  const targets=new Set<string>();
  for(const role of roles){
   const key=JSON.parse(await readFile('/secrets/'+role+'.json','utf8')).privateKey;
   assert.equal(privateKeyToAccount(key).address.toLowerCase(),r.serviceOperators[role].toLowerCase());
   targets.add(r.serviceOperators[role].toLowerCase());
  }
  assert.equal(targets.size,roles.length);assert(!targets.has(sender.toLowerCase()));
  const prefix='public-reship-new-roles-20261007:'+source;
  const t=await chainTools(prefix,undefined,{keyFile:'/old-role-keys/'+source+'.json',address:sender,
   allowCall(to,data,amount){assert.equal(data,'0x');assert(targets.has(to.toLowerCase()));assert.equal(amount,value);}});
  try{
   assert.equal(await t.base.getChainId(),10143);
   for(const role of roles){
    const address=r.serviceOperators[role] as Address;
    const known=await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':'+role]);
    assert(known.rowCount||await t.base.getBalance({address:sender})>value+reserve,'Keep source recovery reserves');
    assert(known.rowCount||await t.base.getBalance({address})<parseEther('1'),'Target already funded; review exact journal');
    const receipt=await retryOperatorContention(()=>t.submit(role,'0x',address,value));
    report.transfers.push({source,role,address,amount:formatEther(value),hash:receipt.transactionHash});
   }
  }finally{await t.close();}
 }
 report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].slice(0,180);process.exitCode=1;}
finally{await writeFile('/evidence/new-role-funding.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
