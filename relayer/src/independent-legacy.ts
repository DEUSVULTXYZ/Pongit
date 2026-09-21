import type {Pool} from 'pg';

/** Historical account data remains in its original database after arena cutover. */
export function independentLegacy(db:Pool){
 return {
  contacts:async(player:string)=>(await db.query('SELECT contact FROM il_contacts WHERE player=$1 ORDER BY contact',[player.toLowerCase()])).rows.map(r=>r.contact),
  results:async(player:string)=>(await db.query("SELECT a,b,extract(epoch FROM ended_at)::bigint AS at FROM il_results WHERE verified AND phase=3 AND ended_at>now()-interval '30 days' AND (lower(a)=$1 OR lower(b)=$1)",[player.toLowerCase()])).rows,
 };
}
