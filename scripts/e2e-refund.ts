import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createPublicClient,createWalletClient,http,parseEther,type Hex} from 'viem';
import {monadTestnet} from 'viem/chains';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {contractsFor,domain,enterTypes,json} from '../shared/protocol';
const base=process.env.E2E_API_URL||'https://pongit.xyz/api';
assert(process.env.E2E_ALLOW_TESTNET==='true'&&process.env.ADMIN_PRIVATE_KEY,'Explicit funded testnet operator required');
const api=async(path:string)=>{const r=await fetch(base+path);assert(r.ok);return r.json();};const d=await api('/config');assert.equal(d.version,4);assert.equal(d.chainId,10143);
const client=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL||'https://testnet-rpc.monad.xyz'),pollingInterval:300}),wallet=createWalletClient({chain:monadTestnet,transport:http(process.env.RPC_URL||'https://testnet-rpc.monad.xyz'),account:privateKeyToAccount(process.env.ADMIN_PRIVATE_KEY as Hex)}),abi=contractsFor(d);
assert.equal(await client.getChainId(),10143);const entrant=privateKeyToAccount(generatePrivateKey()),fee=parseEther('0.001');
async function write(module:'tournaments'|'vault',fn:string,args:unknown[],value=0n){const hash=await wallet.writeContract({address:d[module],abi:abi[module] as any,functionName:fn,args,value});assert.equal((await client.waitForTransactionReceipt({hash})).status,'success');return hash;}
const tid=await client.readContract({address:d.tournaments,abi:abi.tournaments,functionName:'nextId'}) as bigint,now=(await client.getBlock()).timestamp;
const createHash=await write('tournaments','create',[now+20n,2,fee],parseEther('0.002'));
await write('vault','depositFor',[entrant.address],fee);
const message={player:entrant.address,tournamentId:tid,nonce:0n,deadline:now+120n};const signature=await entrant.signTypedData({domain:domain('PONG Tournaments',10143,d.tournaments),types:enterTypes,primaryType:'Enter',message});
await write('tournaments','enter',[tid,entrant.address,0n,now+120n,signature]);
while((await client.getBlock()).timestamp<=now+20n)await new Promise(r=>setTimeout(r,700));
const cancelHash=await write('tournaments','cancel',[tid]),resultAt=Date.now();let payment:any;
for(let i=0;i<90;i++){payment=(await api('/payouts/'+entrant.address)).payments.find((p:any)=>p.kind===2&&p.sourceId===String(tid));if(payment?.state==='paid'&&payment.txHash)break;await new Promise(r=>setTimeout(r,1000));}
assert.equal(payment?.state,'paid');assert(payment.txHash);assert.equal(await client.getBalance({address:entrant.address}),fee);assert.equal(await client.readContract({address:d.vault,abi:abi.vault,functionName:'balances',args:[entrant.address]}),0n);
await writeFile('artifacts/v4-testnet-refund.json',json({network:10143,tournamentId:tid,recipient:entrant.address,refundWei:fee,createHash,cancelHash,payment,observedResultToPaymentMs:Date.now()-resultAt,recipientNeverConnected:true,checks:['cancelled tournament entry refund','fixed recipient received exact MON without signature','zero betting-vault credit'],checkedAt:new Date().toISOString()}));console.log('PASS: an offline tournament entrant received the exact native cancellation refund automatically.');
