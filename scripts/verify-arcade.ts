import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createPublicClient,http,keccak256,parseAbi,type Address} from "viem";
import {json} from "../shared/protocol";

const d=JSON.parse(await readFile(process.env.DEPLOYMENT_FILE || "deployments/testnet-v3.json","utf8"));
assert([3,4].includes(d.version));
const c=createPublicClient({transport:http(process.env.RPC_URL || "https://rpc.ankr.com/monad_testnet")});
assert.equal(await c.getChainId(),d.chainId);
const abi=parseAbi(["function game() view returns(address)","function arcade() view returns(address)","function previousGame() view returns(address)","function market() view returns(address)","function results() view returns(address)","function modulesSealed() view returns(bool)","function modules(address) view returns(bool)"]);
async function equalAddress(address:Address,functionName:any,expected:string){const value=await c.readContract({address,abi,functionName});assert.equal(String(value).toLowerCase(),expected.toLowerCase(),functionName);}
await equalAddress(d.arcade,"game",d.game);
await equalAddress(d.game,"arcade",d.arcade);
await equalAddress(d.game,"previousGame",d.legacy.game);
await equalAddress(d.game,"market",d.market);
await equalAddress(d.market,"results",d.game);
assert.equal(await c.readContract({address:d.vault,abi,functionName:"modulesSealed"}),true);
for(const address of [d.market,d.tournaments])assert.equal(await c.readContract({address:d.vault,abi,functionName:"modules",args:[address]}),true);
const code=(await c.getCode({address:d.game}))!;
assert.equal(keccak256(code),d.gameCodeHash);
assert((code.length-2)/2<=24576);
const receipts=[];
for(const record of d.receipts){const r=await c.getTransactionReceipt({hash:record.hash}),tx=await c.getTransaction({hash:record.hash});assert.equal(r.status,"success");receipts.push({name:record.name,hash:record.hash,block:r.blockNumber,gasUsed:r.gasUsed,gasLimit:tx.gas,effectiveGasPrice:r.effectiveGasPrice,chargedWei:(d.chainId===10143?tx.gas:r.gasUsed)*r.effectiveGasPrice});}
await mkdir("artifacts",{recursive:true});
await writeFile(`artifacts/${d.version===4?"payments":"arcade"}-deployment-verification.json`,json({chainId:d.chainId,game:d.game,registry:d.arcade,gameRuntimeBytes:(code.length-2)/2,bindingsVerified:true,vaultSealed:true,modulesVerified:true,codeHashVerified:true,receipts,checkedAt:new Date().toISOString()}));
console.log("PASS: Arcade registry/game/market bindings, sealed vault modules, runtime bytecode hash and deployment receipts.");
