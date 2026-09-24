// Runs one reusable role forever: a fresh process per keeper step, or a restarted
// long-lived service. Keeper steps are pre-started: the next process loads its
// modules during the pause, reports 'ready', and runs only once told 'go'. Two
// step bodies never run at once, and an exit never starts a parallel signer.
export function superviseRole({role,entry,spawn,prestart=false,sleep,readyTimeoutMs=60000,now=Date.now,log=line=>console.error(line)}){
 let stopped=false,current,next,wake,killTimer;
 const pause=sleep??(ms=>new Promise(resolve=>{const timer=setTimeout(resolve,ms);wake=()=>{clearTimeout(timer);resolve();};}));
 function launch(){
  const child=spawn(process.execPath,['--import','tsx',entry],prestart
   ?{stdio:['inherit','inherit','inherit','ipc'],env:{...process.env,PONG_KEEPER_PRESTARTED:'1'}}:{stdio:'inherit'});
  const exited=new Promise(resolve=>{child.once('exit',code=>resolve(code??1));child.once('error',()=>resolve(1));});
  // A message sent before the child listens would be lost: wait for its 'ready'.
  const ready=prestart?new Promise(resolve=>{child.once('message',message=>resolve(message==='ready'));exited.then(()=>resolve(false));}):Promise.resolve(true);
  return {child,exited,ready};
 }
 const kill=run=>{
  if(!run||run.child.exitCode!==null||run.child.signalCode!==null)return;
  run.child.kill('SIGTERM');clearTimeout(killTimer);killTimer=setTimeout(()=>run.child.kill('SIGKILL'),55000);
 };
 function stop(){stopped=true;wake?.();kill(current);if(next)next.child.kill('SIGTERM');}
 const done=(async()=>{
  let failures=0;
  while(!stopped){
   const run=next??launch();next=undefined;current=run;
   if(prestart){
    let timer;
    const ok=await Promise.race([run.ready,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),readyTimeoutMs);})]);
    clearTimeout(timer);
    if(stopped){kill(run);await run.exited;break;}
    // A step that never became ready is stopped and counted as a failure.
    if(ok){try{run.child.send('go');}catch{/* It already exited; its exit code tells. */}}else kill(run);
   }
   const start=now();
   const code=await run.exited;
   clearTimeout(killTimer);current=undefined;if(stopped)break;
   failures=code===0||now()-start>60000?0:Math.min(failures+1,5);
   // A batched keeper step costs a few RPC round trips, so a short pause reacts to
   // new challenges and captures sooner without raising request volume.
   const delay=failures?Math.min(30000,1000*2**failures):role==='keeper'?2000:1000;
   if(code!==0)log(JSON.stringify({at:new Date().toISOString(),service:'agent-reusable-process',role,event:'role-restarting',delayMs:delay}));
   // The next step loads its modules while this pause runs.
   if(prestart&&!stopped)next=launch();
   await pause(delay);wake=undefined;
  }
  if(next){next.child.kill('SIGTERM');next=undefined;}
 })();
 return {stop,done};
}
