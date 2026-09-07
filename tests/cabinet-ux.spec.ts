import {test,expect} from "@playwright/test";
import {activity} from "./cabinet";
const base=process.env.PONG_TEST_URL||"http://localhost:3150";
for(const viewport of [{width:360,height:640},{width:390,height:844},{width:768,height:1024},{width:1440,height:900},{width:844,height:390},{width:720,height:450}])test(`Cabinet navigation, focus and static room ${viewport.width}x${viewport.height}`,async({browser})=>{
 const context=await browser.newContext({viewport}),page=await context.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 try{
 await page.goto(base);const entry=page.getByRole("dialog",{name:"Enter PONGIT arcade"});await expect(entry).toBeVisible();await expect(page.locator("body")).toHaveCSS("position","fixed");
 for(let i=0;i<8;i++){await page.keyboard.press("Tab");expect(await entry.evaluate(e=>e.contains(document.activeElement))).toBe(true);}
 await page.getByRole("button",{name:"Enter muted",exact:true}).click();await expect(page.locator("body")).not.toHaveCSS("position","fixed");
 const play=page.getByRole("button",{name:"Play now",exact:false});await expect(play).toBeVisible();if(viewport.height>=640)await expect(play).toBeInViewport();
 expect(await page.locator("canvas").count()).toBe(0);expect(await page.locator(".market-card").count()).toBe(0);expect(await page.locator(".arcade-background").evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`artifacts/cabinet-home-${viewport.width}.png`});
 for(const name of ["Ladder","Tournaments","Archive"]){await activity(page,name);expect(await page.evaluate(()=>{const e=new KeyboardEvent("keydown",{key:"ArrowDown",cancelable:true,bubbles:true});document.body.dispatchEvent(e);return e.defaultPrevented;})).toBe(false);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.getByRole("button",{name:"Rivals",exact:true}).click();await expect(page.getByRole("button",{name:"Send challenge"})).toBeDisabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole("button",{name:"Arcade settings",exact:true}).click();const settings=page.getByRole("dialog",{name:"Arcade settings"});await expect(settings).toContainText("Karl Casey @ White Bat Audio");const top=await page.evaluate(()=>document.body.style.top);await page.mouse.wheel(0,300);expect(await page.evaluate(()=>document.body.style.top)).toBe(top);
 await settings.getByText("Room appearance",{exact:true}).click();const intensity=settings.getByLabel("Background intensity",{exact:true});
 if(await page.evaluate(()=>CSS.supports("appearance","base-select"))){await intensity.click();await expect(intensity).toHaveJSProperty("value","full");await page.keyboard.press("Escape");await expect(settings).toBeVisible();await expect(intensity).toBeFocused();}
 await intensity.selectOption("subtle");await expect(page.locator(".arcade-background")).toHaveAttribute("data-intensity","subtle");await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
 await page.getByRole("button",{name:"Connect passkey",exact:true}).click();await expect(page.locator("body")).toHaveCSS("position","fixed");await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
 await page.reload();await expect(page.getByRole("dialog",{name:"Enter PONGIT arcade"})).toHaveCount(0);await page.emulateMedia({reducedMotion:"reduce"});expect(await page.locator(".arcade-background").evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);expect(errors).toEqual([]);
 }finally{await context.close();}
});

test("Play now carries a new passkey through to one search, cancellation and renewal",async({browser})=>{
 test.setTimeout(120000);const context=await browser.newContext(),page=await context.newPage();let queues=0;
 try{const cdp=await context.newCDPSession(page);await cdp.send("WebAuthn.enable");await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
 page.on("request",r=>{if(r.url().endsWith("/queue")&&r.method()==="POST")queues++;});await page.goto(base);await page.getByRole("button",{name:"Enter muted",exact:true}).click();
 await page.getByRole("button",{name:"Play now"}).click();await page.keyboard.press("Escape");await page.getByRole("button",{name:"Connect passkey",exact:true}).click();await page.getByRole("button",{name:"Create a passkey"}).click();await expect(page.locator(".status-line")).toContainText("Arcade session ready",{timeout:30000});expect(queues).toBe(0);
 await page.getByRole("button",{name:"Play now"}).dblclick();await expect(page.getByRole("button",{name:"Cancel search",exact:true})).toBeVisible();expect(queues).toBe(1);await page.getByRole("button",{name:"Cancel search",exact:true}).click();await expect(page.getByRole("button",{name:"Play now"})).toBeEnabled();
 await page.evaluate(()=>{const key="pongit:arcade-session:v3",s=JSON.parse(sessionStorage.getItem(key)!);s.expires=0;sessionStorage.setItem(key,JSON.stringify(s));});await page.reload();await page.getByRole("button",{name:"Play now"}).click();await expect(page.getByRole("button",{name:"Cancel search",exact:true})).toBeVisible({timeout:35000});expect(queues).toBe(2);await page.getByRole("button",{name:"Cancel search",exact:true}).click();
 await page.getByRole("button",{name:"Open account details",exact:true}).click();await page.getByRole("button",{name:"Disconnect",exact:true}).click();
 }finally{await context.close();}
 const fresh=await browser.newContext(),p=await fresh.newPage();try{const cdp=await fresh.newCDPSession(p);await cdp.send("WebAuthn.enable");await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});await p.goto(base);await p.getByRole("button",{name:"Enter muted",exact:true}).click();await p.getByRole("button",{name:"Play now"}).click();await p.getByRole("button",{name:"Create a passkey"}).click();await expect(p.getByRole("button",{name:"Cancel search",exact:true})).toBeVisible({timeout:35000});await p.getByRole("button",{name:"Cancel search",exact:true}).click();}finally{await fresh.close();}
});
