import {encodeAbiParameters,keccak256,stringToHex,isAddress,type Address,type Hex} from 'viem';

export const RESULT_TREE_DEPTH=16,RESULT_TREE_CAPACITY=2**RESULT_TREE_DEPTH;
const zero=('0x'+'00'.repeat(32)) as Hex;
const word=(value:Hex)=>{if(!/^0x[0-9a-f]{64}$/i.test(value))throw Error('Invalid result hash');return value.toLowerCase() as Hex;};
const pair=(a:Hex,b:Hex)=>keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'}],[a,b]));
const empty:Hex[]=[zero];for(let i=0;i<RESULT_TREE_DEPTH;i++)empty.push(pair(empty[i],empty[i]));
export const EMPTY_RESULT_ROOT=empty[RESULT_TREE_DEPTH];
export type ResultEpoch={chainId:bigint;arena:Address;epoch:bigint};
export type PublishedCommitment={root:Hex;count:number};

/** An exact match to PublishedResultTree.resultLeaf. This encodes a claim;
 * only the authoritative published root and issued Monad ticket verify it. */
export function publishedResultLeaf(ref:ResultEpoch,matchId:bigint,ticketHash:Hex,canonicalResultHash:Hex):Hex{
 if(ref.chainId!==10143n||ref.epoch<=0n||matchId<=0n||!isAddress(ref.arena)||/^0x0{40}$/i.test(ref.arena))throw Error('Invalid result reference');
 const ticket=word(ticketHash),result=word(canonicalResultHash);if(ticket===zero||result===zero)throw Error('Empty result');
 return keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'},{type:'address'},{type:'uint256'},{type:'uint256'},{type:'bytes32'}],
  [keccak256(stringToHex('PONGIT_PUBLISHED_RESULT_V1')),ref.chainId,ref.arena,ref.epoch,matchId,pair(ticket,result)]));
}
export function verifyPublishedResult(commitment:PublishedCommitment,index:number,leaf:Hex,siblings:readonly Hex[]):boolean{
 if(!Number.isInteger(commitment.count)||commitment.count<=0||commitment.count>RESULT_TREE_CAPACITY
  ||!Number.isInteger(index)||index<0||index>=commitment.count||siblings.length!==RESULT_TREE_DEPTH)return false;
 try{
  let node=word(leaf);if(node===zero)return false;
  for(let level=0;level<RESULT_TREE_DEPTH;level++)node=((index>>level)&1)===0?pair(node,word(siblings[level])):pair(word(siblings[level]),node);
  return node===word(commitment.root);
 }catch{return false;}
}

/** Reconstruct from ordered result logs, never from frames or caller roots.
 * The caller must read the canonical Monad commitment before exposing a proof.
 * A reorg rewinds to a verified prefix and then replays replacement logs. */
export class PublishedResultIndex {
 private levels:Array<Map<number,Hex>>=Array.from({length:RESULT_TREE_DEPTH+1},()=>new Map());
 private leaves:Hex[]=[];
 get count(){return this.leaves.length;}
 get root(){return this.levels[RESULT_TREE_DEPTH].get(0)??EMPTY_RESULT_ROOT;}
 private appendUnchecked(leaf:Hex){
  let index=this.leaves.length;this.leaves.push(leaf);this.levels[0].set(index,leaf);
  for(let level=0;level<RESULT_TREE_DEPTH;level++){
   const left=index&~1;const parent=pair(this.levels[level].get(left)??empty[level],this.levels[level].get(left+1)??empty[level]);
   index>>=1;this.levels[level+1].set(index,parent);
  }
 }
 append(index:number,leaf:Hex,emittedRoot:Hex){
  if(index!==this.count||this.count>=RESULT_TREE_CAPACITY)throw Error('Result log gap, duplicate or full epoch');
  leaf=word(leaf);if(leaf===zero)throw Error('Empty result leaf');
  // Compute the prospective root before changing the index. A malformed log
  // cannot poison the last verified prefix or be treated as a missing result.
  let node=leaf;
  for(let level=0;level<RESULT_TREE_DEPTH;level++){
   const at=index>>level,sibling=this.levels[level].get(at^1)??empty[level];
   node=(at&1)===0?pair(node,sibling):pair(sibling,node);
  }
  if(node!==word(emittedRoot))throw Error('Result log root mismatch');this.appendUnchecked(leaf);
 }
 proof(index:number,published:PublishedCommitment):Hex[]{
  if(published.count!==this.count||word(published.root)!==this.root)throw Error('Published commitment differs from indexed logs');
  if(!Number.isInteger(index)||index<0||index>=this.count)throw Error('Unpublished result index');
  return Array.from({length:RESULT_TREE_DEPTH},(_,level)=>this.levels[level].get((index>>level)^1)??empty[level]);
 }
 rewind(published:PublishedCommitment){
  if(!Number.isInteger(published.count)||published.count<0||published.count>this.count)throw Error('Missing canonical prefix');
  const replacement=new PublishedResultIndex();for(const leaf of this.leaves.slice(0,published.count))replacement.appendUnchecked(leaf);
  if(replacement.root!==word(published.root))throw Error('Reorg requires replacement logs, not this prefix');
  this.levels=replacement.levels;this.leaves=replacement.leaves;
 }
}
