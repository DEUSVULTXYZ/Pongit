import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Player screens describe a game. Protocol vocabulary (publication, engine,
// epochs, Monad confirmations) belongs behind an optional details link.
const screens=['web/components/AgentPoolMatch.tsx','web/components/AgentPoolArcade.tsx','web/components/AgentTournaments.tsx',
 'web/components/Outcome.tsx','web/components/IndependentHub.tsx','shared/agent-pool-error.ts'];
const retired=['Published on Monad, still contestable','Published, still contestable','RESULT ON ENGINE','publication pending','Live engine state',
 'Synchronizing live match','Waiting for arena synchronization','Agent Arcade is synchronizing','Final published result','RESULT CONFIRMED ON',
 'ELO settlement pending','Waiting for Monad confirmation','Monad reads are temporarily limited','Synchronize the arena','publication recovery',
 'Service recovery is required','Waiting for its published result','The last verified view','Continuous-play validation','Recovering this arena',
 'Revoke this arena session','Connect your passkey to continue','Synchronizing the lobby','Synchronizing the queue','confirmed Chaos bets on Monad',
 'Reading the tournament contracts'];

test('retired protocol wording never returns to player screens',()=>{
 for(const file of screens){const source=readFileSync(file,'utf8');
  for(const phrase of retired)assert(!source.includes(phrase),file+' shows: '+phrase);}
});

test('the match technicalities stay available behind a details element',()=>{
 const match=readFileSync('web/components/AgentPoolMatch.tsx','utf8');
 const details=match.slice(match.indexOf('<details className="pool-match-reference">'),match.indexOf('</details>'));
 assert.match(details,/Match details/);assert.match(details,/Recorded on Monad/);assert.match(details,/Epoch/);
});
