import type { Pool } from "pg";
import type { Address } from "viem";

/** Journal the request before HTTP: after an uncertain response, look it up.
 * The caller holds the lifecycle advisory lock and verifies the live epoch
 * separately. A control-plane response alone never reopens admission.
 */
export async function requestHostedRenewal(
  db: Pick<Pool, "query">,
  app: Address,
  epoch: bigint,
  expectedUrl: string,
  transport: typeof fetch = fetch,
) {
  const claimed = await db.query(
    "UPDATE il_lifecycle SET provision_epoch=$2 WHERE app=$1 AND provision_epoch<>$2 RETURNING app",
    [app, String(epoch)],
  );
  const create = !!claimed.rowCount;
  const response = await transport(
    `https://control.interludelayer.xyz/sessions${create ? "" : "/" + app}`,
    {
      method: create ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      ...(create ? { body: JSON.stringify({ app }) } : {}),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw new Error(
      `Hosted engine ${create ? "restart" : "lookup"} pending (${response.status}); inspect before retrying creation`,
    );
  const body = await response.json();
  if (typeof body.url !== "string")
    throw new Error(
      "Hosted engine response has no URL; inspect before retrying creation",
    );
  if (body.url.replace(/\/$/, "") !== expectedUrl.replace(/\/$/, ""))
    throw new Error(
      "Hosted node URL changed; update and verify the deployment manifest before admission",
    );
}
