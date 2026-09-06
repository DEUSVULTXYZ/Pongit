import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  type Address,
  type Hex,
  type Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { artifact } from "./local-chain";
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
async function deploy(name: string, args: readonly unknown[]) {
  const a = await artifact(name);
  const hash = await wallet.deployContract({
    abi: a.abi as Abi,
    bytecode: a.bytecode.object,
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress)
    throw new Error(`Deployment failed: ${name}`);
  console.log(`${name}: ${receipt.contractAddress}`);
  return receipt.contractAddress;
}
const startBlock = await publicClient.getBlockNumber();
const game = await deploy("Game", [admin]);
const vault = await deploy("Vault", [account.address]);
const lmsr = await deploy("LMSR", []);
const market = await deploy("Market", [admin, treasury, game, lmsr, vault]);
const tournaments = await deploy("Tournaments", [admin, treasury, game, vault]);
for (const module of [market, tournaments]) {
  const hash = await wallet.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "registerModule",
    args: [module],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}
const hash = await wallet.writeContract({
  address: vault,
  abi: vaultAbi,
  functionName: "seal",
});
await publicClient.waitForTransactionReceipt({ hash });
const path =
  process.env.DEPLOYMENT_FILE ||
  `deployments/${chainId === 31337 ? "local" : "testnet"}.json`;
await mkdir("deployments", { recursive: true });
await writeFile(
  path,
  JSON.stringify(
    {
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
