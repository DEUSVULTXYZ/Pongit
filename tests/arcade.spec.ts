import {openCabinet,openWallet,closeWallet} from "./cabinet";
import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("Arcade passkey continuity, direct duel, F5, rematch, finance and revocation",async({browser})=>{
  test.setTimeout(240000);
  const base=process.env.PONG_TEST_URL||"http://localhost:3003",api=process.env.PONG_TEST_API||"http://localhost:4013";
  const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({viewport:{width:1440,height:1000}})));
  const pages=await Promise.all(contexts.map(c=>c.newPage())),addresses:string[]=[],counts=[0,0,0],errors:string[]=[],timings:any[]=[];
  try {
    for(let i=0;i<3;i++){
      const p=pages[i],cdp=await contexts[i].newCDPSession(p);p.on("pageerror",e=>errors.push(e.message));
      await cdp.send("WebAuthn.enable");await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
      cdp.on("WebAuthn.credentialAsserted",()=>counts[i]++);
      await p.goto(base);await p.getByRole("button",{name:"Enter muted",exact:true}).click();await p.getByRole("button",{name:"Connect passkey",exact:true}).click();
      const response=p.waitForResponse(r=>/\/player\/0x[\da-f]+$/i.test(r.url()));await p.getByRole("button",{name:"Create a passkey"}).click();addresses.push((await response).url().split("/").at(-1)!);
      await expect(p.locator(".status-line")).toContainText("Arcade session ready",{timeout:30000});
    }
    const baseline=[...counts],[a,b,s]=pages;
    await a.getByRole("button",{name:"Rivals",exact:true}).click();await a.getByLabel("Opponent address",{exact:true}).fill(addresses[1]);await a.getByRole("button",{name:"Send challenge"}).click();
    // Deliver the private notification before the Accept HTTP response: both
    // paths must reuse one room secret and one signed consent.
    await b.route("**/challenges/*/accept",async route=>{const response=await route.fetch();await b.waitForTimeout(1200);await route.fulfill({response});});
    await expect(b.locator(".duel-notifications")).toContainText("FRIENDLY",{timeout:15000});const acceptedResponse=b.waitForResponse(r=>r.url().endsWith("/accept")&&r.request().method()==="POST");await b.getByRole("button",{name:"Accept friendly"}).click();await acceptedResponse;
    await b.unroute("**/challenges/*/accept");
    for(const p of [a,b])await expect(p.locator(".match-bar")).toContainText("IN PLAY",{timeout:45000});
    await a.bringToFront();await a.screenshot({path:"artifacts/neon-ingame-desktop.png"});
    await a.setViewportSize({width:1280,height:720});expect(await a.evaluate(()=>scrollY)).toBe(0);const courtBox=await a.locator("canvas").boundingBox();expect(courtBox!.y+courtBox!.height).toBeLessThanOrEqual(720);await expect(a.locator(".touch-controls")).toBeInViewport();await a.screenshot({path:"artifacts/neon-ingame-720.png"});await a.setViewportSize({width:1440,height:1000});
    const matches=async()=> (await (await s.request.get(api+"/matches")).json()).matches;
    const first=(await matches()).find((m:any)=>m.status===2&&[m.playerA,m.playerB].some((x:string)=>x.toLowerCase()===addresses[0].toLowerCase()));expect(first).toBeTruthy();
    a.on("response",async r=>{if(/\/jobs\//.test(r.url()))try{const j=await r.json();if(j.status==="succeeded"&&j.timing)timings.push(j.timing);}catch{}});
    await a.keyboard.down("w");await a.waitForTimeout(1100);await a.keyboard.up("w");await a.waitForTimeout(700);
    const saved=await a.evaluate(()=>{const s=JSON.parse(sessionStorage.getItem("pongit:arcade-session:v3")!);return {player:s.player,key:s.key,game:s.game};});expect(saved.player.toLowerCase()).toBe(addresses[0].toLowerCase());
    const popupEvent=a.waitForEvent("popup");await a.evaluate(()=>window.open(location.href,"_blank"));const twin=await popupEvent;await expect(twin.locator(".notice")).toContainText("Another tab controls",{timeout:15000});await twin.close();
    await a.reload();await expect(a.locator(".status-line")).toContainText("Arcade session restored",{timeout:20000});await expect(a.locator(".match-bar")).toContainText("IN PLAY");
    await a.keyboard.down("s");await a.waitForTimeout(1100);await a.keyboard.up("s");expect(counts.slice(0,2)).toEqual(baseline.slice(0,2));
    await contexts[0].setOffline(true);await a.waitForTimeout(1200);await contexts[0].setOffline(false);await expect(a.locator(".heading-meta")).toContainText("CONNECTED",{timeout:15000});expect(counts.slice(0,2)).toEqual(baseline.slice(0,2));
    await s.getByRole("button",{name:/^Live/}).click();await s.locator(`[data-match-id="${first.id}"]`).click();await expect(s.locator("canvas")).toBeVisible();
    await openCabinet(b);await b.getByRole("button",{name:"Concede",exact:true}).click();await expect(a.locator(".outcome h2")).toHaveText("VICTORY",{timeout:20000});await expect(b.locator(".outcome h2")).toHaveText("DEFEAT");await expect(s.locator(".spectator-result")).toBeVisible();
    await a.bringToFront();await a.waitForTimeout(900);await a.screenshot({path:"artifacts/neon-victory.png"});await b.bringToFront();await b.waitForTimeout(300);await b.screenshot({path:"artifacts/neon-defeat.png"});
    // The result scrolls on short screens; the page underneath remains fixed.
    for(const p of [a,b])await expect(p.locator("body")).toHaveCSS("position","fixed");
    await a.setViewportSize({width:390,height:320});await a.bringToFront();const backgroundTop=await a.locator("body").evaluate(e=>e.style.top);
    await a.mouse.move(195,250);await a.mouse.wheel(0,700);await expect.poll(()=>a.locator(".outcome").evaluate(e=>e.scrollTop)).toBeGreaterThan(0);expect(await a.locator("body").evaluate(e=>e.style.top)).toBe(backgroundTop);expect(await a.evaluate(()=>scrollY)).toBe(0);
    await a.getByRole("button",{name:"Find another opponent",exact:true}).scrollIntoViewIfNeeded();await expect(a.getByRole("button",{name:"Find another opponent",exact:true})).toBeInViewport();await a.screenshot({path:"artifacts/result-scroll-mobile.png"});await a.setViewportSize({width:1440,height:1000});
    await a.getByRole("button",{name:"Rematch"}).click();await expect(a.locator("body")).not.toHaveCSS("position","fixed");await expect(b.locator(".duel-notifications")).toBeVisible({timeout:15000});await b.getByRole("button",{name:"Rematch"}).click();
    await expect.poll(async()=> (await matches()).filter((m:any)=>m.status===2&&[m.playerA,m.playerB].some((x:string)=>x.toLowerCase()===addresses[0].toLowerCase())).map((m:any)=>m.id),{timeout:40000}).toHaveLength(1);
    const second=(await matches()).find((m:any)=>m.status===2&&m.id!==first.id);expect(second.mode).toBe(first.mode);expect(second.ranked).toBe(first.ranked);expect(second.tournamentId).toBe("0");
    for(const p of [a,b])await expect(p.locator(".match-bar")).toContainText("IN PLAY");expect(counts.slice(0,2)).toEqual(baseline.slice(0,2));
    await openWallet(a);await a.getByRole("button",{name:"Get test credits"}).click();await expect(a.locator(".account-feedback")).toContainText("credited",{timeout:20000});await closeWallet(a);expect(counts[0]).toBe(baseline[0]+1);
    await openCabinet(b);await b.getByRole("button",{name:"Concede",exact:true}).click();await expect(a.locator(".outcome h2")).toHaveText("VICTORY",{timeout:20000});await a.getByRole("button",{name:"Close result"}).click();
    await contexts[0].setOffline(true);await a.waitForTimeout(17000);expect(await a.evaluate(()=>sessionStorage.getItem("pongit:arcade-session:v3"))).not.toBeNull();await contexts[0].setOffline(false);await a.reload();await expect(a.locator(".status-line")).toContainText("Arcade session restored",{timeout:25000});expect(counts[0]).toBe(baseline[0]+1);
    await a.setViewportSize({width:1280,height:720});
    await a.getByRole("button",{name:"Open account details"}).click();await a.getByRole("button",{name:"Disconnect",exact:true}).click();await expect(a.locator(".status-line")).toContainText("revocation confirmed",{timeout:20000});
    expect(await a.evaluate(()=>sessionStorage.getItem("pongit:arcade-session:v3"))).toBeNull();expect((await (await a.request.get(api+`/arcade/${addresses[0]}`)).json()).expires).toBe("0");
    const reconnectAssertions=counts[0];await a.getByRole("button",{name:"Connect passkey",exact:true}).click();await expect(a.locator(".status-line")).toContainText("Arcade session ready",{timeout:30000});expect(counts[0]).toBe(reconnectAssertions+1);await expect(a.locator(".connect-modal")).toHaveCount(0);
    // Expired same-tab storage must expose renewal on the main account button.
    await a.evaluate(()=>{const key="pongit:arcade-session:v3",data=JSON.parse(sessionStorage.getItem(key)!);data.expires=0;sessionStorage.setItem(key,JSON.stringify(data));});await a.reload();
    const renew=a.locator("header").getByRole("button",{name:"Renew arcade session",exact:true});await expect(renew).toBeEnabled({timeout:20000});await expect(a.locator(".connect-modal")).toHaveCount(0);
    const beforeRenew=counts[0];let grants=0;const countGrant=(r:any)=>{if(r.method()==="POST"&&r.url().endsWith("/relay")){const payload=r.postDataJSON();if(payload?.contract==="arcade"&&payload?.functionName==="register")grants++;}};a.on("request",countGrant);
    await renew.dblclick();await expect(a.locator(".status-line")).toContainText("Arcade session ready",{timeout:30000});expect(counts[0]).toBe(beforeRenew+1);expect(grants).toBe(1);a.off("request",countGrant);await expect(a.locator(".connect-modal")).toHaveCount(0);
    expect((await a.evaluate(()=>JSON.parse(sessionStorage.getItem("pongit:arcade-session:v3")!).player)).toLowerCase()).toBe(addresses[0].toLowerCase());
    await a.getByRole("button",{name:"Arcade settings"}).click();await a.getByRole("slider",{name:"Music volume"}).fill("35");await a.getByText("Room appearance",{exact:true}).click();await a.getByRole("button",{name:"Background effects on"}).click();await expect(a.locator(".arcade-background")).toHaveAttribute("data-effects","false");await a.getByRole("button",{name:"Sound off",exact:true}).last().click();await a.getByRole("button",{name:"Close arcade settings"}).click();
    await a.setViewportSize({width:390,height:844});expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await a.screenshot({path:"artifacts/arcade-mobile.png",fullPage:true});
    expect(errors).toEqual([]);await writeFile("artifacts/arcade-browser.json",JSON.stringify({base,addresses,matches:[first.id,second.id],passkeyAssertions:counts,baseline,timings,passedAt:new Date().toISOString(),authenticator:"Chromium virtual PRF; physical cross-device sync requires a separate demonstration"},null,2));
  }catch(e){for(let i=0;i<3;i++){console.log("Arcade browser",i,await pages[i].locator(".notice,.status-line").allTextContents());await pages[i].screenshot({path:`artifacts/arcade-failure-${i}.png`,fullPage:true});}throw e;}finally{await Promise.all(contexts.map(c=>c.close()));}
});
