import {readFile,writeFile} from "node:fs/promises";
const artifact=JSON.parse(await readFile("contracts/out/PongInterludeRooms.sol/PongInterludeRooms.json","utf8"));
await writeFile("shared/abi-rooms.ts",`// Generated from PongInterludeRooms.sol.\nexport const roomsAbi=${JSON.stringify(artifact.abi)} as const;\n`);
