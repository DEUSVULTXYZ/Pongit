import {test,expect} from "@playwright/test";
import {writeFile} from "node:fs/promises";
import {openCabinet} from "./cabinet";
test.use({trace:"off"});

test("Live cabinet remains controllable with pixel motion, mobile, results and a preserved session",async({browser})=>{
  test.setTimeout(180000);
  const base=process.env.PONG_TEST_URL||"http://localhost:3150",contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:1440,height:1000},hasTouch:true})));
  const pages=await Promise.all(contexts.map(c=>c.newPage())),addresses:string[]=[],samples:any[]=[],errors:string[]=[];
  try{
    for(let i=0;i<2;i++){
      const page=pages[i],cdp=await contexts[i].newCDPSession(page);page.on("pageerror",e=>errors.push(e.message));
      await cdp.send("WebAuthn.enable");await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
      await page.goto(base);await page.getByRole("button",{name:"Enter muted",exact:true}).click();await page.getByRole("button",{name:"Connect passkey",exact:true}).click();
      const response=page.waitForResponse(r=>/\/player\/0x[\da-f]+$/i.test(r.url()));await page.getByRole("button",{name:"Create a passkey"}).click();addresses.push((await response).url().split("/").at(-1)!);
      await expect(page.locator(".status-line")).toContainText("Arcade session ready",{timeout:30000});
    }
    const [a,b]=pages;
    await a.getByRole("button",{name:"Rivals",exact:true}).click();await a.getByLabel("Opponent address",{exact:true}).fill(addresses[1]);await a.getByRole("button",{name:/^Send challenge/}).click();
    await b.getByRole("button",{name:"Accept friendly",exact:true}).click({timeout:20000});
    for(const page of pages)await expect(page.locator(".match-bar")).toContainText("IN PLAY",{timeout:45000});
    const fingerprint=()=>a.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(sessionStorage.getItem("pongit:arcade-session:v3")||"")))).join('-'));
    const session=await fingerprint();
    for(const width of [1440,390]){
      await a.setViewportSize({width,height:width===390?844:1000});
      const cdp=await contexts[0].newCDPSession(a);if(width===390)await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
      for(const enabled of [false,true]){
        // Keep the same room and terrain; only gate decorative sprite animation.
        await a.evaluate(enabled=>{document.documentElement.dataset.pixelEffects=String(enabled);},enabled);
        const gaps=await a.evaluate(()=>new Promise<number[]>(resolve=>{const gaps:number[]=[];let last=performance.now(),start=last;const tick=(now:number)=>{gaps.push(now-last);last=now;if(now-start<6500)requestAnimationFrame(tick);else resolve(gaps.slice(1));};requestAnimationFrame(tick);}));
        await expect(a.locator("canvas")).toBeVisible();const sorted=[...gaps].sort((a,b)=>a-b);samples.push({width,cpuSlowdown:width===390?4:1,effects:enabled,frames:gaps.length,sampleMs:6500,fps:1000/(gaps.reduce((a,b)=>a+b,0)/gaps.length),p95:sorted[Math.ceil(sorted.length*.95)-1],p99:sorted[Math.ceil(sorted.length*.99)-1]});
      }
      const court=await a.locator("canvas").boundingBox();expect(court!.width/court!.height).toBeCloseTo(16/9,1);
      const overlaps=await a.locator(".pixel-ornament").evaluateAll((elements,r)=>elements.some(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&b.left<r.x+r.width&&b.right>r.x&&b.top<r.y+r.height&&b.bottom>r.y;}),court!);expect(overlaps).toBe(false);
      expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await a.screenshot({path:`artifacts/neon-cabinet-game-${width}.png`,fullPage:true});
      if(width===390){await a.getByRole("button",{name:"Move up",exact:true}).tap();}
      else {await a.keyboard.down("w");await a.waitForTimeout(150);await a.keyboard.up("w");}
    }
    await a.reload();await expect(a.locator(".match-bar")).toContainText("IN PLAY");expect(await fingerprint()).toBe(session);
    await openCabinet(b);await b.getByRole("button",{name:"Concede",exact:true}).click();
    await expect(a.locator(".outcome h2")).toHaveText("VICTORY",{timeout:25000});await expect(b.locator(".outcome h2")).toHaveText("DEFEAT",{timeout:25000});
    for(const [i,page] of pages.entries()){
      const skip=page.getByRole("button",{name:/^Skip animation/});if(await skip.isVisible())await skip.click();
      await expect(page.getByRole("button",{name:/^Rematch/})).toBeFocused();await expect(page.locator('body')).toHaveCSS('position','fixed');
      await page.screenshot({path:`artifacts/neon-cabinet-${i===0?'victory':'defeat'}.png`,fullPage:true});
      await page.getByRole("button",{name:"Close result",exact:true}).click();await expect(page.locator('body')).not.toHaveCSS('position','fixed');
    }
    expect(errors).toEqual([]);
    await writeFile("artifacts/neon-cabinet-live-performance.json",JSON.stringify({base,checkedAt:new Date().toISOString(),samples,errors,sessionPreserved:true,note:"Chromium desktop and a 390px viewport with CPU throttling, not a physical mobile device. Friendly game; no ranked or financial changes."},null,2));
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
