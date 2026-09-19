import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import type {chainTools} from './independent-chain-tools';

export function qualificationRules(prefix:string){
 const match=/^chaos-events-rules(8|9)-[a-z0-9-]{1,48}$/.exec(prefix);
 assert(match,'Use a separately journaled rules-8 or rules-9 qualification ID');return Number(match[1]) as 8|9;
}
/** Only a freshly journalled versioned fixture can be operated by these scripts. */
export async function chaosQualificationRecord(){
 assert.equal(process.env.PONG_CHAOS_QUALIFY,'isolated-hosted-testnet');
 const prefix=process.env.PONG_CHAOS_QUALIFY_ID;
 assert(prefix,'Use an isolated qualification ID');qualificationRules(prefix);
 const path=`/secrets/${prefix}.json`,record=JSON.parse(await readFile(path,'utf8'));
 return {prefix,path,record};
}
export async function verifyQualificationApp(t:Awaited<ReturnType<typeof chainTools>>,prefix:string,app:string){
 const job=(await t.db.query('SELECT hash,status FROM il_lifecycle_jobs WHERE id=$1',[prefix+':deploy-pongchaosevents'])).rows[0];
 assert.equal(job?.status,'confirmed','The isolated deployment must have its own confirmed journal');
 const receipt=await t.base.getTransactionReceipt({hash:job.hash});
 assert.equal(receipt.status,'success');assert.equal(receipt.contractAddress?.toLowerCase(),app.toLowerCase());
 const a=await t.artifact('PongChaosEvents');
 assert.equal(await t.base.readContract({address:app as `0x${string}`,abi:a.abi,functionName:'RULES_VERSION'}),BigInt(qualificationRules(prefix)));
 return a;
}
