import type { Pool } from "pg";
import type { Address } from "viem";
import { HOME_REGION } from "../../shared/interlude-regions";

type Provision = { epoch: string; state: "sending" | "uncertain" | "rejected" | "confirmed" | "intervention"; attemptedAt: number; retryAt: number; attempts: number; status?: number;
  reason?: "identity"; stalledAt?: number; alertedAt?: number };

/** Persist intent before HTTP. Lost replies are resolved by lookup, not another POST. */
export async function requestHostedRenewal(
  db: Pick<Pool, "query">, app: Address, epoch: bigint, expectedUrl: string,
  transport: typeof fetch = fetch, now = Date.now(),
) {
  const row=(await db.query("SELECT provision_epoch,provisioning FROM il_lifecycle WHERE app=$1",[app])).rows[0];
  let p: Provision | null = row.provisioning;
  if(!p && String(row.provision_epoch)===String(epoch))p={epoch:String(epoch),state:"uncertain",attemptedAt:now,retryAt:0,attempts:1};
  if(p?.epoch!==String(epoch))p=null;
  if(p && p.retryAt>now)throw new Error("Hosted engine retry is cooling down");
  // Only a changed identity or URL is terminal. An older intervention came from
  // ambiguity alone: resume lookups, which never create and recheck identity.
  if(p?.state==="intervention"){
    if(p.reason==="identity")throw new Error("Hosted engine identity changed; operator inspection required");
    p={...p,state:"uncertain"};
  }
  const create=!p || p.state==="rejected";
  const save=async(next:Provision)=>{
    p=next;
    await db.query("UPDATE il_lifecycle SET provision_epoch=$2,provisioning=$3 WHERE app=$1",[app,String(epoch),p]);
  };
  // Ambiguity keeps looking up: a GET never creates, so it is always safe and it
  // adopts the session as soon as control answers. Past five minutes the state is
  // flagged for operators instead of freezing every later lookup.
  const pending=(next:Partial<Provision>,reason:string):Provision=>{
    const value:Provision={...p!,state:"uncertain",...next};
    if(now-p!.attemptedAt>=300000){
      value.stalledAt=p!.stalledAt??now;
      if(p!.alertedAt===undefined||now-p!.alertedAt>=600000){value.alertedAt=now;console.warn(JSON.stringify({event:"hosted-provisioning-stalled",app,epoch:String(epoch),
        since:new Date(p!.attemptedAt).toISOString(),reason,attempts:p!.attempts}));}
    }
    return value;
  };
  if(create)await save({epoch:String(epoch),state:"sending",attemptedAt:now,retryAt:0,attempts:(p?.attempts??0)+1});
  else if(!row.provisioning)await save(p!);
  let response:Response;
  try {
    response=await transport(`https://control.interludelayer.xyz/sessions${create?"":"/"+app}`,{
      method:create?"POST":"GET",headers:{"content-type":"application/json"},
      // Without a region, Interlude places the node near the caller (this VPS), not the players.
      ...(create?{body:JSON.stringify({app,region:HOME_REGION})}:{}),signal:AbortSignal.timeout(10000),
    });
  }catch {
    await save(pending({retryAt:now+10000},"response-lost"));
    throw new Error("Hosted engine response lost; looking up the existing session before any new creation");
  }
  const body=await response.json().catch(()=>null);
  if(!response.ok){
    // HTTP status alone does not establish whether the previous POST executed.
    const rejected=create && response.status>=400 && response.status<500 && body?.created===false;
    const retryHeader=Number(response.headers.get("retry-after"));
    const wait=Number.isFinite(retryHeader)&&retryHeader>0?Math.min(3600,retryHeader)*1000:Math.min(60000,10000*p!.attempts);
    // A 404 after a lost POST is still ambiguous: never create again on it.
    await save(pending({state:rejected?"rejected":"uncertain",status:response.status,retryAt:now+wait},"http-"+response.status));
    throw new Error(`Hosted engine ${create?"creation":"lookup"} pending (${response.status})`);
  }
  if(typeof body?.url!=="string"){
    await save(pending({retryAt:now+10000},"missing-url"));
    throw new Error("Hosted engine response has no URL; waiting for provisioning confirmation");
  }
  if(body.app && String(body.app).toLowerCase()!==app.toLowerCase()){
    await save({...p!,state:"intervention",reason:"identity",retryAt:0});
    throw new Error("Hosted lookup belongs to another application; operator inspection required");
  }
  if(body.url.replace(/\/$/,"")!==expectedUrl.replace(/\/$/,"")){
    await save({...p!,state:"intervention",reason:"identity",retryAt:0});
    throw new Error("Hosted node URL changed; update and verify the deployment manifest before admission");
  }
  // This function is called only while the engine itself still fails validation.
  // A live control-plane record must not hide an old or unavailable engine forever.
  if(now-p!.attemptedAt>=300000){
    await save(pending({state:"confirmed",status:response.status,retryAt:now+10000},"engine-unavailable"));
    throw new Error("Hosted session exists but the new engine epoch is still unavailable; still checking");
  }
  await save({...p!,state:"confirmed",status:response.status,retryAt:now+10000});
}
