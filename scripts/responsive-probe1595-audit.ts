// Read-only timing audit. Preserve the original failed hosted report.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {syncMetrics} from './browser-sync-probe';
const root='artifacts/qualification/catalogue-r2final70b2/';
const bytes=await readFile(root+'sync-trace.json'),data=JSON.parse(bytes.toString());
const reportBytes=await readFile(root+'report.json'),original=JSON.parse(reportBytes.toString());
assert.equal(original.passed,false);assert.equal(original.sync.paddleJumps.length,1);
const a=data.paddles.find((p:any)=>p.side===0&&Math.abs(p.at-25363.6)<.001);
const b=data.paddles.find((p:any)=>p.side===0&&p.at===25364);
assert(a&&b);
const displacement=a.y-b.y,rafMs=b.at-a.at,paintMs=b.paintedAt-a.paintedAt,integratedMs=b.integratedAt-a.integratedAt;
assert(Math.abs(displacement/integratedMs-.3)<1e-8);
assert(rafMs<.5&&paintMs===8);
const after=syncMetrics(data);assert.equal(after.paddleJumps.length,0);
await writeFile('docs/validation/responsive-probe1595-20261009.json',JSON.stringify({
 passed:true,kind:'Recorded measurement audit; original hosted failure remains',originalPassed:false,
 ref:original.ref,traceSha256:createHash('sha256').update(bytes).digest('hex'),reportSha256:createHash('sha256').update(reportBytes).digest('hex'),
 a,b,displacement,rafMs,paintMs,integratedMs,before:original.sync.paddleJumps,after:after.paddleJumps,
 productUnchanged:'2499ce1',jumpLimitUnchanged:'(contract speed +120)*actual paint interval/1000 +2',
},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,displacement,rafMs,paintMs,integratedMs}));
