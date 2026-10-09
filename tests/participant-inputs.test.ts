import test from 'node:test';
import assert from 'node:assert/strict';
import {ParticipantInputs} from '../web/lib/participant-inputs';
import {projectParticipant,projectChaosParticipant} from '../web/lib/participant-projection';
import {initial} from '../shared/physics-v2';
import {initialChaosEvents} from '../shared/physics-chaos-events';
import {zeroHash} from 'viem';

test('local intent timestamps survive receipt pruning and reset with their match',()=>{
 const inputs=new ParticipantInputs();inputs.localIntent(1,20);inputs.localIntent(1,30);inputs.localIntent(0,100);
 inputs.notice({id:1,direction:1,at:200,acceptedAt:10n},0n,0);inputs.controls(0,20n);
 assert.deepEqual(inputs.localControls,[{direction:1,at:20},{direction:0,at:100}]);
 for(let i=0;i<300;i++)inputs.localIntent(i%2?0:1,101+i);
 assert.equal(inputs.localControls.length,128);assert.deepEqual(inputs.localControls.at(-1),{direction:0,at:400});
 inputs.reset();assert.deepEqual(inputs.localControls,[]);
});

test('input paints are coalesced before the next frame and detached on unmount',async()=>{
 const inputs=new ParticipantInputs();let paints=0;
 const detach=inputs.subscribeLocal(()=>{paints++;assert.equal(inputs.localControls.at(-1)?.direction,0);});
 inputs.localIntent(1,0);inputs.localIntent(0,8);assert.equal(paints,0);
 await Promise.resolve();assert.equal(paints,1);
 inputs.localIntent(1,12);detach();await Promise.resolve();assert.equal(paints,1);
});

for(const mode of ['classic','chaos'] as const)for(const side of [0,1] as const)test(`${mode}: a new direction cannot rewrite the already displayed rally (side ${side})`,()=>{
 // Chaos 883: a 427 ms command delay left the monotonic display at 8.54s
 // while the latest live snapshot was at 8.21s. The next key was previously
 // dated at 8.334s, moving the paddle 37px before the first new frame.
 const ledger=new ParticipantInputs(),processed=8_210_000n,displayed=8_540_000n;
 const source={...initial(zeroHash),t:processed,left:205_200_000n,right:205_200_000n};
 const chaos={...initialChaosEvents(zeroHash),t:processed,left:205_200_000_000_000n,right:205_200_000_000_000n};
 const position=(target:bigint)=>{
  const s=mode==='classic'?projectParticipant(source,target,ledger.controls(side,processed)).state:projectChaosParticipant(chaos,target,ledger.controls(side,processed),'complete').state;
  return Number(side===0?s.left:s.right)/(mode==='classic'?1e6:1e12);
 };
 const before=position(displayed);
 ledger.notice({id:1,direction:-1,at:1124},processed,1000,{clock:displayed,observedAt:1118});
 assert.ok(Math.abs(position(displayed)-before)<.001,'a fresh key cannot change an already rendered instant');
 assert.ok(Math.abs(position(displayed+16_000n)-before)<=2.881,'first frame travels at most one frame of paddle speed');
});

test('only confirmation changes and recovery revise the input correction source',()=>{
 const ledger=new ParticipantInputs();assert.equal(ledger.revision,0);
 ledger.notice({id:1,direction:1,at:1000},0n,1000);assert.equal(ledger.revision,0);
 ledger.notice({id:1,direction:1,at:1000,acceptedAt:80_000n},0n,1000);assert.equal(ledger.revision,1);
 ledger.notice({id:1,direction:1,at:1000,acceptedAt:80_000n},0n,1000);assert.equal(ledger.revision,1);
 ledger.controls(0,100_000n);assert.equal(ledger.revision,1,'pruning follows physical source update');
 ledger.reset();assert.equal(ledger.revision,2);
});

