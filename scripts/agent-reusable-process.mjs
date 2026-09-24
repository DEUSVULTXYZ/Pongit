// Fixed entrypoints, no Docker socket. Keeper and engine share durable journals;
// an exit never starts a parallel signer or erases uncertain operations.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {superviseRole} from './agent-role-supervisor.mjs';
const role=process.argv[2],entries={keeper:'scripts/agent-reusable-step.ts',engines:'scripts/agent-reusable-engines.ts',
 reader:'relayer/src/agents/pool-server.ts',sponsor:'relayer/src/agents/pool-sponsor-server.ts'};
assert(Object.hasOwn(entries,role),'Unknown reusable service role');assert.equal(process.getuid?.(),1000);
// Only keeper steps are short-lived enough for pre-starting to matter.
const supervisor=superviseRole({role,entry:entries[role],spawn,prestart:role==='keeper'});
process.once('SIGTERM',supervisor.stop);process.once('SIGINT',supervisor.stop);
await supervisor.done;
