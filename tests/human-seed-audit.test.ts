import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zeroHash,type Address} from 'viem';
import {humanSeedDigest,humanSeedState,packedHumanSeed,humanPlayerSeedSlot,type HumanSeedCall} from '../shared/human-seed-audit';
const a='0x1111111111111111111111111111111111111111' as Address;
const seed:HumanSeedCall={kind:'players',accounts:[a],mode:0,values:[{elo:1110,played:5,wins:4,season:3}]};
test('human migration preserves original values, modes and the exact seed call order',()=>{
 const other:HumanSeedCall={...seed,mode:1};
 assert.notEqual(humanSeedDigest([seed,other]),humanSeedDigest([other,seed]));
 assert.equal(humanSeedDigest([]),zeroHash);assert.equal(humanSeedState([seed,other]).players.size,2);
 assert.throws(()=>humanSeedState([seed,seed]),/Duplicate/);
 assert.notEqual(humanPlayerSeedSlot(a,0),humanPlayerSeedSlot(a,1));
 assert.equal(packedHumanSeed(seed.values[0]),1110n|(5n<<32n)|(4n<<64n)|(3n<<96n));
});
test('repeated-pair seed validation rejects silent overwrites and out of range penalties',()=>{
 const pair=('0x'+'11'.repeat(32)) as `0x${string}`;
 const call:HumanSeedCall={kind:'pairs',pairs:[pair],values:[8]};
 assert.equal(humanSeedState([call]).pairs.get(pair),8);
 assert.throws(()=>humanSeedState([call,call]),/Duplicate/);
 assert.throws(()=>humanSeedState([{...call,values:[9]}]));
});
