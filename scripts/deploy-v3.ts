import "dotenv/config";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress, parseGwei, keccak256,
  type Address,
  type Hex,
  type Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { artifact } from "./local-chain";
import { gameV3Abi, arcadeSessionsAbi } from "../shared/abis-v3";
import type { Deployment } from "../shared/protocol";
import { vaultAbi } from "../shared/abis";

const url =
  process.env.ALCHEMY_RPC_URL || process.env.RPC_URL || "http://127.0.0.1:8545";
const publicClient = createPublicClient({
  transport: http(url),
  pollingInterval: 300,
});
const chainId = await publicClient.getChainId();
if (![31337, 10143].includes(chainId))
  throw new Error("Only local Anvil or Monad testnet are allowed.");
const key = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!key)
  throw new Error("Set DEPLOYER_PRIVATE_KEY in your private environment.");
const account = privateKeyToAccount(key);
const admin = (process.env.ADMIN_ADDRESS ||
  (chainId === 31337 ? account.address : "")) as Address;
const treasury = (process.env.TREASURY_ADDRESS ||
  (chainId === 31337 ? account.address : "")) as Address;
if (!isAddress(admin) || !isAddress(treasury))
  throw new Error("ADMIN_ADDRESS and TREASURY_ADDRESS are required.");
const chain = defineChain({
  id: chainId,
  name: "PONG test network",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [url] } },
});
const wallet = createWalletClient({ account, chain, transport: http(url) });
const receipts:unknown[]=[];
const fees={maxFeePerGas:parseGwei("200"),maxPriorityFeePerGas:0n};
async function record(hash:Hex,name:string) {const receipt=await publicClient.waitForTransactionReceipt({hash});if(receipt.status!=="success")throw new Error(`${name} reverted: ${hash}`);receipts.push({name,hash,block:receipt.blockNumber.toString(),gasUsed:receipt.gasUsed.toString(),effectiveGasPrice:receipt.effectiveGasPrice.toString(),fee:(receipt.gasUsed*receipt.effectiveGasPrice).toString()});return receipt;}
async function deploy(name: string, args: readonly unknown[]) {
  const a = await artifact(name);
  const hash = await wallet.deployContract({
    ...fees,
    abi: a.abi as Abi,
    bytecode: a.bytecode.object,
    args,
  });
  const receipt = await record(hash,name);
  if (receipt.status !== "success" || !receipt.contractAddress)
    throw new Error(`Deployment failed: ${name}`);
  console.log(`${name}: ${receipt.contractAddress}`);
  return receipt.contractAddress;
}
const legacy:Deployment = JSON.parse(await readFile(process.env.LEGACY_DEPLOYMENT_FILE || `deployments/${chainId===31337?"local":"testnet"}.json`,"utf8"));
if(legacy.chainId!==chainId || legacy.version!==2)throw new Error("Expected V2 manifest on the same chain");
const startBlock = await publicClient.getBlockNumber();
const arcade = await deploy("ArcadeSessions", []);
const game = await deploy("GameV3", [admin,legacy.game,arcade]);
await record(await wallet.writeContract({...fees,address:arcade,abi:arcadeSessionsAbi,functionName:"bind",args:[game]}),"bind-arcade-game");
const vault = await deploy("Vault", [account.address]);
const lmsr = await deploy("LMSRV2", []);
const market = await deploy("MarketV2", [admin, treasury, game, lmsr, vault]);
const tournaments = await deploy("TournamentsV3", [admin, treasury, game, vault]);
const bindHash=await wallet.writeContract({...fees,address:game,abi:gameV3Abi,functionName:"setMarket",args:[market]});
await record(bindHash,"seal-game-market");
for (const module of [market, tournaments]) {
  const hash = await wallet.writeContract({
    ...fees,
    address: vault,
    abi: vaultAbi,
    functionName: "registerModule",
    args: [module],
  });
  await record(hash,"register-vault-module");
}
const hash = await wallet.writeContract({
  ...fees,
  address: vault,
  abi: vaultAbi,
  functionName: "seal",
});
await record(hash,"seal-vault");
const path =
  process.env.DEPLOYMENT_FILE ||
  `deployments/${chainId === 31337 ? "local-v3" : "testnet-v3"}.json`;
await mkdir("deployments", { recursive: true });
await writeFile(
  path,
  JSON.stringify(
    {
      version:3, legacy, arcade,
      eloFormula:await publicClient.readContract({address:game,abi:gameV3Abi,functionName:"eloFormula"}),
      gameCodeHash:keccak256((await publicClient.getCode({address:game}))!),
      receipts,
      chainId,
      game,
      vault,
      lmsr,
      market,
      tournaments,
      startBlock: startBlock.toString(),
      deployedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  `Deployment saved to ${path}. Vault module list permanently sealed.`,
);
