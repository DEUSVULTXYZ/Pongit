import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  parseAbi,
  toHex,
  zeroAddress,
  zeroHash,
  type Hex,
  type PublicClient,
} from "viem";
import {
  decideRecovery,
  executionReporter,
  normalSessionClosureReason,
  type ExecutionObservation,
} from "../shared/authority-recovery";
import { authorityRecoverySource } from "../shared/authority-recovery-source";
import {
  recoveryWorker,
  type RecoveryJournal,
  type RecoveryPort,
} from "../relayer/src/authority-recovery";
import { roomsLifecycleHubAbi } from "../shared/abi-rooms-lifecycle";
import { logTransition } from "../shared/authority-client";

const app = toHex(1n, { size: 20 });
const hub = toHex(2n, { size: 20 });
const hash = toHex(10n, { size: 32 });
const tx = toHex(20n, { size: 32 });
function observation(): ExecutionObservation {
  return {
    chainId: 10143,
    app,
    generation: 2n,
    block: 100n,
    blockHash: hash,
    timestamp: 1_000n,
    execution: "Interlude",
    transitionReason: zeroHash,
    closure: { drainingEpoch: 0n, sealedEpoch: 0n },
    hub: {
      phase: "Active",
      epoch: 5n,
      lastCommitAt: 995n,
      maxBatchInterval: 60n,
      expiresAt: 2_000n,
      stakeUnlockAt: 0n,
    },
    health: { kind: "healthy", consecutiveFailures: 0, unhealthySince: 0n },
  };
}
function outage() {
  const o = observation();
  o.hub.lastCommitAt = 900n;
  o.health = {
    kind: "publication_failed",
    consecutiveFailures: 4,
    unhealthySince: 970n,
  };
  return o;
}

test("healthy Interlude remains preferred even when idle publication is old", () => {
  const o = observation();
  o.hub.lastCommitAt = 1n;
  assert.deepEqual(decideRecovery(o), {
    execution: "Interlude",
    admissions: true,
    reason: "INTERLUDE_HEALTHY",
  });
});

test("429 and isolated failures cannot cause base-chain execution", () => {
  const o = outage();
  o.health.kind = "rate_limited";
  assert.equal(decideRecovery(o).action, undefined);
  assert.equal(decideRecovery(o).admissions, false);
  o.health.kind = "unreachable";
  o.health.consecutiveFailures = 1;
  assert.equal(decideRecovery(o).reason, "INTERLUDE_RECONNECTING");
  o.health.consecutiveFailures = 4;
  o.health.unhealthySince = 999n;
  assert.equal(decideRecovery(o).action, undefined);
});

test("sustained failure must also satisfy the hub's strict silence boundary", () => {
  const o = outage();
  o.timestamp = o.hub.lastCommitAt + o.hub.maxBatchInterval;
  o.health.unhealthySince = 930n;
  const waiting = decideRecovery(o);
  assert.equal(waiting.reason, "WAITING_PROTOCOL_EXIT");
  assert.equal(waiting.retryAt, 961n);
  assert.equal(waiting.action, undefined);
  o.timestamp++;
  assert.equal(decideRecovery(o).action, "beginRecovery");
  assert.equal(decideRecovery(o).execution, "Interlude");
  assert.equal(decideRecovery(o).admissions, false);
});

test("expiry, closure and failed startup request recovery without opening Monad", () => {
  const o = observation();
  o.hub.expiresAt = 1_000n;
  assert.equal(decideRecovery(o).action, undefined);
  o.timestamp++;
  assert.equal(decideRecovery(o).reason, "DELEGATION_EXPIRED");
  for (const execution of ["Interlude", "Returning"] as const) {
    for (const phase of ["None", "Exiting"] as const) {
      o.execution = execution;
      o.hub.phase = phase;
      assert.equal(decideRecovery(o).action, "beginRecovery");
      assert.equal(decideRecovery(o).admissions, false);
    }
  }
});

test("contestation blocks recovery and admission in every controller state", () => {
  const o = outage();
  o.hub.phase = "Challenged";
  for (const execution of [
    "Interlude",
    "Recovery",
    "Monad",
    "Returning",
  ] as const) {
    o.execution = execution;
    assert.deepEqual(decideRecovery(o), {
      execution,
      admissions: false,
      reason: "CHALLENGE_PENDING",
    });
  }
});

