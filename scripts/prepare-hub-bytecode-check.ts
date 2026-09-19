import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {keccak256,type Hex} from 'viem';
const source=JSON.parse(await readFile('node_modules/@interludelayer-sdk/cli/artifacts/InterludeHub.sol/InterludeHub.json','utf8'));
const code=typeof source.bytecode==='string'?source.bytecode:source.bytecode.object;
if(!/^0x[\da-f]+$/i.test(code))throw Error('Expected a fully linked official hub artifact');
await mkdir('contracts/out/OfficialHub.sol',{recursive:true});
await writeFile('contracts/out/OfficialHub.sol/OfficialHub.json',JSON.stringify({abi:source.abi,bytecode:{object:code}}));
console.log(JSON.stringify({source:'@interludelayer-sdk/cli',creationCodeHash:keccak256(code as Hex),kind:'local diagnostic; not hosted qualification'}));
