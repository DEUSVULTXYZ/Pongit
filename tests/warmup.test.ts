import test from 'node:test';
import assert from 'node:assert/strict';
import {HEIGHT,SCALE} from '../shared/physics-v2';
import {botDirection,newWarmup,stepWarmup} from '../web/lib/warmup';
import {arenaOutage,arenaWaitStatus,clockLabel,preparingArena} from '../web/lib/arena-wait';

const seed=()=>`0x${'ab'.repeat(32)}` as const;

test('a warm-up step runs the real physics and never jumps after a background tab',()=>{
 let w=newWarmup(seed);
 assert.equal(w.state.scoreA,0);assert.equal(w.state.t,0n);
 w=stepWarmup(w,16,0);assert.equal(w.state.t,16_000n);
 w=stepWarmup(w,5000,0);assert.equal(w.state.t,66_000n,'a long frame is capped at 50 ms');
 const top=stepWarmup(w,50,-1),bottom=stepWarmup(w,50,1);
 assert.ok(top.state.left<w.state.left&&bottom.state.left>w.state.left,'the player paddle follows the key');
});

test('the bot chases a ball coming its way, slightly off, and drifts home otherwise',()=>{
 const w=newWarmup(seed);
 const coming={...w,state:{...w.state,vx:128n*SCALE,y:100n*SCALE,right:HEIGHT/2n}};
 const [up,aimed]=botDirection(coming,()=>0.5);
 assert.equal(up,-1);assert.equal(aimed.heading,1);assert.equal(aimed.aim,0n);
 const [,kept]=botDirection({...aimed,state:{...aimed.state,y:120n*SCALE}},()=>0.99);
 assert.equal(kept.aim,0n,'the aim changes only when the ball turns');
 const leaving={...aimed,state:{...aimed.state,vx:-128n*SCALE,right:100n*SCALE}};
 assert.equal(botDirection(leaving,()=>0.5)[0],1,'back toward the centre');
 const centred={...leaving,state:{...leaving.state,right:HEIGHT/2n}};
 assert.equal(botDirection(centred,()=>0.5)[0],0);
});

test('a long rally keeps scoring without ever breaking the physics',()=>{
 let w=newWarmup(seed),points=0;
 for(let i=0;i<20000&&!w.state.finished;i++){const before=w.state.scoreA+w.state.scoreB;w=stepWarmup(w,16,i%120<60?-1:1,()=>0.5);points+=w.state.scoreA+w.state.scoreB-before;}
 assert.ok(points>0);
});

test('waiting players are told why, and only when it helps',()=>{
 assert.equal(arenaOutage(undefined),false);
 assert.equal(arenaOutage([{online:false,stage:'starting'},{online:false,stage:'closing'}]),true);
 assert.equal(arenaWaitStatus([{online:false,stage:'starting'}]),'Arenas are restarting. Your spot is kept.');
 assert.equal(arenaWaitStatus([{online:true,stage:'playing'},{online:false,stage:'closing'}]),'Every arena is in play. Yours is next.');
 assert.equal(arenaWaitStatus([{online:true,stage:'available'}]),'');
 assert.equal(clockLabel(0),'0:00');assert.equal(clockLabel(75),'1:15');assert.equal(clockLabel(-3),'0:00');
});

test('a binding that is not there yet is preparation, not an error',()=>{
 assert.equal(preparingArena(Error('Arena participant binding changed')),true);
 assert.equal(preparingArena(Error('Arena binding changed')),true);
 assert.equal(preparingArena(Error('Waiting for the assigned arena epoch')),true);
 assert.equal(preparingArena(Error('This account is already controlling an arena in another tab')),false);
});
