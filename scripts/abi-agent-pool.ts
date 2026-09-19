import {readFile,writeFile} from 'node:fs/promises';
const names=['AgentCatalog','AgentArenaPool','AgentTournaments','AgentChallenges','AgentQualifications','AgentPublishedRatings','PooledAgentArena','HousePolicies'] as const;
for(const name of names){
 const artifact=JSON.parse(await readFile(`contracts/out/${name}.sol/${name}.json`,'utf8'));
 const abi=[...artifact.abi],errors=new Set(abi.filter((item:any)=>item.type==='error').map((item:any)=>item.name));
 if(name==='PooledAgentArena')for(const library of ['PoolAdmission','PoolAuthorizations','PoolSteer','PendingControls','ChaosGameFlow']){
  const linked=JSON.parse(await readFile(`contracts/out/${library}.sol/${library}.json`,'utf8'));
  for(const item of linked.abi)if(item.type==='error'&&!errors.has(item.name)){abi.push(item);errors.add(item.name);}
 }
 await writeFile(`shared/abi-${name}.ts`,`// Generated from ${name}.sol.\nexport const ${name[0].toLowerCase()+name.slice(1)}Abi=${JSON.stringify(abi)} as const;\n`);
}
