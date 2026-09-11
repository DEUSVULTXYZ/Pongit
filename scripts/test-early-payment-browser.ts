import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {generatePrivateKey,privateKeyToAccount} from "viem/accounts";
import {encodeSession,storageKey} from "@interludelayer-sdk/sdk";
import {toFunctionSelector,type Abi,type Address} from "viem";
import {roomsChaosAbi} from "../shared/abi-PongRoomsTestnet";
import manifest from "../deployments/interlude-rooms.json";
import financial from "../deployments/rooms-finance.json";
assert.equal(process.env.ROOMS_BROWSER_TEST,"isolated-vps");
const origin="https://pongit.xyz",app=manifest.app as Address,player="0x1111111111111111111111111111111111111111";
const current=financial.at(-1)!,previous=financial.find(x=>x.app===manifest.app&&!(x as any).financeId)!;
const fixture=(m:any)=>({manifest:m,balance:m.financeId?"20000000000000000":"10000000000000000",walletBalance:"1000000000000000000",nonce:"0",marketNonce:"0",history:[{id:m.financeId?"2":"1",phase:3}]});
const out="artifacts/early-payment-browser";await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});const report:any={viewports:[],errors:[]};
try{
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900}});
  const key=generatePrivateKey(),signer=privateKeyToAccount(key);
  const stored=encodeSession({app,baseChainId:10143,privateKey:key,signature:`0x${"11".repeat(65)}`,grant:{granter:player,sessionKey:signer.address,expiry:BigInt(Math.floor(Date.now()/1000)+1800),epoch:0n,anyFunction:false,selectors:["acceptMatch","input","tick","cancelMatch","concede"].map(name=>toFunctionSelector((roomsChaosAbi as Abi).find(x=>x.type==="function"&&x.name===name) as any))}});
  await context.addInitScript(({stored,key,app,player})=>{sessionStorage.setItem(key,stored);sessionStorage.setItem(`pongit:rooms:${app}:account`,player);localStorage.setItem("pongit:arcade-audio",JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:"off"}));},{stored,key:storageKey(app,10143,player),app,player});
  await context.route("**/*",async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==origin){const rpc=route.request().postDataJSON();return route.fulfill({json:{jsonrpc:"2.0",id:rpc?.id,result:"0x"+"00".repeat(32)}});}
   if(u.pathname.startsWith("/api/")){
    let data:any={};
    if(u.pathname.endsWith("/config"))data={...manifest,online:true,admission:true};
    else if(u.pathname.endsWith("/auth/challenge"))data={nonce:"mock",message:"Isolated UI test"};
    else if(u.pathname.endsWith("/state"))data={room:null,profiles:[{player,handle:"tester",avatar:0}],inbox:[],outbox:[],online:true,admission:true,rating:{live:{elo:1000},published:{elo:1000}}};
    else if(u.pathname.endsWith("/finance")){const m=u.searchParams.has("financeId")&&!u.searchParams.get("financeId")?previous:current;data={...fixture(m),archives:[fixture(m===current?previous:current)]};}
    else if(u.pathname.includes("/markets/")){const m=u.pathname.endsWith("/1")?previous:current;data={manifest:m,settlementPolicy:(m as any).settlement||"finalized",book:[],window:[false,"0"],result:["0x3333333333333333333333333333333333333333","0x4444444444444444444444444444444444444444","0x3333333333333333333333333333333333333333",3],position:["5000000000000000","0","3000000000000000",true],paid:["3000000000000000","0"],quote:null,payout:[player,"5000000000000000",2,1],terminal:true,head:"100",payment:{tx_hash:"0x"+"11".repeat(32)}};}
    return route.fulfill({json:data});
   }
   return route.fulfill({response:await route.fetch({url:"http://pongit-early-web:3000"+u.pathname+u.search})});
  });
  await context.routeWebSocket("**/*",()=>{});
  const page=await context.newPage();page.on("pageerror",e=>report.errors.push(e.message));
  await page.goto(origin+"/rooms");
  await page.getByRole("button",{name:"tester",exact:true}).click();
  await page.getByRole("button",{name:"Betting credit & wallet",exact:true}).click();
  const select=page.getByLabel("Betting account",{exact:true});await select.waitFor({timeout:10000}).catch(async e=>{console.log(await page.locator("body").innerText());console.log("Select count",await page.locator("select").count());await page.screenshot({path:`${out}/${width}-failure.png`});throw e;});
  assert.equal(await select.inputValue(),"early-v1");
  await page.getByText("Your recent positions",{exact:true}).click();
  await page.getByRole("button",{name:/Match …2/}).click();
  await page.getByText("Testnet payouts use the first Interlude result",{exact:false}).waitFor();
  await page.getByText("Paid to your wallet",{exact:true}).waitFor();
  await page.screenshot({path:`${out}/${width}-early.png`});
  await select.selectOption("");
  await page.getByRole("button",{name:/Match …1/}).waitFor();
  await page.getByRole("button",{name:/Match …1/}).click();
  await page.getByText("These previous markets pay after delegation closure",{exact:false}).waitFor();
  assert.equal(await page.getByRole("button",{name:"Withdraw credit to wallet",exact:true}).isEnabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`${out}/${width}-previous.png`});
  report.viewports.push({width,currentAndPreviousAccounts:true,earlyPolicy:true,previousPolicy:true,withdrawalAccessible:true,noOverflow:true});
  await context.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
