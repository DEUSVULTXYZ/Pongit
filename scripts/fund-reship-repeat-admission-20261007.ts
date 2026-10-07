// One authorized test-MON top-up; the original operator journal owns the nonce.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {parseEther,formatEther,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
assert.equal(process.env.PONG_RESHIP_ADMISSION_RESERVE,'owned-5-test-mon-20261007');
const sender='0x369158ac444278541322643e46e0d5b45ac21c4c' as Address;
const recipient='0x12c57dEBC4d9bA127DfD98F88095B87395ae9a7f' as Address;
const value=parseEther('5'),prefix='public-reship-repeat-admission-20261007';
const t=await chainTools(prefix);
assert.equal(t.account.address.toLowerCase(),sender.toLowerCase());
try{
 const known=await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':reserve-5']);
 assert(known.rowCount||await t.base.getBalance({address:recipient})<parseEther('1'),'Do not duplicate a sufficient admission reserve');
 assert(known.rowCount||await t.base.getBalance({address:sender})>value+parseEther('4'),'Keep four MON in the original operator');
 const receipt=await t.submit('reserve-5','0x',recipient,value);
 const report={passed:true,at:new Date().toISOString(),sender,recipient,amount:'5',hash:receipt.transactionHash,
  admissionBalance:formatEther(await t.base.getBalance({address:recipient})),operatorBalance:formatEther(await t.base.getBalance({address:sender}))};
 await writeFile('/evidence/admission-reserve.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report));
}finally{await t.close();}
