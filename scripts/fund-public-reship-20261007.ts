// Explicit testnet-only treasury movement for the authorized full public reship.
// The retired maintenance signer retains its original scoped nonce journal.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {formatEther,parseEther,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
assert.equal(process.env.PONG_PUBLIC_ROLE_FUNDING,'reship-all-20261007');
const r=JSON.parse(await readFile('/agent-metadata/reusable.json','utf8'));
assert.equal(r.common.pool.toLowerCase(),'0x1f7d8a7b470a724df48d1b72723d7782d8e6014a');
const sender='0xbeeb456231E970aC08420488a2dB91Bfe257686A' as Address;
assert.equal(r.serviceOperators.maintenance.toLowerCase(),sender.toLowerCase());
const amounts=new Map([
 ['0x369158ac444278541322643e46e0d5b45ac21c4c',parseEther('30')],
 ['0x38078433f7a63b3e6abdef49a726599d655f42c5',parseEther('10')],
]);
assert.equal(r.serviceOperators.archive.toLowerCase(),[...amounts.keys()][1]);
const prefix='public-reship-reserve-20261007';
const t=await chainTools(prefix,undefined,{keyFile:'/run/maintenance-funding.json',address:sender,
 allowCall(to,data,value){assert.equal(data,'0x');assert.equal(amounts.get(to.toLowerCase()),value);}});
const report:any={at:new Date().toISOString(),sender,transfers:[],passed:false};
try{
 assert.equal(await t.base.getChainId(),10143);
 for(const [address,value]of amounts){
  const id=address.slice(2),known=await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':'+id]);
  const before=await t.base.getBalance({address:sender});
  assert(known.rowCount||before>value+parseEther('30'),'Keep 30 test MON in the retired maintenance account');
  const tx=await retryOperatorContention(()=>t.submit(id,'0x',address as Address,value));
  report.transfers.push({address,amount:formatEther(value),hash:tx.transactionHash,after:formatEther(await t.base.getBalance({address:address as Address}))});
 }
 report.remaining=formatEther(await t.base.getBalance({address:sender}));report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].slice(0,180);process.exitCode=1;}
finally{await t.close();await writeFile('/evidence/reserve-transfer.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
