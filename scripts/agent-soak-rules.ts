// The two rules scripts/agent-soak.ts must not get wrong, apart from it so both can be tested
// without a laboratory: when a clock that ran out may keep sampling, and which files a run froze.
import {readFile,readdir,stat} from 'node:fs/promises';
import {posix} from 'node:path';

// The renewal as scripts/agent-lifecycle.ts records it, in order: admissions closed and games
// finishing, the node publishing what is left, the engine closed, the hub's one-hour challenge
// window, the stake released, the engine reopened, the node provisioned, the services restarted
// on the new epoch. Not 'intervention-required', which waits for a person, and not the service's
// own health stages: its 'waiting-publication' is a publication backlog with admissions open, and
// every renewal restarts it, so its /health fails or says 'starting' in the middle of one.
export const renewalStages=new Set(['draining','waiting-publication','closed','challenge-window','released','reopened','provisioning','restart-required']);
export type LifecycleView={stage:string,at:number,after?:string};
// The record's stage, when it last changed, and the stage it changed from.
export function lifecycleView(record:any):LifecycleView|undefined{
 if(!record||typeof record.stage!=='string')return undefined;
 const events=Array.isArray(record.events)?record.events:[],last=events.at(-1),previous=events.at(-2);
 return {stage:record.stage,at:last?.stage===record.stage?Date.parse(last.at):NaN,after:last?.stage===record.stage&&typeof previous?.stage==='string'?previous.stage:undefined};
}
export type AfterClock={now:number,ends:number,graceMs:number,settleMs:number,lifecycle?:LifecycleView,service?:string};
// Whether the soak takes another sample. Past its clock only while the lifecycle is renewing, for
// at most graceMs, and for settleMs after a renewal the lifecycle has just reopened: it reopens
// admissions and the service picks them up on its next admission cycle, so a sample falling in
// between would otherwise end a healthy run. Anything else past the clock ends the run as it is.
export function afterClock({now,ends,graceMs,settleMs,lifecycle,service}:AfterClock):{sample:boolean,reason:string}{
 if(now<ends)return {sample:true,reason:'clock running'};
 if(!lifecycle)return {sample:false,reason:'lifecycle record unreadable at the end of the clock; no grace'};
 const renewing=renewalStages.has(lifecycle.stage);
 if(now>=ends+graceMs)return {sample:false,reason:renewing?`renewal still at lifecycle stage ${lifecycle.stage} after the grace bound`:`grace bound reached at lifecycle stage ${lifecycle.stage}`};
 if(renewing)return {sample:true,reason:`renewal in progress (lifecycle stage ${lifecycle.stage})`};
 if(lifecycle.stage==='online'&&renewalStages.has(lifecycle.after??'')&&service!=='online'&&now-lifecycle.at<settleMs)
  return {sample:true,reason:`renewal reopened after ${lifecycle.after}; waiting for the service to resume admissions`};
 return {sample:false,reason:`lifecycle stage ${lifecycle.stage} is not a renewal`};
}

// Every file the roles can execute: the roots, every relative import they reach, and every
// repository script a reached file names as a string, which is how the keeper, the operator step
// and agent-process start the next role (docker run ... scripts/agent-test-environment.mjs).
// A listed entry point missed what the lifecycle imports, so the closure is walked instead.
const specifiers=[/\bfrom\s*['"](\.{1,2}\/[^'"\n]+)['"]/g,/\bimport\s*['"](\.{1,2}\/[^'"\n]+)['"]/g,/\bimport\s*\(\s*['"](\.{1,2}\/[^'"\n]+)['"]\s*\)/g,/\brequire\s*\(\s*['"](\.{1,2}\/[^'"\n]+)['"]\s*\)/g];
const named=/['"`]((?:scripts|relayer|shared|agent-sdk)\/[\w./-]+\.(?:ts|mjs|js))['"`]/g;
const isFile=async(path:string)=>{try{return (await stat(path)).isFile();}catch{return false;}};
async function resolveImport(from:string,specifier:string){
 const base=posix.normalize(posix.join(posix.dirname(from),specifier));
 for(const path of [base,base+'.ts',base+'.tsx',base+'.mjs',base+'.js',base+'.json',base.replace(/\.js$/,'.ts'),base+'/index.ts',base+'/index.mjs',base+'/index.js'])if(await isFile(path))return path;
}
export async function tree(dir:string):Promise<string[]>{
 const found:string[]=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;
  if(entry.isDirectory())found.push(...await tree(path));else if(/\.(ts|mjs|sol)$/.test(entry.name))found.push(path);}
 return found;
}
// Paths are relative to the working directory, the release the roles run from. An import that
// resolves to nothing is returned rather than skipped: the closure is incomplete, not smaller.
export async function sourceClosure(roots:string[]):Promise<{paths:string[],unresolved:string[]}>{
 const seen=new Set<string>(),unresolved:string[]=[],queue=roots.map(path=>posix.normalize(path));
 while(queue.length){
  const path=queue.pop()!;if(seen.has(path))continue;seen.add(path);
  if(!/\.(ts|tsx|mjs|js|sol)$/.test(path))continue;
  const text=await readFile(path,'utf8');
  for(const pattern of specifiers)for(const [,specifier] of text.matchAll(pattern)){
   const target=await resolveImport(path,specifier);if(target)queue.push(target);else unresolved.push(`${path} -> ${specifier}`);
  }
  for(const [,target] of text.matchAll(named))if(await isFile(target))queue.push(posix.normalize(target));
 }
 return {paths:[...seen].sort(),unresolved:[...new Set(unresolved)].sort()};
}
export const soakRoles=['relayer/src/agents/server.ts','relayer/src/agents/coordinator.ts','relayer/src/agents/metrics.ts','relayer/src/agents/replays.ts','shared/agent-client.ts','shared/engine-read.ts','scripts/agent-house-worker.ts','scripts/agent-community-qualification.ts','agent-sdk/example.ts','scripts/agent-process.mjs','scripts/agent-soak.ts','scripts/agent-lifecycle.ts','scripts/agent-archive-step.ts','scripts/agent-operator-step.ts','scripts/independent-chain-tools.ts','scripts/agent-ops.mjs','scripts/agent-private-keeper.mjs'];
// The soak's roots: the roles it names, every agent script in the release (the keeper runs some
// only on a renewal or a restart), the SDK the laboratory strategies register with, and the trees
// the service is built from, with the agent contracts' sources for the record.
export async function soakSources(roles=soakRoles){
 const scripts=(await readdir('scripts')).filter(name=>/^agent-.*\.(ts|mjs)$/.test(name)).map(name=>`scripts/${name}`);
 const trees=(await Promise.all(['relayer/src/agents','shared','agent-sdk/src','contracts/src/agents'].map(tree))).flat();
 return sourceClosure([...roles,...scripts,'agent-sdk/strategy.ts','web/lib/rooms-command-journal.ts',...trees]);
}
