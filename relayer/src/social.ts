import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { verifyMessage, type Address, type Hex } from "viem";
import { z } from "zod";
import { pool } from "./store";
import { authMessage } from "../../shared/social";
import type { Deployment } from "../../shared/protocol";

const address = z.string().regex(/^0x[\da-fA-F]{40}$/).transform(v=>v.toLowerCase());
const hexId = z.string().regex(/^0x[\da-f]{64}$/);
const now = () => Math.floor(Date.now()/1000);
const id = () => `0x${randomBytes(32).toString("hex")}`;
const hash = (value:string) => createHash("sha256").update(value).digest("hex");
export async function initializeSocial() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_nonces (nonce text PRIMARY KEY,player text NOT NULL,expires bigint NOT NULL);
    CREATE TABLE IF NOT EXISTS app_sessions (token_hash text PRIMARY KEY,player text NOT NULL,expires bigint NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_player ON app_sessions(player);
    CREATE TABLE IF NOT EXISTS profiles (player text PRIMARY KEY,handle text UNIQUE NOT NULL,avatar integer NOT NULL CHECK(avatar BETWEEN 0 AND 11),updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS notebooks (player text PRIMARY KEY,revision integer NOT NULL,iv text NOT NULL,ciphertext text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS player_blocks (player text NOT NULL,blocked text NOT NULL,PRIMARY KEY(player,blocked));
    CREATE TABLE IF NOT EXISTS challenges (id text PRIMARY KEY,creator text NOT NULL,recipient text,mode integer NOT NULL,ranked boolean NOT NULL,status text NOT NULL DEFAULT 'pending',room_id text,expires bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS challenges_inbox ON challenges(recipient,status,expires);
    ALTER TABLE queue_players ADD COLUMN IF NOT EXISTS mode integer NOT NULL DEFAULT 0;
    ALTER TABLE queue_players ADD COLUMN IF NOT EXISTS deployment text NOT NULL DEFAULT 'v1';
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS mode integer NOT NULL DEFAULT 0;
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ranked boolean NOT NULL DEFAULT true;
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS rules_version integer NOT NULL DEFAULT 1;
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS deployment text NOT NULL DEFAULT 'v1';
  `);
  await pool.query("DELETE FROM app_nonces WHERE expires<$1;",[now()]);
  await pool.query("DELETE FROM app_sessions WHERE expires<$1;",[now()]);
}
export async function authenticatedPlayer(req: IncomingMessage) {
  const token = /(?:^|;\s*)pongit_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || "")?.[1];
  if (!token) throw new Error("Unlock your app session with your passkey.");
  const result = await pool.query("SELECT player FROM app_sessions WHERE token_hash=$1 AND expires>$2",[hash(token),now()]);
  if (!result.rows[0]) throw new Error("App session expired. Reconnect your passkey.");
  return result.rows[0].player as string;
}
type Dependencies = {
  deployment: Deployment;
  origin: string;
  readBody: (req:IncomingMessage)=>Promise<any>;
  send: (res:ServerResponse, value:unknown, status?:number)=>void;
  serialize: <T>(operation:()=>Promise<T>)=>Promise<T>;
  assertAvailable: (players:string[])=>Promise<void>;
};
export function socialRoutes(d: Dependencies) {
  const quota=new Map<string,{count:number,until:number}>();
  const limit=(key:string,max:number,seconds=60)=>{
    const item=quota.get(key); if (!item || item.until<now()) {quota.set(key,{count:1,until:now()+seconds});return;}
    if (++item.count>max) throw new Error("Too many requests. Please wait before trying again.");
    if(quota.size>10000) for(const [k,v] of quota) if(v.until<now())quota.delete(k);
  };
  const cookie=(token:string,age:number)=>`pongit_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${d.origin.startsWith("https:")?"; Secure":""}`;
  return async (req:IncomingMessage,res:ServerResponse,path:string):Promise<boolean>=>{
    if (!/^\/(auth|profiles|notebook|challenges|blocks)(\/|$)/.test(path)) return false;
    if(req.method!=="GET" && req.headers.origin!==d.origin) throw new Error("Origin denied");
    const url=new URL(req.url!,d.origin);
    if(path==="/auth/challenge" && req.method==="POST") {
      const player=address.parse((await d.readBody(req)).player);
      limit(`auth:${player}`,8); limit(`auth-ip:${req.socket.remoteAddress}`,100);
      const nonce=id(),expires=now()+300;
      await pool.query("INSERT INTO app_nonces(nonce,player,expires) VALUES($1,$2,$3)",[nonce,player,expires]);
      d.send(res,{nonce,expires,message:authMessage(player,nonce,expires,d.deployment.chainId,d.deployment.game)});return true;
    }
    if(path==="/auth/session" && req.method==="POST") {
      const r=z.object({player:address,nonce:hexId,signature:z.string().regex(/^0x[\da-fA-F]{130}$/)}).parse(await d.readBody(req));
      limit(`verify:${r.player}`,12);
      const rows=await pool.query("SELECT * FROM app_nonces WHERE nonce=$1 AND player=$2 AND expires>$3",[r.nonce,r.player,now()]);
      const n=rows.rows[0];
      if(!n || !await verifyMessage({address:r.player as Address,message:authMessage(r.player,r.nonce,Number(n.expires),d.deployment.chainId,d.deployment.game),signature:r.signature as Hex}))throw new Error("Invalid or expired app signature");
      const used=await pool.query("DELETE FROM app_nonces WHERE nonce=$1 RETURNING nonce",[r.nonce]);
      if(!used.rowCount)throw new Error("App signature already used");
      const token=randomBytes(32).toString("hex");
      await pool.query("INSERT INTO app_sessions(token_hash,player,expires) VALUES($1,$2,$3)",[hash(token),r.player,now()+3600]);
      res.setHeader("Set-Cookie",cookie(token,3600));d.send(res,{player:r.player,expires:now()+3600});return true;
    }
    if(path==="/auth/session" && req.method==="GET") {d.send(res,{player:await authenticatedPlayer(req)});return true;}
    if(path==="/auth/session" && req.method==="DELETE") {
      const token=/(?:^|;\s*)pongit_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||"")?.[1];
      if(token)await pool.query("DELETE FROM app_sessions WHERE token_hash=$1",[hash(token)]);
      res.setHeader("Set-Cookie",cookie("",0));d.send(res,{disconnected:true});return true;
    }
    if(path==="/profiles" && req.method==="GET") {
      const search=(url.searchParams.get("search")||"").slice(0,40).toLowerCase();
      const rows=await pool.query("SELECT player,handle,avatar FROM profiles WHERE handle LIKE $1 OR player=$2 ORDER BY handle LIMIT 30",[search.replace(/[%_]/g,"")+"%",search]);
      d.send(res,{profiles:rows.rows});return true;
    }
    if(/^\/profiles\/0x[\da-fA-F]{40}$/.test(path) && req.method==="GET") {
      const player=address.parse(path.split("/")[2]);
      const rows=await pool.query("SELECT player,handle,avatar FROM profiles WHERE player=$1",[player]);
      d.send(res,rows.rows[0]||{player,handle:null,avatar:parseInt(player.slice(-4),16)%12});return true;
    }
    const player=await authenticatedPlayer(req);
    if(String(req.headers["x-pongit-player"] || "").toLowerCase()!==player)throw new Error("The account changed in another tab. Unlock this account again before continuing.");
    limit(`user:${player}`,240);
    if(path==="/profiles" && req.method==="PUT") {
      const r=z.object({handle:z.string().toLowerCase().regex(/^[a-z][a-z0-9_]{2,19}$/),avatar:z.number().int().min(0).max(11)}).parse(await d.readBody(req));
      try {await pool.query("INSERT INTO profiles(player,handle,avatar) VALUES($1,$2,$3) ON CONFLICT(player) DO UPDATE SET handle=$2,avatar=$3,updated_at=now()",[player,r.handle,r.avatar]);}
      catch(e){if((e as any).code==="23505")throw new Error("This nickname is already taken.");throw e;}
      d.send(res,{player,...r});return true;
    }
    if(path==="/profiles" && req.method==="DELETE"){await pool.query("DELETE FROM profiles WHERE player=$1",[player]);d.send(res,{removed:true});return true;}
    if(path==="/notebook" && req.method==="GET") {
      const rows=await pool.query("SELECT revision,iv,ciphertext FROM notebooks WHERE player=$1",[player]);d.send(res,rows.rows[0]||{revision:0});return true;
    }
    if(path==="/notebook" && req.method==="PUT") {
      const r=z.object({revision:z.number().int().nonnegative(),iv:z.string().regex(/^[A-Za-z0-9_-]{16}$/),ciphertext:z.string().min(22).max(60000).regex(/^[A-Za-z0-9_-]+$/)}).parse(await d.readBody(req));
      const result = r.revision===0
        ? await pool.query("INSERT INTO notebooks(player,revision,iv,ciphertext) VALUES($1,1,$2,$3) ON CONFLICT DO NOTHING RETURNING revision",[player,r.iv,r.ciphertext])
        : await pool.query("UPDATE notebooks SET revision=revision+1,iv=$3,ciphertext=$4,updated_at=now() WHERE player=$1 AND revision=$2 RETURNING revision",[player,r.revision,r.iv,r.ciphertext]);
      if(!result.rowCount){d.send(res,{error:"Notebook changed on another device. Keep your edits and reload before saving.",conflict:true},409);return true;}
      d.send(res,result.rows[0]);return true;
    }
    if(path==="/blocks" && req.method==="GET") {d.send(res,{blocked:(await pool.query("SELECT blocked FROM player_blocks WHERE player=$1",[player])).rows.map(r=>r.blocked)});return true;}
    if(path==="/blocks" && ["POST","DELETE"].includes(req.method!)) {
      const blocked=address.parse((await d.readBody(req)).player);if(blocked===player)throw new Error("Choose another player");
      if(req.method==="POST")await pool.query("INSERT INTO player_blocks VALUES($1,$2) ON CONFLICT DO NOTHING",[player,blocked]);
      else await pool.query("DELETE FROM player_blocks WHERE player=$1 AND blocked=$2",[player,blocked]);
      d.send(res,{ok:true});return true;
    }
    if(path==="/challenges" && req.method==="POST") {
      limit(`invite:${player}`,5,600);
      if(Number((await pool.query("SELECT count(*) FROM challenges WHERE creator=$1 AND created_at>now()-interval '10 minutes'",[player])).rows[0].count)>=5)throw new Error("Five invitations per ten minutes. Please wait.");
      const r=z.object({recipient:address.nullable(),mode:z.number().int().min(0).max(1),ranked:z.boolean()}).parse(await d.readBody(req));
      if(r.recipient===player)throw new Error("Choose another player");
      if(r.recipient && (await pool.query("SELECT 1 FROM player_blocks WHERE (player=$1 AND blocked=$2) OR (player=$2 AND blocked=$1)",[player,r.recipient])).rowCount)throw new Error("Invitations unavailable for this player");
      const challenge=id();
      await pool.query("INSERT INTO challenges(id,creator,recipient,mode,ranked,expires) VALUES($1,$2,$3,$4,$5,$6)",[challenge,player,r.recipient,r.mode,r.ranked,now()+600]);
      d.send(res,{id:challenge,creator:player,...r,status:"pending",expires:now()+600});return true;
    }
    if(path==="/challenges" && req.method==="GET") {
      const rows=await pool.query(`SELECT c.*,r.ticket_a,r.ticket_b,r.player_a,r.player_b,r.match_id,r.job_id,r.expires AS room_expires FROM challenges c LEFT JOIN rooms r ON r.id=c.room_id
        WHERE (c.creator=$1 OR c.recipient=$1) AND c.created_at>now()-interval '1 day'
        ORDER BY c.created_at DESC LIMIT 50`,[player]);
      d.send(res,{challenges:rows.rows.map(c=>({...c,status:c.status==="pending"&&Number(c.expires)<=now()?"expired":c.status}))});return true;
    }
    const match=/^\/challenges\/(0x[\da-f]{64})(?:\/(accept|decline|cancel))?$/.exec(path);
    if(match && req.method==="GET" && !match[2]) {
      const c=(await pool.query("SELECT * FROM challenges WHERE id=$1",[match[1]])).rows[0];
      if(!c || c.recipient && c.creator!==player && c.recipient!==player)throw new Error("Invitation not available for this account");
      d.send(res,{...c,status:c.status==="pending"&&Number(c.expires)<=now()?"expired":c.status});return true;
    }
    if(match && req.method==="POST" && match[2]) {
      await d.serialize(async()=>{
        const db=await pool.connect();
        try {
          await db.query("BEGIN");await db.query("SELECT pg_advisory_xact_lock(701338)");
          const c=(await db.query("SELECT * FROM challenges WHERE id=$1 FOR UPDATE",[match[1]])).rows[0];
          if(!c || c.recipient && ![c.creator,c.recipient].includes(player))throw new Error("Invitation unavailable");
          if(match[2]==="accept" && c.status==="accepted" && c.recipient===player){await db.query("COMMIT");d.send(res,c);return;}
          if(c.status!=="pending" || Number(c.expires)<=now())throw new Error("Invitation expired or already answered");
          if(match[2]==="accept") {
            if(c.creator===player)throw new Error("The opponent must accept this invitation");
            if((await db.query("SELECT 1 FROM player_blocks WHERE (player=$1 AND blocked=$2) OR (player=$2 AND blocked=$1)",[player,c.creator])).rowCount)throw new Error("Invitations unavailable for this player");
            await d.assertAvailable([c.creator,player]);
            const active=await db.query("SELECT 1 FROM rooms WHERE expires>$3 AND match_id IS NULL AND (player_a IN ($1,$2) OR player_b IN ($1,$2))",[c.creator,player,now()]);
            if(active.rowCount)throw new Error("A player is already preparing another match");
            const room=id(),aTicket=id(),bTicket=id();
            await db.query("INSERT INTO rooms(id,player_a,player_b,tournament_id,expires,ticket_a,ticket_b,mode,ranked,rules_version,deployment) VALUES($1,$2,$3,'0',$4,$5,$6,$7,$8,2,'v2')",[room,c.creator,player,now()+180,aTicket,bTicket,c.mode,c.ranked]);
            await db.query("DELETE FROM queue_players WHERE player IN ($1,$2)",[c.creator,player]);
            await db.query("UPDATE challenges SET status='accepted',recipient=$2,room_id=$3 WHERE id=$1",[c.id,player,room]);
            await db.query("COMMIT");d.send(res,{...c,status:"accepted",recipient:player,room_id:room,ticket:bTicket});return;
          }
          if(match[2]==="cancel" && c.creator!==player || match[2]==="decline" && (c.creator===player || !c.recipient))throw new Error("Invitation action denied");
          const status=match[2]==="cancel"?"cancelled":"declined";
          await db.query("UPDATE challenges SET status=$2 WHERE id=$1",[c.id,status]);
          await db.query("COMMIT");d.send(res,{...c,status});
        }catch(e){await db.query("ROLLBACK");throw e;}finally{db.release();}
      });return true;
    }
    throw new Error("Unknown app action");
  };
}
