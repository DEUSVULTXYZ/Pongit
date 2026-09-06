import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

// Public Anvil test key; never used outside a chain with ID 31337.
export const DEV_KEY: Hex =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export async function localChain() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const process = spawn(
    "anvil",
    ["--host", "127.0.0.1", "--port", String(port), "--silent"],
    { stdio: "ignore", windowsHide: true },
  );
  const url = `http://127.0.0.1:${port}`;
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(url),
    pollingInterval: 30,
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await publicClient.getChainId();
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!ready) {
    process.kill();
    throw new Error("Anvil did not start");
  }
  const account = privateKeyToAccount(DEV_KEY);
  const wallet = createWalletClient({
    account,
    chain: foundry,
    transport: http(url),
  });
  return {
    url,
    publicClient,
    wallet,
    account,
    close: () => process.kill(),
    mine: async (blocks = 1) => {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "anvil_mine",
          params: [blocks],
        }),
      });
    },
  };
}
export async function artifact(name: string) {
  const source =
    name === "LMSRV2" ? "MarketV2" : name === "PhysicsV2Harness" ? "PhysicsV2" : name === "LMSR" ? "Market" : name === "PhysicsHarness" ? "Physics" : name;
  return JSON.parse(
    await readFile(`contracts/out/${source}.sol/${name}.json`, "utf8"),
  ) as { abi: readonly unknown[]; bytecode: { object: Hex } };
}
