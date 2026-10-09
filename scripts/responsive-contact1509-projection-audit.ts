// Recorded state only. No node writes, admission, signed data or synthetic result.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {advanceChaosEvents,type ChaosPhysicsState} from '../shared/physics-chaos-events';
import {responsiveState} from '../shared/physics-rules';
import {projectChaosParticipant} from '../web/lib/participant-projection';
const bytes=await readFile('artifacts/responsive-20261009-match1509/replay.json');
const replay=JSON.parse(bytes.toString());
const frame=replay.frames.find((f:any)=>f.state.t==='13630000');assert(frame);
const source=responsiveState(JSON.parse(JSON.stringify(frame.chaos.physics),(_,v)=>typeof v==='string'&&/^-?\d+$/.test(v)?BigInt(v):v) as ChaosPhysicsState,17);
const target=13_750_000n,first=projectChaosParticipant(source,target,[],'complete',undefined,true);
assert(first.contactBoundary);assert.equal(first.collisions.length,0);
const crossings=first.state.balls.map((b,i)=>({ball:i+1,x:Number(b.x)/1e12,y:Number(b.y)/1e12,vx:Number(b.vx)/1e6}));
assert(first.state.balls.every(b=>!b.alive||b.x>=40_000_000_000_000n&&b.x<=984_000_000_000_000n));
// Advance the authoritative mirror just past the first decision, with the
// recorded stationary paddle. These two balls reach the plane together.
const [afterMiss]=advanceChaosEvents(source,first.state.t+2n);
assert(afterMiss.balls[0].vx<0n&&afterMiss.balls[0].x<40_000_000_000_000n);
const second=projectChaosParticipant(afterMiss,target,[],'complete',undefined,true);
assert(afterMiss.balls[1].vx>0n,'the same authoritative step resolves both contacts');
assert(!second.contactBoundary);assert.equal(second.collisions.length,0);
assert(second.state.balls[1].vx>0n);
const [confirmed,,contacts]=advanceChaosEvents(source,target);
assert(confirmed.balls[0].vx<0n&&confirmed.balls[1].vx>0n);
assert(contacts.some(c=>c.ball===2&&c.kind===3));
const report={passed:true,kind:'recorded-state presentation regression; not browser or user-local evidence',
 ref:{chainId:10143,app:'0x776f35918da25f0b594fea72911dde5efc93e48e',epoch:'1',id:'1509'},
 replaySha256:createHash('sha256').update(bytes).digest('hex'),sourceUs:String(source.t),targetUs:String(target),
 firstFenceUs:String(first.state.t),firstFence:crossings,confirmedContinuationUs:String(second.state.t),
 predictedMissWaits:true,simultaneousSecondBallWaits:true,confirmedFirstMissSecondBounce:true,
 initialFailedAudit:'Incorrectly assumed sequential rather than simultaneous plane contacts; failure retained in artifacts.'};
await writeFile('docs/validation/responsive-contact1509-projection-20261009.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));
