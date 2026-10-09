// Reanalyse the retained raw render trace without changing its failed report.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {syncMetrics} from './browser-sync-probe';
const path='artifacts/independent-candidate/browser-chaos-r2seven27hx/';
const old=await readFile(path+'report.json');assert.equal(JSON.parse(String(old)).passed,false);
const reportData=JSON.parse(String(old));const ids=new Set(reportData.liveControls.map((x:any)=>x.id));assert.equal(ids.size,1);const matchId=[...ids][0];
const traces=[];
for(const name of ['sync-0.json','sync-1.json']){
 const raw=await readFile(path+name),data=JSON.parse(String(raw));
 const refs=new Set(data.poses.map((p:any)=>p.ref));assert.equal(refs.size,1);assert.equal(String([...refs][0]).split(':').at(-1),matchId);
 // Legacy human snapshots omitted matchId; bind the diagnostic clone to the
 // independently recorded live-control identity. Original bytes remain intact.
 for(const snapshot of data.snapshots)snapshot.matchId=matchId;
 const analysis=syncMetrics(data);
 const entry={name,sha256:createHash('sha256').update(raw).digest('hex'),paddleJumps:analysis.paddleJumps,
  scheduledClamps:analysis.geometryClamps.filter((x:any)=>x.scheduledConfirmation)};
 assert.equal(entry.paddleJumps.length,0);assert.equal(entry.scheduledClamps.length,1);traces.push(entry);
}
const report={scope:'Separate exact known-expiry geometry diagnosis with recorded live-control binding; original qualification failure retained',at:new Date().toISOString(),
 originalReportSha256:createHash('sha256').update(old).digest('hex'),traces};
await writeFile('artifacts/qualification/r2seven27/geometry-diagnosis.json',JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
