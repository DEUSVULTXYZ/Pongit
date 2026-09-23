import {engineReadRetryMs} from './engine-read';
import {publicationUnavailable} from './service-error';

const PLAYER_COPY:[RegExp,string][]=[
 [/^Renew (?:your )?arcade session/i,'Please sign in again to continue.'],
 [/^Your arcade session is unavailable/i,'Please sign in again to continue.'],
 [/^Use the passkey for this player/i,'Sign in with the account that played this match.'],
 [/^Use the arcade session that created this challenge/i,'Sign in with the account that sent this challenge.'],
 [/^Use a browser with arcade session protection/i,'Please use an up-to-date browser to play.'],
];
/** Public UI copy only. viem errors can embed signed transactions and grants. */
export function poolUserError(error:unknown):string {
 if((error as {code?:string}|null)?.code==='BASE_READ_RATE_LIMIT')return 'The arcade is busy right now. Your game is saved; retrying automatically.';
 if(publicationUnavailable(error))return 'This arena is catching up. Your game is saved.';
 if(engineReadRetryMs(error))return 'This arena is busy. Your game is saved; retrying shortly.';
 const e=error as {message?:unknown;shortMessage?:unknown}|null;
 const message=String(e?.shortMessage??e?.message??'');
 if(/fetch|network|HTTP request|timed? out|timeout|socket/i.test(message))
  return 'Connection lost. Your game is saved; reconnecting automatically.';
 // Only short application-authored messages may survive. Transport diagnostics
 // must never be forwarded just because a provider flattened them to one line.
 const first=message.split('\n')[0];
 // Session instructions raised by shared code, in words a player recognises.
 for(const [pattern,copy] of PLAYER_COPY)if(pattern.test(first))return copy;
 if(!first||first.length>240||/0x[\da-f]{64,}|\b(?:signature|raw transaction|request body|call arguments|private key)\b|https?:\/\//i.test(first))
  return 'That action did not go through. Please try again.';
 return first;
}
