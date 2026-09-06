import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { parseEther } from "viem";
import { localChain, DEV_KEY } from "./local-chain";
import { json } from "../shared/protocol";
import { vaultAbi } from "../shared/abis";

// Isolated local chain and fresh database: does not interrupt the preview relayer.
const dbUrl =
  process.env.RECOVERY_DATABASE_URL ||
  "postgres://pong:pong-local-only@127.0.0.1:15432/pong";
const parsed = new URL(dbUrl);
assert(
  ["127.0.0.1", "localhost"].includes(parsed.hostname),
  "Local PostgreSQL only",
);
const admin = new pg.Client({ connectionString: dbUrl });
await admin.connect();
const dbName = `pong_recovery_${Date.now()}`;
await admin.query(`CREATE DATABASE ${dbName}`);
await admin.end();
parsed.pathname = "/" + dbName;
const db = new pg.Client({ connectionString: parsed.toString() });
await db.connect();
const chain = await localChain();
const port = Number(process.env.RECOVERY_PORT || 4001);
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined;
const file = "artifacts/recovery-deployment.json";
const v4File = "artifacts/recovery-deployment-v4.json";
const v3File = "artifacts/recovery-deployment-v3.json";
const v2File = "artifacts/recovery-deployment-v2.json";
await mkdir("artifacts", { recursive: true });
const env = {
  ...process.env,
  RPC_URL: chain.url,
  ALCHEMY_RPC_URL: "",
  RPC_FALLBACK_URL: "",
  DEPLOYER_PRIVATE_KEY: DEV_KEY,
  RELAYER_PRIVATE_KEY: DEV_KEY,
  DEPLOYMENT_FILE: file,
  DATABASE_URL: parsed.toString(),
  PORT: String(port),
  LOCAL_DEV: "true",
  INDEXER_GRAPHQL_URL: "",
  ADMIN_ADDRESS: "",
  TREASURY_ADDRESS: "",
};
async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean) {
  for (let i = 0; i < 150; i++) {
    try {
      const r = await read();
      if (ok(r)) return r;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Recovery step timed out");
}
async function start() {
  child = spawn(process.execPath, ["--import", "tsx", "relayer/src/main.ts"], {
    env,
    stdio: "ignore",
    windowsHide: true,
  });
  await until(
    () => fetch(base + "/health").then((r) => r.json()),
    (r) => r.ok,
  );
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const done = new Promise<void>((resolve) =>
    child!.once("exit", () => resolve()),
  );
  child.kill("SIGKILL");
  await done;
}
try {
  const deploy = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/deploy.ts"],
    { env, stdio: "ignore", windowsHide: true },
  );
  await new Promise<void>((resolve, reject) => {
    deploy.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Local deployment failed")),
    );
    deploy.once("error", reject);
  });
  const deployV2 = spawn(process.execPath, ["--import", "tsx", "scripts/deploy-v2.ts"], {
    env: {...env, LEGACY_DEPLOYMENT_FILE:file, DEPLOYMENT_FILE:v2File}, stdio:"ignore", windowsHide:true,
  });
  await new Promise<void>((resolve,reject)=>deployV2.once("exit", code=>code===0?resolve():reject(new Error("V2 recovery deployment failed"))));
  const deployV3=spawn(process.execPath,["--import","tsx","scripts/deploy-v3.ts"],{env:{...env,LEGACY_DEPLOYMENT_FILE:v2File,DEPLOYMENT_FILE:v3File},stdio:"ignore",windowsHide:true});
  await new Promise<void>((resolve,reject)=>deployV3.once("exit",code=>code===0?resolve():reject(new Error("V3 recovery deployment failed"))));
  const deployV4=spawn(process.execPath,["--import","tsx","scripts/deploy-v4.ts"],{env:{...env,LEGACY_DEPLOYMENT_FILE:v3File,DEPLOYMENT_FILE:v4File},stdio:"ignore",windowsHide:true});
  await new Promise<void>((resolve,reject)=>deployV4.once("exit",code=>code===0?resolve():reject(new Error("V4 recovery deployment failed"))));
  await start();
  await chain.publicClient.request({
    method: "evm_setAutomine" as never,
    params: [false] as never,
  });
  const player = privateKeyToAccount(generatePrivateKey());
  const expires = Math.floor(Date.now() / 1000) + 300;
  const signature = await player.signMessage({
    message: `PONG test credits\nPlayer: ${player.address.toLowerCase()}\nExpires: ${expires}`,
  });
  const job = await fetch(base + "/faucet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: json({ player: player.address, expires, signature }),
  }).then((r) => r.json());
  assert(job.id, json(job));
  const before = await until(
    () =>
      db
        .query("SELECT * FROM relay_jobs WHERE id=$1", [job.id])
        .then((r) => r.rows[0]),
    (r) => r.status === "sent",
  );
  await stop();
  env.DEPLOYMENT_FILE = v2File;
  await start();
  await chain.mine();
  const after = await until(
    () =>
      db
        .query("SELECT * FROM relay_jobs WHERE id=$1", [job.id])
        .then((r) => r.rows[0]),
    (r) => r.status === "succeeded",
  );
  assert.equal(after.tx_hash, before.tx_hash);
  assert.equal(after.raw_tx, before.raw_tx);
  assert.equal(after.nonce, before.nonce);
  const deployment = JSON.parse(await readFile(file, "utf8"));
  assert.equal(
    await chain.publicClient.readContract({
      address: deployment.vault,
      abi: vaultAbi,
      functionName: "balances",
      args: [player.address],
    }),
    parseEther("0.02"),
  );
  await chain.publicClient.request({method:"evm_setAutomine" as never,params:[true] as never});
  const second = await fetch(base+"/faucet",{method:"POST",headers:{"content-type":"application/json"},body:json({player:player.address,expires,signature})}).then(r=>r.json());
  assert(second.id,json(second));
  const next = await until(()=>db.query("SELECT * FROM relay_jobs WHERE id=$1",[second.id]).then(r=>r.rows[0]),r=>r.status==="succeeded");
  assert.equal(Number(next.nonce),Number(after.nonce)+1);
  const v2 = JSON.parse(await readFile(v2File,"utf8"));
  assert.equal(await chain.publicClient.readContract({address:v2.vault,abi:vaultAbi,functionName:"balances",args:[player.address]}),parseEther("0.02"));
  assert.equal(await chain.publicClient.readContract({address:deployment.vault,abi:vaultAbi,functionName:"balances",args:[player.address]}),parseEther("0.02"));
  await chain.publicClient.request({method:"evm_setAutomine" as never,params:[false] as never});
  const thirdPlayer=privateKeyToAccount(generatePrivateKey());const thirdSignature=await thirdPlayer.signMessage({message:`PONG test credits\nPlayer: ${thirdPlayer.address.toLowerCase()}\nExpires: ${expires}`});
  const third=await fetch(base+"/faucet",{method:"POST",headers:{"content-type":"application/json"},body:json({player:thirdPlayer.address,expires,signature:thirdSignature})}).then(r=>r.json());
  const pendingV2=await until(()=>db.query("SELECT * FROM relay_jobs WHERE id=$1",[third.id]).then(r=>r.rows[0]),r=>r.status==="sent");
  await stop();env.DEPLOYMENT_FILE=v3File;await start();await chain.mine();
  const recoveredV2=await until(()=>db.query("SELECT * FROM relay_jobs WHERE id=$1",[third.id]).then(r=>r.rows[0]),r=>r.status==="succeeded");
  assert.equal(recoveredV2.raw_tx,pendingV2.raw_tx);assert.equal(recoveredV2.nonce,pendingV2.nonce);assert.equal(await chain.publicClient.readContract({address:v2.vault,abi:vaultAbi,functionName:"balances",args:[thirdPlayer.address]}),parseEther("0.02"));
  await chain.publicClient.request({method:"evm_setAutomine" as never,params:[true] as never});
  const fourth=await fetch(base+"/faucet",{method:"POST",headers:{"content-type":"application/json"},body:json({player:player.address,expires,signature})}).then(r=>r.json());
  const firstV3=await until(()=>db.query("SELECT * FROM relay_jobs WHERE id=$1",[fourth.id]).then(r=>r.rows[0]),r=>r.status==="succeeded");
  assert.equal(Number(firstV3.nonce),Number(recoveredV2.nonce)+1);
  const v3=JSON.parse(await readFile(v3File,"utf8"));assert.equal(await chain.publicClient.readContract({address:v3.vault,abi:vaultAbi,functionName:"balances",args:[player.address]}),parseEther("0.02"));
  await chain.publicClient.request({method:"evm_setAutomine" as never,params:[false] as never});
  const fifth=await fetch(base+"/faucet",{method:"POST",headers:{"content-type":"application/json"},body:json({player:thirdPlayer.address,expires,signature:thirdSignature})}).then(r=>r.json());
  const pendingV3=await until(()=>db.query("SELECT * FROM relay_jobs WHERE id=$1",[fifth.id]).then(r=>r.rows[0]),r=>r.status==="sent");
  await stop();env.DEPLOYMENT_FILE=v4File;await start();await chain.mine();
  const recoveredV3=await until(()=>db.query("SELECT * FROM relay_jobs WHERE id=$1",[fifth.id]).then(r=>r.rows[0]),r=>r.status==="succeeded");
  assert.equal(recoveredV3.raw_tx,pendingV3.raw_tx);assert.equal(recoveredV3.nonce,pendingV3.nonce);assert.equal(await chain.publicClient.readContract({address:v3.vault,abi:vaultAbi,functionName:"balances",args:[thirdPlayer.address]}),parseEther("0.02"));
  await chain.publicClient.request({method:"evm_setAutomine" as never,params:[true] as never});
  const sixth=await fetch(base+"/faucet",{method:"POST",headers:{"content-type":"application/json"},body:json({player:player.address,expires,signature})}).then(r=>r.json());
  const firstV4=await until(()=>db.query("SELECT * FROM relay_jobs WHERE id=$1",[sixth.id]).then(r=>r.rows[0]),r=>r.status==="succeeded");
  assert.equal(Number(firstV4.nonce),Number(recoveredV3.nonce)+1);
  const v4=JSON.parse(await readFile(v4File,"utf8"));assert.equal(await chain.publicClient.readContract({address:v4.vault,abi:vaultAbi,functionName:"balances",args:[player.address]}),parseEther("0.02"));
  await writeFile(
    "artifacts/recovery.json",
    json({
      network: "local Anvil",
      database: dbName,
      job: job.id,
      txHash: after.tx_hash,
      checks: [
        "persistent signed transaction",
        "process killed before inclusion",
        "same nonce and raw transaction after restart into V2",
        "V1 pending job retained through manifest migration",
        "next V2 transaction uses the following nonce and its own vault",
        "V2 pending signed bytes recovered unchanged in V3",
        "V3 uses the following journal nonce and a separate vault",
        "V3 pending signed bytes recovered unchanged in V4",
        "V4 uses the following journal nonce and a separate vault",
        "exactly one credit in each generation",
      ],
      completedAt: new Date().toISOString(),
    }),
  );
  console.log(
    "PASS: relayer crash before inclusion recovered the identical transaction and credited once.",
  );
} finally {
  await stop();
  await db.end();
  chain.close();
}
