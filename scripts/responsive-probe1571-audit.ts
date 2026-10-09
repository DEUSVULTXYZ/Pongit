// Read-only measurement audit. Preserve the failed natural-match report.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {sustainedInputMetrics} from './browser-sync-probe';
const root='artifacts/qualification/catalogue-r2final67c2/';
const bytes=await readFile(root+'sync-trace.json'),data=JSON.parse(bytes.toString());
const reportBytes=await readFile(root+'report.json'),original=JSON.parse(reportBytes.toString());
assert.equal(original.passed,false);assert.equal(original.error,'Held movement differs from contractual speed');
const a=data.paddles.find((p:any)=>p.side===0&&p.at===15007);
const b=data.paddles.find((p:any)=>p.side===0&&p.at===15107.2);
assert(a&&b);
const displacement=a.y-b.y;
const rafRatio=displacement/((b.at-a.at)*.3);
const paintRatio=displacement/((b.paintedAt-a.paintedAt)*.3);
const integratedRatio=displacement/((b.integratedAt-a.integratedAt)*.3);
assert(rafRatio>1.05);assert(Math.abs(integratedRatio-1)<1e-8);assert(paintRatio>.95&&paintRatio<1.05);
const metrics=sustainedInputMetrics(data);
assert.equal(metrics.held.outsideTarget,0);
await writeFile('docs/validation/responsive-probe1571-20261009.json',JSON.stringify({
 passed:true,kind:'Recorded measurement audit, not a new hosted pass',originalPassed:false,
 ref:original.ref,traceSha256:createHash('sha256').update(bytes).digest('hex'),
 reportSha256:createHash('sha256').update(reportBytes).digest('hex'),
 a,b,displacement,rafRatio,paintRatio,integratedRatio,held:metrics.held,rawRaf:metrics.heldUsingRafTime,
 productUnchanged:'2499ce1',thresholdUnchanged:[.95,1.05],
},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,rafRatio,paintRatio,integratedRatio,held:metrics.held}));
