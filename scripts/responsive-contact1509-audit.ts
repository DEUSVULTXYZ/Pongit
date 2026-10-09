// Read-only preservation and deterministic reconstruction of the reported match.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {advanceChaosEvents,type ChaosPhysicsState} from '../shared/physics-chaos-events';
import {responsiveState} from '../shared/physics-rules';
const root='artifacts/responsive-20261009-match1509';
const bytes=await readFile(root+'/replay.json'),detailBytes=await readFile(root+'/match.json');
const replay=JSON.parse(bytes.toString()),detail=JSON.parse(detailBytes.toString());
assert.equal(detail.ref.id,'1509');assert.equal(detail.ref.app,'0x776f35918da25f0b594fea72911dde5efc93e48e');assert.equal(replay.rulesVersion,17);
const decode=(raw:any):ChaosPhysicsState=>JSON.parse(JSON.stringify(raw),(_,v)=>typeof v==='string'&&/^-?\d+$/.test(v)?BigInt(v):v);
const a=replay.frames.find((f:any)=>f.state.t==='13630000'),b=replay.frames.find((f:any)=>f.state.t==='13750000');
assert(a&&b&&a.state.leftDir===0&&b.state.leftDir===0);
const s=responsiveState(decode(a.chaos.physics),17),[resolved,,contacts]=advanceChaosEvents(s,BigInt(b.state.t));
for(let i=0;i<2;i++)for(const field of ['x','y','vx','vy'] as const)assert.equal(resolved.balls[i][field].toString(),b.chaos.physics.balls[i][field]);
assert(resolved.balls[0].vx<0n&&resolved.balls[1].vx>0n);
const contact=contacts.find(c=>c.ball===2&&c.kind===3);assert(contact);
const pauses=replay.frames.filter((f:any)=>f.sync.pause.status>=2);
const report={ref:detail.ref,rulesVersion:17,result:detail.result,frames:replay.frameCount,
 replaySha256:createHash('sha256').update(bytes).digest('hex'),detailSha256:createHash('sha256').update(detailBytes).digest('hex'),
 contractPauseFrames:pauses.length,multiball:{beforeUs:a.state.t,afterUs:b.state.t,
 paddleY:Number(s.left)/1e12,firstBallMiss:true,secondBallContact:{...contact,at:String(contact.at),x:String(contact.x),y:String(contact.y)},
 exactMirrorMatchesBothLiveBalls:true},
 limitation:'Authoritative replay does not retain this player\'s local predicted paddle. The browser baseline is a separate fixture.'};
await writeFile(root+'/audit.json',JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
