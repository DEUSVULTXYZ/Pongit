import {readFile,writeFile} from 'node:fs/promises';
const artifact=JSON.parse(await readFile('contracts/out/PongAgentArcade.sol/PongAgentArcade.json','utf8'));
await writeFile('shared/abi-PongAgentArcade.ts',`// Generated from PongAgentArcade.sol.\nexport const agentArcadeAbi=${JSON.stringify(artifact.abi)} as const;\n`);
const archive=JSON.parse(await readFile('contracts/out/AgentResultArchive.sol/AgentResultArchive.json','utf8'));
await writeFile('shared/abi-AgentResultArchive.ts',`// Generated from AgentResultArchive.sol.\nexport const agentArchiveAbi=${JSON.stringify(archive.abi)} as const;\n`);
