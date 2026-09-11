import type { Pool } from "pg";
import type { Address } from "viem";

type Provision = { epoch: string; state: "sending" | "uncertain" | "rejected" | "confirmed" | "intervention"; attemptedAt: number; retryAt: number; attempts: number; status?: number };

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
  if(p?.state==="intervention")throw new Error("Hosted creation remains ambiguous; inspect the persisted provisioning request before another creation");
  const create=!p || p.state==="rejected";
  const save=async(next:Provision)=>{
    p=next;
    await db.query("UPDATE il_lifecycle SET provision_epoch=$2,provisioning=$3 WHERE app=$1",[app,String(epoch),p]);
  };
  if(create)await save({epoch:String(epoch),state:"sending",attemptedAt:now,retryAt:0,attempts:(p?.attempts??0)+1});
  else if(!row.provisioning)await save(p!);
  let response:Response;
  try {
    response=await transport(`https://control.interludelayer.xyz/sessions${create?"":"/"+app}`,{
      method:create?"POST":"GET",headers:{"content-type":"application/json"},
      ...(create?{body:JSON.stringify({app})}:{}),signal:AbortSignal.timeout(10000),
    });
  }catch {
    await save({...p!,state:"uncertain",retryAt:now+10000});
    throw new Error("Hosted engine response lost; looking up the existing session before any new creation");
  }
  const body=await response.json().catch(()=>null);
  if(!response.ok){
    // HTTP status alone does not establish whether the previous POST executed.
    const rejected=create && response.status>=400 && response.status<500 && body?.created===false;
    const retryHeader=Number(response.headers.get("retry-after"));
    const wait=Number.isFinite(retryHeader)&&retryHeader>0?Math.min(3600,retryHeader)*1000:Math.min(60000,10000*p!.attempts);
    const intervention=!rejected && now-p!.attemptedAt>=300000;
    await save({...p!,state:rejected?"rejected":intervention?"intervention":"uncertain",status:response.status,retryAt:now+wait});
    throw new Error(`Hosted engine ${create?"creation":"lookup"} pending (${response.status})${intervention?"; operator inspection required":""}`);
  }
  if(typeof body?.url!=="string"){
    await save({...p!,state:now-p!.attemptedAt>=300000?"intervention":"uncertain",retryAt:now+10000});
    throw new Error("Hosted engine response has no URL; waiting for provisioning confirmation");
  }
  if(body.url.replace(/\/$/,"")!==expectedUrl.replace(/\/$/,"")){
    await save({...p!,state:"intervention",retryAt:0});
    throw new Error("Hosted node URL changed; update and verify the deployment manifest before admission");
  }
  await save({...p!,state:"confirmed",status:response.status,retryAt:now+10000});
}
