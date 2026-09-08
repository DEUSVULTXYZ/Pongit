import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const mode=process.env.PONG_AVATAR_TEST;
assert(['private-vps','public-testnet'].includes(mode));
const origin='https://pongit.xyz',out=`artifacts/avatar-account-${mode}`;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
if(mode==='private-vps')await context.route(origin+'/**',async route=>{
  const url=new URL(route.request().url());
  const response=await route.fetch({url:url.pathname.startsWith('/api/')?route.request().url():'http://ranking-web:3000'+url.pathname+url.search});
  await route.fulfill({response});
});
await context.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:true,intensity:'full'})));
const page=await context.newPage(),report={checks:[],errors:[],createdProfile:null};
page.on('pageerror',e=>report.errors.push(e.message));
const cdp=await context.newCDPSession(page);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
try {
  await page.goto(origin+'/');
  assert.equal(await page.getByRole('button',{name:'Ranking',exact:true}).count(),1);
  await page.getByRole('button',{name:'More arcade activities'}).click();
  assert.equal(await page.getByRole('dialog').getByRole('button',{name:'Ranking',exact:true}).count(),0);
  await page.keyboard.press('Escape');report.checks.push('Ranking appears only in the header');
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByRole('button',{name:'Create a passkey',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Your account',exact:true});await dialog.waitFor({timeout:40000});
  const address=(await dialog.locator('.rooms-address').textContent()).trim();
  const picker=dialog.getByTestId('avatar-picker'),radios=picker.getByRole('radio');
  await radios.first().waitFor();assert.equal(await radios.count(),12);
  await radios.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));
  for(const width of [360,390,768,1440]) {
    await page.setViewportSize({width,height:width<768?844:1000});
    const columns=width<=480?3:4;
    assert.equal(await picker.getByRole('radiogroup').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),columns);
    const boxes=await radios.evaluateAll(nodes=>nodes.map(n=>{
      const r=n.getBoundingClientRect(),img=n.querySelector('img').getBoundingClientRect(),name=n.querySelector('img').parentElement.nextElementSibling.getBoundingClientRect();
      return{width:r.width,height:r.height,imageWidth:img.width,imageHeight:img.height,nameBelow:name.top>=img.bottom-1,inside:name.left>=r.left&&name.right<=r.right+1};
    }));
    assert(boxes.every(r=>r.width>=44&&r.height>=44&&Math.abs(r.imageWidth-r.imageHeight)<2&&r.nameBelow&&r.inside));
    await radios.nth(0).click();await page.keyboard.press('ArrowRight');assert.equal(await radios.nth(1).getAttribute('aria-checked'),'true');
    await page.keyboard.press('ArrowDown');assert.equal(await radios.nth(1+columns).getAttribute('aria-checked'),'true');
    await page.keyboard.press('End');assert.equal(await radios.nth(11).getAttribute('aria-checked'),'true');
    const selected=radios.nth(11),check=selected.locator('[data-avatar-check]');
    const mark=await check.boundingBox(),card=await selected.boundingBox();
    assert(mark.x>=card.x&&mark.y>=card.y&&mark.x+mark.width<=card.x+card.width&&mark.y+mark.height<=card.y+card.height);
    assert.equal(await page.locator('[data-avatar-check]:visible').count(),1);
    assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await picker.screenshot({path:`${out}/picker-${width}.png`});
    await dialog.evaluate(e=>e.scrollTop=0);await page.screenshot({path:`${out}/account-${width}.png`});
    report.checks.push({width,columns,labelsBelowPortraits:true,checkContained:true,noOverflow:true});
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await radios.first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
  await page.emulateMedia({reducedMotion:'no-preference'});
  const handle='qa_avatar_'+Date.now().toString(36);
  await dialog.getByLabel('Username',{exact:true}).fill(handle);
  await radios.nth(5).click();
  const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/interlude/profile'&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Save profile',exact:true}).click();assert.equal((await saved).status(),200);
  report.createdProfile={address,handle,avatar:5};
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Close Your account"]').disabled);
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);
  await page.reload();await page.locator('.rooms-account-toggle').filter({hasText:handle}).waitFor({timeout:30000});
  await page.locator('.rooms-account-toggle').click();await dialog.waitFor();
  assert.equal(await dialog.getByLabel('Username',{exact:true}).inputValue(),handle);
  assert.equal(await radios.nth(5).getAttribute('aria-checked'),'true');
  report.checks.push('Profile and avatar saved through authenticated API and restored after F5');
  await page.keyboard.press('Escape');
  assert(await page.locator('.rooms-account-toggle').evaluate(e=>e===document.activeElement));
  assert.deepEqual(report.errors,[]);
}catch(e){report.failure=e.message;process.exitCode=1;await page.screenshot({path:out+'/failure.png'}).catch(()=>{});}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
