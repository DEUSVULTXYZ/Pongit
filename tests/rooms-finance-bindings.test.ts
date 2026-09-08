import test from "node:test";
import assert from "node:assert/strict";
import {
  bindRoomsFinance,
  type RoomsFinanceManifest,
} from "../relayer/src/rooms-finance-config";
const address = (n: string) => ("0x" + n.padStart(40, "0")) as `0x${string}`;
const manifest: RoomsFinanceManifest = {
  app: address("a"),
  adapter: address("b"),
  market: address("c"),
  vault: address("d"),
  pressureSigner: address("e"),
  chainId: 10143,
  startBlock: "123",
};
function database() {
  const rows = new Map<string, string>();
  return {
    rows,
    query: async (sql: string, args: string[] = []) => {
      if (sql.startsWith("INSERT") && !rows.has(args[0]))
        rows.set(args[0], args[1]);
      return {
        rows:
          sql.startsWith("SELECT") && rows.has(args[0])
            ? [{ fingerprint: rows.get(args[0]) }]
            : [],
      };
    },
  } as any;
}
test("restarts preserve the binding; case-only addresses and equivalent block numbers do not rebind", async () => {
  const db = database();
  await bindRoomsFinance(db, [manifest]);
  const before = [...db.rows];
  await bindRoomsFinance(db, [
    {
      ...manifest,
      market: ("0x" + manifest.market.slice(2).toUpperCase()) as `0x${string}`,
      startBlock: "000123",
    },
  ]);
  assert.deepEqual([...db.rows], before);
});
test("a changed destination cannot reinterpret an unsigned financial job after restart", async () => {
  for (const field of [
    "market",
    "vault",
    "adapter",
    "pressureSigner",
    "startBlock",
    "chainId",
  ] as const) {
    const db = database();
    await bindRoomsFinance(db, [manifest]);
    const before = [...db.rows];
    const changed = {
      ...manifest,
      [field]:
        field === "startBlock" ? "124" : field === "chainId" ? 1 : address("f"),
    };
    await assert.rejects(
      bindRoomsFinance(db, [changed as RoomsFinanceManifest]),
      /bindings changed/,
    );
    assert.deepEqual([...db.rows], before);
  }
});
test("another app appends a binding without replacing the previous financial deployment", async () => {
  const db = database();
  await bindRoomsFinance(db, [manifest]);
  const old = db.rows.get(manifest.app);
  await bindRoomsFinance(db, [manifest, { ...manifest, app: address("f") }]);
  assert.equal(db.rows.size, 2);
  assert.equal(db.rows.get(manifest.app), old);
});
