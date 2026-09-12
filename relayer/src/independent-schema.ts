import type {Pool} from 'pg';
/** Shared operation journals remain usable even with the former coordinator stopped. */
export async function independentSchema(db:Pool){
 await db.query(`
 CREATE TABLE IF NOT EXISTS il_engine_jobs(app text NOT NULL,id text NOT NULL,nonce bigint NOT NULL,raw text NOT NULL,hash text NOT NULL,status text NOT NULL,PRIMARY KEY(app,id));
 ALTER TABLE il_engine_jobs ADD COLUMN IF NOT EXISTS epoch bigint NOT NULL DEFAULT 0;
 ALTER TABLE il_engine_jobs ADD COLUMN IF NOT EXISTS signer text;
 ALTER TABLE il_engine_jobs ADD COLUMN IF NOT EXISTS action text;
 ALTER TABLE il_engine_jobs ADD COLUMN IF NOT EXISTS match_id text;
 ALTER TABLE il_engine_jobs ADD COLUMN IF NOT EXISTS resolution jsonb;
 ALTER TABLE il_engine_jobs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
 ALTER TABLE il_engine_jobs ADD COLUMN IF NOT EXISTS request_key text;
 ALTER TABLE il_engine_jobs DROP CONSTRAINT IF EXISTS il_engine_jobs_app_nonce_key;
 CREATE UNIQUE INDEX IF NOT EXISTS il_engine_jobs_epoch_nonce ON il_engine_jobs(app,epoch,nonce);
 CREATE INDEX IF NOT EXISTS il_engine_request ON il_engine_jobs(app,epoch,request_key) WHERE request_key IS NOT NULL;
 CREATE TABLE IF NOT EXISTS independent_engine_health(app text NOT NULL,epoch bigint NOT NULL,failed_at bigint NOT NULL,PRIMARY KEY(app,epoch));
 CREATE TABLE IF NOT EXISTS il_lifecycle(app text PRIMARY KEY,stage text NOT NULL,changed_at timestamptz NOT NULL DEFAULT now());
 ALTER TABLE il_lifecycle ADD COLUMN IF NOT EXISTS epoch bigint NOT NULL DEFAULT 0;
 ALTER TABLE il_lifecycle ADD COLUMN IF NOT EXISTS provision_epoch bigint NOT NULL DEFAULT 0;
 ALTER TABLE il_lifecycle ADD COLUMN IF NOT EXISTS provisioning jsonb;
 `);
}
