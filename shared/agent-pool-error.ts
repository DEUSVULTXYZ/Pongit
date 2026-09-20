import {engineReadRetryMs} from './engine-read';
import {publicationUnavailable} from './service-error';

/** Public UI copy only. viem errors can embed signed transactions and grants. */
export function poolUserError(error:unknown):string {
 if((error as {code?:string}|null)?.code==='BASE_READ_RATE_LIMIT')return 'Monad reads are temporarily limited. Your arcade session is saved; retry synchronization.';
 if(publicationUnavailable(error))return 'This arena is waiting for publication recovery. Your arcade session is saved.';
 if(engineReadRetryMs(error))return 'This arena is busy. Waiting to synchronize; your arcade session is saved.';
 const e=error as {message?:unknown;shortMessage?:unknown}|null;
 const message=String(e?.shortMessage??e?.message??'');
 if(/fetch|network|HTTP request|timed? out|timeout|socket/i.test(message))
  return 'The arena connection is unavailable. Your arcade session is saved; synchronization will retry.';
 // Only short application-authored messages may survive. Transport diagnostics
 // must never be forwarded just because a provider flattened them to one line.
 const first=message.split('\n')[0];
 if(!first||first.length>240||/0x[\da-f]{64,}|\b(?:signature|raw transaction|request body|call arguments|private key)\b|https?:\/\//i.test(first))
  return 'This action could not be confirmed. Synchronize the arena before continuing.';
 return first;
}
