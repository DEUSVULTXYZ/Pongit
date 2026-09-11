import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeFunctionData,
  getAddress,
  keccak256,
  parseAbi,
  toHex,
  type Address,
  type Hex,
} from "viem";
import {
  preparePrivateUpload,
  verifyPrivateChunk,
  restoreCiphertext,
  saveEncryptedChunks,
  privateKeyFromPrf,
  encryptPrivate,
  decryptPrivate,
  namespaceHash,
  type UploadPort,
} from "../shared/authority-private";
import {
  readAuthorityLeaderboard,
  transitionNotice,
  authorityGrantHash,
  commandMessage,
  engineCommand,
  authorityCommandAbi,
} from "../shared/authority-client";
import {
  authorityExecutor,
  maintenanceCall,
  type AuthorityExecutorPort,
} from "../relayer/src/authority-keeper";

test("engine commands bind both execution generation and delegation epoch", () => {
  const data = engineCommand(2n, 8n, "0x12345678");
  const decoded = decodeFunctionData({ abi: authorityCommandAbi, data });
  assert.deepEqual(decoded.args, [2n, 8n, "0x12345678"]);
  assert.notEqual(data, engineCommand(2n, 9n, "0x12345678"));
  assert.notEqual(data, engineCommand(3n, 8n, "0x12345678"));
  assert.throws(() => engineCommand(2n, 0n, "0x12345678"));
  assert.throws(() => engineCommand(0n, 8n, "0x12345678"));
});

test("ciphertext Merkle chunks roundtrip at limits, corruption cannot pass", () => {
  for (const size of [16, 4096, 4097, 16000, 65536]) {
    const bytes = crypto.getRandomValues(new Uint8Array(size));
    const upload = preparePrivateUpload(bytes);
    assert.equal(upload.chunks.length, Math.ceil(size / 4096));
    for (const c of upload.chunks) {
      assert(verifyPrivateChunk(upload.root, c.index, c.data, c.proof));
      assert(!verifyPrivateChunk(upload.root, c.index, "0xdead", c.proof));
    }
    assert.deepEqual(
      restoreCiphertext(
        upload.chunks.map((c) => c.data),
        upload.dataHash,
      ),
      bytes,
    );
  }
  assert.throws(() => preparePrivateUpload(new Uint8Array(65537)));
  assert.notEqual(namespaceHash("contacts"), namespaceHash("notebook"));
});
test("atomic upload stops on conflict and resumes missing chunks only", async () => {
  let revision = 0n;
  let bitmap = 0;
  let commits = 0;
  const puts: number[] = [];
  const id = toHex(1n, { size: 32 });
  const cipher = new Uint8Array(5000);
  const iv = toHex(new Uint8Array(12));
  const prepared = preparePrivateUpload(cipher);
  const port: UploadPort = {
    player: toHex(1n, { size: 20 }),
    namespace: namespaceHash("contacts"),
    currentRevision: async () => revision,
    currentUpload: async () => id,
    begin: async () => id,
    bitmap: async () => bitmap,
    upload: async () => ({
      player: port.player,
      namespace: port.namespace,
      root: prepared.root,
      dataHash: prepared.dataHash,
      iv,
      size: prepared.size,
      expected: 0n,
    }),
    put: async (_, c) => {
      puts.push(c.index);
      bitmap |= 1 << c.index;
    },
    commit: async () => {
      revision++;
      commits++;
    },
  };
  const abort = new AbortController();
  await assert.rejects(
    saveEncryptedChunks(
      port,
      cipher,
      iv,
      0n,
      (done) => {
        if (done === 1) abort.abort();
      },
      abort.signal,
    ),
  );
  assert.equal(commits, 0);
  await saveEncryptedChunks(port, cipher, iv, 0n, () => {}, undefined, id);
  assert.deepEqual(puts, [0, 1]);
  assert.equal(commits, 1);
  const changed = new Uint8Array(cipher);
  changed[0] = 1;
  await assert.rejects(
    saveEncryptedChunks(port, changed, iv, 0n, () => {}, undefined, id),
    /different backup/,
  );
  assert.equal(
    await saveEncryptedChunks(port, cipher, iv, 0n, () => {}, undefined, id),
    id,
  );
  assert.equal(commits, 1);
  await assert.rejects(
    saveEncryptedChunks(port, cipher, iv, 0n, () => {}),
    /another device/,
  );
});
test("private keys remain nonextractable and ciphertext binds namespace and account", async () => {
  const prf = crypto.getRandomValues(new Uint8Array(32));
  const copy = new Uint8Array(prf);
  const key = await privateKeyFromPrf(prf, "contacts");
  assert(prf.every((x) => x === 0));
  assert.equal(key.extractable, false);
  const recovered = await privateKeyFromPrf(copy, "contacts");
  const player = getAddress(toHex(1n, { size: 20 }));
  const data = { version: 1, contacts: [getAddress(toHex(2n, { size: 20 }))] };
  const first = await encryptPrivate(key, "contacts", player, data);
  const second = await encryptPrivate(key, "contacts", player, data);
  assert.notEqual(first.iv, second.iv);
  assert.deepEqual(
    await decryptPrivate(
      recovered,
      "contacts",
      player,
      first.iv,
      first.ciphertext,
    ),
    data,
  );
  await assert.rejects(
    decryptPrivate(key, "notebook", player, first.iv, first.ciphertext),
  );
  await assert.rejects(
    decryptPrivate(key, "contacts", "0xother", first.iv, first.ciphertext),
  );
});
test("leaderboard comes from pinned contract pages with stable address tiebreak", async () => {
  const players = Array.from({ length: 105 }, (_, i) =>
    getAddress(toHex(BigInt(105 - i), { size: 20 })),
  );
  let pages = 0;
  const result = await readAuthorityLeaderboard(
    {
      snapshot: async () => ({ revision: 10n, generation: 2n }),
      page: async (mode, offset, limit, revision) => {
        assert.equal(mode, 1);
        assert.equal(revision, 10n);
        pages++;
        return [players.slice(Number(offset), Number(offset + limit)), 105n];
      },
      rating: async (player, _, revision) => {
        assert.equal(revision, 10n);
        return {
          elo: player === players[0] ? 1200 : 1000,
          played: 2,
          wins: 1,
          season: 1,
        };
      },
    },
    1,
  );
  assert.equal(pages, 2);
  assert.equal(result.rows[0].player, players[0]);
  assert.equal(result.rows[1].player, players.at(-1));
});
test("grants bind generation and private transition diagnostics contain no signatures", () => {
  const g = {
    player: toHex(1n, { size: 20 }) as Address,
    key: toHex(2n, { size: 20 }) as Address,
    generation: 1n,
    epoch: 0n,
    expires: 100n,
  };
  assert.notEqual(
    authorityGrantHash(g),
    authorityGrantHash({ ...g, generation: 2n }),
  );
  assert.throws(() => commandMessage(g, "0x1234", 0n, 101n));
  const notice = transitionNotice({
    previous: 0,
    next: 1,
    generation: 2n,
    reason: keccak256("0x"),
    at: 1n,
  });
  assert.deepEqual(Object.keys(notice), [
    "previous",
    "next",
    "generation",
    "reason",
    "utc",
    "transactionHash",
  ]);
});

