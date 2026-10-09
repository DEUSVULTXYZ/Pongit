import {encodeAbiParameters,keccak256,type Address,type Hex} from 'viem';
import type {Pool} from 'pg';
import type {ScopedWriter,SponsoredCall} from '../../shared/scoped-writer';

export type SponsorRow={id:string;target:Address;data:Hex;value:string;priority:number;status:string;hash?:Hex};
export type SponsorDispatch=SponsorRow&{members?:string[];estimates?:readonly SponsoredCall[]};
const bundleId=(members:string[],call:SponsoredCall)=>'bundle:'+keccak256(encodeAbiParameters(
 [{type:'string[]'},{type:'address'},{type:'bytes'},{type:'uint256'}],[members,call.to,call.data,call.value]));

/** Durable composition metadata lives with the immutable original operations.
 * The existing operator journal remains the sole signed/nonce authority. An
 * unsigned group can be dissolved; a journalled group must only reconcile. */
export async function sponsorBundles(db:Pool,scope:ScopedWriter,check:(to:Address,data:Hex,value:bigint)=>Promise<void>){
 if(!scope.bundle)throw Error('Sponsor bundle policy missing');
 await db.query(`CREATE TABLE IF NOT EXISTS independent_operation_batches(
 id text PRIMARY KEY,target text NOT NULL,data text NOT NULL,value text NOT NULL,members text[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now());`);
 const compose=async(rows:SponsorRow[])=>{
  for(const row of rows)await check(row.target,row.data,BigInt(row.value));
  return scope.bundle!(rows.map(row=>({to:row.target,data:row.data,value:BigInt(row.value)})));
 };
 async function resolve(id:string):Promise<SponsorDispatch|null>{
  if(!id.startsWith('bundle:'))return null;
  const record=(await db.query('SELECT * FROM independent_operation_batches WHERE id=$1',[id])).rows[0];if(!record)throw Error('Journalled sponsor bundle is missing');
  const members=record.members as string[];
  if(!Array.isArray(members)||members.length<2||members.length>4||new Set(members).size!==members.length)throw Error('Invalid sponsor bundle members');
  const rows=(await db.query('SELECT * FROM independent_operations WHERE id=ANY($1::text[]) ORDER BY array_position($1::text[],id)',[members])).rows as SponsorRow[];
  if(rows.length!==members.length||rows.some((r,i)=>r.id!==members[i]))throw Error('Sponsor bundle membership differs');
  const composed=await compose(rows);
  if(!composed||bundleId(members,composed.call)!==id||record.target!==composed.call.to.toLowerCase()
   ||record.data!==composed.call.data||record.value!==String(composed.call.value))throw Error('Sponsor bundle payload differs');
  return{id,target:record.target,data:record.data,value:record.value,priority:rows[0].priority,status:'queued',members,estimates:composed.estimates};
 }
 return{
  resolve,
  async next(){
   const record=(await db.query("SELECT b.id FROM independent_operation_batches b WHERE EXISTS (SELECT 1 FROM independent_operations o WHERE o.id=ANY(b.members) AND o.status IN ('queued','pending')) ORDER BY b.created_at LIMIT 1")).rows[0];
   return record?resolve(record.id):null;
  },
  async create(rows:SponsorRow[]):Promise<SponsorDispatch|null>{
   const composed=await compose(rows);if(!composed)return null;
   const members=rows.map(r=>r.id),id=bundleId(members,composed.call);
   await db.query('INSERT INTO independent_operation_batches(id,target,data,value,members) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',
    [id,composed.call.to.toLowerCase(),composed.call.data,String(composed.call.value),members]);
   return resolve(id);
  },
  async update(row:SponsorDispatch,status:string,hash:Hex){
   if(!row.members)throw Error('Missing sponsor bundle members');
   await db.query("UPDATE independent_operations SET status=$2,hash=$3,error=$4,updated_at=now() WHERE id=ANY($1::text[]) AND status IN ('queued','pending')",
    [row.members,status,hash,status==='failed'?'Transaction reverted. Reload the contract state before retrying.':null]);
  },
  // Caller holds the sole signer lock and has verified the group has no job.
  async discardUnsigned(row:SponsorDispatch){await db.query('DELETE FROM independent_operation_batches WHERE id=$1',[row.id]);},
  async unresolved(ids:string[]){return(await db.query('SELECT id FROM independent_operation_batches WHERE members && $1::text[]',[ids])).rows.map(r=>r.id) as string[];},
 };
}
