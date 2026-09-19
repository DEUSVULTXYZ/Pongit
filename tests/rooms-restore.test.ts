import test from 'node:test';
import assert from 'node:assert/strict';
import {OrphanMatches,maintenanceTargets,reconcileContestedResult,restoreIntoLobby,type LiveMatch,type LobbyRestore,type LobbyState,type SavedOffer} from '../relayer/src/rooms-restore';
import type {LobbyOffer,LobbyRoom} from '../shared/rooms';

// The frozen match of 2026-09-18: cancelled on the halted node (phase 4 in
// il_results), live again on epoch 7's node from Monad's published state.
const id='15508105729549036396166434651117196823296587055133484651289937508406096101523';
const a='0x00000000000000000000000000000000000000aa',b='0x00000000000000000000000000000000000000bb';
const roomId=`0x${'77'.repeat(32)}`;
const offer=(over:Partial<LobbyOffer>={}):LobbyOffer=>({mode:1,id,room:roomId,a,b,ranked:true,expires:'1789760000',rules:'6',entropy:`0x${'01'.repeat(32)}`,signature:`0x${'11'.repeat(65)}`,accepted:[a,b],status:'cancelled',...over});
const saved:SavedOffer={room:roomId,offer:offer()};
const live=(phase=2n):LiveMatch=>({phase,a:a.toUpperCase().replace('0X','0x'),b});
const room=(over:Partial<LobbyRoom>={}):LobbyRoom=>({id:roomId,host:a,kind:'ranked',mode:1,members:[{player:a,joined:1,position:0,away:true,seen:1},{player:b,joined:1,position:1,away:true,seen:1}],offer:offer(),status:'waiting',created:1,activity:1,...over});
const row={id,room:roomId,ranked:true};

test('the room still exists: the match goes back into it, active, with both players',()=>{
 const s:LobbyState={rooms:{[roomId]:room()},queue:[{player:a}]};
 assert.deepEqual(restoreIntoLobby(s,saved,live(),5_000),{kind:'restored'});
 const r=s.rooms[roomId];
 assert.equal(r.offer?.status,'active');assert.equal(r.status,'playing');assert.equal(r.activity,5_000);
 assert(r.members.every(m=>!m.away));assert.deepEqual(s.queue,[],'the contract owns participation');
});

test('the room is gone (deleted 24 h after its last activity): it is recreated from the signed offer in il_offers',()=>{
 const s:LobbyState={rooms:{},queue:[]};
 assert.deepEqual(restoreIntoLobby(s,saved,live(),5_000),{kind:'recreated'});
 const r=s.rooms[roomId];
 assert.equal(r.id,roomId,'same id: the offer and il_result_pending refer to it');
 assert.equal(r.kind,'ranked');assert.equal(r.mode,1);assert.equal(r.host,a);
 assert.deepEqual(r.members.map(m=>m.player),[a,b]);
 assert.deepEqual(r.offer,{...saved.offer,status:'active'},'the exact signed offer, now active');
 assert.equal(r.status,'playing');
 // A submitted offer (phase 1) comes back as an offer.
 const offered:LobbyState={rooms:{},queue:[]};restoreIntoLobby(offered,saved,live(1n),5_000);
 assert.equal(offered.rooms[roomId].offer?.status,'submitted');assert.equal(offered.rooms[roomId].status,'offer');
 // The players leave any other room, whose unfinished offer to them is cancelled.
 const other:LobbyState={rooms:{other:{...room({id:'other',offer:offer({id:'9',room:'other',status:'offered'})})}},queue:[]};
 restoreIntoLobby(other,saved,live(),5_000);
 assert.deepEqual(other.rooms.other.members,[]);assert.equal(other.rooms.other.offer?.status,'cancelled');
});

