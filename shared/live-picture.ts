import type {EngineState} from './engine-stream';

/** Delivery callbacks can overtake each other after the feed has verified them.
 * Only the feed's explicit, independently checked reset may rewind this match.
 * The caller resets ownership when the complete match reference changes. */
export function adoptLivePicture(previous:EngineState|null,incoming:EngineState):EngineState{
 if(!previous)return incoming;
 if(previous.id!==incoming.id)return previous;
 if(incoming.reset)return incoming.observedAt>=previous.observedAt?incoming:previous;
 if(incoming.head<previous.head||incoming.revision<previous.revision)return previous;
 if(incoming.head===previous.head&&incoming.revision===previous.revision&&incoming.observedAt<previous.observedAt)return previous;
 return incoming;
}
