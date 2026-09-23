import test from 'node:test';
import assert from 'node:assert/strict';
import {quietFailure} from '../web/lib/quiet-failure';

test('a passing hiccup stays silent and only a lasting failure reaches the player',()=>{
 let now=0;const quiet=quietFailure(5000,()=>now);
 assert.equal(quiet.failed('Connection lost.'),'','the first failure is retried silently');
 now=4000;assert.equal(quiet.failed('Connection lost.'),'');
 now=5000;assert.equal(quiet.failed('Connection lost.'),'Connection lost.','five seconds of failure is shown');
 quiet.recovered();now=6000;assert.equal(quiet.failed('Connection lost.'),'','a success restarts the grace period');
 now=11000;assert.equal(quiet.failed('Connection lost.'),'Connection lost.');
});
