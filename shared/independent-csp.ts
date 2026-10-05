import {publicIndependentManifest} from './independent';
/** Use the same hub-specific, pinned origins as admission and the browser SDK. */
export function independentCspOrigins(raw:unknown){
 return publicIndependentManifest(raw).arenas.flatMap(a=>[a.node!,a.node!.replace(/^http/,'ws')]).join(' ');
}
