import assert from 'node:assert/strict';

// Observe actual canvas draw coordinates in the test browser, without adding
// test hooks, session keys or telemetry to the shipped application.
export async function installMotionProbe(context) {
 await context.addInitScript(() => {
  window.pongitMotion = {active:false,frames:[]};
  const draw = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect = function(x,y,w,h) {
   if(window.pongitMotion.active && w===12 && h===96 && (x===22 || x===990))
    window.pongitMotion.frames.push({at:performance.now(),x,y});
   return draw.call(this,x,y,w,h);
  };
 });
}

export async function measureMotion(page,side) {
 const holds=[];
 for(const direction of [1,-1,1,-1]) {
  const key=direction===1?'s':'w';
  await page.evaluate(()=>{window.pongitMotion.frames=[];window.pongitMotion.active=true;});
  await page.keyboard.down(key);
  await page.waitForTimeout(650);
  await page.keyboard.up(key);
  const frames=await page.evaluate(()=>{window.pongitMotion.active=false;return window.pongitMotion.frames;});
  const samples=frames.filter(f=>f.x===(side===0?22:990));
  assert(samples.length>=8,'Not enough rendered frames to verify paddle motion');
  const backsteps=samples.slice(1).map((s,i)=>(s.y-samples[i].y)*direction).filter(d=>d < -0.05);
  const travel=(samples.at(-1).y-samples[0].y)*direction;
  holds.push({direction,frames:samples.length,reverseFrames:backsteps.length,worstBackstep:Math.max(0,...backsteps.map(d=>-d)),travel});
  assert(travel>30,'Held input must move immediately and continuously');
  if(!process.env.PONG_ALLOW_BASELINE_ROLLBACK)assert.equal(backsteps.length,0,`Owner paddle rolled back: ${JSON.stringify(holds.at(-1))}`);
  await page.waitForTimeout(200);
 }
 return holds;
}
