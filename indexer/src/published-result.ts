/** Static ABI for PublishedRatings.Entry (two 12-word results, timestamp, finality).
 * Reject truncated responses instead of manufacturing a result on an RPC error. */
export function decodePublishedEntry(data:string){
 if(!/^0x[\da-f]{1664}$/i.test(data))throw Error('Malformed published result');
 const words=Array.from({length:26},(_,i)=>data.slice(2+i*64,2+(i+1)*64));
 const result=(offset:number)=>{
  const n=(i:number)=>BigInt('0x'+words[offset+i]);
  const address=(i:number)=>'0x'+words[offset+i].slice(24).toLowerCase();
  if(n(6)>1n||n(7)>1n||n(8)>4n||n(9)>255n||n(10)>255n)throw Error('Invalid published rules');
  return {arena:address(0),epoch:String(n(1)),id:String(n(2)),a:address(3),b:address(4),winner:address(5),mode:Number(n(6)),ranked:n(7)===1n,status:Number(n(8)),scoreA:Number(n(9)),scoreB:Number(n(10)),hash:'0x'+words[offset+11]};
 };
 return {first:result(0),latest:result(12),at:String(BigInt('0x'+words[24])),finality:BigInt('0x'+words[25])===1n};
}
