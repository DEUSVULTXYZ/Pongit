import {test,expect} from "@playwright/test";
import {writeFile,mkdir} from "node:fs/promises";

test("Mera PRF: cancellation, financial signature, two players, spectator, recovery and replay", async ({browser}) => {
  test.setTimeout(240000);
  const base=process.env.PONG_TEST_URL || "http://localhost:3000";
  const apiBase=process.env.PONG_TEST_API || (base.startsWith("http://localhost") ? "http://localhost:4000" : base+"/api");
  const config=await fetch(apiBase+"/config").then(r=>r.json());
  const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({viewport:{width:1440,height:1000}})));
  const pages=await Promise.all(contexts.map(c=>c.newPage()));
  const addresses:string[]=[];
  const errors:string[]=[];
  const relayStarts=new Map<string,number>();
  const inputSamples:any[]=[];
  try {
    for (let i=0;i<pages.length;i++) {
      const p=pages[i];
      p.on("response",async r=>{
        if (!r.url().endsWith("/relay")) return;
        try { const payload=r.request().postDataJSON(); if (payload.functionName!=="submitInput") return;
          const job=await r.json(); relayStarts.set(job.id,r.request().timing().startTime);
        } catch { /* Responses interrupted by an intentional reconnect are not samples. */ }
      });
      p.on("websocket",socket=>socket.on("framereceived",event=>{
        try { const job=JSON.parse(String(event.payload)); const start=relayStarts.get(job.id);
          if (job.type==="job" && start && job.status==="succeeded") {
            inputSamples.push({job:job.id,browserRequestToReceiptMs:Math.round(Date.now()-start),...job.timing});
            relayStarts.delete(job.id);
          }
        } catch { /* Not every WebSocket frame is a job notification. */ }
      }));
      p.on("pageerror",e=>errors.push(e.message));
      const cdp=await contexts[i].newCDPSession(p);
      await cdp.send("WebAuthn.enable");
      await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
      await p.goto(base);
      if(config.version>=3)await p.getByRole("button",{name:"Enter muted"}).click();
      await p.getByRole("button",{name:/^Connect passkey/}).click();
      const response=p.waitForResponse(r=>/\/player\/0x[\da-f]+$/i.test(r.url()));
      await p.getByRole("button",{name:"Create a passkey"}).click();
      addresses.push((await response).url().split("/").at(-1)!);
      await expect(p.locator(".vault-strip")).toBeVisible();
      if(config.version>=3)await expect(p.locator(".status-line")).toContainText("Arcade session ready",{timeout:30000});
    }
    const [a,b,s]=pages;
    await a.getByRole("button",{name:"Open account details"}).click();
    await expect(a.getByRole("dialog")).toBeVisible();
    await expect(a.getByRole("textbox",{name:"Full account address"})).toHaveValue(addresses[0]);
    if (!base.startsWith("http://localhost")) await expect(a.getByRole("link",{name:"View account on explorer"})).toHaveAttribute("href",`https://testnet.monadscan.com/address/${addresses[0]}`);
    await a.getByRole("button",{name:"Copy address",exact:true}).click();
    await expect(a.getByRole("button",{name:"Address copied",exact:true})).toBeVisible();
    await a.keyboard.press("Escape");
    await expect(a.getByRole("dialog")).toHaveCount(0);
    await a.getByRole("button",{name:"Find an opponent"}).click();
    await expect(a.getByRole("button",{name:"Cancel search"})).toBeVisible();
    await a.getByRole("button",{name:"Cancel search"}).click();
    await expect(a.locator(".status-line")).toContainText("Search cancelled");
    // Spending closes the owner signing session. Match consent must recover it.
    await a.getByRole("button",{name:"Get test credits"}).click();
    await expect(a.locator(".status-line")).toContainText("credited",{timeout:30000});
    await s.getByRole("button",{name:"Get test credits"}).click();
    await expect(s.locator(".status-line")).toContainText("credited",{timeout:30000});
    await a.getByRole("button",{name:"Find an opponent"}).click();
    await a.getByRole("button",{name:"Get test credits"}).click();
    await expect(a.locator(".status-line")).toContainText("credited",{timeout:30000});
    await b.getByRole("button",{name:"Find an opponent"}).click();
    for(const p of [a,b]) await expect(p.locator(".match-bar")).toContainText("IN PLAY",{timeout:60000});
    await s.getByRole("button",{name:/^Live/}).click();
    const match = (await (await s.request.get(apiBase + "/matches")).json()).matches.find((m:any)=>m.status===2 && [m.playerA,m.playerB].some((p:string)=>p.toLowerCase()===addresses[0].toLowerCase()));
    const matchId=match.id;
    await s.locator(`[data-match-id="${matchId}"]`).click();
    await expect(s.locator(".match-bar")).toContainText("SPECTATOR");
    await a.keyboard.down("s");
    await expect.poll(async()=>{
      const d=await (await a.request.get(apiBase+"/matches/"+matchId)).json();
      const slot=d.match.playerA.toLowerCase()===addresses[0].toLowerCase()?d.match.a:d.match.b;
      return Number(slot.nonce);
    },{timeout:15000}).toBeGreaterThan(0);
    await a.keyboard.up("s");
    await expect(a.locator("canvas")).toBeVisible();
    // Exercise direction changes while a command is in flight. A completed
    // command must not require another /matches RPC read before the next one.
    for (const key of ["w","s","w","s","w","s","w","s","w","s"]) {
      await a.keyboard.down(key);
      await a.waitForTimeout(900);
      await a.keyboard.up(key);
      await a.waitForTimeout(300);
    }
    for (let attempt=0;attempt<6;attempt++) {
      await expect(s.getByRole("button",{name:match.playerA.toLowerCase()===addresses[0].toLowerCase()?"Back 01":"Back 02"})).toBeEnabled({timeout:20000});
      await s.getByRole("button",{name:match.playerA.toLowerCase()===addresses[0].toLowerCase()?"Back 01":"Back 02"}).click();
      await expect.poll(async()=> (await s.locator(".status-line").innerText()).includes("Bet confirmed") || await s.locator(".notice").count()>0,{timeout:20000}).toBe(true);
      if ((await s.locator(".status-line").innerText()).includes("Bet confirmed")) break;
      expect(await s.locator(".notice").innerText()).toMatch(/window|version|collision|stale|slippage/i);
      await s.getByRole("button",{name:"Dismiss error"}).click();
      await s.waitForTimeout(700);
    }
    await expect(s.locator(".status-line")).toContainText("Bet confirmed");
    await b.reload();
    if(config.version>=3){await expect(b.locator(".status-line")).toContainText("Arcade session restored",{timeout:25000});}else{
    await b.getByRole("button",{name:/^Connect passkey/}).click();
    await b.getByRole("button",{name:/Continue as|Use existing passkey/}).click();
    await expect(b.locator(".vault-strip")).toContainText(addresses[1].slice(0,6));
    await b.locator(`[data-match-id="${matchId}"]`).click();
    await b.getByRole("button",{name:"Restore game session"}).click();
    await expect(b.locator(".status-line")).toContainText("Game session restored",{timeout:20000});}
    await b.setViewportSize({width:390,height:844});
    const beforeTouch=await (await b.request.get(apiBase+"/matches/"+matchId)).json();
    const bSlot=beforeTouch.match.playerA.toLowerCase()===addresses[1].toLowerCase()?"a":"b";
    const touchNonce=Number(beforeTouch.match[bSlot].nonce);
    const touch=await b.getByRole("button",{name:"Move up",exact:true}).boundingBox();
    const touchCdp=await contexts[1].newCDPSession(b);
    await touchCdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:touch!.x+touch!.width/2,y:touch!.y+touch!.height/2}]});
    await expect.poll(async()=>{
      const current=await (await b.request.get(apiBase+"/matches/"+matchId)).json();
      return Number(current.match[bSlot].nonce);
    },{timeout:15000}).toBeGreaterThan(touchNonce);
    await touchCdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await b.getByRole("button",{name:"Concede",exact:true}).click();
    await expect(a.locator(".match-bar")).toContainText("FINAL",{timeout:30000});
    for(const p of [a,b]) {await expect(p.locator(".outcome")).toBeVisible();await p.getByRole("button",{name:"Close result",exact:true}).click();}
    if(config.version===4)await expect(s.locator(".match-payment")).toContainText("Paid to your wallet",{timeout:30000});
    else {await s.getByRole("button",{name:"Claim legacy payout / refund"}).click();await expect(s.locator(".match-payment")).toContainText("Credited to your legacy vault",{timeout:20000});}
    await s.getByText("Withdraw test MON",{exact:true}).click();
    await s.getByRole("button",{name:"Sign withdrawal"}).click();
    await expect(s.locator(".status-line")).toContainText("Withdrawal confirmed",{timeout:20000});
    await s.getByRole("button",{name:"Archive",exact:true}).click();
    await expect(s.locator(".match-row").first()).toBeVisible({timeout:30000});
    await s.locator(`[data-match-id="${matchId}"]`).click();
    await expect(s.getByRole("button",{name:/^Play replay/})).toBeVisible({timeout:30000});
    await s.getByRole("button",{name:/^Play replay/}).click();
    await s.screenshot({path:"artifacts/mera-replay.png",fullPage:true});
    await a.setViewportSize({width:390,height:844});
    await expect.poll(()=>a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await a.screenshot({path:"artifacts/mera-mobile.png",fullPage:true});
    await b.getByRole("button",{name:"Open account details"}).click();
    await b.getByRole("button",{name:"Disconnect",exact:true}).click();
    await expect(b.getByRole("button",{name:"Connect passkey",exact:true})).toBeVisible();
    await expect(b.locator(".vault-strip")).toHaveCount(0);
    await expect(b.getByRole("button",{name:"Move up",exact:true})).toBeDisabled();
    await b.getByRole("button",{name:"Connect passkey",exact:true}).click();
    await b.getByRole("button",{name:/Continue as|Use existing passkey/}).click();
    if(config.version>=3)await expect(b.locator(".status-line")).toContainText("Arcade session ready",{timeout:30000});
    await b.getByRole("button",{name:"Open account details"}).click();
    await expect(b.getByRole("textbox",{name:"Full account address"})).toHaveValue(addresses[1]);
    await expect(b.getByRole("button",{name:"Disconnect",exact:true})).toBeEnabled();
    await expect.poll(()=>b.getByRole("textbox",{name:"Full account address"}).evaluate(el=>el.scrollHeight<=el.clientHeight && el.scrollWidth<=el.clientWidth)).toBe(true);
    await b.screenshot({path:"artifacts/account-mobile.png",fullPage:true});
    await b.keyboard.press("Escape");
    expect(errors).toEqual([]);
    await mkdir("artifacts",{recursive:true});
    await writeFile("artifacts/input-latency-browser.json",JSON.stringify({base,matchId,samples:inputSamples,definition:"POST submitInput request start to first received successful job WebSocket notification; not display prediction latency",measuredAt:new Date().toISOString()},null,2));
    await writeFile("artifacts/mera-browser.json",JSON.stringify({base,matchId,addresses,authenticator:"Chromium CTAP2 virtual authenticator with PRF; actual Mera SDK and contracts, no local test player",scenarios:["create","account details and copy","cancel queue","recover owner after financial signature while queued","match","spectate","input","bet","passkey recovery","session restore","concede","claim","withdraw","Envio replay","mobile","touch input confirmed onchain","disconnect clears controls","recover same account after disconnect"],passedAt:new Date().toISOString()},null,2));
  } catch(e) { for(let i=0;i<pages.length;i++) { console.log("Browser",i,"notice:",await pages[i].locator(".notice").allTextContents()); await pages[i].screenshot({path:`artifacts/mera-failure-${i}.png`,fullPage:true}); } throw e; } finally {await Promise.all(contexts.map(c=>c.close()));}
});
