"""Read-only proof of actual grouped admissions; never emits authorizations."""
import datetime,json,pathlib,subprocess
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
out=root/'live/evidence/entry50-groups-proof.json';assert not out.exists()
script=r'''
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {createPublicClient,http,decodeEventLog} from 'viem';
import {monadTestnet} from 'viem/chains';
import {reusableAgentPoolAbi} from './shared/abi-ReusableAgentPool.ts';
import {readFile} from 'node:fs/promises';
const db=new Pool({connectionString:process.env.DATABASE_URL}),journal=new Pool({connectionString:process.env.OPERATOR_DATABASE_URL});
const m=JSON.parse(await readFile('/metadata/manifest.json','utf8'));
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
try{
 const owner=(await db.query('SELECT owner FROM independent_writer_binding WHERE id=1')).rows[0].owner;
 const groups=(await db.query('SELECT id,members,created_at FROM independent_operation_batches ORDER BY created_at DESC LIMIT 12')).rows;
 assert(groups.length>0,'No actual group has been recorded');const rows=[];
 for(const group of groups){
  const members=(await db.query('SELECT id,status,hash FROM independent_operations WHERE id=ANY($1::text[])',[group.members])).rows;
  assert.equal(members.length,group.members.length);
  const jobs=(await journal.query('SELECT id,nonce,hash,status,owner FROM il_lifecycle_jobs WHERE id=$1 AND owner=$2',[`independent:${owner}:${group.id}`,owner])).rows;
  assert.equal(jobs.length,1);const job=jobs[0];assert.equal(job.status,'confirmed');
  assert(members.every(r=>r.status==='confirmed'&&r.hash===job.hash));
  const receipt=await base.getTransactionReceipt({hash:job.hash}),block=await base.getBlock({blockNumber:receipt.blockNumber});
  assert.equal(receipt.transactionHash,job.hash);assert.equal(receipt.status,'success');assert.equal(receipt.blockHash,block.hash);
  const admissions=receipt.logs.filter(l=>l.address.toLowerCase()===m.pool.toLowerCase()).flatMap(l=>{
   try{const e=decodeEventLog({abi:reusableAgentPoolAbi,data:l.data,topics:l.topics});return e.eventName==='AdmissionIssued'?[{
    app:e.args.arena,epoch:String(e.args.epoch),id:String(e.args.binding.id),a:e.args.binding.a,b:e.args.binding.b,mode:e.args.binding.mode,ranked:e.args.binding.ranked,
   }]:[];}catch{return [];}
  });
  rows.push({id:group.id,createdAt:group.created_at,members:group.members.length,nonce:String(job.nonce),hash:job.hash,
   block:String(receipt.blockNumber),blockHash:block.hash,gasUsed:String(receipt.gasUsed),feeWei:String(receipt.gasUsed*receipt.effectiveGasPrice),admissions});
 }
 console.log(JSON.stringify({at:new Date().toISOString(),passed:true,scope:'Canonical actual sponsor groups and immutable original operation statuses',groups:rows}));
}finally{await db.end();await journal.end();}
'''
p=subprocess.run(['docker','exec','-i','pongit-arcade-five-sponsor-1','node','--import','tsx','--input-type=module'],input=script,text=True,capture_output=True,timeout=90)
if p.returncode:
 out.write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':False,'exitCode':p.returncode,'error':'Read-only group verification failed; preserve container evidence'},indent=2))
 raise RuntimeError('Group verification failed; no writes attempted')
report=json.loads(p.stdout.strip().splitlines()[-1]);assert report['passed'];out.write_text(json.dumps(report,indent=2));print(json.dumps(report))
