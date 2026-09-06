import "dotenv/config";
import {readFile} from "node:fs/promises";
import {createPublicClient,createWalletClient,http,defineChain,parseEther,parseGwei,isAddress,keccak256,toHex,type Hex,type Address} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {initializeStore,pool} from "../relayer/src/store";
import {readSponsorCosts} from "../relayer/src/budget";
import {json,type Deployment} from "../shared/protocol";

// Run only from the authenticated operator shell while the relayer is stopped.
// The same advisory lock, nonce journal and daily ceiling cover this transfer.
const [target,amountText]=process.argv.slice(2);
if(!isAddress(target))throw new Error("Usage: operator-funding.ts 0xOPERATOR_ADDRESS TEST_MON");
const value=parseEther(amountText);if(value<=0n || value>parseEther("2"))throw new Error("Operator transfer must be between 0 and 2 test MON");
const d:Deployment=JSON.parse(await readFile(process.env.DEPLOYMENT_FILE || "deployments/testnet.json","utf8"));
if(![10143,31337].includes(d.chainId))throw new Error("Test networks only");
const signer=privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as Hex),url=process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
const chain=defineChain({id:d.chainId,name:"PONGIT test network",nativeCurrency:{name:"MON",symbol:"MON",decimals:18},rpcUrls:{default:{http:[url]}}});
const client=createPublicClient({chain,transport:http(url),pollingInterval:300}),wallet=createWalletClient({account:signer,chain,transport:http(url)});
if(await client.getChainId()!==d.chainId)throw new Error("RPC chain mismatch");
const lock=await initializeStore();lock.on("error",()=>process.exit(1));
try {
  const original=d.legacy || d;
  const fingerprint=keccak256(toHex(json({chainId:original.chainId,game:original.game,vault:original.vault,market:original.market,tournaments:original.tournaments,signer:signer.address})));
  const binding=await pool.query("SELECT fingerprint FROM deployment_binding");
  if(binding.rows[0]?.fingerprint!==fingerprint)throw new Error("Signing journal mismatch");
  if((await pool.query("SELECT 1 FROM relay_jobs WHERE status IN ('queued','signed','sent') LIMIT 1")).rowCount)throw new Error("Drain all pending jobs before an operator transfer");
  const gasPrice=await client.getGasPrice(),cap=parseGwei(process.env.RELAYER_MAX_GAS_PRICE_GWEI || "200");if(gasPrice>cap)throw new Error("Gas price ceiling exceeded");
  const maxFeePerGas=gasPrice*2n>cap?cap:gasPrice*2n,gas=25000n,cost=gas*maxFeePerGas+value;
  const budget=parseEther(process.env.RELAYER_DAILY_BUDGET_MON || "6"),{spent}=await readSponsorCosts(pool,new Date());
  if(spent+cost>budget)throw new Error("Daily sponsorship ceiling exceeded");
  const [nonce,balance]=await Promise.all([client.getTransactionCount({address:signer.address,blockTag:"pending"}),client.getBalance({address:signer.address})]);
  const reserved=(await pool.query("SELECT max(nonce) AS nonce FROM relay_jobs WHERE raw_tx IS NOT NULL")).rows[0].nonce;
  if(reserved!==null && nonce<=Number(reserved))throw new Error("Chain nonce has not caught up with the journal");
  if(balance<cost+parseEther("0.01"))throw new Error("Insufficient sponsor reserve");
  const raw=await wallet.signTransaction({to:target as Address,value,nonce,gas,maxFeePerGas,maxPriorityFeePerGas:0n,type:"eip1559"});
  const hash=keccak256(raw),id=keccak256(toHex(`operator-funding:${hash}`));
  await pool.query("INSERT INTO relay_jobs(id,payload,status,nonce,raw_tx,tx_hash,cost,signed_at) VALUES($1,$2,'signed',$3,$4,$5,$6,now())",[id,json({deployment:d.version===2?"v2":"v1",contract:"vault",functionName:"operatorFunding",args:[target],value:value.toString()}),nonce,raw,hash,cost.toString()]);
  await client.sendRawTransaction({serializedTransaction:raw});
  await pool.query("UPDATE relay_jobs SET status='sent',submitted_at=now(),updated_at=now() WHERE id=$1",[id]);
  const receipt=await client.waitForTransactionReceipt({hash});
  await pool.query("UPDATE relay_jobs SET status=$2,receipt=$3,confirmed_at=now(),updated_at=now() WHERE id=$1",[id,receipt.status==="success"?"succeeded":"failed",json(receipt)]);
  if(receipt.status!=="success")throw new Error("Funding transfer reverted");
  console.log(json({id,recipient:target,testMon:amountText,hash,nonce,gasCost:receipt.gasUsed*receipt.effectiveGasPrice}));
} finally {lock.release();await pool.end();}
