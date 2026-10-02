/** A warm-up session measures visible local time. Scores and rallies do not
 * own this clock; only opening a new warm-up creates a new instance. */
export class WarmupClock {
 private elapsed=0;
 constructor(private last:number,private visible=true){}
 sample(now:number){
  const next=Math.max(this.last,now);
  if(this.visible)this.elapsed+=next-this.last;
  this.last=next;return this.elapsed;
 }
 visibility(visible:boolean,now:number){this.sample(now);this.visible=visible;}
}
