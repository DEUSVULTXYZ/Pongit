import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

test("RPC coalesces reads and rebroadcasts only identical signed bytes on failover", async () => {
  const seen: { primary: string[]; secondary: string[] } = {
    primary: [],
    secondary: [],
  };
  const submissions: { name: string; params: unknown[] }[] = [];
  const mock = async (name: "primary" | "secondary") => {
    const server = createServer(async (req, res) => {
      let text = "";
      for await (const part of req) text += part;
      const q = JSON.parse(text);
      seen[name].push(q.method);
      if (q.method === "eth_sendRawTransaction")
        submissions.push({ name, params: q.params });
      res.setHeader("content-type", "application/json");
      if (name === "primary") {
        if (q.method === "eth_sendRawTransaction")
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: q.id,
              error: {
                code: -32000,
                message: "Signer had insufficient balance",
              },
            }),
          );
        else {
          res.statusCode = 503;
          res.end("{}");
        }
      } else
        res.end(JSON.stringify({ jsonrpc: "2.0", id: q.id, result: "0x279f" }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return {
      server,
      url: `http://127.0.0.1:${(server.address() as any).port}`,
    };
  };
  const primary = await mock("primary"),
    secondary = await mock("secondary"),
    reservation = createServer();
  await new Promise<void>((r) => reservation.listen(0, "127.0.0.1", r));
  const port = (reservation.address() as any).port;
  await new Promise<void>((r) => reservation.close(() => r()));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "relayer/src/rpc-gateway.ts"],
    {
      env: {
        ...process.env,
        RPC_PORT: String(port),
        RPC_UPSTREAM: primary.url,
        RPC_UPSTREAM_FALLBACK: secondary.url,
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        await fetch(base + "/health");
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    assert(ready);
    const request = (method: string, params: unknown[] = []) =>
      fetch(base, {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }).then((r) => r.json());
    const reads = await Promise.all([
      request("eth_chainId"),
      request("eth_chainId"),
      request("eth_chainId"),
    ]);
    assert(reads.every((r) => r.result === "0x279f"));
    assert.deepEqual(seen.primary, ["eth_chainId"]);
    assert.deepEqual(seen.secondary, ["eth_chainId"]);
    assert.equal((await request("eth_chainId")).result, "0x279f");
    assert.equal(seen.secondary.length, 1);
    assert.equal(
      (await request("eth_sendRawTransaction", ["0x010203"])).result,
      "0x279f",
    );
    assert.deepEqual(submissions, [
      { name: "primary", params: ["0x010203"] },
      { name: "secondary", params: ["0x010203"] },
    ]);
    assert((await request("eth_sendTransaction", [{ from: "0x01" }])).error);
    assert(!seen.secondary.includes("eth_sendTransaction"));
  } finally {
    child.kill();
    primary.server.closeAllConnections();
    secondary.server.closeAllConnections();
    await Promise.all([
      new Promise<void>((r) => primary.server.close(() => r())),
      new Promise<void>((r) => secondary.server.close(() => r())),
    ]);
  }
});

test("RPC spacing honours the configured rate down to its floor and reports upstream throttling",async()=>{
 let hits=0;
 const upstream=createServer(async(req,res)=>{let text="";for await(const part of req)text+=part;const q=JSON.parse(text);
  res.setHeader("content-type","application/json");
  // The provider rejects the first request with HTTP 429, then answers.
  if(hits++===0){res.statusCode=429;res.end("Too Many Requests");return;}
  res.end(JSON.stringify({jsonrpc:"2.0",id:q.id,result:"0x1"}));});
 await new Promise<void>(r=>upstream.listen(0,"127.0.0.1",r));
 const url=`http://127.0.0.1:${(upstream.address() as any).port}`;
 const start=async(spacing:string)=>{
  const probe=createServer();await new Promise<void>(r=>probe.listen(0,"127.0.0.1",r));
  const port=(probe.address() as any).port;await new Promise<void>(r=>probe.close(()=>r()));
  const child=spawn(process.execPath,["--import","tsx","relayer/src/rpc-gateway.ts"],{env:{...process.env,RPC_PORT:String(port),RPC_UPSTREAM:url,RPC_UPSTREAM_FALLBACK:url,RPC_SPACING_MS:spacing},stdio:"ignore",windowsHide:true});
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<100;i++){try{await fetch(base+"/health");break;}catch{await new Promise(r=>setTimeout(r,50));}}
  return{child,base,health:async()=>(await fetch(base+"/health")).json() as Promise<any>};
 };
 const configured=await start("40"),floored=await start("5");
 try{
  // 40 ms was silently raised to 50 ms before; it is now honoured.
  assert.equal((await configured.health()).requestsPerSecond,25);
  assert.equal((await floored.health()).requestsPerSecond,40,"a spacing below the floor is still bounded");
  const answer=await fetch(configured.base,{method:"POST",body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_blockNumber",params:[]})}).then(r=>r.json());
  assert.equal(answer.result,"0x1","the throttled read is retried and answered");
  assert.equal((await configured.health()).throttled,1,"upstream throttling is visible to operators");
 }finally{
  configured.child.kill();floored.child.kill();upstream.closeAllConnections();
  await new Promise<void>(r=>upstream.close(()=>r()));
 }
});
