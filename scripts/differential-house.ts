// Compares the on-chain house policy against shared/agent-controller.ts on states the physics can
// actually reach. The only intended difference is truncation: the original works in floats after
// dividing by 1e6, the library stays in integers. This measures that gap rather than assuming it.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { toHex, type Abi, type Address } from "viem";
import { localChain, artifact } from "./local-chain";
import { initial, advance, type State } from "../shared/physics-v2";
import { AgentController } from "../shared/agent-controller";
import { houseBots } from "../shared/agents";
import type { EngineState } from "../shared/engine-stream";

const SCALE = 1_000_000;
const chain = await localChain();
try {
  const a = await artifact("HouseControllerHarness");
  const hash = await chain.wallet.deployContract({ abi: a.abi as Abi, bytecode: a.bytecode.object });
  const harness = (await chain.publicClient.waitForTransactionReceipt({ hash })).contractAddress! as Address;

  let seed = 0x5eed1e;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const count = Number(process.env.DIFFERENTIAL_CASES || 10000);

  const snapshot = (state: State): EngineState => ({
    id: 1n, revision: 1n, phase: 2,
    a: "0x0000000000000000000000000000000000000001" as Address,
    b: "0x0000000000000000000000000000000000000002" as Address,
    target: "0x0000000000000000000000000000000000000000" as Address,
    winner: "0x0000000000000000000000000000000000000000" as Address,
    head: 0n, clock: 0n, nonceA: 0n, nonceB: 0n, deadline: 0n,
    state, observedAt: 0,
  });

  const buckets = { zeroAim: { compared: 0, agreed: 0 }, randomAim: { compared: 0, agreed: 0 } };
  const divergences: any[] = [];

  for (let i = 0; i < count; i++) {
    let state = initial(toHex(BigInt(random()), { size: 32 }), 0);
    state.leftDir = (random() % 3) - 1 as -1 | 0 | 1;
    state.rightDir = (random() % 3) - 1 as -1 | 0 | 1;
    [state] = advance(state, BigInt(random() % 60_000_000), 128);
    if (state.finished || state.awaitingServe) continue;

    const side = (random() % 2) as 0 | 1;
    const level = (random() % 3) as 0 | 1 | 2;
    const settings = houseBots[level];

    // Half the cases pin random() to 0.5 so the aim error is exactly zero and only the geometry
    // is under test. The other half use a real error, where the original keeps a float and the
    // library truncates: that is the divergence worth measuring.
    const zeroAim = i % 2 === 0;
    const roll = zeroAim ? 0.5 : (random() % 1_000_001) / 1_000_000;
    const controller = new AgentController(level, () => roll);
    const expected = controller.decide(snapshot(state), side, 1e9);
    const aimError = BigInt(Math.trunc((roll * 2 - 1) * settings.error * SCALE));

    const balls = [{ x: state.x, y: state.y, vx: state.vx, vy: state.vy }];
    const actual = await chain.publicClient.readContract({
      address: harness, abi: a.abi as Abi, functionName: "decide",
      args: [balls, side,
        side === 0 ? state.left : state.right,
        side === 0 ? state.halfA : state.halfB,
        { level, reactionUs: settings.reactionMs * 1000, error: BigInt(settings.error) * BigInt(SCALE), deadZone: BigInt(settings.deadZone) * BigInt(SCALE) },
        aimError],
    }) as number;

    const bucket = zeroAim ? buckets.zeroAim : buckets.randomAim;
    bucket.compared++;
    if (Number(actual) === expected) bucket.agreed++;
    else if (divergences.length < 20) divergences.push({
      case: i, side, level, zeroAim, roll, expected, actual: Number(actual),
      x: String(state.x), y: String(state.y), vx: String(state.vx), vy: String(state.vy),
      position: String(side === 0 ? state.left : state.right),
    });
  }

  const compared = buckets.zeroAim.compared + buckets.randomAim.compared;
  const agreed = buckets.zeroAim.agreed + buckets.randomAim.agreed;
  const pct = (b: { compared: number; agreed: number }) => (b.compared ? b.agreed / b.compared : 0);
  const report = { at: new Date().toISOString(), scope: "House policy, legacy mode", compared, agreed, divergent: compared - agreed,
    agreement: compared ? agreed / compared : 0,
    zeroAim: { ...buckets.zeroAim, agreement: pct(buckets.zeroAim) },
    randomAim: { ...buckets.randomAim, agreement: pct(buckets.randomAim) }, divergences };
  await mkdir("artifacts/agents", { recursive: true });
  await writeFile("artifacts/agents/differential-house.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ compared, agreed, divergent: compared - agreed,
    zeroAim: Number(pct(buckets.zeroAim).toFixed(6)), randomAim: Number(pct(buckets.randomAim).toFixed(6)) }));
  for (const d of divergences.slice(0, 5)) console.log("  divergence", JSON.stringify(d));
  assert(compared > 0, "no comparable cases were generated");
} finally { chain.close(); }
