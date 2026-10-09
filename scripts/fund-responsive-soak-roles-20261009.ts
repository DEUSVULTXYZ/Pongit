// Bounded allocation from the user's authorized TEST MON reserve, not a new purchase.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEther,formatEther,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {agentPoolAdmissionAbi} from '../shared/agent-house-instances';

assert.equal(process.env.PONG_RESPONSIVE_SOAK_RESERVE,'owned-roles-900-20261009');
const r=JSON.parse(await readFile('/metadata/reusable.json','utf8'));
const pool='0xe01c31f482113367c510a04816ff371676477fa3' as Address;
assert.equal(r.prefix,'reusable-agents-20261008-2');
assert.equal(r.common.pool.toLowerCase(),pool);
const targets=[
 {role:'archive',address:'0x4387c90cf38ce514bcc99234d2f9296d218e5543',amount:'200',ceiling:'50'},
 {role:'sponsor',address:'0x03cacefd5522f27ee20322aaa03e76745518fad1',amount:'200',ceiling:'100'},
 {role:'admission',address:'0x12c57debc4d9ba127dfd98f88095b87395ae9a7f',amount:'500',ceiling:'500'},
] as const;
const prefix='responsive-20261009-r2:soak-role-reserve-1',t=await chainTools(prefix);
const report:{at:string;passed:boolean;pool:Address;transfers:object[]}={at:new Date().toISOString(),passed:false,pool,transfers:[]};
try{
 assert.equal((await t.base.readContract({address:pool,abi:agentPoolAdmissionAbi,functionName:'admissionOperator'})).toLowerCase(),targets[2].address);
 // Check all destinations and limits before the first new signed intent.
 for(const target of targets){
  assert.equal(r.serviceOperators[target.role].toLowerCase(),target.address);
  const known=await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[`${prefix}:${target.role}-${target.amount}`]);
  assert(known.rowCount||await t.base.getBalance({address:target.address as Address})<parseEther(target.ceiling),'Role reserve changed; inspect rather than duplicate funding');
 }
 assert(await t.base.getBalance({address:t.account.address})>parseEther('10000'),'Preserve operator recovery reserve');
 for(const target of targets){
  const address=target.address as Address,before=await t.base.getBalance({address});
  const receipt=await retryOperatorContention(()=>t.submit(`${target.role}-${target.amount}`,'0x',address,parseEther(target.amount)));
  report.transfers.push({role:target.role,address,beforeMon:formatEther(before),amountMon:target.amount,
   afterMon:formatEther(await t.base.getBalance({address})),hash:receipt.transactionHash,block:String(receipt.blockNumber),
   gasUsed:String(receipt.gasUsed),effectiveGasPrice:String(receipt.effectiveGasPrice)});
 }
 report.passed=true;
}finally{
 await writeFile('/evidence/soak-role-reserve-1.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 await t.close();console.log(JSON.stringify(report));
}
