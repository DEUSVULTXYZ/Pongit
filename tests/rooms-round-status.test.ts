import test from 'node:test';import assert from 'node:assert/strict';
import {roomsRoundStatus as state} from '../shared/rooms-round-status';
test('Chaos uses the exact rally, paid-bet cutoff and confirmation blocks, never a fake three-second pause',()=>{
 const version=(200n<<8n)|3n;
 assert.deepEqual(state(3,version,true,160n),{phase:'open',blocksLeft:40n});
 assert.deepEqual(state(3,version,true,199n),{phase:'open',blocksLeft:1n});
 assert.deepEqual(state(3,version,false,200n),{phase:'closing',blocksLeft:2n});
 assert.deepEqual(state(3,version,false,201n),{phase:'closing',blocksLeft:1n});
 assert.equal(state(3,version,false,202n).phase,'preparing');
 assert.equal(state(4,version,true,161n).phase,'preparing');
 assert.equal(state(3,0n,false,160n).phase,'preparing');
 assert.equal(state(3,version,false,190n).phase,'preparing');
});
