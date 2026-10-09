// Reanalyse the retained raw render trace without changing its failed report.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {syncMetrics} from './browser-sync-probe';
const path='artifacts/independent-candidate/browser-chaos-r2seven24hx/';
const old=await readFile(path+'report.json');assert.equal(JSON.parse(String(old)).passed,false);
const traces=[];
for(const name of ['sync-0.json','sync-1.json']){
 const raw=await readFile(path+name),analysis=syncMetrics(JSON.parse(String(raw)));
 const entry={name,sha256:createHash('sha256').update(raw).digest('hex'),paddleJumps:analysis.paddleJumps,
  scheduledClamps:analysis.geometryClamps.filter((x:any)=>x.scheduledConfirmation)};
 assert.equal(entry.paddleJumps.length,0);assert.equal(entry.scheduledClamps.length,2);traces.push(entry);
}
const report={scope:'Separate exact known-start geometry diagnosis; original qualification failure retained',at:new Date().toISOString(),
 originalReportSha256:createHash('sha256').update(old).digest('hex'),traces};
await writeFile('artifacts/qualification/r2seven24/geometry-diagnosis.json',JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
