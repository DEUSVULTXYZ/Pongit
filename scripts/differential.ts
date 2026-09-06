import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { type Abi, toHex } from "viem";
import { localChain, artifact } from "./local-chain";
import { initial, advance, next, type State } from "../shared/physics";

const chain = await localChain();
try {
  const a = await artifact("PhysicsHarness");
  const hash = await chain.wallet.deployContract({
    abi: a.abi as Abi,
    bytecode: a.bytecode.object,
  });
  const address = (await chain.publicClient.waitForTransactionReceipt({ hash }))
    .contractAddress!;
  let seed = 0xc0ffee;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const count = Number(process.env.DIFFERENTIAL_CASES || 10000);
  const cases: { state: State; target: bigint; limit: number }[] = [];
  for (let i = 0; i < count; i++) {
    let state = initial(toHex(BigInt(random()), { size: 32 }));
    state.leftDir = (random() % 3) - 1;
    state.rightDir = (random() % 3) - 1;
    [state] = advance(state, BigInt(random() % 60_000_000), 128);
    state.leftDir = (random() % 3) - 1;
    state.rightDir = (random() % 3) - 1;
    const event = next(state);
    let target = state.t + BigInt(random() % 600_000_000);
    if (!state.finished && i % 4 === 0) target = event.at;
    if (!state.finished && i % 4 === 1)
      target = event.at > state.t ? event.at - 1n : state.t;
    cases.push({ state, target, limit: [1, 2, 32, 128][random() % 4] });
  }
  for (let i = 0; i < count; i += 32) {
    await Promise.all(
      cases.slice(i, i + 32).map(async ({ state, target, limit }, j) => {
        const expected = advance(state, target, limit);
        const actual = await chain.publicClient.readContract({
          address,
          abi: a.abi as Abi,
          functionName: "advance",
          args: [state, target, BigInt(limit)],
        });
        assert.deepEqual(
          actual,
          expected,
          `Differential mismatch at case ${i + j}`,
        );
      }),
    );
    if (i % 1024 === 0)
      console.log(`Compared ${Math.min(i + 32, count)}/${count}`);
  }
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/differential.json",
    JSON.stringify(
      {
        count,
        mismatches: 0,
        seed: "0xC0FFEE",
        network: "local Anvil EVM",
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: ${count} Solidity/TypeScript differential cases, zero differences.`,
  );
} finally {
  chain.close();
}
