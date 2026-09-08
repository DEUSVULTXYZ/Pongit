import test from "node:test";
import assert from "node:assert/strict";
import { requestHostedRenewal } from "../relayer/src/rooms-hosted-renewal";
const app = "0x0000000000000000000000000000000000000011",
  url = "https://test-engine.example";
function journal() {
  let epoch = "0";
  return {
    query: async (_sql: string, args: any[]) => {
      const old = epoch;
      epoch = args[1];
      return { rowCount: old !== epoch ? 1 : 0 };
    },
  } as any;
}

test("hosted renewal submits once per persisted epoch and then reads status", async () => {
  const calls: { url: string; method: string; body: any }[] = [],
    db = journal();
  const transport = (async (u: any, o: any) => {
    calls.push({ url: String(u), method: o.method, body: o.body });
    return Response.json({ url });
  }) as typeof fetch;
  await requestHostedRenewal(db, app, 2n, url, transport);
  await requestHostedRenewal(db, app, 2n, url, transport);
  assert.deepEqual(
    calls.map((c) => c.method),
    ["POST", "GET"],
  );
  assert.deepEqual(JSON.parse(calls[0].body), { app });
  assert(calls[1].url.endsWith("/" + app));
  await requestHostedRenewal(db, app, 3n, url, transport);
  assert.equal(calls[2].method, "POST");
});
test("uncertain creation is recovered by lookup after restart, never blindly repeated", async () => {
  const db = journal(),
    calls: string[] = [];
  await assert.rejects(
    requestHostedRenewal(db, app, 2n, url, (async (_u: any, o: any) => {
      calls.push(o.method);
      throw new Error("connection lost");
    }) as typeof fetch),
    /connection lost/,
  );
  await requestHostedRenewal(db, app, 2n, url, (async (_u: any, o: any) => {
    calls.push(o.method);
    return Response.json({ url });
  }) as typeof fetch);
  assert.deepEqual(calls, ["POST", "GET"]);
});
test("control-plane errors or a different URL never silently switch the application endpoint", async () => {
  await assert.rejects(
    requestHostedRenewal(journal(), app, 2n, url, (async () =>
      Response.json({ url: "https://another.example" })) as typeof fetch),
    /URL changed/,
  );
  await assert.rejects(
    requestHostedRenewal(journal(), app, 2n, url, (async () =>
      Response.json({ status: "starting" })) as typeof fetch),
    /no URL/,
  );
  await assert.rejects(
    requestHostedRenewal(
      journal(),
      app,
      2n,
      url,
      (async () => new Response("", { status: 503 })) as typeof fetch,
    ),
    /503/,
  );
});
