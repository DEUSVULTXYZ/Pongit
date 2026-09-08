// Visual regression check on the private VPS candidate, with no financial writes.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

assert.equal(process.env.ROOMS_BROWSER_TEST, "isolated-vps");
const origin = "https://pongit.xyz";
const out = "artifacts/cabinet-depth";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({headless:true,args:["--no-sandbox"]});
const context = await browser.newContext();
const report = {viewports:[],checks:[],errors:[]};
await context.addInitScript(() => localStorage.setItem("pongit:arcade-audio", JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:true,intensity:"full"})));
await context.route(origin + "/**", async route => {
  const u = new URL(route.request().url());
  if (u.pathname.startsWith("/api/") && route.request().method() !== "GET") return route.abort();
  const response = await route.fetch({url: u.pathname.startsWith("/api/interlude/")
    ? "http://rooms-api:4000" + u.pathname.slice(4) + u.search
    : u.pathname.startsWith("/api/") ? route.request().url()
    : "http://rooms-web:3000" + u.pathname + u.search});
  await route.fulfill({response});
});
const page = await context.newPage();
page.on("pageerror", e => report.errors.push(e.message));
try {
  for (const viewport of [{width:360,height:640},{width:390,height:844},{width:768,height:1024},{width:1440,height:1000},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    await page.goto(origin + "/rooms");
    await page.locator(".rooms-choice").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const boxes = await page.locator(".rooms-choice").evaluateAll(es => es.map(e => {const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};}));
    assert.equal(boxes.length,3);
    assert(boxes.every(b=>b.height>=44 && b.x>=0 && b.x+b.width<=viewport.width));
    if(viewport.width===360) assert(boxes.every(b=>b.bottom<=640),"All choices above mobile fold");
    const content=await page.locator(".rooms-choice").evaluateAll(es=>es.map(e=>{
      const title=e.querySelector("strong").getBoundingClientRect(), model=e.querySelector(".rooms-choice-stage").getBoundingClientRect();
      const subtitle=e.querySelector("strong + span").getBoundingClientRect();
      return {title:{x:title.x,right:title.right,top:title.top,bottom:title.bottom},model:{right:model.right,bottom:model.bottom},subtitle:{top:subtitle.top,x:subtitle.x}};
    }));
    if(viewport.width<768) assert(content.every(c=>c.title.x>=c.model.right+8 && c.subtitle.x>=c.model.right+8),"Cabinet model must not cover either label");
    else if(viewport.height>500) assert(content.every(c=>c.title.top>=c.model.bottom),"Desktop label below its screen");
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await page.locator(".cabinet-model[aria-hidden=true][focusable=false]").count(),3);
    assert.equal(await page.locator(".arcade-background").evaluate(e=>e.getAnimations({subtree:true}).length),0);
    await page.screenshot({path:`${out}/rooms-${viewport.width}.png`,fullPage:true});
    report.viewports.push({viewport,boxes});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:"reduce"});
  const choice=page.locator(".rooms-choice").first();
  await choice.focus();
  assert(await choice.evaluate(e=>e===document.activeElement));
  await choice.hover();
  assert.equal(await choice.evaluate(e=>getComputedStyle(e).transform),"none");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  assert(await choice.evaluate(e=>e===document.activeElement));
  report.checks.push("Three visible mobile choices, centered controls, decorative SVGs excluded from focus, static background, reduced motion and keyboard activation/focus return");
  for (const width of [360,1440]) {
    await page.setViewportSize({width,height:width===360?640:1000});
    await page.goto(origin + "/legacy");
    await page.locator(".home-cabinet").waitFor();
    await page.evaluate(()=>document.fonts.ready);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${out}/legacy-${width}.png`,fullPage:true});
  }
  await page.goto(origin + "/docs");
  assert.equal(await page.locator("canvas,audio,.cabinet-model").count(),0);
  report.checks.push("Legacy cabinet remains usable; documentation has no game or decorative models");
  assert.deepEqual(report.errors,[]);
} catch(e) {
  report.failure=e.message;
  await page.screenshot({path:`${out}/failure.png`,fullPage:true});
  process.exitCode=1;
} finally {
  await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  await context.unrouteAll({behavior:"ignoreErrors"});
  await browser.close();
}
