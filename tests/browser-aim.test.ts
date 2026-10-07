import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visibleAim} from '../scripts/browser-aim';
test('browser controls aim at the visible approaching ball and release before contact',()=>{
 const p={at:0,rally:1,paddles:[288,288],balls:[{id:0,x:350,y:150}]};
 const q={...p,at:50,balls:[{id:0,x:325,y:150}]};
 assert.equal(visibleAim(p,q,0,48,false).direction,-1);
 assert.equal(visibleAim({...p,balls:[{id:0,x:110,y:150}]},{...q,balls:[{id:0,x:85,y:150}]},0,48,false).nearContact,true);
 assert.equal(visibleAim({...p,balls:[{id:0,x:110,y:150}]},{...q,balls:[{id:0,x:85,y:150}]},0,48,false).direction,0);
 assert.equal(visibleAim(p,{...q,rally:2},0,48,false).direction,0);
});
