import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  parseEther,
  type Hex,
} from "viem";
import { foundry, monadTestnet } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { DEV_KEY } from "./local-chain";
import {
  domain,
  joinTypes, joinV2Types, queueV2Message,
  enterTypes,
  actionTypes,
  queueMessage,
  json,
} from "../shared/protocol";
import { tournamentsAbi, vaultAbi } from "../shared/abis";
const base = process.env.E2E_API_URL || "http://localhost:4000";
async function api(path: string, body?: unknown) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : json(body),
  });
  const d = await r.json();
  assert(r.ok && !d.error, d.error);
  return d;
}
async function until<T>(read: () => Promise<T>, done: (v: T) => boolean) {
  for (let i = 0; i < 150; i++) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Tournament step timed out");
}
async function relay(contract: string, functionName: string, args: unknown[]) {
  const job = await api("/relay", { contract, functionName, args });
  const done = await until(
    () => api("/jobs/" + job.id),
    (j) => j.status === "succeeded" || j.status === "failed",
  );
  assert.equal(done.status, "succeeded", json(done));
}
const config = await api("/config");
assert([31337,10143].includes(config.chainId), "Test networks only");
if(config.chainId===10143) assert(process.env.E2E_ALLOW_TESTNET==="true" && process.env.ADMIN_PRIVATE_KEY,"Explicit funded testnet operator required");
const targetChain=config.chainId===10143?monadTestnet:foundry;
const rpc=process.env.RPC_URL||"http://127.0.0.1:8545";
const client = createPublicClient({
  chain: targetChain,
  transport: http(rpc),
  pollingInterval: 100,
});
const wallet = createWalletClient({
  account: privateKeyToAccount((process.env.ADMIN_PRIVATE_KEY||DEV_KEY) as Hex),
  chain: targetChain,
  transport: http(rpc),
});
const players = Array.from({ length: 4 }, () =>
  privateKeyToAccount(generatePrivateKey()),
);

assert.equal(config.version,2);
const pair=players.slice(0,2),secrets=[generatePrivateKey(),generatePrivateKey()];
const cookies=new Map<string,string>();
async function social(p:typeof pair[number],path:string,body:unknown){const response=await fetch(base+path,{method:"POST",headers:{"content-type":"application/json","x-pongit-player":p.address,origin:process.env.E2E_WEB_URL || new URL(base).origin,cookie:cookies.get(p.address)||""},body:json(body)});const cookie=response.headers.get("set-cookie");if(cookie)cookies.set(p.address,cookie.split(";")[0]);const result=await response.json();assert(response.ok && !result.error,json(result));return result;}
for(const p of pair){const challenge=await social(p,"/auth/challenge",{player:p.address});await social(p,"/auth/session",{player:p.address,nonce:challenge.nonce,signature:await p.signMessage({message:challenge.message})});}
const invitation=await social(pair[0],"/challenges",{recipient:pair[1].address,mode:1,ranked:true});await social(pair[1],`/challenges/${invitation.id}/accept`,{});
const room=await until(()=>api("/queue/"+pair[0].address),r=>!!r.id);
for(let i=0;i<2;i++){const p=pair[i],info=await api("/player/"+p.address),now=Math.floor(Date.now()/1000);const join={player:p.address,opponent:pair[1-i].address,roomId:room.id as Hex,commitment:keccak256(secrets[i]),sessionKey:p.address,nonce:BigInt(info.gameNonce),deadline:BigInt(now+120),sessionExpiry:BigInt(now+600),maxInputs:1000,tournamentId:0n,mode:1,ranked:true,rulesVersion:2};await api("/ready",{join,signature:await p.signTypedData({domain:domain("PONG",config.chainId,config.game),types:joinV2Types,primaryType:"Join",message:join})});}
const ready=await until(()=>api("/queue/"+pair[0].address),r=>!!r.match_id),id=ready.match_id;
for(let i=0;i<2;i++)await relay("game","reveal",[id,pair[i].address,secrets[i]]);
const info=await api("/player/"+pair[0].address),m={player:pair[0].address,matchId:BigInt(id),action:2,nonce:BigInt(info.gameNonce),deadline:BigInt(Math.floor(Date.now()/1000)+120)};
await relay("game","playerAction",[m.player,id,m.action,m.nonce,m.deadline,await pair[0].signTypedData({domain:domain("PONG",config.chainId,config.game),types:actionTypes,primaryType:"GameAction",message:m})]);
await until(()=>api("/matches/"+id),m=>m.match.ratingFinalized);
const stats=await Promise.all(pair.map(p=>api("/player/"+p.address)));for(const s of stats){assert.equal(s.rating.elo,1000);assert.equal(s.rating.played,0);assert.equal(s.chaosRating.played,1);assert.notEqual(s.chaosRating.elo,1000);}
assert(stats[0].chaosRating.elo<stats[1].chaosRating.elo);
await writeFile("artifacts/ranked-chaos.json",json({base,matchId:id,players:pair.map(p=>p.address),ratings:stats.map(s=>({classic:s.rating,chaos:s.chaosRating})),checkedAt:new Date().toISOString(),checks:["targeted ranked Chaos invitation","signed rules agreement","Chaos ELO changes","Classic ELO unchanged"]}));console.log("PASS: ranked Chaos changes only the Chaos ladder.");
