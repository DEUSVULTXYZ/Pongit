import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
// Isolated visual fixture. It never imports an engine transport or wallet.
const source=`
import {chaosEvents} from './shared/chaos-events';
import {announceEffect,emptyEffects} from './shared/chaos-effects';
import {chaosPaddles} from './shared/chaos-modifiers';
import {drawChaosCourt,drawChaosPaddles,drawChaosBalls} from './web/lib/chaos-canvas';
const grid=document.getElementById('grid');
for(const e of chaosEvents){const box=document.createElement('article');box.innerHTML='<h2>'+e.name+'</h2><canvas width="1024" height="576"></canvas><p>'+e.description+'</p>';grid.appendChild(box);}
const start=performance.now();let frame;
function paint(now){const animate=document.getElementById('motion').checked&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 [...grid.children].forEach((box,i)=>{const id=i+1,canvas=box.querySelector('canvas'),c=canvas.getContext('2d');
 const ms=1200+(animate?(now-start)%3000:0),[effects]=announceEffect(emptyEffects(),id,0,0,id,0);
 const paddles=chaosPaddles(96000000n,72000000n,effects.map(e=>({...e,startsAt:BigInt(e.startsAt),expiresAt:BigInt(e.expiresAt),consumed:false})),BigInt(Math.floor(ms)));
 const balls=[{id:1,x:680,y:250,vx:192,vy:96,power:id===4||id===6||id===9,curving:id===5}];if(id===21)balls.push({...balls[0],id:2,x:370,y:360,vy:-96});
 const f={effects,gameMs:ms,effectsEnabled:true,reducedMotion:!animate,paddles:[{y:288,height:Number(paddles.heightA)/1e6,split:paddles.splitA},{y:288,height:Number(paddles.heightB)/1e6,split:paddles.splitB}],balls};
 c.fillStyle='#050912';c.fillRect(0,0,1024,576);c.strokeStyle='#1a2639';c.lineWidth=1;c.setLineDash([4,12]);c.beginPath();c.moveTo(512,0);c.lineTo(512,576);c.stroke();c.setLineDash([]);
 drawChaosCourt(c,f);drawChaosPaddles(c,f);drawChaosBalls(c,f);
 });frame=requestAnimationFrame(paint);
}
document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(frame);if(!document.hidden)frame=requestAnimationFrame(paint);});frame=requestAnimationFrame(paint);
`;
const result=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser',minify:true});
await mkdir('artifacts/drand',{recursive:true});
await writeFile('artifacts/drand/chaos-canvas.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PONGIT Chaos canvas review</title><style>
*{box-sizing:border-box}body{background:#070b15;color:#eaf3ff;font:16px/1.5 system-ui;margin:0;padding:32px}header{max-width:1500px;margin:0 auto 32px}h1{font-size:38px;margin:0 0 12px}header p{color:#b3c2d8}label{display:flex;align-items:center;gap:12px;min-height:44px}input{width:22px;height:22px}#grid{max-width:1500px;margin:auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}article{border:1px solid #26364b;background:#101826;overflow:hidden;border-radius:6px}h2{font-size:14px;letter-spacing:.07em;margin:16px}canvas{display:block;width:100%;height:auto;aspect-ratio:16/9}article p{padding:0 16px;font-size:14px;color:#bac9dc;min-height:64px}@media(max-width:1000px){#grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){body{padding:16px}#grid{grid-template-columns:1fr}}
</style><header><h1>CHAOS / Arena effects</h1><p>Visual review of the 24 candidate events. This is an isolated drawing fixture, not a playable game or proof of physics validation.</p><label><input id="motion" type="checkbox" checked>Animate the arena details</label></header><main id="grid"></main><script>${result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script></html>`);
console.log('artifacts/drand/chaos-canvas.html');
