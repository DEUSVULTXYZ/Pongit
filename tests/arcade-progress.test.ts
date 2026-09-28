import test from 'node:test';
import assert from 'node:assert/strict';
import {challengeStage,measuredProgress,sponsorStage} from '../shared/arcade-progress';
import {arenaLaunchRemaining} from '../shared/arena-launch';

test('a confirmed zero engine clock displays all three seconds and a late join does not restart them',()=>{
 assert.equal(arenaLaunchRemaining(3000,0,100,100),3000);
 assert.equal(arenaLaunchRemaining(3000,0,100,1100),2000);
 assert.equal(arenaLaunchRemaining(3000,0,100,2100),1000);
 assert.equal(arenaLaunchRemaining(3000,0,100,3100),0);
 assert.equal(arenaLaunchRemaining(3000,2500,4000,4100),400);
 assert.equal(arenaLaunchRemaining(undefined,0,0,0),0);
 assert.equal(arenaLaunchRemaining(3000,0,NaN,0),0);
});

test('unknown or invalid quantities never become a percentage or completed bar',()=>{
 for(const input of [undefined,{completed:1,total:0},{completed:-1,total:4},{completed:5,total:4},{completed:NaN,total:4},{completed:1,total:Infinity}])
  assert.equal(measuredProgress(input),undefined);
 assert.deepEqual(measuredProgress({completed:0,total:4}),{completed:0,total:4});
 assert.deepEqual(measuredProgress({completed:4,total:4}),{completed:4,total:4});
});
test('sponsorship is not confirmation and arena assignment is not game readiness',()=>{
 assert.equal(sponsorStage('queued'),'sponsorship');assert.equal(sponsorStage('pending'),'confirmation');
 assert.equal(sponsorStage('failed'),'error');assert.equal(sponsorStage('confirmed'),'confirmed');
 assert.equal(challengeStage(false,'arena'),'capacity');
 assert.equal(challengeStage(false,'tournament'),'opponent');
 assert.equal(challengeStage(true,'arena'),'preparing');
});
