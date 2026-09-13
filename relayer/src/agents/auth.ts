import {randomBytes,randomUUID,createHash} from 'node:crypto';
import type {IncomingMessage} from 'node:http';
import type {Pool} from 'pg';
import {recoverMessageAddress,recoverTypedDataAddress,toFunctionSelector,parseAbi,type Abi,type Address,type Hex,type PublicClient} from 'viem';
import {sessionGrantTypedData,type SessionGrant} from '@interludelayer-sdk/sdk';
import {z} from 'zod';
import {agentActions,agentAuthMessage,type AgentManifest} from '../../../shared/agents';
const address=z.string().regex(/^0x[\da-fA-F]{40}$/).transform(s=>s.toLowerCase() as Address);
const proof=z.string().regex(/^0x[\da-fA-F]{130}$/);
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const authSchema=z.object({player:address,nonce:z.string().uuid(),signature:proof,grantSignature:proof,
 grant:z.object({granter:address,sessionKey:address,expiry:z.coerce.bigint(),epoch:z.coerce.bigint(),anyFunction:z.literal(false),selectors:z.array(z.string().regex(/^0x[\da-f]{8}$/)).length(5)})});
export function createAgentAuth(db:Pool,base:PublicClient,m:AgentManifest,abi:Abi,readBinding?:(key:Address)=>Promise<bigint>){
 const app=m.app.toLowerCase();
 const allowed=new Set(abi.filter(x=>x.type==='function'&&(agentActions as readonly string[]).includes(x.name)).map(x=>toFunctionSelector(x as any)));
 const epochAbi=parseAbi(['function sessionEpochOf(address) view returns(uint256)']);
 const revocations=new Map<string,{at:number;value:bigint}>();
 const bindings=new Map<string,{at:number;revoked:boolean}>();
 async function assertKey(key:Address){
  if(!readBinding)return;let value=bindings.get(key);
  if(!value||Date.now()-value.at>=10000){const binding=await readBinding(key);value={at:Date.now(),revoked:binding!==0n&&binding>>160n===0n};bindings.set(key,value);if(bindings.size>2000)bindings.delete(bindings.keys().next().value!);}
  if(value.revoked)throw Object.assign(Error('Arcade session revoked'),{status:401,code:'AGENT_SESSION_REVOKED'});
 }
 async function epoch(player:Address){
  const recent=revocations.get(player);if(recent&&Date.now()-recent.at<10000)return recent.value;
  const value=await base.readContract({address:m.hub,abi:epochAbi,functionName:'sessionEpochOf',args:[player]});
  revocations.set(player,{at:Date.now(),value});if(revocations.size>2000)revocations.delete(revocations.keys().next().value!);return value;
 }
 return {
  async challenge(body:unknown){const {player}=z.object({player:address}).parse(body);const nonce=randomUUID(),expires=Math.floor(Date.now()/1000)+300;
   await db.query('INSERT INTO agent_arcade.auth_nonces VALUES($1,$2,$3,$4)',[nonce,app,player,expires]);return {nonce,expires,message:agentAuthMessage(player,nonce,expires,app)};
  },
  async session(body:unknown){
   const r=authSchema.parse(body),grant=r.grant as SessionGrant,now=Math.floor(Date.now()/1000);
   const challenge=(await db.query('SELECT expires FROM agent_arcade.auth_nonces WHERE app=$1 AND player=$2 AND nonce=$3 AND expires>$4',[app,r.player,r.nonce,now])).rows[0];
   if(!challenge||grant.granter!==r.player||grant.expiry<=BigInt(now)||grant.expiry>BigInt(now+7200)||new Set(grant.selectors).size!==5||grant.selectors.some(x=>!allowed.has(x)))throw Object.assign(Error('Invalid Agent Arcade authorization'),{status:401,code:'AGENT_AUTH_INVALID'});
   const [owner,key,revocation]=await Promise.all([
    recoverTypedDataAddress({...sessionGrantTypedData(grant,{app:m.app,baseChainId:10143}),signature:r.grantSignature as Hex}),
    recoverMessageAddress({message:agentAuthMessage(r.player,r.nonce,Number(challenge.expires),app),signature:r.signature as Hex}),epoch(r.player)]);
   if(owner.toLowerCase()!==r.player||key.toLowerCase()!==grant.sessionKey||revocation!==grant.epoch)throw Object.assign(Error('Agent Arcade authorization was revoked or mismatched'),{status:401,code:'AGENT_AUTH_INVALID'});
   await assertKey(grant.sessionKey);
   const token=randomBytes(32).toString('hex'),connection=await db.connect();
   try{await connection.query('BEGIN');const removed=await connection.query('DELETE FROM agent_arcade.auth_nonces WHERE nonce=$1 RETURNING nonce',[r.nonce]);
    if(!removed.rowCount)throw Object.assign(Error('Authentication already used'),{status:401,code:'AGENT_AUTH_REPLAY'});
    await connection.query('INSERT INTO agent_arcade.sessions VALUES($1,$2,$3,$4,$5,$6)',[hash(token),app,r.player,grant.sessionKey,String(grant.expiry),String(grant.epoch)]);
    await connection.query(`INSERT INTO agent_arcade.presence(app,player,connections) VALUES($1,$2,1) ON CONFLICT(app,player) DO UPDATE SET connections=agent_arcade.presence.connections+1,seen=now()`,[app,r.player]);
    await connection.query('COMMIT');
   }catch(e){await connection.query('ROLLBACK');throw e;}finally{connection.release();}
   return {token,player:r.player,expires:String(grant.expiry)};
  },
  async require(req:IncomingMessage){
   const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token||!/^\w{64}$/.test(token))throw Object.assign(new Error('Connect to Agent Arcade'),{status:401});
   const session=(await db.query('SELECT * FROM agent_arcade.sessions WHERE token_hash=$1 AND app=$2 AND expiry>$3',[hash(token),app,Math.floor(Date.now()/1000)])).rows[0];
   if(!session)throw Object.assign(new Error('Renew arcade session'),{status:401,code:'AGENT_SESSION_EXPIRED'});
   // An RPC failure does not delete this authorization or its local key.
   if(await epoch(session.player)!==BigInt(session.epoch))throw Object.assign(new Error('Arcade session revoked'),{status:401,code:'AGENT_SESSION_REVOKED'});
   await assertKey(session.session_key);
   return {player:session.player as Address,tokenHash:hash(token)};
  },
 };
}
