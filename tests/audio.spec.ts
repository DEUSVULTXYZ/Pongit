import {test,expect,chromium,firefox,webkit} from "@playwright/test";
import {writeFile} from "node:fs/promises";
for(const name of ["chromium","firefox","webkit"] as const)test(`Arcade audio and motion / ${name}`,async()=>{
  test.setTimeout(60000);const engine={chromium,firefox,webkit}[name];
  const browser=await engine.launch({headless:true,executablePath:name==="chromium"&&process.platform==="win32"?"C:/Program Files/Google/Chrome/Application/chrome.exe":engine.executablePath()});
  try {const page=await browser.newPage({viewport:{width:1280,height:900}});
    await page.addInitScript(()=>{const Original=window.AudioContext;(window as any).__audio=[];window.AudioContext=new Proxy(Original,{construct(target,args){const context=Reflect.construct(target,args);(window as any).__audio.push(context);return context;}});});
    await page.goto(process.env.PONG_TEST_URL||"http://localhost:3003");await page.getByRole("button",{name:"Enter arcade",exact:false}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).__audio[0]?.state)).toBe("running");expect(await page.evaluate(()=>(window as any).__audio.length)).toBe(1);
    await page.getByRole("button",{name:"Arcade settings"}).click();const settings=page.getByRole("dialog",{name:"Arcade settings"});
    await expect(page.getByRole("slider",{name:"Music volume"})).toHaveValue("20");await expect(page.getByRole("slider",{name:"Effects volume"})).toHaveValue("60");await page.getByRole("slider",{name:"Music volume"}).fill("30");await page.getByRole("slider",{name:"Effects volume"}).fill("40");
    await page.locator(".arcade-settings").getByRole("button",{name:"Sound on",exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("pongit:arcade-audio")!).enabled)).toBe(false);
    await page.reload();await expect(page.getByRole("button",{name:"Enter muted"})).toHaveCount(0);await page.getByRole("button",{name:"Arcade settings"}).click();await expect(page.getByRole("slider",{name:"Music volume"})).toHaveValue("30");await expect(page.getByRole("slider",{name:"Effects volume"})).toHaveValue("40");
    await page.locator(".arcade-settings").getByRole("button",{name:"Sound off",exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__audio[0]?.state)).toBe("running");
    await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));});await expect.poll(()=>page.evaluate(()=>(window as any).__audio[0]?.state)).toBe("suspended");expect(await page.locator(".arcade-background").evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
    await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>false});document.dispatchEvent(new Event("visibilitychange"));});await page.getByRole("button",{name:"Close arcade settings"}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__audio[0]?.state)).toBe("running");expect(await page.evaluate(()=>(window as any).__audio.length)).toBe(1);
    await page.emulateMedia({reducedMotion:"reduce"});expect(await page.locator(".arcade-grid").evaluate(el=>getComputedStyle(el).animationName)).toBe("none");await page.screenshot({path:`artifacts/arcade-${name}.png`,fullPage:true});
    await writeFile(`artifacts/arcade-audio-${name}.json`,JSON.stringify({engine:name,version:browser.version(),passedAt:new Date().toISOString(),checks:["gesture activation","single shared context","default and persistent volumes","mute","no repeat entrance","visibility event suspends and resumes","reduced motion"],visibility:"Synthetic visibilitychange exercises the lifecycle handler",note:name==="webkit"?`Playwright WebKit on ${process.platform}; physical Safari remains a separate device test`:undefined},null,2));
  }finally{await browser.close();}
});
