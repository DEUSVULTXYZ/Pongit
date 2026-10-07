// Bounded transfer from the stopped sponsor, through its original nonce journal.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {parseEther,formatEther,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
assert.equal(process.env.PONG_RESHIP_IMPORT_RESERVE,'owned-70-test-mon-20261007');
const sender='0x03CaceFD5522f27Ee20322aAA03E76745518FAd1' as Address;
const recipient='0x369158ac444278541322643e46e0d5b45ac21c4c' as Address,value=parseEther('70');
const db=new Pool({connectionString:process.env.PONG_SOURCE_SPONSOR_DATABASE_URL});
const t=await chainTools('public-reship-import-reserve-20261007',undefined,{keyFile:'/old-role-keys/sponsor.json',address:sender,
 allowCall(to,data,amount){assert.equal(to.toLowerCase(),recipient);assert.equal(data,'0x');assert.equal(amount,value);}});
try{
 assert.equal((await db.query('SELECT owner FROM independent_writer_binding WHERE id=1')).rows[0].owner,sender.toLowerCase());
 assert.equal(Number((await db.query("SELECT count(*) FROM independent_operations WHERE status IN ('queued','pending')")).rows[0].count),0);
 const known=await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',['public-reship-import-reserve-20261007:operator-70']);
 assert(known.rowCount||await t.base.getBalance({address:sender})>value+parseEther('90'),'Retain the live sponsor reserve');
 const receipt=await t.submit('operator-70','0x',recipient,value);
 const report={passed:true,at:new Date().toISOString(),sender,recipient,amount:'70',hash:receipt.transactionHash,
  senderRemaining:formatEther(await t.base.getBalance({address:sender})),operatorBalance:formatEther(await t.base.getBalance({address:recipient}))};
 await writeFile('/evidence/import-reserve.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}finally{await db.end();await t.close();}
