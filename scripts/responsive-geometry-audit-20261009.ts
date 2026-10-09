// Reanalyse the retained raw render trace without changing its failed report.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {syncMetrics} from './browser-sync-probe';
const path='artifacts/qualification/catalogue-r2seven18a3/';
const raw=await readFile(path+'sync-trace.json'),old=await readFile(path+'report.json');
assert.equal(JSON.parse(String(old)).passed,false);
const analysis=syncMetrics(JSON.parse(String(raw)));
const report={scope:'Separate geometry diagnosis; original admission and qualification failure retained',at:new Date().toISOString(),
 traceSha256:createHash('sha256').update(raw).digest('hex'),originalReportSha256:createHash('sha256').update(old).digest('hex'),
 paddleJumps:analysis.paddleJumps,scheduledClamps:analysis.geometryClamps.filter((x:any)=>x.scheduledConfirmation)};
assert.equal(report.paddleJumps.length,0);assert.equal(report.scheduledClamps.length,1);
await writeFile('artifacts/qualification/r2seven18/geometry-diagnosis.json',JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