test('release and reversal preserve their visual times until authoritative receipt',()=>{
 const ledger=new ParticipantInputs(),paint={clock:8_540_000n,observedAt:1118};
 ledger.notice({id:1,direction:1,at:1124},8_210_000n,1000,paint);
 ledger.notice({id:2,direction:0,at:1130},8_210_000n,1000,paint);
 ledger.notice({id:3,direction:-1,at:1134},8_210_000n,1000,paint);
 assert.deepEqual(ledger.controls(0,8_210_000n).map(x=>x.at),[8_546_000n,8_552_000n,8_556_000n]);
 ledger.notice({id:2,direction:0,at:1130,acceptedAt:8_350_000n},8_320_000n,1140,{clock:8_600_000n,observedAt:1140});
 assert.deepEqual(ledger.controls(0,8_320_000n),[{side:0,direction:0,at:8_350_000n,confirmed:true},{side:0,direction:-1,at:8_556_000n,confirmed:false}]);
 assert.equal(ledger.revision,1,'the engine retiming goes through reconciliation');
 assert.deepEqual(ledger.controls(0,8_350_000n),[{side:0,direction:-1,at:8_556_000n,confirmed:false}]);
});

test('stale or future paint cannot leak into resumed input and fresh raw time remains authoritative',()=>{
 for(const observedAt of [899,1001]){
  const ledger=new ParticipantInputs();
  ledger.notice({id:1,direction:1,at:1000},100_000n,980,{clock:900_000n,observedAt});
  assert.equal(ledger.controls(0,0n)[0].at,120_000n);
 }
 const ledger=new ParticipantInputs();
 ledger.notice({id:1,direction:1,at:1000},800_000n,980,{clock:700_000n,observedAt:990});
 assert.equal(ledger.controls(0,0n)[0].at,820_000n);
 ledger.reset();ledger.notice({id:1,direction:0,at:1010},0n,1000);
 assert.equal(ledger.controls(1,0n)[0].at,10_000n,'another match starts on its own clock');
});

test('coalesced unsent inputs disappear only when a later command is accepted',()=>{
 const ledger=new ParticipantInputs();
 ledger.notice({id:1,direction:1,at:1100},100_000n,1000);
 ledger.notice({id:2,direction:-1,at:1200},100_000n,1000);
 assert.deepEqual(ledger.controls(0,100_000n).map(x=>x.at),[200_000n,300_000n]);
 ledger.notice({id:2,direction:-1,at:1200,acceptedAt:400_000n},200_000n,1300);
 assert.deepEqual(ledger.controls(0,300_000n),[{side:0,direction:-1,at:400_000n,confirmed:true}]);
 assert.deepEqual(ledger.controls(0,400_000n),[]);
});

test('accepted catch-up input remains until its physical time even if another command is queued',()=>{
 const ledger=new ParticipantInputs();
 ledger.notice({id:1,direction:1,at:1000,acceptedAt:300_000n},0n,1000);
 ledger.notice({id:2,direction:0,at:1100,acceptedAt:400_000n},0n,1000);
 assert.equal(ledger.controls(1,200_000n).length,2);
 assert.deepEqual(ledger.controls(1,350_000n),[{side:1,direction:0,at:400_000n,confirmed:true}]);
 ledger.reset();assert.deepEqual(ledger.controls(1,0n),[]);
});

test('terminal and paused scenes do not enter an endless projection loop',()=>{
 const classic={...initial(zeroHash),finished:true};
 assert.deepEqual(projectParticipant(classic,400_000n,[]).state,classic);
 const chaos=initialChaosEvents(zeroHash);chaos.cancelled=true;
 assert.deepEqual(projectChaosParticipant(chaos,400_000n,[],'complete').state,chaos);
 const frozen=initialChaosEvents(zeroHash);
 assert.deepEqual(projectChaosParticipant(frozen,frozen.t,[{side:0,direction:1,at:10n}],'complete').state,frozen);
});

test('house decisions use the absolute grid and confirmed public memory without mutating it',()=>{
 const source=initial(zeroHash),house={controllers:1n<<8n,decision:0n,brainA:0n,brainB:0n,progressive:true};
 const full=projectParticipant(source,300_000n,[],house);
 const split=projectParticipant(source,300_000n,[{side:0,direction:0,at:55_000n},{side:0,direction:0,at:171_000n}],house);
 assert.deepEqual(full.state,split.state,'extra human observations cannot make NOVA react twice');
 assert.equal(house.brainB,0n);assert.equal(source.rightDir,0);
 const a=projectParticipant(source,300_000n,[{side:0,direction:1,at:0n}],house);
 assert.equal(a.state.right,full.state.right,'one friendly copy does not mutate another');
});
