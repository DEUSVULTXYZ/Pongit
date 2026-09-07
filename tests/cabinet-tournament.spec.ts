import {test,expect} from "@playwright/test";
import {createPublicClient,createWalletClient,http,parseEther} from "viem";
import {foundry} from "viem/chains";
import {privateKeyToAccount} from "viem/accounts";
import {DEV_KEY} from "../scripts/local-chain";
import {tournamentsAbi,vaultAbi} from "../shared/abis";
import {allDeployments,deploymentId} from "../shared/protocol";
import {activity,openCabinet,openWallet,closeWallet} from "./cabinet";

test("Cabinet tournament buttons start the correct round; all three legacy vaults still withdraw",async({browser})=>{
  test.setTimeout(180000);
  const base=process.env.PONG_TEST_URL||"http://localhost:3150",api=process.env.PONG_TEST_API||base+"/api";
  const config=await fetch(api+"/config").then(r=>r.json());
  test.skip(config.chainId!==31337,"Disposable test chain only");
  const transport=http(process.env.PONG_TEST_RPC_URL||"http://chain:8545");
  const client=createPublicClient({chain:foundry,transport,pollingInterval:100});
  const operator=createWalletClient({chain:foundry,transport,account:privateKeyToAccount(DEV_KEY)});
  const contexts=await Promise.all([0,1].map(()=>browser.newContext()));
  const pages=await Promise.all(contexts.map(c=>c.newPage()));const addresses:any[]=[],errors:string[]=[];
  try{
    for(let i=0;i<2;i++){
      const page=pages[i];page.on("pageerror",e=>errors.push(e.message));const cdp=await contexts[i].newCDPSession(page);
      await cdp.send("WebAuthn.enable");await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
      await page.goto(base);await page.getByRole("button",{name:"Enter muted"}).click();await page.getByRole("button",{name:"Connect passkey",exact:true}).click();
      const response=page.waitForResponse(r=>/\/player\/0x[\da-f]+$/i.test(r.url()));await page.getByRole("button",{name:"Create a passkey"}).click();addresses.push((await response).url().split("/").at(-1));
      await expect(page.locator(".status-line")).toContainText("Arcade session ready",{timeout:30000});
    }
    const tid=await client.readContract({address:config.tournaments,abi:tournamentsAbi,functionName:"nextId"});
    const now=(await client.getBlock()).timestamp;
    const hash=await operator.writeContract({address:config.tournaments,abi:tournamentsAbi,functionName:"create",args:[now+600n,2,0n],value:parseEther("0.001")});
    expect((await client.waitForTransactionReceipt({hash})).status).toBe("success");
    const card=(p:typeof pages[number])=>p.locator(".tournament-grid .side-card").filter({has:p.getByText(`TOURNAMENT #${tid}`,{exact:true})});
    for(const p of pages){await activity(p,"Tournaments");await card(p).getByRole("button",{name:"Register",exact:true}).click();await expect(card(p).getByRole("button",{name:"Registered",exact:true})).toBeDisabled({timeout:25000});}
    await card(pages[0]).getByRole("button",{name:"Start bracket"}).click();
    for(const p of pages){await expect(card(p).getByRole("button",{name:"Play round"})).toBeEnabled({timeout:20000});await card(p).getByRole("button",{name:"Play round"}).click();}
    for(const p of pages)await expect(p.locator(".match-bar")).toContainText("IN PLAY",{timeout:40000});
    const match=(await fetch(api+"/matches").then(r=>r.json())).matches.find((m:any)=>m.tournamentId===String(tid));expect(match).toBeTruthy();
    await openCabinet(pages[1]);await pages[1].getByRole("button",{name:"Concede",exact:true}).click();
    await expect(pages[0].locator(".outcome h2")).toHaveText("VICTORY",{timeout:20000});
    await expect.poll(()=>client.getBalance({address:addresses[0]}),{timeout:30000}).toBe(parseEther("0.001"));
    await pages[0].getByRole("button",{name:"Watch replay",exact:true}).click();await expect(pages[0].getByRole("slider",{name:"Replay position"})).toBeVisible({timeout:20000});
    await pages[0].screenshot({path:"artifacts/neon-cabinet-replay.png",fullPage:true});
    await expect(pages[0].locator(".personal-replays .recent-game")).toHaveCount(1);
    const recent=await fetch(api+`/player/${addresses[0]}/recent-matches`).then(r=>r.json());expect(recent.Match[0].id).toBe(`${deploymentId(config)}:${match.id}`);
    await openWallet(pages[0]);await pages[0].getByText("Older balances",{exact:true}).click();
    for(const deployment of allDeployments(config).slice(1)){
      const version=deploymentId(deployment).toUpperCase();
      const hash=await operator.writeContract({address:deployment.vault,abi:vaultAbi,functionName:"depositFor",args:[addresses[0]],value:parseEther("0.001")});await client.waitForTransactionReceipt({hash});
      await pages[0].getByRole("dialog",{name:"Account details"}).getByRole("button",{name:`Open ${version} archive & balance`}).click();
      const panel=pages[0].getByRole("dialog",{name:"Account details"}).locator(".legacy-panel").filter({hasText:`ARCHIVED DEPLOYMENT / ${version}`});
      await expect(panel).toContainText(`${version} vault balance: 0.001000`);await panel.getByRole("button",{name:`Withdraw from ${version} vault`}).click();await expect(panel).toContainText("Withdrawal confirmed",{timeout:20000});
      expect(await client.readContract({address:deployment.vault,abi:vaultAbi,functionName:"balances",args:[addresses[0]]})).toBe(0n);
    }
    expect(await client.getBalance({address:addresses[0]})).toBe(parseEther("0.004"));await closeWallet(pages[0]);expect(errors).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
