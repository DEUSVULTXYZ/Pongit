// Reanalyse original evidence; never change the failed qualification reports.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {syncMetrics} from './browser-sync-probe';
import {deliveryEvidence} from './browser-delivery-evidence';
const sha=(raw:Uint8Array)=>createHash('sha256').update(raw).digest('hex');
const base='artifacts/qualification/';
const rawGeometry=await readFile(base+'catalogue-r2seven29a1/sync-trace.json');
const rawFirst=await readFile(base+'catalogue-r2seven29a1/report.json');
assert.equal(JSON.parse(String(rawFirst)).passed,false);
const geometry=syncMetrics(JSON.parse(String(rawGeometry)));
assert.equal(geometry.paddleJumps.length,0);
const clamp=geometry.geometryClamps.find((x:any)=>x.scheduledConfirmation?.effect===1);
assert(clamp);assert.equal(clamp.from,528);assert.equal(clamp.to,516);
assert.equal(clamp.scheduledConfirmation.boundary,'start');
const rawDelivery=await readFile(base+'catalogue-r2seven29a3/report.json');
const original=JSON.parse(String(rawDelivery));assert.equal(original.passed,false);
const delivery=deliveryEvidence(original.submissions,original.receipts,original.commandTimings);
assert.equal(delivery.unresolved.length,0);
assert.equal(delivery.reconciledCopies.length,1);
assert.equal(delivery.reconciledCopies[0].hash,'0xe290fd312ce277411c17db7d354400c6c0fb3a9d62412467e18d07d37f910611');
const report={at:new Date().toISOString(),scope:'Separate measurement diagnosis. Original trial remains failed, including its 8197ms admission.',
 geometry:{sourceSha256:sha(rawGeometry),originalReportSha256:sha(rawFirst),paddleJumps:geometry.paddleJumps,clamp},
 delivery:{originalReportSha256:sha(rawDelivery),...delivery}};
await writeFile(base+'r2seven29/measurement-diagnosis.json',JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({geometryClamps:1,unresolved:delivery.unresolved.length,reconciledCopies:delivery.reconciledCopies.length,originalFailurePreserved:true}));