test("leaderboard rejects missing pages and totals changing inside one snapshot", async () => {
  const players = Array.from({length: 105}, (_, i) => getAddress(toHex(BigInt(i + 1), {size: 20})));
  for (const problem of ["short", "changed", "extra", "negative"] as const) {
    await assert.rejects(readAuthorityLeaderboard({
      snapshot: async () => ({revision: 10n, generation: 2n}),
      page: async (_, offset) => {
        if (problem === "short" && offset === 0n) return [players.slice(0, 99), 105n];
        if (problem === "changed" && offset === 100n) return [[], 100n];
        if (problem === "extra") return [players.slice(0, 3), 2n];
        if (problem === "negative") return [[], -1n];
        return [players.slice(Number(offset), Number(offset) + 100), 105n];
      },
      rating: async () => ({elo: 1000, played: 2, wins: 1, season: 1}),
    }, 0), /snapshot/);
  }
});
test("optional executor never chooses opponents, retries an uncertain send or charges a player", async () => {
  const targets = {
    chainId: 10143 as const,
    generation: 1n,
    game: toHex(1n, { size: 20 }) as Address,
    finance: toHex(2n, { size: 20 }) as Address,
    market: toHex(3n, { size: 20 }) as Address,
  };
  let writes = 0;
  let state: "missing" | "uncertain" = "missing";
  let available = true;
  const port: AuthorityExecutorPort = {
    journal: async () => state,
    reconcile: async () => state,
    simulate: async () => {},
    sponsoredEnqueue: async () => {
      writes++;
    },
    sponsorAvailable: async () => available,
  };
  const execute = authorityExecutor(port);
  const task = { kind: "matchmake" as const, mode: 0 as const, revision: 1n };
  await Promise.all([execute(targets, task), execute(targets, task)]);
  assert.equal(writes, 1);
  state = "uncertain";
  assert.equal(await execute(targets, task), "uncertain");
  assert.equal(writes, 1);
  state = "missing";
  available = false;
  assert.equal(await execute(targets, task), "waiting_for_sponsor");
  assert.equal(writes, 1);
  assert.equal(maintenanceCall(targets, task).value, 0n);
  const close = maintenanceCall(targets, {
    kind: "closeCompletedSession",
    epoch: 8n,
  });
  assert.equal(close.to, targets.game);
  assert.equal(close.value, 0n);
  assert.deepEqual(
    decodeFunctionData({
      abi: parseAbi(["function closeCompletedSession(uint256 expectedEpoch)"]),
      data: close.data,
    }).args,
    [8n],
  );
  assert.notEqual(
    close.requestId,
    maintenanceCall(targets, { kind: "closeCompletedSession", epoch: 9n })
      .requestId,
  );
  assert.throws(() =>
    maintenanceCall(targets, { kind: "closeCompletedSession", epoch: 0n }),
  );
  assert.notEqual(
    maintenanceCall(targets, task).requestId,
    maintenanceCall({ ...targets, generation: 2n }, task).requestId,
  );
  for (const kind of ["propose", "tick"] as const) {
    assert.notEqual(
      maintenanceCall(targets, { kind, id: 1n, revision: 1n }).requestId,
      maintenanceCall(targets, { kind, id: 1n, revision: 2n }).requestId,
    );
  }
  assert.notEqual(
    maintenanceCall(targets, {
      kind: "retryPayout",
      id: toHex(1n, { size: 32 }),
      attempt: 1n,
    }).requestId,
    maintenanceCall(targets, {
      kind: "retryPayout",
      id: toHex(1n, { size: 32 }),
      attempt: 2n,
    }).requestId,
  );
  assert.notEqual(
    maintenanceCall(targets, { kind: "openRound", id: 1n, rally: 1 }).requestId,
    maintenanceCall(targets, { kind: "openRound", id: 1n, rally: 2 }).requestId,
  );
});