test('refused, and the lobby untouched: another unfinished match in the room, too many members, or another match\'s offer',()=>{
 const busy:LobbyState={rooms:{[roomId]:room({offer:offer({id:'42',status:'active'})})},queue:[]};
 const before=JSON.stringify(busy);
 assert.equal((restoreIntoLobby(busy,saved,live(),5_000) as any).kind,'refused');assert.equal(JSON.stringify(busy),before);
 const crowd=room({members:Array.from({length:7},(_,i)=>({player:`0x${String(i).padStart(40,'0')}`,joined:1,position:i,away:false,seen:1}))});
 const full:LobbyState={rooms:{[roomId]:crowd},queue:[]};
 assert.equal((restoreIntoLobby(full,saved,live(),5_000) as any).kind,'refused');
 assert.equal((restoreIntoLobby({rooms:{},queue:[]},{room:roomId,offer:offer({a:b,b:a})},live(),5_000) as any).kind,'refused');
});

// The audit's decision for one contested row, against an in-memory lobby and database.
function harness(o:{phase?:bigint;saved?:SavedOffer|undefined;rooms?:Record<string,LobbyRoom>}={}){
 const state:LobbyState={rooms:o.rooms??{},queue:[]};
 const log:string[]=[];const orphans=new OrphanMatches(()=>1);
 const deps={
  row,live:async()=>live(o.phase??2n),savedOffer:async()=>'saved' in o?o.saved:saved,
  lobby:async(fn:(s:LobbyState)=>LobbyRestore)=>fn(state),
  recordEnd:async()=>{log.push('record-end');},deleteRow:async()=>{log.push('delete-row');},
  orphan:(reason:string)=>{log.push(`orphan:${reason}`);orphans.add(row,reason);},
  restored:(kind:string)=>{log.push(kind);orphans.delete(row.id);},now:()=>5_000,
 };
 return {state,log,orphans,run:()=>reconcileContestedResult(deps)};
}

test('the audit deletes the stale row only once the match is back in a (recreated) room',async()=>{
 const gone=harness();
 assert.equal(await gone.run(),'restored');
 assert.deepEqual(gone.log,['recreated','delete-row']);
 assert.equal(gone.state.rooms[roomId].offer?.status,'active','watched from its room offer on the next maintenance pass');
 const kept=harness({rooms:{[roomId]:room()}});
 assert.equal(await kept.run(),'restored');assert.deepEqual(kept.log,['restored','delete-row']);
});

test('no signed offer on record, or no room can take it: the row stays, the operator is alerted and the match is ticked by id',async()=>{
 const none=harness({saved:undefined});
 assert.equal(await none.run(),'orphaned');
 assert.deepEqual(none.log,['orphan:no signed offer on record'],'never delete-row');
 assert.deepEqual(none.orphans.entries().map(o=>o.id),[id]);
 const busy=harness({rooms:{[roomId]:room({offer:offer({id:'42',status:'active'})})}});
 assert.equal(await busy.run(),'orphaned');assert(!busy.log.includes('delete-row'));
 assert.match(busy.log[0],/another unfinished match/);
 // The maintenance loop watches and ticks it with the room offers.
 const targets=maintenanceTargets([],busy.orphans.entries(),5_000);
 assert.deepEqual(targets.map(t=>({id:t.id,orphan:t.orphan})),[{id,orphan:{room:roomId,ranked:true}}]);
});

test('a match the node ended differently is recorded again, not deleted; an unknown one is kept for review',async()=>{
 const ended=harness({phase:3n});
 assert.equal(await ended.run(),'terminal');assert.deepEqual(ended.log,['record-end']);
 const absent=harness({phase:0n});
 assert.equal(await absent.run(),'absent');assert.deepEqual(absent.log,[]);
});

test('orphans: reported once, forgotten once restored or ended; room offers come first in the maintenance targets',()=>{
 const orphans=new OrphanMatches(()=>7);
 assert.equal(orphans.add(row,'no signed offer on record'),true);
 assert.equal(orphans.add(row,'no signed offer on record'),false,'alerted once per process');
 assert.equal(orphans.entries()[0].since,7);
 const inRoom=room({offer:offer({status:'active'})});
 const targets=maintenanceTargets([inRoom],orphans.entries(),5_000);
 assert.equal(targets.length,1);assert.equal(targets[0].room,inRoom,'a restored match is its room\'s, never ticked twice');
 const expired=room({offer:offer({status:'cancelled',expires:'1'})});
 assert.deepEqual(maintenanceTargets([expired],[],5_000_000),[],'a cancelled ticket past its expiry is not observed');
 orphans.delete(id);assert.equal(orphans.size,0);
});
