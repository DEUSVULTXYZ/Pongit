import test from 'node:test';import assert from 'node:assert/strict';
import {terminalReceiptRaces} from '../scripts/terminal-receipt-evidence';
const r={hash:'0x'+'1'.repeat(64),action:'heartbeat',status:'0x0',revertName:'InvalidMatch'};
const t={stage:'terminal',hash:r.hash,command:'heartbeat'};
test('terminal race requires exact receipt, command and verified recovery evidence',()=>{
 assert.deepEqual(terminalReceiptRaces([r],[t]),[r]);
 for(const changes of [{hash:'0x'+'2'.repeat(64)},{stage:'acknowledged'},{command:'input'}])
  assert.deepEqual(terminalReceiptRaces([r],[{...t,...changes}]),[]);
 assert.deepEqual(terminalReceiptRaces([r],[]),[]);
 for(const changes of [{revertName:'StaleInput'},{action:'concede'},{hash:undefined}])
  assert.deepEqual(terminalReceiptRaces([{...r,...changes}],[t]),[]);
});
