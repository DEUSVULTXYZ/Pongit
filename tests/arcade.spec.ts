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
    await expect(b.locator(".duel-notifications")).toContainText("FRIENDLY",{timeout:15000});await b.getByRole("button",{name:"Accept friendly"}).click();
    for(const p of [a,b])await expect(p.locator(".match-bar")).toContainText("IN PLAY",{timeout:45000});
    const matches=async()=> (await (await s.request.get(api+"/matches")).json()).matches;
    const first=(await matches()).find((m:any)=>m.status===2&&[m.playerA,m.playerB].some((x:string)=>x.toLowerCase()===addresses[0].toLowerCase()));expect(first).toBeTruthy();
    a.on("response",async r=>{if(/\/jobs\//.test(r.url()))try{const j=await r.json();if(j.status==="succeeded"&&j.timing)timings.push(j.timing);}catch{}});
    await a.keyboard.down("w");await a.waitForTimeout(1100);await a.keyboard.up("w");await a.waitForTimeout(700);
    const saved=await a.evaluate(()=>{const s=JSON.parse(sessionStorage.getItem("pongit:arcade-session:v3")!);return {player:s.player,key:s.key,game:s.game};});expect(saved.player.toLowerCase()).toBe(addresses[0].toLowerCase());
    const popupEvent=a.waitForEvent("popup");await a.evaluate(()=>window.open(location.href,"_blank"));const twin=await popupEvent;await expect(twin.locator(".notice")).toContainText("Another tab controls",{timeout:15000});await twin.close();
    await a.reload();await expect(a.locator(".status-line")).toContainText("Arcade session restored",{timeout:20000});await expect(a.locator(".match-bar")).toContainText("IN PLAY");
    await a.keyboard.down("s");await a.waitForTimeout(1100);await a.keyboard.up("s");expect(counts.slice(0,2)).toEqual(baseline.slice(0,2));
    await s.getByRole("button",{name:/^Live/}).click();await s.locator(`[data-match-id="${first.id}"]`).click();await expect(s.locator("canvas")).toBeVisible();
    await b.getByRole("button",{name:"Concede",exact:true}).click();await expect(a.locator(".outcome h2")).toHaveText("VICTORY",{timeout:20000});await expect(b.locator(".outcome h2")).toHaveText("DEFEAT");await expect(s.locator(".spectator-result")).toBeVisible();
    await a.getByRole("button",{name:"Rematch"}).click();await expect(b.locator(".duel-notifications")).toBeVisible({timeout:15000});await b.getByRole("button",{name:"Accept friendly"}).click();
    await expect.poll(async()=> (await matches()).filter((m:any)=>m.status===2&&[m.playerA,m.playerB].some((x:string)=>x.toLowerCase()===addresses[0].toLowerCase())).map((m:any)=>m.id),{timeout:40000}).toHaveLength(1);
    const second=(await matches()).find((m:any)=>m.status===2&&m.id!==first.id);expect(second.mode).toBe(first.mode);expect(second.ranked).toBe(first.ranked);expect(second.tournamentId).toBe("0");
    for(const p of [a,b])await expect(p.locator(".match-bar")).toContainText("IN PLAY");expect(counts.slice(0,2)).toEqual(baseline.slice(0,2));
    await a.getByRole("button",{name:"Get test credits"}).click();await expect(a.locator(".status-line")).toContainText("credited",{timeout:20000});expect(counts[0]).toBe(baseline[0]+1);
    await b.getByRole("button",{name:"Concede",exact:true}).click();await expect(a.locator(".outcome h2")).toHaveText("VICTORY",{timeout:20000});await a.getByRole("button",{name:"Close result"}).click();
    await a.getByRole("button",{name:"Open account details"}).click();await a.getByRole("button",{name:"Disconnect",exact:true}).click();await expect(a.locator(".status-line")).toContainText("revocation confirmed",{timeout:20000});
    expect(await a.evaluate(()=>sessionStorage.getItem("pongit:arcade-session:v3"))).toBeNull();expect((await (await a.request.get(api+`/arcade/${addresses[0]}`)).json()).expires).toBe("0");
    await a.getByRole("button",{name:"Connect passkey",exact:true}).click();await expect(a.getByRole("button",{name:/Continue as/})).toBeVisible();await a.getByRole("button",{name:/Continue as/}).click();await expect(a.locator(".status-line")).toContainText("Arcade session ready",{timeout:30000});
    await a.getByRole("button",{name:"Arcade settings"}).click();await a.getByRole("slider",{name:"Music volume"}).fill("35");await a.getByRole("button",{name:"Background effects on"}).click();await expect(a.locator(".arcade-background")).toHaveAttribute("data-effects","false");await a.getByRole("button",{name:"Sound off",exact:true}).last().click();await a.getByRole("button",{name:"Close arcade settings"}).click();
    await a.setViewportSize({width:390,height:844});expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await a.screenshot({path:"artifacts/arcade-mobile.png",fullPage:true});
    expect(errors).toEqual([]);await writeFile("artifacts/arcade-browser.json",JSON.stringify({base,addresses,matches:[first.id,second.id],passkeyAssertions:counts,baseline,timings,passedAt:new Date().toISOString(),authenticator:"Chromium virtual PRF; physical cross-device sync requires a separate demonstration"},null,2));
  }catch(e){for(let i=0;i<3;i++){console.log("Arcade browser",i,await pages[i].locator(".notice,.status-line").allTextContents());await pages[i].screenshot({path:`artifacts/arcade-failure-${i}.png`,fullPage:true});}throw e;}finally{await Promise.all(contexts.map(c=>c.close()));}
});
