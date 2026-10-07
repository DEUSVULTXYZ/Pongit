// One bounded, authorized test-MON reserve movement. Reuse both original journals.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {parseEther,formatEther,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';

assert.equal(process.env.PONG_INTEGRITY_ADMISSION_RESERVE,'owned-5-test-mon-integrity-20261007');
const sender='0x03CaceFD5522f27Ee20322aAA03E76745518FAd1' as Address;
const recipient='0x12c57debc4d9ba127dfd98f88095b87395ae9a7f' as Address;
const value=parseEther('5'),prefix='public-integrity-admission-reserve-20261007';
const db=new Pool({connectionString:process.env.PONG_SOURCE_SPONSOR_DATABASE_URL});
const t=await chainTools(prefix,undefined,{keyFile:'/old-role-keys/sponsor.json',address:sender,
 allowCall(to,data,amount){assert.equal(to.toLowerCase(),recipient);assert.equal(data,'0x');assert.equal(amount,value);}});
try{
 assert.equal((await db.query('SELECT owner FROM independent_writer_binding WHERE id=1')).rows[0].owner,sender.toLowerCase());
 assert.equal(Number((await db.query("SELECT count(*) FROM independent_operations WHERE status IN ('queued','pending')")).rows[0].count),0);
 const known=await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':admission-5']);
 assert(known.rowCount||await t.base.getBalance({address:sender})>value+parseEther('20'),'Retain twenty test MON for public sponsoring');
 assert(known.rowCount||await t.base.getBalance({address:recipient})<parseEther('0.5'),'Recipient already has reserve; do not repeat');
 const receipt=await t.submit('admission-5','0x',recipient,value);
 const report={passed:true,at:new Date().toISOString(),sender,recipient,amount:'5',hash:receipt.transactionHash,
  senderRemaining:formatEther(await t.base.getBalance({address:sender})),admissionBalance:formatEther(await t.base.getBalance({address:recipient}))};
 await writeFile('/evidence/admission-reserve.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report));
}finally{await db.end();await t.close();}
