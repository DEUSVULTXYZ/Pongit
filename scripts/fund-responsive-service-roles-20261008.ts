// Authorized TEST MON reserve allocation; existing role jobs keep their nonces.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEther,formatEther,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
assert.equal(process.env.PONG_RESPONSIVE_ROLE_RESERVE,'owned-archive-sponsor-100-each');
const r=JSON.parse(await readFile('/metadata/reusable.json','utf8'));
assert.equal(r.prefix,'reusable-agents-20261008-2');
assert.equal(r.common.pool.toLowerCase(),'0xe01c31f482113367c510a04816ff371676477fa3');
const targets={archive:'0x4387c90cf38ce514bcc99234d2f9296d218e5543',sponsor:'0x03cacefd5522f27ee20322aaa03e76745518fad1'} as const;
const prefix='responsive-20261008-r2:role-reserve-1',t=await chainTools(prefix);
const report:any={at:new Date().toISOString(),passed:false,pool:r.common.pool,transfers:[]};
try{
 for(const [role,address] of Object.entries(targets)){
  assert.equal(r.serviceOperators[role].toLowerCase(),address);
  const before=await t.base.getBalance({address:address as Address});
  const known=await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':'+role+'-100']);
  assert(known.rowCount||before<parseEther('50'),'Role already funded; inspect before another transfer');
  assert(known.rowCount||await t.base.getBalance({address:t.account.address})>parseEther('1000'),'Keep operator recovery reserve');
  const receipt=await retryOperatorContention(()=>t.submit(role+'-100','0x',address as Address,parseEther('100')));
  report.transfers.push({role,address,beforeMon:formatEther(before),amountMon:'100',hash:receipt.transactionHash,block:String(receipt.blockNumber),afterMon:formatEther(await t.base.getBalance({address:address as Address}))});
 }
 report.passed=true;
}finally{
 await writeFile('/evidence/role-reserve-1.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 await t.close();console.log(JSON.stringify(report));
}
