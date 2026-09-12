export async function gameTabLock(player:string){
 if(!navigator.locks)throw Error('Use a browser that can protect your game session across tabs.');
 return new Promise<()=>void>((resolve,reject)=>{
  void navigator.locks.request(`pongit:controller:${player.toLowerCase()}`,{ifAvailable:true},async lock=>{
   if(!lock){reject(Error('This account is already controlling PONGIT in another tab.'));return;}
   await new Promise<void>(release=>resolve(release));
  }).catch(reject);
 });
}
