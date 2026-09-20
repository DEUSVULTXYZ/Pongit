import {readFile,writeFile} from 'node:fs/promises';
for(const name of ['ReusableAgentArena','ReusableAgentPool']){
 const artifact=JSON.parse(await readFile(`contracts/out/${name}.sol/${name}.json`,'utf8'));
 const abi=[...artifact.abi],seen=new Set(abi.map((item:any)=>`${item.type}:${item.name}`));
 if(name==='ReusableAgentArena')for(const library of ['ReusableAgentBinding','ReusableAgentGame','ReusableAdmission','ReusableAuthorizations','ReusableArenaStorage','PoolSteer','PendingControls','ChaosGameFlow']){
  const linked=JSON.parse(await readFile(`contracts/out/${library}.sol/${library}.json`,'utf8'));
  for(const item of linked.abi)if(['error','event'].includes(item.type)&&!seen.has(`${item.type}:${item.name}`)){abi.push(item);seen.add(`${item.type}:${item.name}`);}
 }
 await writeFile(`shared/abi-${name}.ts`,`// Generated from ${name}.sol.\nexport const ${name[0].toLowerCase()+name.slice(1)}Abi=${JSON.stringify(abi)} as const;\n`);
}