test("challenge window must end before recovery submission; Monad waits for contract confirmation", () => {
  const o = outage();
  o.execution = "Recovery";
  o.hub.phase = "Exiting";
  o.hub.stakeUnlockAt = 1_100n;
  assert.equal(decideRecovery(o).action, undefined);
  o.timestamp = 1_100n;
  assert.equal(decideRecovery(o).action, "finishRecovery");
  assert.equal(decideRecovery(o).admissions, false);
  o.execution = "Monad";
  assert.equal(decideRecovery(o).reason, "EXECUTION_STATE_INCONSISTENT");
  o.hub.phase = "None";
  assert.equal(decideRecovery(o).reason, "MONAD_FALLBACK_ACTIVE");
  assert.equal(decideRecovery(o).admissions, true);
});

test("restored node health does not automatically reopen an Interlude delegation", () => {
  const o = observation();
  o.execution = "Monad";
  o.hub.phase = "None";
  assert.equal(decideRecovery(o).action, undefined);
  o.execution = "Returning";
  o.hub.phase = "Active";
  assert.equal(decideRecovery(o).reason, "ADMIN_RETURN_PENDING");
  assert.equal(decideRecovery(o).admissions, false);
});

test("malformed observations cannot be used as fallback evidence", () => {
  for (const mutate of [
    (o: ExecutionObservation) => {
      o.chainId = 4242 as 10143;
    },
    (o: ExecutionObservation) => {
      o.generation = 0n;
    },
    (o: ExecutionObservation) => {
      o.blockHash = "0x00";
    },
    (o: ExecutionObservation) => {
      o.hub.phase = "Unknown" as "Active";
    },
    (o: ExecutionObservation) => {
      o.health.unhealthySince = o.timestamp + 1n;
    },
  ]) {
    const o = observation();
    mutate(o);
    assert.throws(() => decideRecovery(o), /Invalid execution observation/);
  }
});

function harness(initial = outage()) {
  let o = initial;
  let journal: RecoveryJournal = "missing";
  let sponsor = true;
  let canonical = true;
  let failRead = false;
  const writes: Array<{ id: string; action: string }> = [];
  const logs: Array<{
    level: string;
    data: Parameters<RecoveryPort["log"]>[1];
  }> = [];
  const port: RecoveryPort = {
    observe: async () => {
      if (failRead) throw new Error("secret token and signature");
      return structuredClone(o);
    },
    canonical: async () => canonical,
    sponsorAvailable: async () => sponsor,
    journal: async () => journal,
    reconcile: async () => journal,
    enqueue: async (id, action) => {
      writes.push({ id, action });
      journal = "submitted";
      return tx;
    },
    log: (level, data) => logs.push({ level, data }),
  };
  return {
    port,
    writes,
    logs,
    set observation(v: ExecutionObservation) {
      o = v;
    },
    set journal(v: RecoveryJournal) {
      journal = v;
    },
    set sponsor(v: boolean) {
      sponsor = v;
    },
    set canonical(v: boolean) {
      canonical = v;
    },
    set failRead(v: boolean) {
      failRead = v;
    },
  };
}

test("concurrent recovery triggers share one journal operation; restart does not duplicate it", async () => {
  const h = harness();
  const work = recoveryWorker(h.port);
  await Promise.all(Array.from({ length: 20 }, () => work()));
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].action, "beginRecovery");
  assert.equal((await recoveryWorker(h.port)()).status, "submitted");
  assert.equal(h.writes.length, 1);
  const entry = h.logs.find(
    (l) => "status" in l.data && l.data.status === "requested",
  );
  assert(entry && "actual" in entry.data);
  assert.equal(entry.data.actual, "Interlude");
  assert.equal(entry.data.requested, "Recovery");
  assert.equal(entry.level, "warn");
});

test("lost receipt is reconciled, not interpreted as failed execution", async () => {
  const h = harness();
  h.port.enqueue = async (id, action) => {
    h.writes.push({ id, action });
    h.journal = "uncertain";
    throw new Error("lost receipt signed bytes");
  };
  const work = recoveryWorker(h.port);
  assert.equal((await work()).status, "recovery_check_unavailable");
  assert.equal((await recoveryWorker(h.port)()).status, "uncertain");
  assert.equal(h.writes.length, 1);
  assert(!JSON.stringify(h.logs).includes("signed bytes"));
});

test("failed recovery is held for inspection; missing sponsor never charges a player", async () => {
  const h = harness();
  h.journal = "failed";
  const work = recoveryWorker(h.port);
  assert.equal((await work()).status, "failed");
  h.journal = "missing";
  h.sponsor = false;
  assert.equal((await work()).status, "waiting_for_sponsor");
  assert.equal(h.writes.length, 0);
  assert(
    h.logs.some(
      (l) => "status" in l.data && l.data.status === "waiting_for_sponsor",
    ),
  );
});

