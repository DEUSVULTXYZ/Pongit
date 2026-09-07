import {test,expect} from "@playwright/test";
import {writeFile} from "node:fs/promises";
import {activity,openCabinet} from "./cabinet";

test("Home usernames persist, remain unique and identify rivals, arena and ladder",async({browser})=>{
 test.setTimeout(180000);
 const base=process.env.PONG_TEST_URL||"http://localhost:3150",api=process.env.PONG_TEST_API||`${base}/api`;
 const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:1440,height:1000}})));
 const pages=await Promise.all(contexts.map(c=>c.newPage())),addresses:string[]=[],errors:string[]=[];
 const handle=`neon_${Date.now().toString(36)}`,other=`rival_${Date.now().toString(36)}`;
 try {
  for(let i=0;i<2;i++){
   const p=pages[i];p.on("pageerror",e=>errors.push(e.message));const cdp=await contexts[i].newCDPSession(p);
   await cdp.send("WebAuthn.enable");await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
   await p.goto(base);await p.getByRole("button",{name:"Enter muted",exact:true}).click();
   await p.getByRole("button",{name:"Create your profile",exact:true}).click();
   if(i===0){await p.keyboard.press("Escape");await expect(p.getByRole("dialog")).toHaveCount(0);await p.getByRole("button",{name:"Create your profile",exact:true}).click();}
   const response=p.waitForResponse(r=>/\/player\/0x[\da-f]+$/i.test(r.url()));await p.getByRole("button",{name:"Create a passkey"}).click();addresses.push((await response).url().split("/").at(-1)!);
   const editor=p.getByRole("dialog",{name:"Your public profile"});await expect(editor).toBeVisible({timeout:35000});
   await expect(p.getByRole("button",{name:"Cancel search",exact:true})).toHaveCount(0);
   await editor.getByLabel("Unique username").fill(handle.toUpperCase());await expect(editor.getByLabel("Unique username")).toHaveValue(handle);
   if(i===1){await expect(editor.getByRole("status").filter({hasText:"already taken"})).toBeVisible();await expect(editor.getByRole("button",{name:"Save public profile"})).toBeDisabled();await editor.getByLabel("Unique username").fill(other);}
   await editor.getByRole("button",{name:`Avatar ${i+3}`,exact:true}).click();await expect(editor.getByText("Username available.",{exact:true})).toBeVisible();
   let saves=0;p.on("request",r=>{if(r.url().endsWith("/profiles")&&r.method()==="PUT")saves++;});
   await editor.getByRole("button",{name:"Save public profile"}).dblclick();await expect(editor).toContainText("Public profile saved.");expect(saves).toBe(1);
   if(i===0)await p.screenshot({path:"artifacts/player-tag-editor.png"});await p.getByRole("button",{name:"Close profile"}).click();await expect(p.locator(".home-player-tag")).toContainText(i===0?handle:other);
   await p.reload();await expect(p.locator(".home-player-tag")).toContainText(i===0?handle:other,{timeout:15000});
  }
  const [a,b]=pages;
  // Server uniqueness is authoritative even when the availability check is bypassed.
  const duplicate=await b.evaluate(async({api,account,handle})=>{const r=await fetch(api+"/profiles",{method:"PUT",credentials:"include",headers:{"content-type":"application/json","x-pongit-player":account},body:JSON.stringify({handle:handle.toUpperCase(),avatar:1})});return {status:r.status,body:await r.json()};},{api,account:addresses[1],handle});
  expect(duplicate.status).toBe(400);expect(duplicate.body.error).toContain("already taken");
  expect((await (await b.request.get(`${api}/profiles/${addresses[1]}`)).json()).handle).toBe(other);
  const reserve=async(index:number,name:string)=>pages[index].evaluate(async({api,account,handle})=>{const r=await fetch(api+"/profiles",{method:"PUT",credentials:"include",headers:{"content-type":"application/json","x-pongit-player":account},body:JSON.stringify({handle,avatar:2})});return r.status;},{api,account:addresses[index],handle:name});
  const race=await Promise.all([reserve(0,`${handle}r`),reserve(1,`${handle}r`)]);expect(race.sort()).toEqual([200,400]);
  expect(await reserve(0,handle)).toBe(200);expect(await reserve(1,other)).toBe(200);
  await Promise.all(pages.map(p=>p.reload()));await expect(a.locator(".home-player-tag")).toContainText(handle);await expect(b.locator(".home-player-tag")).toContainText(other);
  // Literal underscores and full addresses must both find the exact saved profile.
  for(const search of [handle,addresses[0]]){const d=await (await a.request.get(`${api}/profiles?search=${encodeURIComponent(search)}`)).json();expect(d.profiles.some((p:any)=>p.handle===handle)).toBe(true);}
  expect((await (await a.request.get(`${api}/profiles?search=%25`)).json()).profiles).toEqual([]);
  await a.screenshot({path:"artifacts/arcade-hall-home.png"});
  await b.getByRole("button",{name:"Rivals",exact:true}).click();await b.getByLabel("Find a public profile").fill(handle);
  await b.locator(".profile-results").getByRole("button").filter({hasText:handle}).click();await expect(b.getByLabel("Opponent address",{exact:true})).toHaveValue(addresses[0].toLowerCase());
  await b.locator("summary").filter({hasText:"Match options"}).click();await b.getByLabel("Competition",{exact:true}).selectOption("true");await b.getByRole("button",{name:"Send challenge"}).click();
  await a.getByRole("button",{name:"Accept ranked",exact:true}).click({timeout:20000});
  for(const p of pages){await expect(p.locator(".match-bar")).toContainText("IN PLAY",{timeout:45000});await expect(p.locator(".scoreboard")).toContainText(handle);await expect(p.locator(".scoreboard")).toContainText(other);}
  await a.setViewportSize({width:2560,height:1260});await a.screenshot({path:"artifacts/arcade-hall-game-wide.png"});
  expect(await a.locator(".arcade-background").evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
  await a.setViewportSize({width:1440,height:1000});await a.screenshot({path:"artifacts/arcade-hall-game-desktop.png"});
  await a.setViewportSize({width:390,height:844});expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await a.screenshot({path:"artifacts/arcade-hall-game-mobile.png"});
  await openCabinet(b);await b.getByRole("button",{name:"Concede",exact:true}).click();await expect(a.locator(".outcome h2")).toHaveText("VICTORY",{timeout:25000});await a.getByRole("button",{name:"Close result"}).click();
  await a.setViewportSize({width:1440,height:1000});await activity(a,"Ladder");
  await expect.poll(async()=>{const d=await(await a.request.get(`${api}/leaderboard?mode=0`)).json();return d.Player.some((p:any)=>p.handle===handle);},{timeout:30000}).toBe(true);
  await a.reload();await activity(a,"Ladder");await expect(a.locator("table")).toContainText(handle);
  // Reopening the editor uses the same saved profile as Rivals, then updates the HUD's source.
  await a.getByRole("button",{name:"Play",exact:true}).click();await a.getByRole("button",{name:"Edit your profile"}).click();const editor=a.getByRole("dialog",{name:"Your public profile"});await expect(editor.getByLabel("Unique username")).toHaveValue(handle);await expect(editor.getByRole("button",{name:"Avatar 3",exact:true})).toHaveAttribute("aria-pressed","true");
  await editor.getByLabel("Unique username").fill(`${handle}x`);await editor.getByRole("button",{name:"Save public profile"}).click();await expect(editor).toContainText("Public profile saved.");await a.getByRole("button",{name:"Close profile"}).click();
  await activity(a,"Ladder");await expect(a.locator("table")).toContainText(`${handle}x`);
  expect(errors).toEqual([]);await writeFile("artifacts/player-tags-validation.json",JSON.stringify({base,at:new Date().toISOString(),addresses,handle,scenarios:["create from home and carry connection intent","cancel connection","lowercase normalization","duplicate click","database uniqueness and concurrent reservation","literal underscore and full address search","reload persistence","targeted ranked duel by username","named scoreboard","ranked leaderboard","immediate rename in leaderboard","static room","desktop and mobile overflow"],errors},null,2));
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});
