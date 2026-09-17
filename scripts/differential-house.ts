// Compares the on-chain house policy against shared/agent-controller.ts on states the physics can
// actually reach. The only intended difference is truncation: the original works in floats after
// dividing by 1e6, the library stays in integers. This measures that gap rather than assuming it.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { toHex, type Abi, type Address } from "viem";
import { localChain, artifact } from "./local-chain";
import { initial, advance, type State } from "../shared/physics-v2";
import { initialChaosEvents, advanceChaosEvents, type ChaosPhysicsState } from "../shared/physics-chaos-events";
import { AgentController } from "../shared/agent-controller";
import { houseBots } from "../shared/agents";
import type { EngineState } from "../shared/engine-stream";

// The library works in 1e12 so both modes share one exact formula; legacy positions
// and paddles are 1e6 and scale up losslessly, while velocities are already 1e6.
const UP = 1_000_000n;
const PICO = 1_000_000_000_000;
const chain = await localChain();
try {
  const a = await artifact("HouseControllerHarness");
  const hash = await chain.wallet.deployContract({ abi: a.abi as Abi, bytecode: a.bytecode.object });
  const harness = (await chain.publicClient.waitForTransactionReceipt({ hash })).contractAddress! as Address;

  let seed = 0x5eed1e;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const count = Number(process.env.DIFFERENTIAL_CASES || 10000);

  const snapshot = (state: State, chaos?: ChaosPhysicsState): EngineState => ({
    id: 1n, revision: 1n, phase: 2,
    a: "0x0000000000000000000000000000000000000001" as Address,
    b: "0x0000000000000000000000000000000000000002" as Address,
    target: "0x0000000000000000000000000000000000000000" as Address,
    winner: "0x0000000000000000000000000000000000000000" as Address,
    head: 0n, clock: 0n, nonceA: 0n, nonceB: 0n, deadline: 0n,
    state, observedAt: 0,
    ...(chaos ? { chaos: { physics: chaos, request: 0n, pending: 0n, collisions: [] } } : {}),
  });

  const buckets = {
    zeroAim: { compared: 0, agreed: 0 }, randomAim: { compared: 0, agreed: 0 },
    legacy: { compared: 0, agreed: 0 }, chaos: { compared: 0, agreed: 0 },
  };
  const divergences: any[] = [];
  // A differential that silently drops cases proves less than its count suggests.
  const skipped = { legacyTerminal: 0, chaosTerminal: 0, chaosNoBall: 0 };
  // The soonest-arrival selection only runs with more than one ball, and MULTIBALL carries a
  // draw weight of 1, so waiting for it would leave that branch untested.
  const ballCounts: Record<number, number> = {};

  for (let i = 0; i < count; i++) {
    // Alternate the two modes. Chaos packs positions in 1e12 and may run two balls at once, so
    // it exercises the multi-ball selection the legacy path never reaches.
    const chaosCase = i % 2 === 1;
    const seedHex = toHex(BigInt(random()), { size: 32 });
    let state = initial(seedHex, chaosCase ? 1 : 0);
    state.leftDir = (random() % 3) - 1 as -1 | 0 | 1;
    state.rightDir = (random() % 3) - 1 as -1 | 0 | 1;
    [state] = advance(state, BigInt(random() % 60_000_000), 128);
    // The controller gates on finished alone, not on awaitingServe, so a state waiting to serve
    // is still a legitimate comparison. Filtering it out was discarding most Chaos cases.
    if (state.finished) { if (chaosCase) skipped.chaosTerminal++; else skipped.legacyTerminal++; continue; }

    let chaos: ChaosPhysicsState | undefined;
    if (chaosCase) {
      chaos = initialChaosEvents(seedHex);
      chaos.leftDir = (random() % 3) - 1;
      chaos.rightDir = (random() % 3) - 1;
      [chaos] = advanceChaosEvents(chaos, BigInt(random() % 60_000_000), 128);
      // No live ball is still comparable: both sides fall back to the middle of the court,
      // which is a path worth covering rather than discarding.
      if (!chaos.balls.some(b => b.alive)) skipped.chaosNoBall++;
      // Force a second ball on a third of the Chaos cases, perturbed so the two rarely tie.
      if (chaos.balls[0].alive && !chaos.balls[1].alive && i % 3 === 1) {
        chaos.balls[1] = { ...chaos.balls[0], alive: true,
          y: chaos.balls[0].y + BigInt(random() % 400_000_000_000_000) - 200_000_000_000_000n,
          vy: -chaos.balls[0].vy,
          vx: chaos.balls[0].vx === 0n ? 0n : chaos.balls[0].vx / 2n + BigInt(random() % 1_000_000) };
      }
    }

    const side = (random() % 2) as 0 | 1;
    const level = (random() % 3) as 0 | 1 | 2;
    const settings = houseBots[level];

    // Half the cases pin random() to 0.5 so the aim error is exactly zero and only the geometry
    // is under test. The other half use a real error, where the original keeps a float and the
    // library truncates: that is the divergence worth measuring.
    const zeroAim = i % 2 === 0;
    const roll = zeroAim ? 0.5 : (random() % 1_000_001) / 1_000_000;
    const controller = new AgentController(level, () => roll);
    const expected = controller.decide(snapshot(state, chaos), side, 1e9);
    const aimError = BigInt(Math.trunc((roll * 2 - 1) * settings.error * PICO));

    const balls = chaos
      ? chaos.balls.filter(b => b.alive).map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy }))
      : [{ x: state.x * UP, y: state.y * UP, vx: state.vx, vy: state.vy }];
    const actual = await chain.publicClient.readContract({
      address: harness, abi: a.abi as Abi, functionName: "decide",
      args: [balls, side,
        (side === 0 ? state.left : state.right) * UP,
        (side === 0 ? state.halfA : state.halfB) * UP,
        { level, reactionUs: settings.reactionMs * 1000, error: BigInt(settings.error) * BigInt(PICO), deadZone: BigInt(settings.deadZone) * BigInt(PICO) },
        aimError],
    }) as number;

    ballCounts[balls.length] = (ballCounts[balls.length] || 0) + 1;
    const agree = Number(actual) === expected;
    for (const bucket of [zeroAim ? buckets.zeroAim : buckets.randomAim, chaos ? buckets.chaos : buckets.legacy]) {
      bucket.compared++;
      if (agree) bucket.agreed++;
    }
    if (agree) { /* nothing to record */ }
    else if (divergences.length < 20) divergences.push({
      case: i, side, level, zeroAim, chaos: !!chaos, balls: balls.length, roll, expected, actual: Number(actual),
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
    randomAim: { ...buckets.randomAim, agreement: pct(buckets.randomAim) },
    legacy: { ...buckets.legacy, agreement: pct(buckets.legacy) },
    chaos: { ...buckets.chaos, agreement: pct(buckets.chaos) }, skipped, ballCounts, divergences };
  await mkdir("artifacts/agents", { recursive: true });
  await writeFile("artifacts/agents/differential-house.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ compared, agreed, divergent: compared - agreed,
    zeroAim: Number(pct(buckets.zeroAim).toFixed(6)), randomAim: Number(pct(buckets.randomAim).toFixed(6)),
    legacy: Number(pct(buckets.legacy).toFixed(6)), chaos: Number(pct(buckets.chaos).toFixed(6)),
    chaosCases: buckets.chaos.compared, ballCounts, skipped }));
  for (const d of divergences.slice(0, 5)) console.log("  divergence", JSON.stringify(d));
  assert(compared > 0, "no comparable cases were generated");
} finally { chain.close(); }
