import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readSponsorCosts } from "../relayer/src/budget";

test("sponsorship keeps pending reservations, bills actual gas/value, and carries unsettled jobs across UTC midnight", async () => {
  assert.ok(process.env.DATABASE_URL, "Use an isolated local PostgreSQL database");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query(`CREATE TEMP TABLE relay_jobs (
      status text, cost numeric, receipt jsonb, payload jsonb, raw_tx text,
      created_at timestamptz, updated_at timestamptz, confirmed_at timestamptz)`);
    const receipt = (status: string) => JSON.stringify({ status, gasUsed: "2", effectiveGasPrice: "3" });
    // Total reservation was 40 per job. Success costs 6 gas + 5 native value;
    // revert costs only 6. Yesterday's unsent/sent reservation remains 40.
    await db.query(`INSERT INTO relay_jobs VALUES
      ('succeeded',40,$1,'{"value":"5"}','0x',now(),now(),now()),
      ('failed',40,$2,'{"value":"5"}','0x',now(),now(),now()),
      ('sent',40,null,'{}','0x',now()-interval '2 days',now()-interval '2 days',null),
      ('signed',40,null,'{}','0x',now(),now(),null),
      ('failed',0,null,'{}',null,now(),now(),null),
      ('succeeded',40,$1,'{"value":"5"}','0x',now()-interval '2 days',now()-interval '2 days',now()-interval '2 days')`,
      [receipt("success"), receipt("reverted")]);
    const now = await db.query("SELECT now() AS at");
    const balanceAt = new Date(now.rows[0].at.getTime() + 1000);
    assert.deepEqual(await readSponsorCosts(db, balanceAt), { spent: 97n, commitments: 80n });
    assert.deepEqual(await readSponsorCosts(db, new Date(0)), { spent: 97n, commitments: 108n });
    // Missing historical receipt fields must retain the reservation.
    await db.query(`INSERT INTO relay_jobs VALUES ('succeeded',40,'{}','{}','0x',now(),now(),now())`);
    assert.equal((await readSponsorCosts(db, balanceAt)).spent, 137n);
  } finally { await db.end(); }
});
