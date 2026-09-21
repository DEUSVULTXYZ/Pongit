/** Refresh a public observation without serializing a real-time loop behind it.
 * Initial/expired reads still block. A failed refresh cannot extend validity. */
export class BackgroundObservation<T> {
 private value:T|undefined;
 private at=0;
 private next=0;
 private pending:Promise<T>|undefined;
 constructor(private load:()=>Promise<T>,private refreshMs:number,private maxAgeMs:number,private now=Date.now){}
 private refresh(){
  if(!this.pending){
   const started=this.now();this.next=started+this.refreshMs;
   this.pending=Promise.resolve().then(this.load).then(value=>{this.value=value;this.at=started;return value;}).finally(()=>{this.pending=undefined;});
  }
  return this.pending;
 }
 async read():Promise<T>{
  if(this.value===undefined||this.now()-this.at>=this.maxAgeMs)return this.refresh();
  if(this.now()>=this.next)void this.refresh().catch(()=>{});
  return this.value;
 }
}
