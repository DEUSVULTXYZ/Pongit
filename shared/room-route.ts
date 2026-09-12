/** Next may preserve escaped path separators inside a dynamic parameter. Decode
 * once, then validate the complete reference; never interpret it as another path. */
export function roomRoute(value:string):{kind:'independent'|'legacy';id:string}|null{
 let id:string;try{id=decodeURIComponent(value);}catch{return null;}
 if(/^0x[\da-fA-F]{40}:\d{1,78}$/.test(id))return {kind:'independent',id};
 if(/^0x[\da-f]{64}$/.test(id))return {kind:'legacy',id};
 return null;
}
