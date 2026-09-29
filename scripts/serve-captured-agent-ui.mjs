// Serve unmodified HTML, assets and CSP captured from the isolated production
// image. API/engine fixtures belong to the browser tests, not this file server.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(process.env.PONG_UI_CAPTURE??'artifacts/qualification/20260929/catalog-build/capture');
const port=Number(process.env.PONG_UI_PORT??4196);assert(port>=4190&&port<=4199);
const headers=JSON.parse(await readFile(resolve(root,'headers.json'),'utf8'));
const mime={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let page=path==='/'?'home':path==='/agents'?'catalog':path==='/agents/tournaments'?'tournaments':/^\/agents\/arenas\/0x[\da-f]+\/\d+\/\d+$/i.test(path)?'arena':undefined;
  if(page&&req.headers.rsc==='1')page+='-rsc';
  const file=resolve(root,page?`${page}.html`:path.startsWith('/_next/static/')?`static/${path.slice(14)}`:`public/${path.slice(1)}`);
  assert(!relative(root,file).startsWith('..'));
  const body=await readFile(file);res.writeHead(200,page?headers[page]:{'Content-Type':mime[extname(file)]??'application/octet-stream'});res.end(body);
 }catch{res.writeHead(404);res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log(`Captured production UI on http://127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
