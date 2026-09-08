import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { roomsRankingCandidates } from "../relayer/src/rooms-ranking";

assert.equal(process.env.ROOMS_RANKING_TEST, "isolated-vps");
const db = new pg.Pool({connectionString:process.env.DATABASE_URL});
const c = await db.connect();
const app = () => `0x${randomBytes(20).toString("hex")}`;
const [old,current,other] = [app(),app(),app()];
const [a,b,d,e,f] = [app(),app(),app(),app(),app()];
try {
  assert.equal((await c.query("SELECT current_database() AS db")).rows[0].db,"rooms_chaos2");
  await c.query("BEGIN");
  await c.query("INSERT INTO il_lobby VALUES($1,$2)", [old,{rooms:{old:{offer:{a,b,ranked:true}}}}]);
  const fixtures = [
    {app:old,offer:{a,b,ranked:true}},
    {app:current,offer:{a,b:d,ranked:true,mode:1}},
    {app:current,offer:{a:e,b:f,ranked:false,mode:0}},
    {app:other,offer:{a:e,b:f,ranked:true,mode:0}},
  ];
  for (const [i,fixture] of fixtures.entries()) {
    await c.query("INSERT INTO il_offers(app,id,room,offer) VALUES($1,$2,$3,$4)",[fixture.app,String(i),"test",fixture.offer]);
  }
  assert.deepEqual(await roomsRankingCandidates(c,[current,old],0),[a,b].sort());
  assert.deepEqual(await roomsRankingCandidates(c,[current],1),[a,d].sort());
  assert.deepEqual(await roomsRankingCandidates(c,[current],0),[]);
  await c.query("DELETE FROM il_offers WHERE app=$1",[old]);
  assert.deepEqual(await roomsRankingCandidates(c,[current,old],0),[a,b].sort());
  console.log(JSON.stringify({passed:true,checks:["Inherited ranked identities recovered without result rows","Duplicates removed","Classic and Chaos stay separate","Friendly offers and unrelated deployments excluded","Historical lobby fallback works without offer rows"],writes:"Rolled back"}));
} finally {
  await c.query("ROLLBACK");
  c.release();
  await db.end();
}
