/** Display time anchored to the service, never to the player's wall clock. */
export class LobbyClock {
 private anchor?:{epoch:number;monotonic:number};
 constructor(private monotonic=()=>performance.now(),private wall=()=>Date.now()){}
 observe(epoch:number){
  if(!Number.isFinite(epoch)||epoch<=0)return;
  const at=this.monotonic();
  this.anchor={epoch:this.anchor?Math.max(epoch,this.now()):epoch,monotonic:at};
 }
 now(){return this.anchor?this.anchor.epoch+Math.max(0,this.monotonic()-this.anchor.monotonic):this.wall();}
}

/** Remains live with older APIs too; a future server timestamp cannot freeze it. */
export class QueueElapsed {
 private entry?:{key:string;at:number;elapsed:number};
 sample(key:string|undefined,since:number,serverNow:number,monotonic:number){
  if(!key){this.entry=undefined;return 0;}
  const elapsed=Math.max(0,serverNow-since);
  if(this.entry?.key!==key)this.entry={key,at:monotonic,elapsed};
  const current=Math.max(this.entry.elapsed+Math.max(0,monotonic-this.entry.at),elapsed);
  this.entry={key,at:monotonic,elapsed:current};
  return Math.floor(current/1000);
 }
}
