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

/** Local duration only. Server timestamps identify the queue, never set its age. */
export class QueueElapsed {
 private entry?:{key:string;at:number};
 sample(key:string|undefined,monotonic:number){
  if(!key){this.entry=undefined;return 0;}
  if(this.entry?.key!==key)this.entry={key,at:monotonic};
  return Math.floor(Math.max(0,monotonic-this.entry.at)/1000);
 }
}
