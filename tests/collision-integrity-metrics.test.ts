import test from 'node:test';
import assert from 'node:assert/strict';
import {collisionIntegrity} from '../scripts/collision-integrity-metrics';
const pose=(at:number,x:number,collisions:any[]=[])=>({at,renderedUs:String(at*1000),rules:17,rally:'1',balls:[{id:1,x,y:200}],collisions});
test('a visible reflection without a live contact fails, even with smooth frames',()=>{
 const frames=[pose(0,50),pose(10,40),pose(20,42),pose(30,45)];
 assert.equal(collisionIntegrity(frames).unconfirmed.length,1);
 frames[3].collisions=[{at:'11000',rally:1,ball:1,kind:3}];
 assert.equal(collisionIntegrity(frames).unconfirmed.length,0);
 frames[3].collisions[0].ball=2;assert.equal(collisionIntegrity(frames).unconfirmed.length,1);
});
test('a held uncertain contact followed by a real miss invents no reflection',()=>{
 assert.equal(collisionIntegrity([pose(0,50),pose(10,40),pose(20,40),pose(30,35)]).visiblePaddleBounces,0);
});
