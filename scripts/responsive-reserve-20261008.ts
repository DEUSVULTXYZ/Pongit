// One owned testnet transfer, through the original operator nonce authority.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {parseEther,formatEther} from 'viem';
import {chainTools} from './independent-chain-tools';
assert.equal(process.env.PONG_RESPONSIVE_RESERVE,'old-admission-100-20261008');
const prefix='responsive-20261008-reserve',recipient='0x12c57debc4d9ba127dfd98f88095b87395ae9a7f';
const t=await chainTools(prefix);
try{
 const before=await t.base.getBalance({address:recipient});
 const known=await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':admission-100']);
 assert(known.rowCount||before<parseEther('2'),'Recipient already funded; inspect before adding reserve');
 assert(known.rowCount||await t.base.getBalance({address:t.account.address})>parseEther('1000'),'Keep the operating reserve');
 const receipt=await t.submit('admission-100','0x',recipient,parseEther('100'));
 const report={passed:true,at:new Date().toISOString(),sender:t.account.address,recipient,amount:'100',
  hash:receipt.transactionHash,before:formatEther(before),after:formatEther(await t.base.getBalance({address:recipient}))};
 await writeFile('/evidence/admission-reserve.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}finally{await t.close();}
