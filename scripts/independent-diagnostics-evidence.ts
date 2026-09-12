// Private aggregate diagnostics only. No request parameters or authenticator data.
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {publicIndependentManifest} from '../shared/independent';
const m=publicIndependentManifest(JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'))),db=new Pool({connectionString:process.env.DATABASE_URL});
try{
 const rows=(await db.query("SELECT component,data FROM il_rpc_diagnostics WHERE app=$1 AND received_at>now()-interval '30 minutes'",[m.lobby])).rows;
 const groups=new Map<string,{component:string;target:string;method:string;source:string;status:number;count:number;maxMs:number}>();
 for(const row of rows)for(const sample of row.data){
  const component=row.component==='vps'?'vps':'browser',key=[component,sample.target,sample.method,sample.source,sample.status].join(':');
  const group=groups.get(key)??{component,target:sample.target,method:sample.method,source:sample.source,status:sample.status,count:0,maxMs:0};
  group.count+=sample.count;group.maxMs=Math.max(group.maxMs,sample.maxMs);groups.set(key,group);
 }
 const report={at:new Date().toISOString(),scope:'Instrumentation smoke only, during a blocked arena and unrelated recovery/private-data tests. Not a complete game or before/after performance comparison.',batches:rows.length,groups:[...groups.values()]};
 await writeFile('artifacts/independent-candidate/diagnostics.json',JSON.stringify(report,null,2));console.log(JSON.stringify({batches:rows.length,groups:groups.size,components:[...new Set([...groups.values()].map(g=>g.component))]}));
}finally{await db.end();}
