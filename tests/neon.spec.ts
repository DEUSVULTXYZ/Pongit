import {activity} from "./cabinet";
import {test,expect} from "@playwright/test";
import {writeFile} from "node:fs/promises";
test("Neon Rush cabinet, measured soundtrack and effects, tabs, mobile, and reduced motion",async({browser})=>{
 test.setTimeout(90000);const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(()=>{
   const w=window as any;w.audioContexts=[];w.outputMeters=[];
   const Original=window.AudioContext;window.AudioContext=new Proxy(Original,{construct(target,args){const c=Reflect.construct(target,args);w.audioContexts.push(c);return c;}});
   const connect=AudioNode.prototype.connect;
   AudioNode.prototype.connect=function(destination:any,...args:any[]):any{
     if(destination instanceof AudioDestinationNode){const meter=this.context.createAnalyser();meter.fftSize=2048;w.outputMeters.push(meter);(connect as any).call(this,meter);return (connect as any).call(meter,destination);}
     return (connect as any).call(this,destination,...args);
   };
 });
 const sample=()=>page.evaluate(()=>{let peak=0,sum=0;const values=new Float32Array(2048);(window as any).outputMeters.at(-1)?.getFloatTimeDomainData(values);for(const x of values){peak=Math.max(peak,Math.abs(x));sum+=x*x;}return {peak,rms:Math.sqrt(sum/values.length)};});
 try{
  await page.goto(process.env.PONG_TEST_URL||"http://localhost:3150");await page.getByRole("button",{name:/Enter arcade/}).click();
  await page.getByRole("button",{name:"Arcade settings",exact:true}).click();await expect(page.locator(".arcade-settings")).toContainText("Audio enabled",{timeout:25000});
  await expect(page.getByRole("slider",{name:"Music volume"})).toHaveValue("20");await expect(page.getByRole("slider",{name:"Effects volume"})).toHaveValue("60");
  const music=[];for(let i=0;i<30;i++){await page.waitForTimeout(50);music.push(await sample());}
  await expect.poll(async()=>(await sample()).rms,{timeout:15000}).toBeGreaterThan(.003);
  await page.getByRole("slider",{name:"Music volume"}).fill("0");await page.waitForTimeout(1000);await page.getByRole("button",{name:"Test sound",exact:true}).click();
  const effects=[];for(let i=0;i<10;i++){await page.waitForTimeout(25);effects.push(await sample());}
  expect(Math.max(...effects.map(x=>x.peak))).toBeGreaterThan(.05);
  await page.getByRole("slider",{name:"Music volume"}).fill("20");await page.getByRole("button",{name:"Close arcade settings"}).click();
  await page.screenshot({path:"artifacts/neon-desktop.png",fullPage:true});
  for(const tab of ["Rivals","Ladder","Tournaments","Archive","Play"]){if(["Ladder","Tournaments","Archive"].includes(tab))await activity(page,tab);else await page.getByRole("button",{name:tab,exact:true}).click();await expect(page.locator("h1")).toBeVisible();}
  expect(await page.evaluate(()=>(window as any).audioContexts.length)).toBe(1);
  await page.getByRole("button",{name:"Arcade settings",exact:true}).click();await page.locator(".arcade-settings").getByRole("button",{name:"Sound on",exact:true}).click();await page.waitForTimeout(500);expect((await sample()).peak).toBeLessThan(.001);
  await page.getByRole("button",{name:"Test sound",exact:true}).click();await expect(page.locator(".arcade-settings")).toContainText("Audio enabled");
  await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));});await expect.poll(()=>page.evaluate(()=>(window as any).audioContexts[0].state)).toBe("suspended");
  await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>false});document.dispatchEvent(new Event("visibilitychange"));});await page.getByRole("button",{name:"Test sound",exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).audioContexts[0].state)).toBe("running");
  await page.getByText("Room appearance",{exact:true}).click();await page.getByRole("button",{name:"Background effects on"}).click();await expect(page.locator(".arcade-background")).toHaveAttribute("data-effects","false");await page.getByRole("button",{name:"Close arcade settings"}).click();
  await page.emulateMedia({reducedMotion:"reduce"});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:"artifacts/neon-mobile-reduced-motion.png",fullPage:true});
  expect(errors).toEqual([]);await writeFile("artifacts/neon-audio.json",JSON.stringify({music,effects,errors,measuredAt:new Date().toISOString(),note:"Measured browser output; physical speaker/headphone listening is separate."},null,2));
 }finally{await page.close();}
});
