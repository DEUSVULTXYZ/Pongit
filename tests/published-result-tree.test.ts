import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,keccak256,toHex,type Hex} from 'viem';
import {EMPTY_RESULT_ROOT,PublishedResultIndex,publishedResultLeaf,verifyPublishedResult} from '../shared/published-result-tree';
const zero=toHex(0,{size:32}),pair=(a:Hex,b:Hex)=>keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'}],[a,b]));
// Independent dense level construction used only by the fixture.
function dense(leaves:Hex[]){let nodes=leaves,empty=zero;for(let level=0;level<16;level++){const next:Hex[]=[];for(let i=0;i<Math.max(1,nodes.length);i+=2)next.push(pair(nodes[i]??empty,nodes[i+1]??empty));nodes=next;empty=pair(empty,empty);}return nodes[0];}
const ref={chainId:10143n,arena:'0x1111111111111111111111111111111111111111',epoch:7n} as const;
const leaf=(id:number)=>publishedResultLeaf(ref,BigInt(id),toHex(123,{size:32}),toHex(id,{size:32}));

test('fixed proof vector matches the independently compiled Solidity consumer',()=>{
 assert.equal(leaf(1),'0x4539959cb7342a6c4fc0cdcce1bb7000479e97c00df3e093eec4e79753798013');
 assert.equal(leaf(2),'0xe494af79a9c93028ff6b1ae7e6ebc176f9a9756bc1d3f38a23a241d8611554e7');
 assert.equal(dense([leaf(1),leaf(2)]),'0x5615732222ead24391252c04d4851b3464d5257999892fd4d69ab9ed15cbf25b');
});
test('ordered historical proofs agree with independent dense prefixes',()=>{
 const index=new PublishedResultIndex(),leaves:Hex[]=[];assert.equal(index.root,EMPTY_RESULT_ROOT);
 for(let i=0;i<65;i++){leaves.push(leaf(i+1));index.append(i,leaves[i],dense(leaves));const published={root:index.root,count:index.count};
  for(const at of new Set([0,Math.floor(i/2),i]))assert(verifyPublishedResult(published,at,leaves[at],index.proof(at,published)));
 }
});
test('wrong identity, ticket, result, sibling order and unpublished padding are rejected',()=>{
 const a=leaf(1),b=leaf(2),index=new PublishedResultIndex();index.append(0,a,dense([a]));index.append(1,b,dense([a,b]));
 const pub={root:index.root,count:2},proof=index.proof(0,pub);
 for(const bad of [leaf(3),publishedResultLeaf({...ref,epoch:8n},1n,toHex(123,{size:32}),toHex(1,{size:32})),publishedResultLeaf(ref,1n,toHex(124,{size:32}),toHex(1,{size:32}))])assert(!verifyPublishedResult(pub,0,bad,proof));
 assert(!verifyPublishedResult(pub,1,a,proof));assert(!verifyPublishedResult(pub,2,zero,proof));assert(!verifyPublishedResult(pub,0,a,proof.slice(1)));
 assert.throws(()=>publishedResultLeaf({...ref,chainId:1n},1n,zero,zero));
});
test('failed log validation does not mutate the verified prefix; corrections need canonical root',()=>{
 const index=new PublishedResultIndex(),a=leaf(1),b=leaf(2),c=leaf(3),first=dense([a]);index.append(0,a,first);
 assert.throws(()=>index.append(1,b,first),/root mismatch/);assert.equal(index.root,first);assert.equal(index.count,1);
 assert.throws(()=>index.append(2,b,dense([a,b])),/gap/);index.append(1,b,dense([a,b]));
 assert.throws(()=>index.proof(0,{root:first,count:1}),/differs/);
 assert.throws(()=>index.rewind({root:dense([c]),count:1}),/replacement/);assert.equal(index.count,2);
 index.rewind({root:first,count:1});index.append(1,c,dense([a,c]));assert(!verifyPublishedResult({root:index.root,count:2},1,b,index.proof(1,{root:index.root,count:2})));
 index.rewind({root:EMPTY_RESULT_ROOT,count:0});assert.equal(index.count,0);assert.throws(()=>index.proof(0,{root:index.root,count:0}),/Unpublished/);
});
