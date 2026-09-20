import {test} from 'node:test';
import assert from 'node:assert/strict';
import {type Address,type Hex} from 'viem';
import {verifyHistoricalRuntime,type HistoricalArtifact} from '../shared/historical-runtime';
const root=`0x${'1'.repeat(40)}` as Address,library=`0x${'2'.repeat(40)}` as Address;
const trailer='abcd0002';
const artifact:HistoricalArtifact={deployedBytecode:{object:'0x60'+'0'.repeat(40)+'ff'+trailer,linkReferences:{'src/Logic.sol':{Logic:[{start:1,length:20}]}}}};
const child:HistoricalArtifact={deployedBytecode:{object:'0x607fff'+trailer,immutableReferences:{owner:[{start:1,length:1}]}}};
test('historical comparison verifies linked code before masking its address and records exact runtime hashes',async()=>{
 const r=await verifyHistoricalRuntime(root,artifact,async at=>at===root?`0x60${library.slice(2)}ff${trailer}`:`0x6012ff${trailer}`,async()=>child);
 assert.deepEqual(Object.keys(r.verified).sort(),[root,library]);
});
test('a malicious linked library, altered root opcode, missing code or invalid mask rejects the export',async()=>{
 const code=`0x60${library.slice(2)}ff${trailer}` as Hex;
 for(const altered of [`0x6012fe${trailer}` as Hex,'0x' as Hex])await assert.rejects(verifyHistoricalRuntime(root,artifact,async at=>at===root?code:altered,async()=>child));
 await assert.rejects(verifyHistoricalRuntime(root,artifact,async at=>at===root?code.replace('0x60','0x61') as Hex:`0x6012ff${trailer}`,async()=>child));
 await assert.rejects(verifyHistoricalRuntime(root,{deployedBytecode:{object:code,immutableReferences:{oops:[{start:999,length:1}]}}},async()=>code,async()=>child),/location/);
});
