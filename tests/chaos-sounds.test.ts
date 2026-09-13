import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chaosEvents} from '../shared/chaos-events';
import {chaosSoundPattern} from '../shared/chaos-sounds';
test('all events have distinct bounded synthesized announcement cues',()=>{
 const patterns=new Set<string>();
 for(const e of chaosEvents){
  const pattern=chaosSoundPattern(e.id);patterns.add(JSON.stringify(pattern));
  assert(pattern.length<=6);
  for(const tone of pattern){assert(tone.duration>0&&tone.at+tone.duration<1);assert(tone.gain<=.16);}
  assert(chaosSoundPattern(e.id,'impact').length<=2);
 }
 assert.equal(patterns.size,24);
});
