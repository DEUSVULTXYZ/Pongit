/** viem's request timeout starts after the socket opens. Bound that handshake
 * too, and never send late bytes after handing uncertainty back to the journal. */
export async function boundedEngineSend<T>(connect:()=>Promise<{close:()=>void}>,send:()=>Promise<T>,timeout=4000):Promise<T>{
 let expired=false,socket:{close:()=>void}|undefined,timer:ReturnType<typeof setTimeout>;
 const close=()=>{try{socket?.close();}catch{/* The original command remains uncertain. */}};
 const work=(async()=>{
  socket=await connect();
  if(expired){close();throw Error('Game socket connection timed out');}
  return send();
 })();
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{
  expired=true;close();reject(Error('Game socket connection or response timed out'));
 },timeout);});
 try{return await Promise.race([work,deadline]);}finally{clearTimeout(timer!);}
}
