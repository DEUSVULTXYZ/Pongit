"""Read canonical fees and owned balances without copying credentials."""
import json
import pathlib
import subprocess

root = pathlib.Path('/opt/pongit/releases/command-integrity-20261007')
script = r'''
import assert from 'node:assert/strict';
import {createPublicClient,http,formatEther} from 'viem';
import {Pool} from 'pg';
import {abi as hubAbi} from './shared/abi-independent-IInterludeHub.ts';
const hub='0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e';
const c=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:20000})});
const block=await c.getBlock(),db=new Pool({connectionString:process.env.DATABASE_URL});
try{
 const validator=await c.readContract({address:hub,abi:hubAbi,functionName:'defaultValidator',blockNumber:block.number});
 const terms=await c.readContract({address:hub,abi:hubAbi,functionName:'termsOf',args:[validator],blockNumber:block.number});
 const rows=(await db.query("SELECT id,hash FROM il_lifecycle_jobs WHERE (id LIKE 'reusable-agents-20261007-2:%' OR id LIKE 'public-human-v3-20261007-2:%') AND status='confirmed' ORDER BY nonce")).rows;
 let gasCost=0n;const fees=[];
 for(const row of rows){const r=await c.getTransactionReceipt({hash:row.hash});assert.equal(r.status,'success');const fee=r.gasUsed*r.effectiveGasPrice;gasCost+=fee;fees.push({operation:row.id,hash:row.hash,feeMon:formatEther(fee)});}
 const balances=[];for(const address of ['0x369158ac444278541322643e46e0d5b45ac21c4c','0x03CaceFD5522f27Ee20322aAA03E76745518FAd1','0x12c57debc4d9ba127dfd98f88095b87395ae9a7f'])balances.push({address,mon:formatEther(await c.getBalance({address,blockNumber:block.number}))});
 console.log(JSON.stringify({at:new Date().toISOString(),block:String(block.number),validator,stakeReservedFromValidator:formatEther(terms.stakePerDelegation),openingFeeMon:formatEther(terms.delegationFee),previousConfirmedTransactions:rows.length,previousGasMon:formatEther(gasCost),balances,fees}));
}finally{await db.end();}
'''
r = subprocess.run(['docker', 'exec', '-i', '-w', '/app', 'pongit-arcade-five-maintenance-1', 'node', '--import', 'tsx', '--input-type=module'], input=script, text=True, capture_output=True, timeout=180)
if r.returncode:
    raise RuntimeError('Budget observation failed; no transaction sent')
d = json.loads(r.stdout.strip().splitlines()[-1])
p = root / 'budget-observation.json'
with p.open('x') as f: json.dump(d, f, indent=2)
print(json.dumps({k:v for k,v in d.items() if k != 'fees'}))
