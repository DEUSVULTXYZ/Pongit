import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { toHex, type Abi } from "viem";
import { localChain, artifact } from "./local-chain";
import { initial, advance, next, resume, handicap, type State } from "../shared/physics-v2";

const chain = await localChain();
try {
  const a = await artifact("PhysicsV2Harness");
  const hash = await chain.wallet.deployContract({ abi: a.abi as Abi, bytecode: a.bytecode.object });
  const address = (await chain.publicClient.waitForTransactionReceipt({ hash })).contractAddress!;
  let seed = 0xc0ffee;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const count = Number(process.env.DIFFERENTIAL_CASES || 10000);
  const report = [];
  for (const mode of [0, 1]) {
    const cases: { state: State; target: bigint; limit: number; paidA: bigint; paidB: bigint }[] = [];
    for (let i = 0; i < count; i++) {
      let state = initial(toHex(BigInt(random()), { size: 32 }), mode);
      const paidA = BigInt(random()) * 10000000n, paidB = i % 3 ? BigInt(random()) * 10000000n : 0n;
      if (mode) [state.halfA, state.halfB] = handicap(paidA, paidB);
      state.leftDir = random() % 3 - 1; state.rightDir = random() % 3 - 1;
      [state] = advance(state, BigInt(random() % 60000000), 128);
      if (state.awaitingServe && i % 2) state = resume(state, state.resumeAt + BigInt(random() % 3000000), paidA, paidB);
      state.leftDir = random() % 3 - 1; state.rightDir = random() % 3 - 1;
      let target = state.t + BigInt(random() % 600000000);
      if (!state.finished && i % 4 === 0) target = next(state).at;
      if (!state.finished && i % 4 === 1) target = next(state).at > state.t ? next(state).at - 1n : state.t;
      cases.push({ state, target, limit: [1,2,32,128][random()%4], paidA, paidB });
    }
    for (let i = 0; i < count; i += 32) {
      await Promise.all(cases.slice(i, i+32).map(async ({state,target,limit,paidA,paidB}, j) => {
        const actual = await chain.publicClient.readContract({ address, abi: a.abi as Abi, functionName: "advance", args: [state, target, BigInt(limit)] });
        assert.deepEqual(actual, advance(state,target,limit), `mode ${mode} case ${i+j}`);
        if (state.awaitingServe) {
          const at = state.resumeAt + 100000n;
          const resumed = await chain.publicClient.readContract({address,abi:a.abi as Abi,functionName:"resume",args:[state,at,paidA,paidB]});
          assert.deepEqual(resumed, resume(state,at,paidA,paidB));
        }
      }));
      if (i % 2048 === 0) console.log(`Mode ${mode}: ${Math.min(i+32,count)}/${count}`);
    }
    report.push({mode,count,mismatches:0});
  }
  await mkdir("artifacts",{recursive:true});
  await writeFile("artifacts/differential-v2.json",JSON.stringify({network:"isolated Anvil",seed:"0xc0ffee",report,completedAt:new Date().toISOString()},null,2));
  console.log("PASS: both physics modes agree with Solidity.");
} finally { chain.close(); }
