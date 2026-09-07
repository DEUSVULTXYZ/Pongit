import {test,expect} from "@playwright/test";
import {writeFile} from "node:fs/promises";
import {openCabinet} from "./cabinet";

test("Reading documentation preserves a live arcade session; spectator betting guide capture",async({browser})=>{
 test.setTimeout(150000);
 const base=process.env.PONG_TEST_URL||"http://localhost:3150",api=process.env.PONG_TEST_API||`${base}/api`;
 const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({viewport:{width:1440,height:1000}}))),pages=await Promise.all(contexts.map(c=>c.newPage()));
 const addresses:string[]=[],assertions=[0,0,0],errors:string[]=[];
 try{
  for(let i=0;i<pages.length;i++){
   const p=pages[i],cdp=await contexts[i].newCDPSession(p);p.on("pageerror",e=>errors.push(e.message));
   await cdp.send("WebAuthn.enable");await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});cdp.on("WebAuthn.credentialAsserted",()=>assertions[i]++);
   await p.goto(base);await p.getByRole("button",{name:"Enter muted",exact:true}).click();await p.getByRole("button",{name:"Connect passkey",exact:true}).click();
   const response=p.waitForResponse(r=>/\/player\/0x[\da-f]+$/i.test(r.url()));await p.getByRole("button",{name:"Create a passkey"}).click();addresses.push((await response).url().split("/").at(-1)!);
   await expect(p.locator(".status-line")).toContainText("Arcade session ready",{timeout:30000});
  }
  const [a,b,spectator]=pages;
  await a.getByRole("button",{name:"Play now",exact:true}).click();await b.getByRole("button",{name:"Play now",exact:true}).click();
  for(const p of [a,b])await expect(p.locator(".match-bar")).toContainText("IN PLAY",{timeout:45000});
  const match=(await(await a.request.get(api+"/matches")).json()).matches.find((m:any)=>m.status===2&&[m.playerA,m.playerB].some((p:string)=>p.toLowerCase()===addresses[0].toLowerCase()));expect(match).toBeTruthy();
  const fingerprint=()=>a.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(sessionStorage.getItem("pongit:arcade-session:v3")||"")))).map(n=>n.toString(16).padStart(2,"0")).join(""));
  const before=await fingerprint(),ceremonies=[...assertions],next=contexts[0].waitForEvent("page");
  await a.locator("header").getByRole("link",{name:"Docs ↗",exact:true}).click();const docs=await next;await docs.waitForURL(base+"/docs");
  await expect(docs.getByRole("heading",{level:1})).toContainText("Know the arcade");expect(await docs.evaluate(()=>window.opener===null&&sessionStorage.getItem("pongit:arcade-session:v3")===null)).toBe(true);await expect(docs.locator("audio,canvas,[role=dialog]")).toHaveCount(0);
  await docs.close();await a.bringToFront();expect(await fingerprint()).toBe(before);expect(assertions).toEqual(ceremonies);await expect(a.locator(".match-bar")).toContainText("IN PLAY");
  await a.keyboard.down("w");await a.waitForTimeout(180);await a.keyboard.up("w");
  await spectator.getByRole("button",{name:/^Live/}).click();await spectator.locator(`[data-match-id="${match.id}"]`).click();
  await spectator.getByRole("button",{name:/^Back 01/}).click();const review=spectator.getByRole("dialog",{name:"Review your bet"});await expect(review).toBeVisible({timeout:25000});
  await expect(review).toContainText("Maximum cost (+1%)");await expect(review).toContainText("Confirm with passkey");await review.screenshot({path:"artifacts/docs-bet-review.png"});await spectator.getByRole("button",{name:"Close bet review"}).click();
  await openCabinet(b);await b.getByRole("button",{name:"Concede",exact:true}).click();await expect(a.locator(".outcome h2")).toHaveText("VICTORY",{timeout:25000});
  expect(assertions).toEqual(ceremonies);expect(errors).toEqual([]);
  await writeFile("artifacts/docs-game-validation.json",JSON.stringify({base,checkedAt:new Date().toISOString(),addresses,match:{id:match.id,deployment:match.deployment},sessionPreserved:true,noPasskeyAfterDocs:true,noWalletKeyInDocs:true,spectatorBetReview:true,receivingGameResult:true,errors},null,2));
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});
