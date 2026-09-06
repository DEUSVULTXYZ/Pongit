import "dotenv/config";
import {readFile} from "node:fs/promises";
import {createPublicClient,createWalletClient,http,isAddress,parseGwei,keccak256,toHex,type Address,type Hex,type Abi} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {monadTestnet,foundry} from "viem/chains";
import {gameAbi,marketAbi,tournamentsAbi} from "../shared/abis";
import type {Deployment} from "../shared/protocol";
const [operation,address]=process.argv.slice(2);
if(!["grant","revoke"].includes(operation)||!isAddress(address)) throw Error("Usage: ADMIN_PRIVATE_KEY=... tsx scripts/admin.ts grant|revoke 0xMERA_ACCOUNT");
if(!process.env.ADMIN_PRIVATE_KEY) throw Error("Operator key required in a private environment");
const d:Deployment=JSON.parse(await readFile(process.env.DEPLOYMENT_FILE||"deployments/testnet.json","utf8"));
if(![10143,31337].includes(d.chainId)) throw Error("Testnet only");
const rpc=process.env.RPC_URL||"https://testnet-rpc.monad.xyz";
const client=createPublicClient({transport:http(rpc)});
if(await client.getChainId()!==d.chainId) throw Error("Wrong RPC network");
const wallet=createWalletClient({chain:d.chainId===10143?monadTestnet:foundry,account:privateKeyToAccount(process.env.ADMIN_PRIVATE_KEY as Hex),transport:http(rpc)});
for(const [target,abi,roles] of [[d.game,gameAbi,["ADMIN_ROLE","PAUSER_ROLE"]],[d.market,marketAbi,["PAUSER_ROLE"]],[d.tournaments,tournamentsAbi,["TOURNAMENT_ROLE"]]] as const){
  for(const roleName of roles){
    const role=keccak256(toHex(roleName));
    const present=await client.readContract({address:target,abi:abi as Abi,functionName:"hasRole",args:[role,address]});
    if(present===(operation==="grant")) continue;
    const hash=await wallet.writeContract({address:target,abi:abi as Abi,functionName:operation==="grant"?"grantRole":"revokeRole",args:[role,address as Address],maxFeePerGas:parseGwei("150"),maxPriorityFeePerGas:0n});
    const receipt=await client.waitForTransactionReceipt({hash,confirmations:d.chainId===10143?5:1});
    if(receipt.status!=="success") throw Error("Role update reverted: "+hash);
    console.log(operation,roleName,target,hash);
  }
}
