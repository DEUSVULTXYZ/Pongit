import test from "node:test";
import assert from "node:assert/strict";
import {
  bindRoomsFinance,
  loadRoomsFinance,
  financeScope,
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
test("a new finance generation cannot retarget legacy jobs", async () => {
  const {mkdtemp,writeFile,rm}=await import("node:fs/promises");
  const {tmpdir}=await import("node:os");const {join}=await import("node:path");
  const dir=await mkdtemp(join(tmpdir(),"pongit-finance-"));
  const early:RoomsFinanceManifest={...manifest,financeId:"early-v1",settlement:"early-published-testnet",adapter:address("1"),market:address("2"),vault:address("3")};
  const old=process.env.ROOMS_FINANCE_MANIFEST;
  try{
    process.env.ROOMS_FINANCE_MANIFEST=join(dir,"manifest.json");
    await writeFile(process.env.ROOMS_FINANCE_MANIFEST,JSON.stringify([manifest,early]));
    const config=await loadRoomsFinance(),db=database();await config.bind(db);
    assert.equal(db.rows.size,2);assert.ok(db.rows.has(financeScope(early)));
    const request={deployment:"rooms",roomApp:manifest.app,contract:"market",functionName:"claim",args:["1",address("9")]} as const;
    assert.equal(config.encode({...request,args:[...request.args]}).address,manifest.market);
    assert.equal(config.encode({...request,args:[...request.args],roomFinance:"early-v1"}).address,early.market);
    assert.throws(()=>config.encode({...request,args:[...request.args],roomFinance:"missing"}),/unavailable/);
  }finally{if(old===undefined)delete process.env.ROOMS_FINANCE_MANIFEST;else process.env.ROOMS_FINANCE_MANIFEST=old;await rm(dir,{recursive:true,force:true});}
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
