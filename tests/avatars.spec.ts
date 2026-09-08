import {test,expect} from "@playwright/test";

const base=process.env.PONG_TEST_URL||"http://localhost:3150";
for(const viewport of [{width:360,height:640},{width:390,height:844},{width:768,height:1024},{width:1440,height:1000}])test(`Avatar roster is readable and keyboard accessible at ${viewport.width}px`,async({browser})=>{
 const context=await browser.newContext({viewport}),page=await context.newPage();const errors:string[]=[];
 page.on("pageerror",e=>errors.push(e.message));
 try {
  await page.goto(base+"/legacy");await page.getByRole("button",{name:"Enter muted",exact:true}).click();
  await page.getByRole("button",{name:"Rivals",exact:true}).click();await page.locator("summary").filter({hasText:"Your public profile"}).click();
  const form=page.locator(".social-layout .public-profile-form"),radios=form.getByRole("radio");
  await expect(radios).toHaveCount(12);
  const images=await radios.locator("img").evaluateAll(async nodes=>{await Promise.all(nodes.map(n=>(n as HTMLImageElement).decode()));return nodes.map(n=>({src:(n as HTMLImageElement).currentSrc,width:(n as HTMLImageElement).naturalWidth}));});
  expect(new Set(images.map(i=>i.src)).size).toBe(12);expect(images.every(i=>i.width===256)).toBe(true);
  expect(await form.getByRole("radiogroup",{name:"Arcade characters"}).evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(" ").length)).toBe(viewport.width<=480?3:4);
  await radios.nth(0).click();await expect(radios.nth(0)).toHaveAttribute("aria-checked","true");
  await page.keyboard.press("ArrowRight");await expect(radios.nth(1)).toBeFocused();await expect(form.getByTestId("avatar-picker").locator('[aria-live="polite"]')).toContainText("Ghost");
  await page.keyboard.press("ArrowDown");await expect(radios.nth(viewport.width<=480?4:5)).toBeFocused();
  await page.keyboard.press("End");await expect(radios.nth(11)).toBeFocused();await expect(radios.nth(11).locator("img")).toHaveAttribute("src","/avatars/roster-v1/viper.webp");
  await page.keyboard.press("ArrowRight");await expect(radios.nth(0)).toBeFocused();
  await radios.nth(5).click();await expect(radios.nth(5)).toHaveAttribute("aria-checked","true");
  await expect(form.locator('[role="radio"][aria-checked="true"]')).toHaveCount(1);
  expect(await radios.evaluateAll(nodes=>nodes.every(n=>{const b=n.getBoundingClientRect();return b.width>=44&&b.height>=44;}))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await form.screenshot({path:`artifacts/avatar-roster-${viewport.width}.png`});
  await page.emulateMedia({reducedMotion:"reduce"});await expect(radios.nth(5)).toHaveCSS("transition-duration","0s");
  expect(await page.locator(".arcade-background").evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);expect(errors).toEqual([]);
 }finally{await context.close();}
});