test("a recovered generation or new hub phase during RPC work cancels the pending write", async () => {
  for (const mutate of [
    (o: ExecutionObservation) => {
      o.generation++;
    },
    (o: ExecutionObservation) => {
      o.hub.epoch++;
    },
    (o: ExecutionObservation) => {
      o.hub.phase = "Challenged";
    },
    (o: ExecutionObservation) => {
      o.health.kind = "healthy";
    },
  ]) {
    const h = harness();
    let n = 0;
    h.port.observe = async () => {
      const o = outage();
      if (n++ > 0) mutate(o);
      return o;
    };
    assert.equal(
      (await recoveryWorker(h.port)()).status,
      "observation_changed",
    );
    assert.equal(h.writes.length, 0);
  }
});

test("reorganizations and lagging replicas cannot schedule recovery", async () => {
  const h = harness(observation());
  const work = recoveryWorker(h.port);
  await work();
  const old = outage();
  old.block--;
  h.observation = old;
  assert.equal((await work()).status, "observation_behind");
  h.observation = outage();
  h.canonical = false;
  assert.equal((await work()).status, "observation_reorganized");
  assert.equal(h.writes.length, 0);
});

test("unavailable observations preserve warning privacy and do not spam unchanged errors", async () => {
  const h = harness();
  h.failRead = true;
  const work = recoveryWorker(h.port);
  await work();
  await work();
  assert.equal(h.logs.length, 1);
  assert.equal(h.logs[0].data.event, "pongit.execution.worker-unavailable");
  assert(!JSON.stringify(h.logs).includes("secret"));
  assert.equal(h.writes.length, 0);
  h.failRead = false;
  h.observation = observation();
  await work();
  h.failRead = true;
  await work();
  assert.equal(h.logs.length, 3);
});

test("fallback completion has a distinct journal identity and never schedules an automatic return", async () => {
  const h = harness();
  const work = recoveryWorker(h.port);
  await work();
  const o = outage();
  o.execution = "Recovery";
  o.hub.phase = "None";
  o.block++;
  h.observation = o;
  h.journal = "missing";
  await work();
  assert.equal(h.writes.length, 2);
  assert.notEqual(h.writes[0].id, h.writes[1].id);
  assert.equal(h.writes[1].action, "finishRecovery");
  o.execution = "Monad";
  o.generation++;
  o.block++;
  o.health.kind = "healthy";
  h.observation = o;
  await work();
  assert.equal(h.writes.length, 2);
  const last = h.logs.at(-1)!;
  assert.equal(last.level, "warn");
  assert("actual" in last.data && last.data.actual === "Monad");
});

test("browser transition diagnostics warn on fallback and deduplicate repeated observations", () => {
  const logs: unknown[] = [];
  const report = executionReporter((level, data) => logs.push({ level, data }));
  const o = observation();
  report(o);
  o.block++;
  report(o);
  o.execution = "Monad";
  o.hub.phase = "None";
  report(o);
  o.block++;
  report(o);
  assert.equal(logs.length, 2);
  const original = console.warn;
  const notices: unknown[] = [];
  try {
    console.warn = (...args) => {
      notices.push(args);
    };
    logTransition({
      previous: 1,
      next: 2,
      generation: 3n,
      reason: zeroHash,
      at: 1000n,
    });
  } finally {
    console.warn = original;
  }
  assert.equal(notices.length, 1);
});

const controllerAbi = parseAbi([
  "function generation() view returns(uint256)",
  "function executionState() view returns(uint8)",
  "function transitionReason() view returns(bytes32)",
  "function sessionClosure() view returns(uint256 drainingEpoch,uint256 sealedEpoch)",
  "function hub() view returns(address)",
]);
function rpcFixture() {
  const pinned: string[] = [];
  let chainId = 10143;
  let otherHash = false;
  let wrongHub = false;
  const delegationAbi = roomsLifecycleHubAbi.find(
    (f) => f.name === "delegationOf",
  )!;
  const fields = delegationAbi.outputs[0].components;
  const values = fields.map((field) => {
    const specified: Record<string, unknown> = {
      app,
      partition: zeroHash,
      status: 1,
      epoch: 5n,
      expiresAt: 2000n,
      lastCommitAt: 995n,
      maxBatchInterval: 60n,
    };
    return (
      specified[field.name] ??
      (field.type === "address"
        ? zeroAddress
        : field.type === "bytes32"
          ? zeroHash
          : 0)
    );
  });
  const base = {
    getChainId: async () => chainId,
    getBlock: async (args: { blockNumber?: bigint }) => ({
      number: 100n,
      hash: args.blockNumber !== undefined && otherHash ? tx : hash,
      timestamp: 1000n,
    }),
    request: async ({
      method,
      params,
    }: {
      method: string;
      params: [{ to: Hex; data: Hex }, string];
    }) => {
      assert.equal(method, "eth_call");
      pinned.push(params[1]);
      if (params[0].to === hub)
        return encodeAbiParameters(delegationAbi.outputs, [values] as never);
      const call = decodeFunctionData({
        abi: controllerAbi,
        data: params[0].data,
      });
      if (call.functionName === "generation")
        return encodeFunctionResult({
          abi: controllerAbi,
          functionName: "generation",
          result: 2n,
        });
      if (call.functionName === "executionState")
        return encodeFunctionResult({
          abi: controllerAbi,
          functionName: "executionState",
          result: 0,
        });
      if (call.functionName === "transitionReason")
        return encodeFunctionResult({
          abi: controllerAbi,
          functionName: "transitionReason",
          result: zeroHash,
        });
      if (call.functionName === "sessionClosure")
        return encodeFunctionResult({
          abi: controllerAbi,
          functionName: "sessionClosure",
          result: [0n, 0n],
        });
      return encodeFunctionResult({
        abi: controllerAbi,
        functionName: "hub",
        result: wrongHub ? app : hub,
      });
    },
  } as unknown as Pick<PublicClient, "getChainId" | "getBlock" | "request">;
  return {
    base,
    pinned,
    set wrongChain(value: boolean) {
      chainId = value ? 4242 : 10143;
    },
    set reorganized(value: boolean) {
      otherHash = value;
    },
    set wrongHub(value: boolean) {
      wrongHub = value;
    },
  };
}

