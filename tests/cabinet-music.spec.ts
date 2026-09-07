import {test,expect} from "@playwright/test";
import {writeFile} from "node:fs/promises";

test("Last Stop streams in full, survives navigation, and loops naturally",async({browser})=>{
 test.setTimeout(270000);const p=await browser.newPage();
 await p.addInitScript(()=>{const w=window as any;w.__media=[];w.__contexts=[];const Original=window.AudioContext;window.AudioContext=new Proxy(Original,{construct(t,a){const c=Reflect.construct(t,a);w.__contexts.push(c);const create=c.createMediaElementSource.bind(c);c.createMediaElementSource=(m:HTMLMediaElement)=>{w.__media.push(m);return create(m);};return c;}});});
 try{await p.goto(process.env.PONG_TEST_URL||"http://localhost:3150");await p.getByRole("button",{name:"Enter arcade ♫",exact:true}).click();await expect.poll(()=>p.evaluate(()=>(window as any).__media[0]?.duration),{timeout:20000}).toBeGreaterThan(214);
 const duration=await p.evaluate(()=>(window as any).__media[0].duration);expect(duration).toBeLessThan(216);
 await p.waitForTimeout(1500);const before=await p.evaluate(()=>(window as any).__media[0].currentTime);await p.getByRole("button",{name:"Rivals",exact:true}).click();expect(await p.evaluate(()=>(window as any).__media[0].currentTime)).toBeGreaterThanOrEqual(before);expect(await p.evaluate(()=>(window as any).__media.length)).toBe(1);
 // Let the complete piece play. Keep sampling so a 34-second loop cannot pass.
 const samples=[];let previous=0,looped=false;const start=Date.now();while(Date.now()-start<240000){await p.waitForTimeout(1000);const t=await p.evaluate(()=>(window as any).__media[0].currentTime);samples.push(t);if(t<previous-1){expect(previous).toBeGreaterThan(212);looped=true;break;}previous=t;}
 expect(looped).toBe(true);expect(samples.some(t=>t>200)).toBe(true);
 await p.getByRole("button",{name:"Arcade settings",exact:true}).click();await p.getByRole("button",{name:"Sound on",exact:true}).click();await expect.poll(()=>p.evaluate(()=>(window as any).__media[0].paused)).toBe(true);await p.getByRole("button",{name:"Test sound",exact:true}).click();await expect.poll(()=>p.evaluate(()=>(window as any).__media[0].paused)).toBe(false);expect(await p.evaluate(()=>(window as any).__contexts.length)).toBe(1);
 await writeFile("artifacts/cabinet-full-track.json",JSON.stringify({duration,samples,looped,measuredAt:new Date().toISOString(),note:"Uninterrupted real-time browser playback. Physical speaker listening is separate."},null,2));
 }finally{await p.close();}
});
