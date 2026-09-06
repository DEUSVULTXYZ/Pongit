import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createPublicClient, createWalletClient, http, parseEther, keccak256, toHex, type Hex, type Address, type Abi } from "viem";
import { monadTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { gameAbi, marketAbi, tournamentsAbi } from "../shared/abis";

test("HTTPS Mera administrator: grant, pauses, creation, cancellation, revoke", async ({ browser }) => {
  test.skip(!process.env.ADMIN_PRIVATE_KEY || !process.env.PONG_TEST_URL, "Explicit funded testnet operator required");
  test.setTimeout(180000);
  const base = process.env.PONG_TEST_URL!;
  const d = await fetch(base + "/api/config").then(r=>r.json());
  expect(d.chainId).toBe(10143);
  expect((await fetch(base + "/api/matches").then(r=>r.json())).matches.every((m:any)=>m.status>=3)).toBe(true);
  const client = createPublicClient({chain:monadTestnet, transport:http(process.env.RPC_URL || "https://rpc.ankr.com/monad_testnet"), pollingInterval:300});
  const operator = createWalletClient({chain:monadTestnet, transport:http(process.env.RPC_URL || "https://rpc.ankr.com/monad_testnet"), account:privateKeyToAccount(process.env.ADMIN_PRIVATE_KEY as Hex)});
  const context = await browser.newContext();
  const p = await context.newPage();
  const cdp = await context.newCDPSession(p);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true}});
  const grants: [Address, Abi, Hex][] = [];
  const hashes: Hex[] = [];
  let address: Address | undefined;
  let report: Record<string, unknown> | undefined;
  async function confirmed(hash: Hex) { hashes.push(hash); expect((await client.waitForTransactionReceipt({hash, confirmations:5})).status).toBe("success"); }
  try {
    await p.goto(base + "/admin");
    await p.getByRole("button",{name:/^Connect passkey/}).first().click();
    const response=p.waitForResponse(r=>/\/player\/0x[\da-f]+$/i.test(r.url()));
    await p.getByRole("button",{name:"Create a passkey"}).click();
    address=(await response).url().split("/").at(-1) as Address;
    for(const [target,abi,roles] of [[d.game,gameAbi,["ADMIN_ROLE","PAUSER_ROLE"]],[d.market,marketAbi,["PAUSER_ROLE"]],[d.tournaments,tournamentsAbi,["TOURNAMENT_ROLE"]]] as const) {
      for (const name of roles) {
        const role=keccak256(toHex(name));
        await confirmed(await operator.writeContract({address:target,abi:abi as Abi,functionName:"grantRole",args:[role,address]}));
        grants.push([target,abi as Abi,role]);
      }
    }
    await confirmed(await operator.sendTransaction({to:address, value:parseEther("0.06")}));
    await p.reload();
    await p.getByRole("button",{name:/^Connect passkey/}).first().click();
    await p.getByRole("button",{name:"Use existing passkey"}).click();
    await expect(p.getByRole("button",{name:"Pause game",exact:true})).toBeVisible();
    for (const target of ["game","market"] as const) {
      for(const paused of [true,false]) {
        await p.getByRole("button",{name:`${paused ? "Pause" : "Resume"} ${target}`,exact:true}).click();
        await expect.poll(()=>client.readContract({address:d[target],abi:target==="game"?gameAbi:marketAbi,functionName:"paused"}),{timeout:20000}).toBe(paused);
        await expect(p.getByRole("button",{name:`${paused ? "Pause" : "Resume"} ${target}`,exact:true})).toBeEnabled({timeout:20000});
      }
    }
    const tid=await client.readContract({address:d.tournaments,abi:tournamentsAbi,functionName:"nextId"});
    await p.getByLabel("Capacity").selectOption("2");
    await p.getByLabel("Registration minutes").fill("0.2");
    await p.getByLabel("Prize (MON)").fill("0.001");
    await p.getByRole("button",{name:"Create onchain"}).click();
    await expect(p.getByRole("button",{name:"Create onchain"})).toBeEnabled({timeout:20000});
    await expect(p.locator(".notice.error")).toHaveCount(0);
    await p.getByRole("button",{name:"Tournaments",exact:true}).click();
    const card=p.locator(".side-card").filter({hasText:`TOURNAMENT #${tid}`});
    await expect(card).toContainText("2-player bracket");
    const tournament=await client.readContract({address:d.tournaments,abi:tournamentsAbi,functionName:"getTournament",args:[tid]});
    await expect.poll(async()=>Number((await client.getBlock()).timestamp),{timeout:20000}).toBeGreaterThan(Number(tournament.closesAt));
    await card.getByRole("button",{name:"Cancel if expired"}).click();
    await expect(card).toContainText("Cancelled",{timeout:20000});
    report = {base,address,tournamentId:String(tid),checks:["Mera role grant","game pause/resume","market pause/resume","Mera funded tournament creation","expired tournament cancellation","roles revoked in cleanup"],operatorTransactions:hashes};
  } catch(error) { console.log("Admin notice",await p.locator(".notice.error").allTextContents()); throw error; } finally {
    for(const [target,abi] of [[d.game,gameAbi],[d.market,marketAbi]] as const) {
      if(await client.readContract({address:target,abi:abi as Abi,functionName:"paused"})) await confirmed(await operator.writeContract({address:target,abi:abi as Abi,functionName:"setPaused",args:[false]}));
    }
    for(const [target,abi,role] of grants) await confirmed(await operator.writeContract({address:target,abi,functionName:"revokeRole",args:[role,address!]}));
    await context.close();
  }
  await writeFile("artifacts/admin-browser.json", JSON.stringify({...report, passedAt:new Date().toISOString()},null,2));
});
