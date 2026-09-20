import type {Pool} from 'pg';
import {keccak256,type Hex} from 'viem';
import {PublishedResultIndex,publishedResultLeaf,RESULT_TREE_CAPACITY,type ResultEpoch,type PublishedCommitment} from '../../shared/published-result-tree';
import type {ReusableResultCandidate,ReusableSlotResult} from '../../shared/reusable-results';

/** Public compact results only. An observation is never a publication verdict.
 * Keep competing histories, including challenged ones, instead of overwriting
 * them when an engine or canonical chain is reorganized. */
export async function initializeReusableResultArchive(db:Pick<Pool,'query'>){
 await db.query(`CREATE TABLE IF NOT EXISTS il_reusable_results (
  chain_id numeric(78,0) NOT NULL,app text NOT NULL,epoch numeric(78,0) NOT NULL,
  position integer NOT NULL CHECK(position>=0 AND position<65536),leaf text NOT NULL,root text NOT NULL,
  match_id numeric(78,0) NOT NULL,rules integer NOT NULL CHECK(rules IN (14,15)),
  ticket_hash text NOT NULL,result_hash text NOT NULL,canonical text NOT NULL,
  transaction_hash text NOT NULL,observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(chain_id,app,epoch,position,leaf,root,transaction_hash));
 CREATE INDEX IF NOT EXISTS reusable_result_match ON il_reusable_results(chain_id,app,epoch,match_id);
 CREATE TABLE IF NOT EXISTS il_reusable_slot_results (
  chain_id numeric(78,0) NOT NULL,app text NOT NULL,epoch numeric(78,0) NOT NULL,
  position integer NOT NULL CHECK(position>=0 AND position<65536),leaf text NOT NULL,root text NOT NULL,
  match_id numeric(78,0) NOT NULL,rules integer NOT NULL CHECK(rules IN (14,15)),
  ticket_hash text NOT NULL,result_hash text NOT NULL,canonical text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(chain_id,app,epoch,position,leaf,root));`);
}
function validate(c:ReusableSlotResult){
 if(![14,15].includes(c.rules)||!Number.isInteger(c.index)||c.index<0||c.index>=RESULT_TREE_CAPACITY
  ||!/^0x[0-9a-f]{64}$/i.test(c.root)
  ||!/^0x(?:[0-9a-f]{2}){1,4096}$/i.test(c.canonical)||keccak256(c.canonical)!==c.resultHash
  ||publishedResultLeaf(c,c.matchId,c.ticketHash,c.resultHash)!==c.leaf)throw Error('Invalid compact result archive entry');
}
export function createReusableResultArchive(db:Pool){
 async function store(results:readonly ReusableResultCandidate[]){
  if(!results.length)return;if(results.length>32)throw Error('Too many results in one receipt');
  for(const result of results){validate(result);if(!/^0x[0-9a-f]{64}$/i.test(result.transactionHash))throw Error('Invalid receipt identity');}
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   for(const r of results){
    const args=[String(r.chainId),r.arena.toLowerCase(),String(r.epoch),r.index,r.leaf,r.root,String(r.matchId),r.rules,
     r.ticketHash,r.resultHash,r.canonical,r.transactionHash];
    const inserted=await client.query(`INSERT INTO il_reusable_results(chain_id,app,epoch,position,leaf,root,match_id,rules,
     ticket_hash,result_hash,canonical,transaction_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT DO NOTHING RETURNING leaf`,args);
    if(!inserted.rowCount){
     const old=(await client.query(`SELECT match_id,rules,ticket_hash,result_hash,canonical FROM il_reusable_results
      WHERE chain_id=$1 AND app=$2 AND epoch=$3 AND position=$4 AND leaf=$5 AND root=$6 AND transaction_hash=$7`,args.slice(0,6).concat(r.transactionHash))).rows[0];
     if(!old||old.match_id!==String(r.matchId)||old.rules!==r.rules||old.ticket_hash!==r.ticketHash
       ||old.result_hash!==r.resultHash||old.canonical!==r.canonical)throw Error('Result archive identity conflict');
    }
   }
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async function storeSlot(r:ReusableSlotResult){
  validate(r);
  const args=[String(r.chainId),r.arena.toLowerCase(),String(r.epoch),r.index,r.leaf,r.root,String(r.matchId),r.rules,
   r.ticketHash,r.resultHash,r.canonical];
  const inserted=await db.query(`INSERT INTO il_reusable_slot_results(chain_id,app,epoch,position,leaf,root,match_id,rules,
   ticket_hash,result_hash,canonical) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING RETURNING leaf`,args);
  if(!inserted.rowCount){
   const old=(await db.query(`SELECT match_id,rules,ticket_hash,result_hash,canonical FROM il_reusable_slot_results
    WHERE chain_id=$1 AND app=$2 AND epoch=$3 AND position=$4 AND leaf=$5 AND root=$6`,args.slice(0,6))).rows[0];
   if(!old||old.match_id!==String(r.matchId)||old.rules!==r.rules||old.ticket_hash!==r.ticketHash
    ||old.result_hash!==r.resultHash||old.canonical!==r.canonical)throw Error('Result slot archive identity conflict');
  }
 }
 async function proof(ref:ResultEpoch,published:PublishedCommitment,matchId:bigint,selectedLeaves?:readonly Hex[]){
  if(ref.chainId!==10143n||ref.epoch<=0n||!Number.isInteger(published.count)||published.count<1||published.count>RESULT_TREE_CAPACITY)
   throw Error('Invalid published result commitment');
  if(selectedLeaves&&selectedLeaves.length!==published.count)throw Error('Canonical selection must cover the published prefix');
  // Read only the published prefix, even if the node has already finished more
  // games. Reading a supplied root is the consumer's on-chain responsibility.
  const rows=(await db.query(`SELECT position,leaf,root,match_id,rules,ticket_hash,result_hash,canonical
   FROM il_reusable_results WHERE chain_id=$1 AND app=$2 AND epoch=$3 AND position<$4
   UNION SELECT position,leaf,root,match_id,rules,ticket_hash,result_hash,canonical
   FROM il_reusable_slot_results WHERE chain_id=$1 AND app=$2 AND epoch=$3 AND position<$4 ORDER BY position LIMIT 131073`,
   [String(ref.chainId),ref.arena.toLowerCase(),String(ref.epoch),published.count])).rows;
  if(rows.length>131072)throw Error('Too many competing result histories; canonical reconciliation required');
  const byIndex=new Map<number,any[]>();for(const r of rows){const group=byIndex.get(r.position)??[];group.push(r);byIndex.set(r.position,group);}
  const tree=new PublishedResultIndex();let target:any;
  for(let i=0;i<published.count;i++){
   const group=(byIndex.get(i)??[]).filter(r=>!selectedLeaves||r.leaf===selectedLeaves[i]);
   if(!group.length)throw Error('Result archive has a gap');
   for(const row of group)if(keccak256(row.canonical)!==row.result_hash
    ||publishedResultLeaf(ref,BigInt(row.match_id),row.ticket_hash,row.result_hash)!==row.leaf)
     throw Error('Archived result no longer matches its commitment');
   if(new Set(group.map(r=>r.leaf)).size!==1)throw Error('Competing results require canonical selection');
   let accepted:any;
   for(const row of group){try{tree.append(i,row.leaf,row.root);accepted=row;break;}catch{/* A retained alternative prefix may not fit. */}}
   if(!accepted)throw Error('Result archive prefix does not match its commitments');
   if(BigInt(accepted.match_id)===matchId){if(target)throw Error('Repeated match in result prefix');target=accepted;}
  }
  if(!target)throw Error('Match is absent from the published prefix');
  const siblings=tree.proof(target.position,published);
  return{...ref,matchId,rules:target.rules as 14|15,canonical:target.canonical as Hex,ticketHash:target.ticket_hash as Hex,
   resultHash:target.result_hash as Hex,index:target.position,leaf:target.leaf as Hex,siblings,root:published.root,count:published.count};
 }
 return{store,storeSlot,proof};
}
