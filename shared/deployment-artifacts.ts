// Deployment guards apply to the complete linked graph before the first write.
// Only these reviewed Monad authorities have a 32 KiB allowance.
const larger=new Set(['SeriesAgentArena','AgentSeriesPool','ReusableAgentPool','IndependentEventsArena','IndependentEventsLobby',
 'ReadyIndependentEventsArena','ReadyIndependentEventsLobby','ReusableEventsLobby']);
export type DeploymentArtifact={bytecode:{object:string;linkReferences?:Record<string,Record<string,{start:number;length:number}[]>>};deployedBytecode:{object:string}};
export function assertDeploymentArtifact(name:string,a:DeploymentArtifact){
 const runtime=(a.deployedBytecode.object.length-2)/2,creation=(a.bytecode.object.length-2)/2;
 if(!Number.isInteger(runtime)||runtime<=0||runtime>(larger.has(name)?32768:24576))throw Error(`${name} exceeds its reviewed runtime budget`);
 if(!Number.isInteger(creation)||creation<=0||creation>49152)throw Error(`${name} exceeds its creation bytecode budget`);
 for(const libraries of Object.values(a.bytecode.linkReferences??{}))for(const refs of Object.values(libraries))for(const ref of refs)
  if(!Number.isInteger(ref.start)||ref.start<0||ref.length!==20||ref.start+ref.length>creation)throw Error(`${name} has invalid library references`);
 return{runtime,creation};
}
export async function preflightDeploymentArtifacts(names:readonly string[],load:(name:string)=>Promise<DeploymentArtifact>){
 const done=new Map<string,{runtime:number;creation:number}>(),active=new Set<string>();
 async function visit(name:string){
  if(done.has(name))return;if(active.has(name))throw Error('Cyclic deployment library graph');active.add(name);
  const artifact=await load(name),size=assertDeploymentArtifact(name,artifact);
  for(const libs of Object.values(artifact.bytecode.linkReferences??{}))for(const lib of Object.keys(libs))await visit(lib);
  active.delete(name);done.set(name,size);
 }
 for(const name of names)await visit(name);
 return [...done].map(([name,size])=>({name,...size}));
}
