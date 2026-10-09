// One authorized TEST MON reserve transfer; preserve the original nonce journal.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEther,formatEther,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {agentPoolAdmissionAbi} from '../shared/agent-house-instances';

assert.equal(process.env.PONG_RESPONSIVE_ADMISSION_RESERVE,'owned-admission-500-20261009');
const r=JSON.parse(await readFile('/metadata/reusable.json','utf8'));
const pool='0xe01c31f482113367c510a04816ff371676477fa3',recipient='0x12c57debc4d9ba127dfd98f88095b87395ae9a7f' as Address;
assert.equal(r.prefix,'reusable-agents-20261008-2');assert.equal(r.common.pool.toLowerCase(),pool);
assert.equal(r.serviceOperators.admission.toLowerCase(),recipient);
const prefix='responsive-20261009-r2:admission-reserve-2',name='admission-500',t=await chainTools(prefix);
try{
 assert.equal((await t.base.readContract({address:pool,abi:agentPoolAdmissionAbi,functionName:'admissionOperator'})).toLowerCase(),recipient);
 const before=await t.base.getBalance({address:recipient});
 const known=await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':'+name]);
 assert(known.rowCount||before<parseEther('2'),'Admission already funded; inspect before another transfer');
 assert(known.rowCount||await t.base.getBalance({address:t.account.address})>parseEther('2000'),'Keep operator recovery reserve');
 const receipt=await retryOperatorContention(()=>t.submit(name,'0x',recipient,parseEther('500')));
 const report={passed:true,at:new Date().toISOString(),sender:t.account.address,recipient,amountMon:'500',
  beforeMon:formatEther(before),afterMon:formatEther(await t.base.getBalance({address:recipient})),
  hash:receipt.transactionHash,block:String(receipt.blockNumber),feeMon:formatEther(receipt.gasUsed*receipt.effectiveGasPrice)};
 await writeFile('/evidence/admission-reserve-2.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}finally{await t.close();}
