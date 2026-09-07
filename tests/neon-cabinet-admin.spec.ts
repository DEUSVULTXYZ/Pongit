import {test,expect} from "@playwright/test";
import {createPublicClient,createWalletClient,http,keccak256,toHex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {gameAbi} from "../shared/abis";
import {DEV_KEY} from "../scripts/local-chain";
import {activity} from "./cabinet";

test("Profile and authorized operator screens retain readable, usable controls",async({browser})=>{
  test.setTimeout(90000);
  const base=process.env.PONG_TEST_URL||"http://localhost:3150",config=await fetch(base+"/api/config").then(r=>r.json());
  test.skip(config.chainId!==31337,"Isolated test-chain permission only");
  const transport=http(process.env.PONG_TEST_RPC_URL||"http://chain:8545"),client=createPublicClient({transport}),operator=createWalletClient({transport,account:privateKeyToAccount(DEV_KEY)});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  try{
    const cdp=await context.newCDPSession(page);await cdp.send("WebAuthn.enable");await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
    await page.goto(base);await page.getByRole("button",{name:"Enter muted",exact:true}).click();await page.getByRole("button",{name:"Connect passkey",exact:true}).click();
    const response=page.waitForResponse(r=>/\/player\/0x[\da-f]+$/i.test(r.url()));await page.getByRole("button",{name:"Create a passkey"}).click();const address=(await response).url().split("/").at(-1)! as `0x${string}`;
    await expect(page.locator(".status-line")).toContainText("Arcade session ready",{timeout:30000});
    await page.getByRole("button",{name:"Create your profile",exact:true}).click();const profile=page.getByRole("dialog",{name:"Your public profile"});await expect(profile).toBeVisible();await profile.screenshot({path:"artifacts/neon-cabinet-profile.png"});await page.keyboard.press("Escape");
    const role=keccak256(toHex("ADMIN_ROLE"));
    const hash=await operator.writeContract({chain:null,address:config.game,abi:gameAbi,functionName:"grantRole",args:[role,address]});await client.waitForTransactionReceipt({hash});await page.reload();
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:width===390?844:1000});await activity(page,"Admin");await expect(page.getByRole("heading",{name:"Operator console.",exact:true})).toBeVisible();
      await expect(page.getByRole("button",{name:"Pause game",exact:true})).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      for(const button of await page.locator(".admin-grid button").all()){const box=await button.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.width).toBeGreaterThanOrEqual(44);}
      await page.screenshot({path:`artifacts/neon-cabinet-admin-${width}.png`,fullPage:true});
    }
    const revoke=await operator.writeContract({chain:null,address:config.game,abi:gameAbi,functionName:"revokeRole",args:[role,address]});await client.waitForTransactionReceipt({hash:revoke});
  }finally{await context.close();}
});
