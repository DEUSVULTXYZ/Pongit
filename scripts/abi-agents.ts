import {readFile,writeFile} from 'node:fs/promises';
const artifact=JSON.parse(await readFile('contracts/out/PongAgentArcade.sol/PongAgentArcade.json','utf8'));
// A linked library reverts with its own errors, which the arcade's artifact does not list, so a
// refusal such as AgentIdentity's InvalidRegistration would reach clients as an unnamed revert.
const identity=JSON.parse(await readFile('contracts/out/AgentIdentity.sol/AgentIdentity.json','utf8'));
const errors=new Set(artifact.abi.filter((x:any)=>x.type==='error').map((x:any)=>x.name));
const abi=[...artifact.abi,...identity.abi.filter((x:any)=>x.type==='error'&&!errors.has(x.name))];
await writeFile('shared/abi-PongAgentArcade.ts',`// Generated from PongAgentArcade.sol, with the errors of its linked AgentIdentity library.\nexport const agentArcadeAbi=${JSON.stringify(abi)} as const;\n`);
const archive=JSON.parse(await readFile('contracts/out/AgentResultArchive.sol/AgentResultArchive.json','utf8'));
await writeFile('shared/abi-AgentResultArchive.ts',`// Generated from AgentResultArchive.sol.\nexport const agentArchiveAbi=${JSON.stringify(archive.abi)} as const;\n`);
