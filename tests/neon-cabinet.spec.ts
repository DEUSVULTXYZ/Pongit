import {test,expect} from "@playwright/test";
import {writeFile} from "node:fs/promises";

const base=process.env.PONG_TEST_URL||"http://localhost:3150";
// Tracing captures every canvas and distorts frame-time measurements.
test.use({trace:"off"});

test("Pixel details animate in short, staggered bursts and respect visibility and saved preferences",async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(base);await page.getByRole("button",{name:"Enter muted",exact:true}).click();
  const cabinet=page.locator(".pixel-header-left"),frames=cabinet.locator(".pixel-frames");
  await expect(cabinet).toHaveAttribute("data-pixel-visible","true");
  await expect(frames).toHaveCSS("animation-play-state","running");
  expect(await page.locator(".arcade-background").evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
  expect(await page.locator(".pixel-ornament :is(a,button,input),.pixel-ornament[tabindex]").count()).toBe(0);
  for(const ornament of await page.locator(".pixel-ornament").all())await expect(ornament).toHaveAttribute("aria-hidden","true");
  const positions=await frames.evaluate(e=>{const a=e.getAnimations()[0];a.pause();const at=(time:number)=>{a.currentTime=time;return new DOMMatrix(getComputedStyle(e).transform).m41;};const positions=[at(0),at(500),at(1500),at(11900)];a.play();return positions;});
  expect(positions[0]).toBe(0);expect(positions[1]).toBeLessThan(0);expect(positions.slice(2)).toEqual([0,0]);
  const phases=await page.locator(".pixel-ornament").evaluateAll(elements=>elements.map(e=>getComputedStyle(e.querySelector('.pixel-frames')!).animationDelay).sort());
  expect(phases).toEqual(["0s","3s","6s","9s"]);
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await expect(cabinet).toHaveAttribute("data-pixel-visible","false");await expect(frames).toHaveCSS("animation-play-state","paused");
  await page.evaluate(()=>window.scrollTo(0,0));await expect(frames).toHaveCSS("animation-play-state","running");
  await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));});
  await expect(frames).toHaveCSS("animation-play-state","paused");
  await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>false});document.dispatchEvent(new Event("visibilitychange"));});
  await expect(frames).toHaveCSS("animation-play-state","running");
  await page.getByRole("button",{name:"Arcade settings",exact:true}).click();await page.getByText("Room appearance",{exact:true}).click();
  await page.getByRole("button",{name:"Background effects on",exact:true}).click();await expect(frames).toHaveCSS("animation-name","none");
  await page.keyboard.press("Escape");await page.reload();await expect(frames).toHaveCSS("animation-name","none");
  await page.getByRole("button",{name:"Arcade settings",exact:true}).click();await page.getByText("Room appearance",{exact:true}).click();
  await page.getByRole("button",{name:"Background effects off",exact:true}).click();await page.keyboard.press("Escape");
  await page.emulateMedia({reducedMotion:"reduce"});await expect(frames).toHaveCSS("animation-name","none");expect(await frames.evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).m41)).toBe(0);
});

test("Cabinet surfaces and reading text stay legible; mobile exposes only two ornaments",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto(base);await page.getByRole("button",{name:"Enter muted",exact:true}).click();
  const shown=await page.locator(".pixel-ornament").evaluateAll(elements=>elements.filter(e=>!!(e as HTMLElement).offsetWidth&&(e as HTMLElement).offsetHeight>0).length);expect(shown).toBe(2);
  await expect(page.getByRole("button",{name:"Play now",exact:false})).toBeInViewport();
  await page.getByRole("button",{name:"Arcade settings",exact:true}).click();const dialog=page.getByRole("dialog",{name:"Arcade settings"});
  await expect(dialog.locator('p:not(.eyebrow)').first()).toHaveCSS("font-family",/system-ui/);await expect(dialog.locator('p:not(.eyebrow)').first()).toHaveCSS("font-size","16px");
  for(const control of await dialog.locator("button,input,select").all()){if(await control.isVisible()){const box=await control.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);}}
  await page.keyboard.press("Escape");await page.goto(base+"/docs");await expect(page.locator(".docs-pixel-accent .pixel-frames")).toHaveCSS("animation-name","none");
  await expect(page.locator(".docs-home-hero>p").last()).toHaveCSS("font-family",/system-ui/);expect(await page.locator("audio,canvas").count()).toBe(0);
});

test("Decoration frame cost with effects on and off",async({browser})=>{
  test.setTimeout(90000);const results=[];
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});const page=await context.newPage();
    const cdp=await context.newCDPSession(page);if(mobile)await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
    try{
      await page.goto(base);await page.getByRole("button",{name:"Enter muted",exact:true}).click();
      for(const enabled of [false,true]){
        // Isolate sprite cost: keep the static room identical in both samples.
        await page.evaluate(enabled=>{document.documentElement.dataset.pixelEffects=String(enabled);},enabled);
        const gaps=await page.evaluate(()=>new Promise<number[]>(resolve=>{const gaps:number[]=[];let last=performance.now(),start=last;function frame(now:number){gaps.push(now-last);last=now;if(now-start<13000)requestAnimationFrame(frame);else resolve(gaps.slice(1));}requestAnimationFrame(frame);}));
        const sorted=[...gaps].sort((a,b)=>a-b);results.push({mobile,cpuSlowdown:mobile?4:1,effects:enabled,sampleMs:13000,frames:gaps.length,fps:1000/(gaps.reduce((a,b)=>a+b,0)/gaps.length),p95:sorted[Math.ceil(sorted.length*.95)-1],p99:sorted[Math.ceil(sorted.length*.99)-1]});
      }
    }finally{await context.close();}
  }
  await writeFile("artifacts/neon-cabinet-decoration-performance.json",JSON.stringify({measuredAt:new Date().toISOString(),base,note:"Home-page rendering, CPU emulation; static room kept enabled in both samples to isolate sprite cost. Live-court samples are reported separately.",results},null,2));
});
