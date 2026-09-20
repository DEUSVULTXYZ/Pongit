// Read-only gate for the isolated rules-12 deployment. No account is funded,
// no delegation is opened and no provider session is created by this script.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {createPublicClient,http,parseAbi,type Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {readHubDelegation} from '../shared/rooms-hub';
assert.equal(process.env.PONG_INDEPENDENT_EVENTS_QUALIFICATION,'isolated-vps');
const hub:Address='0x3Ef8327F69e09cf721772F345e2A887eA22cD595';
const operator:Address='0x369158Ac444278541322643E46e0D5b45ac21C4C';
const bridge=privateKeyToAccount(JSON.parse(await readFile(process.env.ROOMS_PRESSURE_KEY_FILE!,'utf8')).privateKey).address;
assert.equal(bridge.toLowerCase(),'0x15e6b4c9fecac754ce2d9052b6060dd5920e7659','Use the existing approved testnet bridge');
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
assert.equal(await base.getChainId(),10143);
const {abi}=JSON.parse(await readFile('node_modules/@interludelayer-sdk/cli/artifacts/InterludeHub.sol/InterludeHub.json','utf8'));
const block=await base.getBlock(),validator=await base.readContract({address:hub,abi,functionName:'defaultValidator',blockNumber:block.number}) as Address;
const terms:any=await base.readContract({address:hub,abi,functionName:'termsOf',args:[validator],blockNumber:block.number});
const bond=await base.readContract({address:hub,abi,functionName:'bondOf',args:[validator],blockNumber:block.number}) as readonly bigint[];
const probe:Address='0xe4f978d978cbafe6682d0ac056d773fe2c950c94';
assert.equal((await readHubDelegation(base,hub,probe)).status,0,'The read-only admission probe must already be released');
const probeAbi=parseAbi(['function owner() view returns(address)','function delegateAll() payable']);
const owner=await base.readContract({address:probe,abi:probeAbi,functionName:'owner'});
let simulation='accepted';
try{await base.simulateContract({address:probe,abi:[...probeAbi,...abi.filter((x:any)=>x.type==='error')],functionName:'delegateAll',account:owner,value:terms.delegationFee});}
catch(e){simulation='unknown-revert';for(let x:any=e,n=0;x&&n<10;x=x.cause,n++)if(x.data?.errorName)simulation=x.data.errorName;}
const db=new Pool({connectionString:process.env.DATABASE_URL});let pending:number;
try{pending=Number((await db.query("SELECT count(*) FROM il_lifecycle_jobs WHERE owner=$1 AND status='pending'",[operator.toLowerCase()])).rows[0].count);}finally{await db.end();}
const report={at:new Date().toISOString(),readOnly:true,chainId:10143,block:String(block.number),operator,bridge,
 balance:String(await base.getBalance({address:operator})),operatorPending:pending,validator,
 maxDelegations:String(terms.maxDelegations),stake:String(terms.stakePerDelegation),reserved:String(bond[1]),
 challengeWindow:String(terms.challengeWindow),simulation,hostedQualified:false,
 note:'A successful read-only simulation is not a reservation or proof of three hosted arena admissions.'};
await mkdir('artifacts/independent-candidate',{recursive:true});
await writeFile('artifacts/independent-candidate/preflight.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
assert.equal(simulation,'accepted','No admission currently simulated');assert.equal(pending,0,'Reconcile the shared operator before deployment');
