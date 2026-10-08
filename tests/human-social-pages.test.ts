import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resumeSocialPages,type SocialAnchor,type SocialPageCache} from '../shared/human-social-pages';
const old:SocialAnchor={snapshotHash:'0x11',block:200n,hash:'0xaa',lobby:'0x123',family:'0x456',chainId:10143};
const current:SocialAnchor={...old,snapshotHash:'0x22',block:400n,hash:'0xbb'};
const cache:SocialPageCache={schema:'responsive-social-pages-v1',snapshotHash:old.snapshotHash,first:'100',next:'201',events:[{transactionHash:'0xab',blockHash:'0xac',blockNumber:'150',logIndex:0}]};
test('extends a canonical contiguous prefix without changing its next block or events',async()=>{
 const result=await resumeSocialPages(cache,current,100n,old,async n=>{assert.equal(n,200n);return old.hash;});
 assert.equal(result.next,'201');assert.deepEqual(result.events,cache.events);assert.equal(result.snapshotHash,current.snapshotHash);assert.equal(cache.snapshotHash,old.snapshotHash);
});
test('same-snapshot resume requires no prior snapshot',async()=>{
 assert.deepEqual(await resumeSocialPages(cache,old,100n,undefined,async()=>{throw Error('unneeded read');}),cache);
});
test('rejects extension without exact previous snapshot',async()=>{
 await assert.rejects(resumeSocialPages(cache,current,100n,undefined,async()=>old.hash));
 await assert.rejects(resumeSocialPages(cache,current,100n,{...old,snapshotHash:'0x33'},async()=>old.hash));
});
test('rejects reorganization and source/family/network changes',async()=>{
 await assert.rejects(resumeSocialPages(cache,current,100n,old,async()=>'0xcc'));
 for(const changed of [{lobby:'0x999'},{family:'0x999'},{chainId:1}])await assert.rejects(resumeSocialPages(cache,{...current,...changed},100n,old,async()=>old.hash));
});
test('rejects gaps beyond prior anchor, backwards snapshots and a changed prefix',async()=>{
 await assert.rejects(resumeSocialPages({...cache,next:'202'},current,100n,old,async()=>old.hash));
 await assert.rejects(resumeSocialPages(cache,{...current,block:199n},100n,old,async()=>old.hash));
 await assert.rejects(resumeSocialPages(cache,current,99n,old,async()=>old.hash));
});
test('rejects duplicate events and events outside the contiguous prefix',async()=>{
 await assert.rejects(resumeSocialPages({...cache,events:[...cache.events,...cache.events]},current,100n,old,async()=>old.hash));
 await assert.rejects(resumeSocialPages({...cache,events:[{...cache.events[0],blockNumber:'201'}]},current,100n,old,async()=>old.hash));
});
