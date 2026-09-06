import pg from "pg";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
});
export async function initializeStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS relay_jobs (
    id text PRIMARY KEY, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'queued',
    nonce bigint, raw_tx text, tx_hash text, cost numeric NOT NULL DEFAULT 0,
    error text, receipt jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS jobs_pending ON relay_jobs(status, created_at);
    CREATE TABLE IF NOT EXISTS queue_players (player text PRIMARY KEY, elo integer NOT NULL, expires bigint NOT NULL, tournament_id text NOT NULL DEFAULT '0');
    CREATE TABLE IF NOT EXISTS rooms (id text PRIMARY KEY, player_a text NOT NULL, player_b text NOT NULL, tournament_id text NOT NULL,
      join_a jsonb, join_b jsonb, match_id text, job_id text, expires bigint NOT NULL);
    CREATE TABLE IF NOT EXISTS faucets (player text PRIMARY KEY, job_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());`);
  await pool.query(`ALTER TABLE queue_players ADD COLUMN IF NOT EXISTS ticket text;
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ticket_a text;
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ticket_b text;`);
  const connection = await pool.connect();
  const result = await connection.query(
    "SELECT pg_try_advisory_lock(701337) AS locked",
  );
  if (!result.rows[0].locked) {
    connection.release();
    throw new Error("Another relayer owns the signing lock");
  }
  return connection;
}
