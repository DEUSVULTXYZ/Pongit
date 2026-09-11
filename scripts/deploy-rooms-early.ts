import {readFile,writeFile,mkdir,open,unlink} from "node:fs/promises";
import path from "node:path";
import {createPublicClient,createWalletClient,defineChain,http,encodeDeployData,encodeFunctionData,keccak256,parseGwei,parseAbi,type Abi,type Hex,type Address} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {roomsChaosAbi} from "../shared/abi-PongRoomsTestnet";
import {marketV4Abi} from "../shared/abis-v4";
import {roomsVaultAbi} from "../shared/abi-RoomsVault";
import {roomsEarlySettlementAbi} from "../shared/abi-RoomsEarlySettlement";

// Run with the operator nonce owner stopped. Journal and signing key stay outside Git.
const keyFile=process.env.EARLY_DEPLOY_KEY_FILE,journalFile=process.env.EARLY_DEPLOY_JOURNAL;
if(!keyFile||!journalFile||!path.isAbsolute(journalFile))throw new Error("Private key file and absolute private journal path required");
const rpc=process.env.RPC_URL||"https://testnet-rpc.monad.xyz";
const base=createPublicClient({transport:http(rpc),pollingInterval:500});
if(await base.getChainId()!==10143)throw new Error("Monad Testnet only");
const key=JSON.parse(await readFile(keyFile,"utf8"));
const account=privateKeyToAccount(key.privateKey);
const chain=defineChain({id:10143,name:"Monad Testnet",nativeCurrency:{name:"MON",symbol:"MON",decimals:18},rpcUrls:{default:{http:[rpc]}}});
const wallet=createWalletClient({account,chain,transport:http(rpc)});
const game=JSON.parse(await readFile("deployments/interlude-rooms.json","utf8"));
const manifests=JSON.parse(await readFile("deployments/rooms-finance.json","utf8"));
const old=manifests.find((m:any)=>m.app.toLowerCase()===game.app.toLowerCase()&&!m.financeId);
if(!old)throw new Error("Original finance manifest required");
const operator=await base.readContract({address:game.app,abi:parseAbi(["function operator() view returns(address)"]),functionName:"operator"});
if(account.address.toLowerCase()!==operator.toLowerCase())throw new Error("Operator deployment account required");
const [treasury,maker]=await Promise.all(["treasury","maker"].map(functionName=>base.readContract({address:old.market,abi:marketV4Abi,functionName} as any))) as Address[];
const serialize=(x:unknown)=>JSON.stringify(x,(_,v)=>typeof v==="bigint"?String(v):v,2)+"\n";
await mkdir(path.dirname(journalFile),{recursive:true});
const lock=await open(journalFile+".lock","wx",0o600);
try{
  let state:any;
  try{state=JSON.parse(await readFile(journalFile,"utf8"));}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;state={chainId:10143,game:game.app,account:account.address,steps:{}};}
  if(state.game!==game.app||state.account!==account.address||state.chainId!==10143)throw new Error("Deployment journal mismatch");
  const save=()=>writeFile(journalFile,serialize(state),{mode:0o600});
  async function send(name:string,data:Hex,to?:Address){
    let step=state.steps[name];
    if(step&&(step.dataHash!==keccak256(data)||step.to!==to))throw new Error("Deployment step changed: "+name);
    if(!step){
      const [latest,pending]=await Promise.all([base.getTransactionCount({address:account.address,blockTag:"latest"}),base.getTransactionCount({address:account.address,blockTag:"pending"})]);
      if(latest!==pending)throw new Error("Operator has a pending transaction; reconcile before deployment");
      const gas=await base.estimateGas({account:account.address,data,to});
      const raw=await wallet.signTransaction({type:"eip1559",to,data,nonce:latest,gas:gas+gas/5n,maxFeePerGas:parseGwei("200"),maxPriorityFeePerGas:0n});
      step=state.steps[name]={to,dataHash:keccak256(data),raw,hash:keccak256(raw),nonce:latest};await save();
    }
    let receipt=await base.getTransactionReceipt({hash:step.hash}).catch(()=>null);
    if(!receipt){
      try{await base.sendRawTransaction({serializedTransaction:step.raw});}catch{/* An ambiguous send is reconciled by the same hash, never a new nonce. */}
      receipt=await base.waitForTransactionReceipt({hash:step.hash,timeout:120000});
    }
    if(receipt.status!=="success")throw new Error("Deployment reverted: "+name+" "+step.hash);
    step.receipt={hash:step.hash,block:String(receipt.blockNumber),contract:receipt.contractAddress,gasUsed:String(receipt.gasUsed)};await save();
    console.log(JSON.stringify({step:name,...step.receipt}));return receipt;
  }
  async function deploy(name:string,args:unknown[]){
    const a=JSON.parse(await readFile(`contracts/out/${name}.sol/${name}.json`,"utf8"));
    const receipt=await send(name,encodeDeployData({abi:a.abi as Abi,bytecode:a.bytecode.object,args}));
    if(!receipt.contractAddress)throw new Error("Missing deployment address");return receipt.contractAddress;
  }
  const adapter=await deploy("RoomsEarlySettlement",[game.app]);
  const vault=await deploy("RoomsVault",[account.address]);
  const market=await deploy("MarketV4",[operator,treasury,adapter,maker,vault]);
  await send("register-market",encodeFunctionData({abi:roomsVaultAbi,functionName:"registerModule",args:[market]}),vault);
  await send("seal-vault",encodeFunctionData({abi:roomsVaultAbi,functionName:"seal"}),vault);
  const [linked,sealed,count,actualGame]=await Promise.all([
    base.readContract({address:market,abi:marketV4Abi,functionName:"results"}),
    base.readContract({address:vault,abi:roomsVaultAbi,functionName:"modulesSealed"}),
    base.readContract({address:vault,abi:roomsVaultAbi,functionName:"moduleCount"}),
    base.readContract({address:adapter,abi:roomsEarlySettlementAbi,functionName:"game"}),
  ]);
  if(linked.toLowerCase()!==adapter.toLowerCase()||!sealed||count!==1n||actualGame.toLowerCase()!==game.app.toLowerCase())throw new Error("Unsealed financial deployment");
  const entry={financeId:"early-v1",settlement:"early-published-testnet",app:game.app,adapter,market,vault,pressureSigner:old.pressureSigner,startBlock:state.steps.RoomsEarlySettlement.receipt.block,chainId:10143};
  const previous=manifests.find((m:any)=>m.app===entry.app&&m.financeId===entry.financeId);
  if(previous&&serialize(previous)!==serialize(entry))throw new Error("Existing financial generation differs");
  if(!previous)manifests.push(entry);
  await writeFile("deployments/rooms-finance.json",serialize(manifests));
  await mkdir("docs/evidence/payments",{recursive:true});
  await writeFile("docs/evidence/payments/early-deployment.json",serialize({policy:entry.settlement,chainId:10143,app:game.app,steps:Object.entries(state.steps).map(([name,s]:[string,any])=>({name,...s.receipt}))}));
  console.log("Sealed deployment recorded. Service activation is separate.");
}finally{await lock.close();await unlink(journalFile+".lock");}
