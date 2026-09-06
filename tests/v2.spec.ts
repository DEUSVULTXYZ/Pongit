import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
test("V2 Mera notebook, public profile, targeted friendly Chaos, handicap and arcade result",async({browser})=>{
  test.setTimeout(240000);
  const base=process.env.PONG_TEST_URL || "http://localhost:3003",api=process.env.PONG_TEST_API || "http://localhost:4013";
  const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({viewport:{width:1440,height:1000}})));
  const pages=await Promise.all(contexts.map(c=>c.newPage())),addresses:string[]=[],errors:string[]=[];
  const snapshots:any[]=[];
  try{
    for(let i=0;i<3;i++){const p=pages[i];p.on("pageerror",e=>errors.push(e.message));const cdp=await contexts[i].newCDPSession(p);await cdp.send("WebAuthn.enable");await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});await p.goto(base);await p.getByRole("button",{name:"Enter muted"}).click();await p.getByRole("button",{name:"Connect passkey",exact:true}).click();const response=p.waitForResponse(r=>/\/player\/0x[\da-f]+$/i.test(r.url()));await p.getByRole("button",{name:"Create a passkey"}).click();addresses.push((await response).url().split("/").at(-1)!);await expect(p.locator(".vault-strip")).toBeVisible();await expect(p.locator(".status-line")).toContainText("Arcade session ready",{timeout:30000});}
    const [a,b,s]=pages;
    await a.getByRole("button",{name:"Rivals",exact:true}).click();
    if(await a.getByRole("button",{name:"Unlock invitations & profile"}).count())await a.getByRole("button",{name:"Unlock invitations & profile"}).click();
    await expect(a.getByRole("button",{name:"Unlock invitations & profile"})).toHaveCount(0);
    const handle="arcade_"+addresses[0].slice(2,10).toLowerCase();
    await a.getByLabel("Unique nickname").fill(handle);await a.getByRole("button",{name:"Save public profile"}).click();
    await expect(a.locator(".public-profile")).toContainText(handle);
    await a.getByRole("button",{name:"Unlock notebook"}).click();await expect(a.locator(".notebook")).toContainText("Unlocked in memory",{timeout:15000});
    await a.locator(".notebook").getByLabel("Address",{exact:true}).fill(addresses[1]);await a.getByLabel("Private nickname").fill("encrypted-rival-only");await a.getByRole("button",{name:"Add favourite"}).click();await a.getByRole("button",{name:"Save encrypted",exact:true}).click();await expect(a.locator(".notebook")).toContainText("Encrypted copy saved");
    await a.getByLabel("Preferred mode").selectOption("1");await a.getByRole("button",{name:"Apply preferences",exact:true}).click();await expect(a.locator(".notebook")).toContainText("Preferences applied");
    await a.getByRole("button",{name:"Lock",exact:true}).click();await expect(a.locator(".notebook")).not.toContainText("encrypted-rival-only");
    await a.getByRole("button",{name:"Unlock notebook"}).click();await expect(a.locator(".notebook")).toContainText("encrypted-rival-only");
    expect(await a.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes("encrypted-rival-only"))).toBe(false);
    await a.getByLabel("Opponent address").fill(addresses[1]);await a.getByLabel("Challenge mode",{exact:true}).selectOption("1");await expect(a.getByLabel("Competition")).toHaveValue("false");await a.getByRole("button",{name:"Send challenge"}).click();await a.getByText("Shareable links",{exact:true}).click();await expect(a.getByLabel("Share or open an invitation")).toHaveValue(/challenge=0x/);
    await a.screenshot({path:"artifacts/v2-rivals.png",fullPage:true});
    await b.getByRole("button",{name:"Rivals",exact:true}).click();if(await b.getByRole("button",{name:"Unlock invitations & profile"}).count())await b.getByRole("button",{name:"Unlock invitations & profile"}).click();await expect(b.getByRole("button",{name:"Accept friendly"})).toBeVisible({timeout:15000});await b.getByRole("button",{name:"Accept friendly"}).click();

    for(const p of [a,b])await expect(p.locator(".match-bar")).toContainText("IN PLAY",{timeout:45000});
    await expect(a.locator(".match-bar")).toContainText("CHAOS / FRIENDLY");
    const readMatches=async()=>await (await s.request.get(api+"/matches")).json();
    const match=(await readMatches()).matches.find((m:any)=>m.status===2 && [m.playerA,m.playerB].some((p:string)=>p.toLowerCase()===addresses[0].toLowerCase()));
    const read=async()=>await (await s.request.get(api+`/matches/${match.id}`)).json();
    await s.getByRole("button",{name:"Get test credits"}).click();await expect(s.locator(".status-line")).toContainText("credited",{timeout:30000});await s.getByRole("button",{name:/^Live/}).click();await s.locator(`[data-match-id="${match.id}"]`).click();await expect(s.locator(".chaos-warning")).toBeVisible();
    await s.getByLabel("Shares (1 winning share = 1 MON)").fill("0.006");
    for(let i=0;i<8;i++){await expect(s.getByRole("button",{name:"Back 01"})).toBeEnabled({timeout:15000});await s.getByRole("button",{name:"Back 01"}).click();await expect.poll(async()=> (await s.locator(".status-line").innerText()).includes("Bet confirmed") || await s.getByRole("button",{name:"Dismiss error"}).count()>0,{timeout:15000}).toBe(true);if((await s.locator(".status-line").innerText()).includes("Bet confirmed"))break;await s.getByRole("button",{name:"Dismiss error"}).click();await s.waitForTimeout(600);}
    await expect(s.locator(".status-line")).toContainText("Bet confirmed");
    await expect.poll(async()=>{const m=await read();snapshots.push({head:m.head,clock:m.clock,state:m.match.state});return m.match.state.halfA;},{timeout:40000}).toBe("36000000");
    await expect(a.locator("canvas")).toBeVisible();await a.screenshot({path:"artifacts/v2-chaos.png",fullPage:true});
    await b.getByRole("button",{name:"Concede",exact:true}).click();await expect(a.locator(".outcome h2")).toHaveText("VICTORY",{timeout:20000});await expect(b.locator(".outcome h2")).toHaveText("DEFEAT");await a.screenshot({path:"artifacts/v2-victory.png",fullPage:true});
    const beforeClaim=BigInt((await (await s.request.get(api+`/player/${addresses[2]}`)).json()).balance);
    await expect(s.getByRole("button",{name:"Claim payout / refund"})).toBeVisible({timeout:20000});await s.getByRole("button",{name:"Claim payout / refund"}).click();
    await expect.poll(async()=>BigInt((await (await s.request.get(api+`/player/${addresses[2]}`)).json()).balance),{timeout:20000}).toBe(beforeClaim+6000000000000000n);
    await s.getByText("Withdraw test MON",{exact:true}).click();await s.getByLabel("Recipient",{exact:true}).fill(addresses[2]);await s.getByLabel("Amount",{exact:true}).fill("0.001");await s.getByRole("button",{name:"Sign withdrawal"}).click();await expect(s.locator(".status-line")).toContainText("Withdrawal confirmed",{timeout:20000});
    expect(BigInt((await (await s.request.get(api+`/player/${addresses[2]}`)).json()).balance)).toBe(beforeClaim+5000000000000000n);
    await expect.poll(async()=> (await read()).match.ratingFinalized,{timeout:20000}).toBe(true);
    for(const address of addresses.slice(0,2)){const p=await (await s.request.get(api+`/player/${address}`)).json();expect(p.rating.elo).toBe(1000);expect(p.chaosRating.elo).toBe(1000);expect(p.chaosRating.played).toBe(0);}
    await a.getByRole("button",{name:"Close result"}).click();await a.getByRole("button",{name:"Open account details"}).click();await a.getByRole("button",{name:"Disconnect",exact:true}).click();await a.getByRole("button",{name:"Rivals",exact:true}).click();await expect(a.locator(".notebook")).not.toContainText("encrypted-rival-only");
    await a.getByRole("button",{name:"Connect passkey",exact:true}).click();await a.getByRole("button",{name:/Continue as|Use existing passkey/}).click();await a.getByRole("button",{name:"Rivals",exact:true}).click();await a.getByRole("button",{name:"Unlock notebook"}).click();await expect(a.locator(".notebook")).toContainText("encrypted-rival-only");
    await a.getByRole("button",{name:"Archive",exact:true}).click();await a.locator(`[data-match-id="${match.id}"]`).click();await expect(a.getByRole("button",{name:"Note this moment"})).toBeVisible({timeout:30000});
    await a.getByRole("slider",{name:"Replay position"}).fill("1");await a.getByRole("button",{name:"Note this moment"}).click();await expect(a.locator(".notebook")).toContainText(`v${(await (await s.request.get(api+"/config")).json()).version || 1}:${match.id}`);await a.locator(".notebook textarea").fill("private-timestamp-note");await a.getByRole("button",{name:"Add timestamped note"}).click();await a.getByRole("button",{name:"Save encrypted",exact:true}).click();await expect(a.locator(".notebook")).toContainText("Encrypted copy saved");
    await a.setViewportSize({width:390,height:844});expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await a.screenshot({path:"artifacts/v2-rivals-mobile.png",fullPage:true});
    expect(errors).toEqual([]);await writeFile("artifacts/v2-browser.json",JSON.stringify({base,matchId:match.id,addresses,snapshots,passedAt:new Date().toISOString(),scenarios:["Mera PRF notebook different salt","encrypted save and recovery","no plaintext web storage","public nickname","targeted friendly Chaos consent","bet pressure shrinks to 72","confirmed victory and defeat","friendly ELO unchanged","winning claim and separate signed withdrawal","disconnect closes notebook","same-passkey recovery","mobile layout"],authenticator:"Chromium virtual CTAP2 PRF; real device synchronization still requires user demonstration"},null,2));
  }catch(e){for(let i=0;i<3;i++){console.log("V2 browser",i,await pages[i].locator(".notice").allTextContents());await pages[i].screenshot({path:`artifacts/v2-failure-${i}.png`,fullPage:true});}throw e;}finally{await Promise.all(contexts.map(c=>c.close()));}
});
