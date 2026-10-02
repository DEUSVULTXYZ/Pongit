import test from 'node:test';
import assert from 'node:assert/strict';
import {ParticipantInputs} from '../web/lib/participant-inputs';
import {projectParticipant,projectChaosParticipant} from '../web/lib/participant-projection';
import {initial} from '../shared/physics-v2';
import {initialChaosEvents} from '../shared/physics-chaos-events';
import {zeroHash} from 'viem';

test('coalesced unsent inputs disappear only when a later command is accepted',()=>{
 const ledger=new ParticipantInputs();
 ledger.notice({id:1,direction:1,at:1100},100_000n,1000);
 ledger.notice({id:2,direction:-1,at:1200},100_000n,1000);
 assert.deepEqual(ledger.controls(0,100_000n).map(x=>x.at),[200_000n,300_000n]);
 ledger.notice({id:2,direction:-1,at:1200,acceptedAt:400_000n},200_000n,1300);
 assert.deepEqual(ledger.controls(0,300_000n),[{side:0,direction:-1,at:400_000n}]);
 assert.deepEqual(ledger.controls(0,400_000n),[]);
});

test('accepted catch-up input remains until its physical time even if another command is queued',()=>{
 const ledger=new ParticipantInputs();
 ledger.notice({id:1,direction:1,at:1000,acceptedAt:300_000n},0n,1000);
 ledger.notice({id:2,direction:0,at:1100,acceptedAt:400_000n},0n,1000);
 assert.equal(ledger.controls(1,200_000n).length,2);
 assert.deepEqual(ledger.controls(1,350_000n),[{side:1,direction:0,at:400_000n}]);
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
