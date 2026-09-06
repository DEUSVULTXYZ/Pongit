import {test,expect} from "@playwright/test";
import {writeFile} from "node:fs/promises";
test("mobile replay performance under CPU and network emulation",async({browser})=>{
 test.setTimeout(90000);const base=process.env.PONG_TEST_URL || "http://localhost:3002";
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});const p=await context.newPage(),errors:string[]=[];p.on("pageerror",e=>errors.push(e.message));
 const cdp=await context.newCDPSession(p);await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});await cdp.send("Network.enable");await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:40,downloadThroughput:500000,uploadThroughput:125000});
 await p.addInitScript(()=>{const w=window as any;w.perf={lcp:0,cls:0,longTasks:[]};for(const kind of ["largest-contentful-paint","layout-shift","longtask"]){new PerformanceObserver(list=>list.getEntries().forEach((e:any)=>{if(kind==="largest-contentful-paint")w.perf.lcp=e.startTime;else if(kind==="layout-shift" && !e.hadRecentInput)w.perf.cls+=e.value;else if(kind==="longtask")w.perf.longTasks.push(e.duration);})).observe({type:kind,buffered:true});}});
 try{
  await p.goto(base);await p.getByRole("button",{name:"Enter muted"}).click();await p.getByRole("button",{name:"Archive",exact:true}).click();await p.locator(".match-row").filter({hasText:"FINAL"}).first().click();await expect(p.getByRole("button",{name:/^Play replay/})).toBeVisible({timeout:30000});await p.getByRole("button",{name:/^Play replay/}).click();
  const frames=await p.evaluate(()=>new Promise<number[]>(resolve=>{const values:number[]=[];let last=performance.now(),start=last;function frame(now:number){values.push(now-last);last=now;if(now-start<3000)requestAnimationFrame(frame);else resolve(values.slice(1));}requestAnimationFrame(frame);}));
  expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  const metrics=await p.evaluate(()=>({...((window as any).perf),navigation:performance.getEntriesByType("navigation")[0].toJSON(),resourceBytes:performance.getEntriesByType("resource").reduce((s:number,e:any)=>s+e.transferSize,0)}));
  const sorted=[...frames].sort((a,b)=>a-b),q=(p:number)=>sorted[Math.ceil(p*sorted.length)-1];
  await writeFile("artifacts/mobile-performance.json",JSON.stringify({base,emulation:"Chromium: 390x844, DPR 3, touch, CPU 4x slowdown; network 4 Mbps down / 1 Mbps up + 40ms latency. Not a physical phone.",sampleMs:3000,frames:frames.length,averageFps:1000/(frames.reduce((a,b)=>a+b,0)/frames.length),frameGapMs:{p50:q(.5),p95:q(.95),p99:q(.99)},...metrics,checkedAt:new Date().toISOString()},null,2));await p.screenshot({path:"artifacts/mobile-performance.png",fullPage:true});
 }finally{await context.close();}
});