test("the real RPC adapter pins controller and hub calls to the same Monad block", async () => {
  const r = rpcFixture();
  const source = authorityRecoverySource({
    base: r.base,
    app,
    hub,
    health: async (at) => {
      assert.equal(at, 1000n);
      return observation().health;
    },
  });
  assert.deepEqual(await source.observe(), observation());
  assert.deepEqual(r.pinned, Array(6).fill("0x64"));
});

test("planned closure waits for normal renewal, never erases room generations through automatic recovery", () => {
  const o = observation();
  o.closure.drainingEpoch = o.hub.epoch;
  assert.equal(decideRecovery(o).reason, "SESSION_DRAINING");
  assert.equal(decideRecovery(o).admissions, false);
  o.closure.sealedEpoch = o.hub.epoch;
  assert.equal(decideRecovery(o).reason, "SESSION_SEALED");
  assert.equal(decideRecovery(o).action, "closeCompletedSession");
  o.execution = "Returning";
  o.transitionReason = normalSessionClosureReason;
  for (const phase of ["Exiting", "None"] as const) {
    o.hub.phase = phase;
    o.hub.stakeUnlockAt = 2000n;
    const d = decideRecovery(o);
    assert.equal(d.reason, "SESSION_RENEWAL_PENDING");
    assert.equal(d.action, undefined);
    assert.equal(d.admissions, false);
  }
  o.hub.phase = "Challenged";
  assert.equal(decideRecovery(o).reason, "CHALLENGE_PENDING");
});

test("published session closure uses the same journal with an epoch-bound close call", async () => {
  const o = observation();
  o.closure = { drainingEpoch: 5n, sealedEpoch: 5n };
  let state: RecoveryJournal = "missing";
  const sent: Array<[string, string, bigint]> = [];
  const port: RecoveryPort = {
    observe: async () => o,
    canonical: async () => true,
    sponsorAvailable: async () => true,
    journal: async () => state,
    reconcile: async () => state,
    enqueue: async (id, action, epoch) => {
      sent.push([id, action, epoch]);
      state = "uncertain";
      return tx;
    },
    log: () => {},
  };
  const run = recoveryWorker(port);
  await Promise.all([run(), run()]);
  await run();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][1], "closeCompletedSession");
  assert.equal(sent[0][2], 5n);
  assert(sent[0][0].endsWith(":5:closeCompletedSession"));
  o.execution = "Returning";
  o.transitionReason = normalSessionClosureReason;
  o.hub.phase = "Exiting";
  await run();
  assert.equal(sent.length, 1);
});

test("a failed draining engine can still enter protocol-gated disaster recovery", () => {
  const o = outage();
  o.closure.drainingEpoch = o.hub.epoch;
  assert.equal(decideRecovery(o).action, "beginRecovery");
  o.closure.sealedEpoch = o.hub.epoch + 1n;
  assert.throws(() => decideRecovery(o), /Invalid execution/);
});

test("the RPC adapter rejects engine RPCs, wrong hubs and a reorganized pinned block", async () => {
  for (const fault of ["wrongChain", "wrongHub", "reorganized"] as const) {
    const r = rpcFixture();
    r[fault] = true;
    const source = authorityRecoverySource({
      base: r.base,
      app,
      hub,
      health: async () => observation().health,
    });
    await assert.rejects(source.observe());
  }
});
