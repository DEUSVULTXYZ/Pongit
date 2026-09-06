import { spawn } from "node:child_process";
import { localChain, DEV_KEY } from "./local-chain";
const chain = await localChain();
try {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/benchmark.ts"],
    {
      env: {
        ...process.env,
        RPC_URL: chain.url,
        ALCHEMY_RPC_URL: "",
        BENCHMARK_PRIVATE_KEY: DEV_KEY,
        BENCHMARK_TXS: "30",
        BENCHMARK_TPS: "5",
        BENCHMARK_MAX_MON: "1",
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  await new Promise<void>((resolve, reject) => {
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Benchmark exited ${code}`)),
    );
    child.once("error", reject);
  });
} finally {
  chain.close();
}
