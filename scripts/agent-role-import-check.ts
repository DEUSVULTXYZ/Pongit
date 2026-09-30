// Run inside each built role image without a network or runtime secrets. Loading
// these modules checks their real transitive exports without starting a writer.
import assert from 'node:assert/strict';
import {AgentPoolReader} from '../relayer/src/agents/pool-read';
import {poolSponsorRoutes} from '../relayer/src/agents/pool-sponsor';
import {independentWriter} from '../relayer/src/independent-writer';

assert.equal(typeof AgentPoolReader,'function');
assert.equal(typeof poolSponsorRoutes,'function');
assert.equal(typeof independentWriter,'function');
console.log(JSON.stringify({passed:true,scope:'Role image transitive module loading only; no network, key, database or writer'}));
