import type {Pool} from 'pg';
export async function initializeAgents(db:Pool){await db.query(`
 CREATE SCHEMA IF NOT EXISTS agent_arcade;
 CREATE TABLE IF NOT EXISTS agent_arcade.identities (
  app text NOT NULL, agent text NOT NULL, creator text NOT NULL, name text NOT NULL, avatar smallint NOT NULL CHECK(avatar BETWEEN 0 AND 11),
  kind text NOT NULL CHECK(kind IN ('pongit','community')), modes smallint NOT NULL CHECK(modes BETWEEN 1 AND 3),
  qualification jsonb NOT NULL DEFAULT '{}', registration jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(app,agent));
 CREATE TABLE IF NOT EXISTS agent_arcade.presence (
  app text NOT NULL, player text NOT NULL, available boolean NOT NULL DEFAULT false, seen timestamptz NOT NULL DEFAULT now(),
  connections int NOT NULL DEFAULT 0, PRIMARY KEY(app,player));
 CREATE TABLE IF NOT EXISTS agent_arcade.challenges (
  id uuid PRIMARY KEY, app text NOT NULL, player text NOT NULL, agent text NOT NULL, mode smallint NOT NULL CHECK(mode IN (0,1)),
  operation uuid NOT NULL, status text NOT NULL DEFAULT 'waiting', created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes', match_id bigint, UNIQUE(app,player,operation));
 CREATE UNIQUE INDEX IF NOT EXISTS agent_challenge_participation ON agent_arcade.challenges(app,player) WHERE status IN ('waiting','offered','active');
 CREATE TABLE IF NOT EXISTS agent_arcade.matches (
  id bigserial PRIMARY KEY, app text NOT NULL, epoch numeric(78,0) NOT NULL, kind text NOT NULL CHECK(kind IN ('league','challenge','qualification')),
  mode smallint NOT NULL CHECK(mode IN (0,1)), a text NOT NULL, b text NOT NULL CHECK(a<>b), ranked boolean NOT NULL,
  status text NOT NULL DEFAULT 'preparing', offer jsonb, result jsonb, publication jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS agent_match_app_status ON agent_arcade.matches(app,status,id);
 CREATE TABLE IF NOT EXISTS agent_arcade.qualification_checks (
  match_id bigint NOT NULL REFERENCES agent_arcade.matches(id), player text NOT NULL, initial_token text NOT NULL,
  initial_nonce numeric(78,0) NOT NULL, resumed_token text, resumed_nonce numeric(78,0),
  created_at timestamptz NOT NULL DEFAULT now(), resumed_at timestamptz, PRIMARY KEY(match_id,player));
 CREATE TABLE IF NOT EXISTS agent_arcade.occupancy (
  app text NOT NULL, player text NOT NULL, match_id bigint NOT NULL REFERENCES agent_arcade.matches(id), PRIMARY KEY(app,player));
 CREATE TABLE IF NOT EXISTS agent_arcade.auth_nonces (
  nonce uuid PRIMARY KEY, app text NOT NULL, player text NOT NULL, expires bigint NOT NULL);
 CREATE TABLE IF NOT EXISTS agent_arcade.sessions (
  token_hash text PRIMARY KEY, app text NOT NULL, player text NOT NULL, session_key text NOT NULL, expiry bigint NOT NULL, epoch numeric(78,0) NOT NULL);
 CREATE TABLE IF NOT EXISTS agent_arcade.engine_jobs (
  app text NOT NULL, operation text NOT NULL, signer text NOT NULL, epoch numeric(78,0) NOT NULL, nonce bigint NOT NULL,
  hash text NOT NULL, raw text NOT NULL, state text NOT NULL DEFAULT 'prepared', evidence jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(app,operation), UNIQUE(app,signer,epoch,nonce));
 CREATE UNIQUE INDEX IF NOT EXISTS agent_pending_signer ON agent_arcade.engine_jobs(app,signer) WHERE state IN ('prepared','uncertain');
 CREATE TABLE IF NOT EXISTS agent_arcade.health (
  app text PRIMARY KEY, stage text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS agent_arcade.ratings (
  app text NOT NULL,agent text NOT NULL,mode smallint NOT NULL,live jsonb,published jsonb,observed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(app,agent,mode));
 CREATE TABLE IF NOT EXISTS agent_arcade.control(app text PRIMARY KEY,admissions boolean NOT NULL DEFAULT true,reason text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS agent_arcade.lifecycle(app text PRIMARY KEY,provision_epoch numeric(78,0),provisioning jsonb);
 CREATE TABLE IF NOT EXISTS agent_arcade.replays (
  match_id bigint PRIMARY KEY REFERENCES agent_arcade.matches(id),availability text NOT NULL DEFAULT 'recording',frames bytea,frame_count integer NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS agent_arcade.frames (
  match_id bigint NOT NULL REFERENCES agent_arcade.matches(id),revision numeric(78,0) NOT NULL,frame jsonb NOT NULL,PRIMARY KEY(match_id,revision));
 `);}
