import {
  createInterludeClient,
  webStorageStore,
  decodeSession,
  storageKey,
  type Session,
} from "@interludelayer-sdk/sdk";
import { createPublicClient, http, type Abi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import manifest from "../../deployments/interlude-rooms.json";
import { roomsAbi } from "../../shared/abi-rooms";
import { roomsChaosAbi } from "../../shared/abi-PongRoomsTestnet";
import { roomsCompactAbi } from "../../shared/abi-PongRoomsCompact";
import { roomsEventsAbi } from "../../shared/abi-PongChaosEvents";
import {compactRoomsSession} from '../../shared/compact-rooms-session';
import { api, API } from "./api";
import {engineTransport} from "../../shared/engine-transport";
import {measuredFetch,recordRpc} from "../../shared/rpc-metrics";
import {RoomsCommandJournal,resendJournaled} from './rooms-command-journal';
import {EngineHalted} from '../../shared/engine-halt';
import {readHubDelegation} from '../../shared/rooms-hub';
import {assertRoomsEngineAvailable} from '../../shared/rooms-availability';
export const roomsManifest = manifest;
export const roomsCompact = (manifest as typeof manifest & {compactControls?:boolean}).compactControls===true;
const gameAbi:Abi=Number(manifest.rulesVersion)===6?roomsEventsAbi:roomsCompact?roomsCompactAbi:roomsChaosAbi;
export const roomsChaos = [4,5,6].includes(Number(manifest.rulesVersion));
export const roomsEvents = Number(manifest.rulesVersion)===6;
export const roomsScope = [
  "acceptMatch",
  "input",
  "tick",
  "cancelMatch",
  "concede",
] as const;
export const roomsAccountKey = `pongit:rooms:${manifest.app}:account`;
export function createRoomsClient() {
  const journal=new RoomsCommandJournal(sessionStorage,manifest.app as Address,roomsChaos?gameAbi:roomsAbi);
  const client=createInterludeClient({
    app: manifest.app as Address,
    abi: roomsChaos ? gameAbi : roomsAbi,
    node: manifest.node,
    base: createPublicClient({
      chain: monadTestnet,
      transport: http("https://testnet-rpc.monad.xyz", {
        retryCount: 0,
        timeout: 8000,
        fetchFn:measuredFetch("monad"),
      }),
    }),
    store: webStorageStore(sessionStorage),
    expirySeconds: 7200,
    transport: engineTransport(manifest.node,journal),
    fastPath: true,
  });
  return Object.assign(client,{commandJournal:journal});
}
export type RoomsClient = ReturnType<typeof createRoomsClient>;
export type RoomsSession = Session<Abi>;
function storedControls(player:Address){
 const stored=decodeSession(sessionStorage.getItem(storageKey(manifest.app as Address,10143,player)));
 if(!stored||stored.app.toLowerCase()!==manifest.app.toLowerCase()||stored.baseChainId!==10143||stored.grant.granter.toLowerCase()!==player.toLowerCase())throw Error('Renew your arcade session to continue.');
 return stored;
}
export function roomControls(client:RoomsClient,player:Address,epoch:bigint){
 if(!roomsCompact)return;
 const stored=storedControls(player);
 client.commandJournal.bindRoomControls(player,stored.grant.sessionKey,epoch,stored.grant.expiry);
 return compactRoomsSession({node:client.node,abi:gameAbi,app:manifest.app as Address,stored,epoch});
}
/** Reads first, then reuses only the same signed bytes if a response was lost.
 * `halted`: the relayer reports ENGINE_HALTED. Nothing is resent to a halted node;
 * the entry stays uncertain until the node answers again or a newer epoch
 * retires it. */
export async function recoverRoomsCommands(client:RoomsClient,player:Address,o:{halted?:boolean}={}){
  const [node,hub]=await Promise.all([client.status(),readHubDelegation(client.base,manifest.hub as Address,manifest.app as Address)]);
  assertRoomsEngineAvailable(manifest.app,node,hub,Math.floor(Date.now()/1000));
  client.commandJournal.retirePrevious(player,hub.epoch);
  const pending=client.commandJournal.pending(player);
  if(!pending){client.commandJournal.assertGasAllowed();return;}
  if(pending.epoch!==String(hub.epoch))throw Error('The uncertain command belongs to another engine epoch');
  if(roomsCompact){const stored=storedControls(player);client.commandJournal.bindRoomControls(player,stored.grant.sessionKey,hub.epoch,stored.grant.expiry);}
  let receipt=await client.node.getTransactionReceipt({hash:pending.hash}).catch(()=>null);
  if(!receipt){
    if(o.halted)throw new EngineHalted();
    // Explicit recovery can resend these bytes, never synthesize a replacement.
    // A refusal before execution with the nonce confirmed unused retires them.
    const sent=await resendJournaled(client.commandJournal,pending,{
      send:raw=>client.node.request({method:'interlude_sendTransaction',params:[raw]} as any),
      latestNonce:()=>client.node.getTransactionCount({address:pending.signer,blockTag:'latest'}),
    });
    // Retired: the nonce is free and a fresh session signs the next command.
    if(sent.kind==='refused')return;
    receipt=sent.receipt as any;
  }
  if(!receipt || client.commandJournal.pending(player))throw Error('Waiting for confirmation of the existing game command');
}
export async function roomsApi<T = any>(
  path: string,
  body?: unknown,
): Promise<T> {
  const player = sessionStorage.getItem(roomsAccountKey);
  const at=Date.now(),method=path.split("?")[0].replace(/0x[\da-f]+/gi,"item").replace(/[^\w]/g,".").slice(0,80);
  const response = await fetch(API + path, {
    credentials: "include",
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(player ? { "x-pongit-player": player.toLowerCase() } : {}),
    },
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body, (_, v) =>
            typeof v === "bigint" ? v.toString() : v,
          ),
    signal: AbortSignal.timeout(15000),
  });
  recordRpc({at,target:"pongit",method,status:response.status,ms:Date.now()-at,source:"network"});
  const result = await response.json().catch(() => {
    throw new Error("Connection interrupted. Please retry.");
  });
  if (!response.ok) {
    const error = new Error(result.error || "Service unavailable");
    Object.assign(error, {status: response.status, headers: response.headers,code:result.code,source:result.source,retryAt:result.retryAt,requestId:result.requestId});
    throw error;
  }
  return result;
}
export async function authenticateRooms(player: Address) {
  const stored = decodeSession(
    sessionStorage.getItem(
      storageKey(roomsManifest.app as Address, 10143, player),
    ),
  );
  if (!stored) throw new Error("Renew your arcade session to continue.");
  const challenge = await api("/interlude/auth/challenge", { player });
  const signature = await privateKeyToAccount(stored.privateKey).signMessage({
    message: challenge.message,
  });
  await api("/interlude/auth/session", {
    player,
    nonce: challenge.nonce,
    signature,
    grant: stored.grant,
    grantSignature: stored.signature,
  });
}
export async function roomsAction(
  path: string,
  body: Record<string, unknown> = {},
  operation = crypto.randomUUID(),
) {
  return roomsApi(`/interlude/${path}`, { ...body, operation });
}
