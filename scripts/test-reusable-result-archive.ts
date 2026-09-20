// Real disposable PostgreSQL, synthetic contract logs. No hosted-game claim.
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {encodeAbiParameters,keccak256,zeroHash,type Hex} from 'viem';
import {initializeReusableResultArchive,createReusableResultArchive} from '../relayer/src/reusable-result-archive';
import {reusableResults,reusableSlotResult} from '../shared/reusable-results';
import {resultFixture} from '../tests/fixtures/reusable-result';

assert.equal(process.env.PONG_RESULT_ARCHIVE_DB_TEST,'isolated-disposable');
const url=new URL(process.env.POOL_TEST_DATABASE_URL!);assert.equal(url.hostname,'pongit-result-archive-test-db');assert.equal(url.pathname,'/result_archive_test');
const db=new Pool({connectionString:url.toString(),max:8}),cases:string[]=[];
try{
 await initializeReusableResultArchive(db);await initializeReusableResultArchive(db);
 const fixture=resultFixture(),[r]=reusableResults(fixture.abi,fixture.ref.arena,15,fixture.frame),archive=createReusableResultArchive(db);
 await Promise.all(Array.from({length:8},()=>archive.store([r])));
 assert.equal((await db.query('SELECT count(*) FROM il_reusable_results')).rows[0].count,'1');
 assert.equal((await archive.proof(r,{root:r.root,count:1},r.matchId)).canonical,r.canonical);
 cases.push('concurrent idempotent archive, exact canonical proof after restart');
 await assert.rejects(archive.store([{...r,canonical:'0x00'}]),/Invalid compact/);
 await assert.rejects(archive.proof(r,{root:zeroHash,count:1},r.matchId),/differs/);
 await assert.rejects(archive.proof({...r,epoch:r.epoch+1n},{root:r.root,count:1},r.matchId),/gap/);
 cases.push('altered content, epoch and noncanonical root rejected');
 // A valid conflicting first result has a different leaf/root. Both must stay
 // archived, including after a publication correction, not be overwritten.
 const other=resultFixture(15,r.arena,r.matchId+1n,r.epoch),[replacement]=reusableResults(other.abi,r.arena,15,other.frame);
 await archive.store([replacement]);await assert.rejects(archive.proof(r,{root:r.root,count:1},r.matchId),/canonical selection/);
 const retained=await archive.proof(r,{root:r.root,count:1},r.matchId,[r.leaf]);assert.equal(retained.canonical,r.canonical);
 const corrected=await archive.proof(r,{root:replacement.root,count:1},replacement.matchId,[replacement.leaf]);assert.equal(corrected.canonical,replacement.canonical);
 assert.equal((await db.query('SELECT count(*) FROM il_reusable_results')).rows[0].count,'2');
 cases.push('competing histories retained; exact published selection required');
 // Store both entries in one receipt. Failure after the first insert must roll
 // the entire receipt back, leaving a nonce owner able to retry it intact.
 await db.query(`CREATE FUNCTION reject_archive_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.match_id=93 THEN RAISE EXCEPTION 'injected archive failure'; END IF; RETURN NEW; END $$`);
 await db.query('CREATE TRIGGER fail_archive BEFORE INSERT ON il_reusable_results FOR EACH ROW EXECUTE FUNCTION reject_archive_test()');
 const newEpoch=resultFixture(15,r.arena,92n,r.epoch+1n),bad=resultFixture(15,r.arena,93n,r.epoch+1n);
 const one=reusableResults(newEpoch.abi,r.arena,15,newEpoch.frame)[0],two=reusableResults(bad.abi,r.arena,15,bad.frame)[0];
 await assert.rejects(archive.store([one,two]),/injected archive failure/);
 assert.equal((await db.query('SELECT count(*) FROM il_reusable_results WHERE epoch=$1',[String(r.epoch+1n)])).rows[0].count,'0');
 await db.query('DROP TRIGGER fail_archive ON il_reusable_results');await archive.store([one]);
 assert.equal((await createReusableResultArchive(db).proof(one,{root:one.root,count:1},one.matchId)).canonical,one.canonical);
 cases.push('atomic receipt rollback, restart and exact retry');
 // A node may have further unpublished results. A shorter authoritative root
 // still produces the historical proof and cannot expose that later result.
 await assert.rejects(archive.proof(one,{root:one.root,count:2},one.matchId),/gap/);
 const pair=(a:Hex,b:Hex)=>keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'}],[a,b]));
 let root=pair(one.leaf,two.leaf),empty=pair(zeroHash,zeroHash);
 for(let level=1;level<16;level++){root=pair(root,empty);empty=pair(empty,empty);}
 await archive.store([{...two,index:1,root}]);
 assert.equal((await archive.proof(one,{root:one.root,count:1},one.matchId)).canonical,one.canonical);
 await assert.rejects(archive.proof(one,{root:one.root,count:1},two.matchId),/absent/);
 assert.equal((await archive.proof(one,{root,count:2},one.matchId)).siblings[0],two.leaf);
 assert.equal((await archive.proof(one,{root,count:2},two.matchId)).siblings[0],one.leaf);
 cases.push('later results do not replace older published proofs; both remain provable after reuse');
 const disconnected=resultFixture(15,r.arena,94n,r.epoch+2n);
 const slot=reusableSlotResult(disconnected.abi,disconnected.ref,15,94n,disconnected.ticketHash,1n,disconnected.result,[disconnected.ref.epoch,1,disconnected.root]);
 await Promise.all([archive.storeSlot(slot),archive.storeSlot(slot)]);
 assert.equal((await archive.proof(slot,{count:1,root:slot.root},slot.matchId)).canonical,slot.canonical);
 assert.equal((await db.query('SELECT count(*) FROM il_reusable_results WHERE epoch=$1',[String(slot.epoch)])).rows[0].count,'0');
 await archive.store(reusableResults(disconnected.abi,r.arena,15,disconnected.frame));
 assert.equal((await archive.proof(slot,{count:1,root:slot.root},slot.matchId)).canonical,slot.canonical);
 await db.query('UPDATE il_reusable_slot_results SET canonical=$1 WHERE epoch=$2',['0x00',String(slot.epoch)]);
 await assert.rejects(archive.proof(slot,{count:1,root:slot.root},slot.matchId),/no longer matches/);
 cases.push('disconnected terminal slot retained without fake receipt; receipt deduplicated and storage corruption rejected');
 console.log(JSON.stringify({at:new Date().toISOString(),kind:'isolated-postgresql-result-archive',passed:true,cases,hostedInterlude:false,productionChanged:false}));
}finally{await db.end();}
