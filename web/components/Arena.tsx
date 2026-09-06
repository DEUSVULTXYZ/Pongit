"use client";
import { useEffect, useRef, useState } from "react";
import {
  decodeAbiParameters,
  encodeFunctionData,
  formatEther,
  keccak256,
  parseEther,
  toHex,
  createWalletClient,
  createPublicClient,
  defineChain,
  http,
  type Hex,
  type Address,
} from "viem";
import { ArcadeAmbience } from "./ArcadeAmbience";
import { arcadeAudio } from "../lib/audio";
import { Court } from "./Court";
import {
  api, appApi,
  API,
  WS,
  relay,
  waitJob,
  notifyJob,
  stateFromJson,
  short,
  type Config,
} from "../lib/api";
import {
  connect, rememberedAccount, forgetAccount, accountStub,
  localIdentity,
  gameSession,
  type Identity,
} from "../lib/wallet";
import {
  domain, json, deploymentId, allDeployments,
  joinTypes, joinV2Types, queueV2Message,
  inputTypes,
  betTypes,
  actionTypes,
  sessionTypes,
  enterTypes,
  withdrawTypes,
  queueMessage,
  cancelQueueMessage,
} from "../../shared/protocol";
import { type State, stateComponents, advance } from "../../shared/physics-v2";
import { gameV2Abi as gameAbi, marketV2Abi as marketAbi, tournamentsV2Abi as tournamentsAbi } from "../../shared/abis-v2";
import { Legacy } from "./Legacy";
import { SocialHub } from "./SocialHub";
import { createArcade, restoreArcade, clearArcade, revokeArcade, type ArcadeSession } from "../lib/arcade";
import { Outcome } from "./Outcome";
import { monadTransport } from "../lib/transport";
import { acceptsSnapshot, type SnapshotCursor } from "../lib/presentation";

const tabs = ["Play", "Live", "Rivals", "Ladder", "Tournaments", "Archive"];
const money = (value: unknown) =>
  Number(formatEther(BigInt(String(value || 0)))).toFixed(4);
export function Arena({ initialTab = "Play" }: { initialTab?: string }) {
  const [tab, setTab] = useState(initialTab),
    [config, setConfig] = useState<Config | null>(null),
    [account, setAccount] = useState(""),
    [player, setPlayer] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [match, setMatch] = useState<any>(null),
    [state, setState] = useState<State | null>(null);
  const [head, setHead] = useState(0n),
    [clock, setClock] = useState(0n),
    [observedAt, setObservedAt] = useState(Date.now()),
    [connected, setConnected] = useState(false);
  const [message, setMessage] = useState(
      "Connect a passkey to enter the arena.",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [queued, setQueued] = useState(false),
    [direction, setDirection] = useState(0);
  const [noteContext,setNoteContext]=useState<{ref:string;atUs:string}|null>(null);
  const [mode,setMode]=useState(0),[sound,setSound]=useState(false),[challengeTarget,setChallengeTarget]=useState("");
  const arcade=useRef<ArcadeSession|null>(null),restoreAttempt=useRef(""),pendingReady=useRef<any>(null);
  const [arcadeExpires,setArcadeExpires]=useState(0),[remembered,setRemembered]=useState<ReturnType<typeof rememberedAccount>>(null);
  const expectedRoom=useRef<{mode:number;ranked:boolean;opponent?:string;roomId?:string}|null>(null);
  const [fundingWarning, setFundingWarning] = useState("");
  const [fps, setFps] = useState(0),
    [predicted, setPredicted] = useState(false),
    [correction, setCorrection] = useState(0),
    [showConnect, setShowConnect] = useState(false);
  const [showAccount, setShowAccount] = useState(false), [copiedAddress, setCopiedAddress] = useState(false);
  const [inputPending, setInputPending] = useState(false), [waitingImpact, setWaitingImpact] = useState(false);
  const [inputTiming, setInputTiming] = useState<any>(null);
  const lastSnapshotSound=useRef(0);
  const snapshotCursor = useRef<SnapshotCursor | null>(null);
  const inputNonce = useRef({ key: "", nonce: 0n });
  const [ladder, setLadder] = useState<any[]>([]),
    [tournaments, setTournaments] = useState<any[]>([]),
    [alerts, setAlerts] = useState<any[]>([]);
  const [shares, setShares] = useState("0.001"),
    [odds, setOdds] = useState<any>(null),
    [frames, setFrames] = useState<any[]>([]),
    [frameIndex, setFrameIndex] = useState(0),
    [replayPlaying, setReplayPlaying] = useState(false);
  const [tournamentId, setTournamentId] = useState("0"),
    [withdrawAmount, setWithdrawAmount] = useState("0.001"),
    [recipient, setRecipient] = useState("");
  const [capacity, setCapacity] = useState("8"),
    [fee, setFee] = useState("0"),
    [prize, setPrize] = useState("0.01"),
    [minutes, setMinutes] = useState("30"),
    [attachTid, setAttachTid] = useState(""),
    [attachSlot, setAttachSlot] = useState("0");
  const owner = useRef<Identity | null>(null),
    session = useRef<Pick<Identity,"account"|"end"> | null>(null),
    secret = useRef<Hex | null>(null),
    readyRoom = useRef(""),
    revealSent = useRef("");
  const ownerOpen = useRef(false);
  const clockOffset = useRef(0);
  const nowSeconds = () => Math.floor((Date.now() + clockOffset.current) / 1000);
  const operationBusy = useRef(false), identityVersion = useRef(0), queueTicket = useRef("");
  const [inputLatency, setInputLatency] = useState<number | null>(null);
  const [archive, setArchive] = useState<any[]>([]),
    [moreHistory, setMoreHistory] = useState(false);
  async function loadHistory(more = false) {
    const previous = more ? archive : [];
    const before = previous.at(-1)?.block;
    const data = await api("/history" + (before ? `?before=${before}` : ""));
    setArchive([...previous, ...data.Match.map((m:any)=>({...m,ref:m.id,id:m.rawId}))]);
    setMoreHistory(data.Match.length === 100);
  }
  useEffect(() => {
    if (tab === "Archive") void loadHistory().catch((e) => setError(e.message));
  }, [tab]);
  const visibleItems =
    tab === "Archive"
      ? archive.map((m) => ({
          ...m,
          state: items.find((i) => i.id === m.id)?.state,
        }))
      : items;
  const view = useRef({
    config,
    account,
    selected,
    match,
    head,
    tab,
    direction,
  });
  view.current = { config, account, selected, match, head, tab, direction };
  const lastState = useRef<State | null>(null),
    lastDirection = useRef(0),
    inputBusy = useRef(false),
    sessionMatch = useRef("");
  const side =
    match && account
      ? match.playerA.toLowerCase() === account.toLowerCase()
        ? 0
        : match.playerB.toLowerCase() === account.toLowerCase()
          ? 1
          : -1
      : -1;
  const canControl = side >= 0 && match?.status === 2 && !!session.current &&
    selected === sessionMatch.current &&
    (side === 0 ? match.a.key : match.b.key).toLowerCase() === session.current.account.address.toLowerCase();
  async function act(fn: () => Promise<void>) {
    if (operationBusy.current) return;
    operationBusy.current = true;
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      operationBusy.current = false;
      setBusy(false);
    }
  }
  async function refreshPlayer(address = account) {
    if (address) {
      const data = await api(`/player/${address}`);
      if (owner.current?.account.address.toLowerCase() === address.toLowerCase()) setPlayer(data);
    }
  }
  useEffect(() => {
    if (account && match?.status >= 3)
      void refreshPlayer().catch((e) => setError(e.message));
  }, [account, selected, match?.status,match?.ratingFinalized]);
  async function signingOwner() {
    if (!owner.current) throw new Error("Connect your passkey first");
    if (!owner.current.local && !ownerOpen.current) {
      const restored = await connect(false,false,owner.current.credential);
      if (restored.account.address.toLowerCase() !== account.toLowerCase()) {
        restored.end();
        throw new Error("Choose the passkey for the connected account.");
      }
      owner.current = restored;
      ownerOpen.current = true;
    }
    return owner.current;
  }
  function closeOwner() {
    if (owner.current && !owner.current.local) {
      owner.current.end();
      ownerOpen.current = false;
    }
  }
  useEffect(()=>setNoteContext(null),[selected,account]);
  async function gameplaySigner() {
    if(config?.version!==3)return signingOwner();
    if(!arcade.current || arcade.current.player.toLowerCase()!==owner.current?.account.address.toLowerCase())throw new Error("Renew arcade session to keep playing.");
    await arcade.current.validate();return arcade.current.identity;
  }
  async function renewArcade(identity=owner.current!) {
    if(!config?.arcade)return;
    const own=ownerOpen.current?identity:await signingOwner();
    try {arcade.current=await createArcade(own,config);session.current=arcade.current.identity;setArcadeExpires(arcade.current.expires);setMessage("Arcade session ready · two hours of play in this tab.");}
    finally {closeOwner();}
    if(view.current.selected && view.current.match?.status===2 && [view.current.match.playerA,view.current.match.playerB].some((p:string)=>p.toLowerCase()===own.account.address.toLowerCase()))await restoreSession();
  }
  function persistMatch() {
    if(config?.version===3)sessionStorage.setItem("pongit:pending-match",json({player:owner.current?.account.address,game:config.game,expected:expectedRoom.current,ticket:queueTicket.current,secret:secret.current,room:readyRoom.current,match:sessionMatch.current,reveal:revealSent.current,ready:pendingReady.current}));
  }
  useEffect(()=>{setRemembered(rememberedAccount());},[]);
  useEffect(()=>{
    if(!config?.arcade || restoreAttempt.current===config.game)return;restoreAttempt.current=config.game;
    const generation=identityVersion.current;setBusy(true);
    void restoreArcade(config).then(async restored=>{
      if(generation!==identityVersion.current){restored?.session.end();return;}
      if(!restored){const previous=rememberedAccount();if(previous){owner.current=accountStub(previous.address,previous.credential);setAccount(previous.address);setRecipient(previous.address);setMessage("Renew arcade session to continue playing.");await refreshPlayer(previous.address);}return;}owner.current=restored.owner;arcade.current=restored.session;session.current=restored.session.identity;ownerOpen.current=false;
      const address=restored.owner.account.address;setAccount(address);setRecipient(address);setArcadeExpires(restored.session.expires);
      const pending=JSON.parse(sessionStorage.getItem("pongit:pending-match")||"null");
      if(pending?.player?.toLowerCase()===address.toLowerCase() && pending.game===config.game){expectedRoom.current=pending.expected;queueTicket.current=pending.ticket;secret.current=pending.secret;readyRoom.current=pending.room;sessionMatch.current=pending.match;revealSent.current=pending.reveal;pendingReady.current=pending.ready;if(pending.ticket)setQueued(true);}
      const all=await api("/matches");const active=all.matches.find((m:any)=>[1,2].includes(m.status)&&[m.playerA,m.playerB].some((p:string)=>p.toLowerCase()===address.toLowerCase()));
      if(active){sessionMatch.current=active.id;setSelected(active.id);setTab("Play");}
      await refreshPlayer(address);setMessage("Welcome back. Arcade session restored in this tab.");
    }).catch(e=>{if(generation===identityVersion.current)setError(e.message);}).finally(()=>setBusy(false));
  },[config?.game]);
  useEffect(()=>{if(!arcade.current)return;const check=()=>void arcade.current?.validate().catch(()=>{setArcadeExpires(0);setDirection(0);session.current=null;setMessage("Arcade session expired or revoked. Renew arcade session to play again.");});const timer=setInterval(check,15000);return()=>clearInterval(timer);},[account,arcadeExpires]);
  async function authenticateApp() {
    if(!owner.current)throw new Error("Connect your passkey first");
    try {const current=await appApi("/auth/session");if(current.player===owner.current.account.address.toLowerCase())return;} catch {}
    const own=await gameplaySigner();const generation=identityVersion.current;
    const challenge=await appApi("/auth/challenge","POST",{player:owner.current.account.address});
    const signature=await own.account.signMessage({message:challenge.message});closeOwner();
    if(generation!==identityVersion.current)throw new Error("Account changed");
    await appApi("/auth/session","POST",{player:owner.current!.account.address,nonce:challenge.nonce,signature});
  }
  function enterChallenge(c:any) {
    if(queued && expectedRoom.current?.roomId===c.room_id)return;
    readyRoom.current="";revealSent.current="";
    expectedRoom.current={mode:c.mode,ranked:c.ranked,opponent:c.creator===account.toLowerCase()?c.recipient:c.creator,roomId:c.room_id};
    queueTicket.current=c.ticket || (c.creator===account.toLowerCase()?c.ticket_a:c.ticket_b) || "";
    persistMatch();
    setMode(c.mode);setTournamentId("0");setQueued(true);setTab("Play");
    setMessage(`Accepted ${c.mode===1?"Chaos":"Classic"} ${c.ranked?"ranked":"friendly"} challenge. Starting your match.`);
  }
  async function login(kind: "create" | "restore" | "another" | "local" | "operator") {
    const identity =
      kind === "local" || kind === "operator"
        ? localIdentity(kind === "operator")
        : await connect(kind === "create",kind === "another");
    await appApi("/auth/session","DELETE");
    identityVersion.current++;
    expectedRoom.current=null;
    snapshotCursor.current = null;
    inputNonce.current = { key: "", nonce: 0n };
    setInputPending(false);
    session.current?.end();
    session.current = null;
    setArcadeExpires(0);
    secret.current = null;
    sessionMatch.current = "";
    readyRoom.current = "";
    revealSent.current = "";
    queueTicket.current = "";
    lastDirection.current = 0;
    lastState.current = null;
    setQueued(false);
    setDirection(0);
    setTournamentId("0");
    setPlayer(null);
    setSelected(null);
    setMatch(null);
    setState(null);
    owner.current?.end();
    owner.current = identity;
    ownerOpen.current = true;
    setAccount(identity.account.address);
    setRecipient(identity.account.address);
    setShowConnect(false);
    setShowAccount(false);
    setMessage(
      identity.local
        ? "Local test account — Anvil only."
        : "Passkey connected. Ready to play.",
    );
    setRemembered(rememberedAccount());
    if(config?.version===3)await renewArcade(identity);
    await refreshPlayer(identity.account.address);
    const all = await api("/matches");
    const active = all.matches.find((m:any)=>m.status === 2 && [m.playerA,m.playerB].some((p:string)=>p.toLowerCase()===identity.account.address.toLowerCase()));
    if (active && owner.current === identity) { setSelected(active.id); setTab("Play"); }

  }
  async function disconnect() {
    let revokePending=false;
    try {if(queued)await cancelQueue();if(config && arcade.current)await revokeArcade(config,arcade.current);}catch{revokePending=!!arcade.current;}
    try {await appApi("/auth/session","DELETE");}catch{}
    clearArcade();arcade.current=null;setArcadeExpires(0);
    identityVersion.current++;
    expectedRoom.current=null;
    owner.current?.end();
    session.current?.end();
    owner.current = null; ownerOpen.current = false; session.current = null;
    secret.current = null; sessionMatch.current = ""; readyRoom.current = ""; revealSent.current = "";
    queueTicket.current = ""; lastDirection.current = 0; lastState.current = null;
    inputNonce.current = { key: "", nonce: 0n }; snapshotCursor.current = null;
    setAccount(""); setPlayer(null); setDirection(0); setInputPending(false); setInputLatency(null);
    setInputTiming(null); setQueued(false); setRecipient(""); setTournamentId("0");
    setSelected(null); setMatch(null); setState(null); setFrames([]); setReplayPlaying(false);
    setShowAccount(false); setShowConnect(false); setTab("Play");
    setMessage(revokePending?"Disconnected locally. Onchain session revocation remains unconfirmed; its authorization expires within two hours. Reconnect to replace it.":"Disconnected. Session revocation confirmed. Your passkey and funds are preserved; submitted transactions may still complete.");
  }
  useEffect(() => {
    let stop = false;
    let closeTransport: (()=>void) | undefined;
    let reconnect: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const startedAt = Date.now();
        const c = await api<Config>("/config");
        if (!stop) { clockOffset.current = c.serverTimeMs - (startedAt + Date.now()) / 2; setConfig(c); }
        const all = await api("/matches");
        const health = await api("/health");
        if (!stop) setFundingWarning(health.queueError || "");
        if (!stop) {
          setItems(all.matches.sort((a:any,b:any)=>Number(b.id)-Number(a.id)));
          setHead((previous) => BigInt(all.head) > previous ? BigInt(all.head) : previous);
        }
        const selectedId=view.current.selected;
        if(!stop && selectedId && view.current.tab!=="Archive") {
          const selectedMatch=await monadTransport.readMatch(selectedId);
          if(!stop)applyMatch({...selectedMatch,id:selectedId});
        }
      } catch {
        if (!stop)
          setMessage(
            "Connection interrupted. Reconnecting to the arena...",
          );
      }
    };
    void load();
    const open = () => {
      if (stop) return;
      closeTransport = monadTransport.subscribe((data) => {
        if (data.head) setHead((previous) => BigInt(data.head) > previous ? BigInt(data.head) : previous);
        if (data.type === "job") notifyJob(data);
        if (data.type === "match") {
          setItems((old) =>
            [
              { id: String(data.id), ...data.match },
              ...old.filter((m) => m.id !== String(data.id)),
            ].sort((a, b) => Number(b.id) - Number(a.id)),
          );
          if (
            String(data.id) === view.current.selected &&
            view.current.tab !== "Archive"
          )
            applyMatch(data);
        }
      }, (online)=>{setConnected(online);if(online)void load();else if(!stop)reconnect=setTimeout(open,2000);});
    };
    open();
    const poll = setInterval(() => {
      void load();
    }, 15000);
    return () => {
      stop = true;
      clearInterval(poll);
      clearTimeout(reconnect);
      closeTransport?.();
      owner.current?.end();
      session.current?.end();
    };
  }, []);
  function applyMatch(data: any) {
    const id = String(data.id ?? view.current.selected);
    if (id !== view.current.selected || view.current.tab === "Archive") return;
    const incoming = { id, head: BigInt(data.head), version: BigInt(data.match.version), clock: BigInt(data.clock) };
    if (!acceptsSnapshot(snapshotCursor.current, incoming)) return;
    snapshotCursor.current = incoming;
    const s = stateFromJson(data.match.state);
    if(lastState.current && data.match.status>=2 && Date.now()-(lastSnapshotSound.current||0)<1800){
      if(s.scoreA!==lastState.current.scoreA || s.scoreB!==lastState.current.scoreB)arcadeAudio.play("point",`${id}:point:${s.scoreA}:${s.scoreB}`);
      if(s.halfA!==lastState.current.halfA || s.halfB!==lastState.current.halfB)arcadeAudio.play("handicap",`${id}:size:${s.resumeAt}`);
    }
    lastSnapshotSound.current=Date.now();
    const playable =
      Number(data.match.status) >= 2 && BigInt(data.match.startBlock)>0n;
    if (playable && lastState.current && s.t >= lastState.current.t) {
      const expected = advance(lastState.current, s.t)[0];
      setCorrection(
        Math.max(
          Math.abs(Number(expected.x - s.x)),
          Math.abs(Number(expected.y - s.y)),
        ) / 1e6,
      );
    }
    lastState.current = playable ? s : null;
    setMatch(data.match);
    setState(playable ? s : null);
    setClock(BigInt(data.clock));
    setObservedAt(data.observedAt ? data.observedAt - clockOffset.current : Date.now());
  }
  useEffect(() => {
    let cancelled = false;
    snapshotCursor.current = null;
    lastState.current = null;
    if (selected && tab !== "Archive")
      void monadTransport.readMatch(selected)
        .then((data) => { if (!cancelled) applyMatch({ ...data, id: selected }); })
        .catch((e) => setError(e.message));
    return () => { cancelled = true; };
  }, [selected, tab]);
  useEffect(() => {
    if (!showConnect && !showAccount) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector(".connect-modal")!;
    const controls = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input,textarea",
        ),
      );
    controls()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setShowConnect(false); setShowAccount(false); }
      if (e.key === "Tab") {
        const list = controls();
        const first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [showConnect, showAccount]);
  useEffect(() => {
    if (tab === "Ladder")
      void api(`/leaderboard?mode=${mode}`)
        .then((d) => setLadder(d.Player))
        .catch((e) => setError(e.message));
    if (tab === "Tournaments")
      void api("/tournaments")
        .then((d) => setTournaments(d.tournaments))
        .catch((e) => setError(e.message));
    if (tab === "Admin" && player?.admin)
      void api("/alerts")
        .then((d) => setAlerts(d.Alert))
        .catch((e) => setError(e.message));
  }, [tab, player?.admin,mode]);
  useEffect(() => {
    if (!queued || !account || !config) return;
    let cancelled = false;
    const tick = async () => {
      if (operationBusy.current || cancelled) return;
      operationBusy.current = true;
      try {
        const room = await api(`/queue/${account}`);
        if (cancelled) return;
        if (!room.id) {
          if (!room.waiting) { queueTicket.current = ""; setQueued(false); setMessage("Search expired or opponent cancelled. You can search again."); }
          return;
        }
        const agreed=expectedRoom.current;
        if((config.version || 1)>=2 && (!agreed || room.mode!==agreed.mode || room.ranked!==agreed.ranked || room.rules_version!==2 || room.deployment!==deploymentId(config) || agreed.roomId && agreed.roomId!==room.id || agreed.opponent && ![room.player_a,room.player_b].includes(agreed.opponent.toLowerCase()))) throw new Error("Room rules differ from your agreement. Cancel and create a fresh invitation.");
        queueTicket.current=room.player_a===account.toLowerCase()?room.ticket_a:room.ticket_b;
        if (room.id !== readyRoom.current) {
          readyRoom.current = room.id;
          if(config.version===3)session.current=arcade.current?.identity || null;
          else {session.current?.end();session.current=gameSession();}
          if(!session.current)throw new Error("Renew arcade session");
          secret.current = toHex(crypto.getRandomValues(new Uint8Array(32)));
          setBusy(true);
          const own = await gameplaySigner();
          const info = await api(`/player/${account}`);
          const opponent =
            room.player_a === account.toLowerCase()
              ? room.player_b
              : room.player_a;
          const now = nowSeconds();
          const join = {
            player: account as Address,
            opponent: opponent as Address,
            roomId: room.id as Hex,
            commitment: keccak256(secret.current),
            sessionKey: session.current.account.address,
            nonce: BigInt(info.gameNonce),
            deadline: BigInt(now + 150),
            sessionExpiry: BigInt(config.version===3?arcade.current!.expires:now + 3600),
            maxInputs: 12000,
            tournamentId: BigInt(room.tournament_id),
            mode: room.mode || 0, ranked:room.ranked!==false, rulesVersion:2,
          };
          const signature = await own.account.signTypedData({
            domain: domain("PONG", config.chainId, config.game),
            types: (config.version || 1)>=2?joinV2Types:joinTypes,
            primaryType: "Join",
            message: join,
          });
          pendingReady.current={join,signature};persistMatch();
          await api("/ready", pendingReady.current);
          closeOwner();
          arcadeAudio.play("match",`match:${room.id}`);
          setMessage("Opponent found. Waiting for onchain confirmation.");
        }
        if(room.id===readyRoom.current && pendingReady.current && !(room.player_a===account.toLowerCase()?room.join_a:room.join_b))await api("/ready",pendingReady.current);
        if (room.job_id) {
          const job = await api(`/jobs/${room.job_id}`);
          if (job.status === "failed")
            throw new Error(job.error || "Match creation failed");
        }
        if (room.match_id && revealSent.current !== room.match_id) {
          revealSent.current = room.match_id;
          sessionMatch.current = room.match_id;
          setSelected(room.match_id);
          await relay({
            contract: "game",
            functionName: "reveal",
            args: [room.match_id, account, secret.current],
          });
          setQueued(false);
          queueTicket.current = "";persistMatch();
          setMessage("Session active. W / S or ↑ / ↓ to move.");
          setTab("Play");
        }
      } catch (e) {
        setError((e as Error).message);
        setQueued(false);
      } finally {
        operationBusy.current = false;
        setBusy(false);
      }
    };
    const timer = setInterval(() => void tick(), 1000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [queued, account, config]);
  useEffect(() => {
    const keys = new Set<string>();
    const update = () =>
      setDirection(
        keys.has("ArrowUp") || keys.has("w") || keys.has("W")
          ? -1
          : keys.has("ArrowDown") || keys.has("s") || keys.has("S")
            ? 1
            : 0,
      );
    const down = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      if ((e.target as HTMLElement).matches("input,textarea,select")) return;
      if (["ArrowUp", "ArrowDown", "w", "s", "W", "S"].includes(e.key)) {
        e.preventDefault();
        keys.add(e.key);
        update();
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.key);
      update();
    };
    const blur = () => {
      keys.clear();
      setDirection(0);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(async () => {
      const v = view.current;
      if (
        inputBusy.current ||
        !v.config ||
        (v.config.version===3 && (!arcade.current || arcade.current.expires<=Date.now()/1000)) ||
        !session.current ||
        !v.match ||
        v.match.status !== 2 ||
        v.selected !== sessionMatch.current ||
        v.direction === lastDirection.current
      )
        return;
      const slot =
        v.match.playerA.toLowerCase() === v.account.toLowerCase()
          ? v.match.a
          : v.match.b;
      if (
        slot.key.toLowerCase() !== session.current.account.address.toLowerCase()
      )
        return;
      inputBusy.current = true;
      setInputPending(true);
      const generation = identityVersion.current;
      const dir = v.direction;
      const submittedAt = performance.now();
      const nonceKey = `${v.selected}:${session.current.account.address}`;
      try {
        const knownNonce = inputNonce.current.key === nonceKey && inputNonce.current.nonce > BigInt(slot.nonce)
          ? inputNonce.current.nonce : BigInt(slot.nonce);
        const input = {
          matchId: BigInt(v.selected!),
          player: v.account as Address,
          direction: dir,
          nonce: knownNonce + 1n,
          observedBlock: v.head,
          validUntilBlock: v.head + 16n,
        };
        const signature = await session.current.account.signTypedData({
          domain: domain("PONG", v.config.chainId, v.config.game),
          types: inputTypes,
          primaryType: "Input",
          message: input,
        });
        const completed = await relay({
          contract: "game",
          functionName: "submitInput",
          args: [input, signature],
        });
        if (generation !== identityVersion.current) return;
        setInputLatency(Math.round(performance.now() - submittedAt));
        setInputTiming(completed.timing || null);
        inputNonce.current = { key: nonceKey, nonce: input.nonce };
        lastDirection.current = dir;
      } catch (e) {
        if (generation === identityVersion.current) {
          setError((e as Error).message);
          // A failed command did not consume the game nonce. Refresh once for
          // recovery, instead of making every successful command wait for RPC.
          try {
            const latest = await api(`/matches/${v.selected}?fresh=1`);
            if (generation === identityVersion.current) {
              inputNonce.current = { key: "", nonce: 0n };
              applyMatch({ ...latest, id: v.selected });
            }
          } catch { /* The connection indicator exposes an unavailable service. */ }
        }
      } finally {
        inputBusy.current = false;
        if (generation === identityVersion.current) setInputPending(false);
      }
    }, 25);
    return () => clearInterval(timer);
  }, []);
  async function rematch() {
    if(!config || !selected) return;
    await gameplaySigner();await authenticateApp();
    const c=await appApi("/challenges/rematch","POST",{matchRef:`${deploymentId(config)}:${selected}`},account);
    if(c.creator!==account.toLowerCase() && c.status==="pending"){const accepted=await appApi(`/challenges/${c.id}/accept`,"POST",{},account);enterChallenge(accepted);}
    setMessage(c.status==="accepted"?"Rematch accepted. Starting your match…":"Rematch sent to your opponent. Waiting for acceptance (60 seconds).");window.dispatchEvent(new Event("pongit:inbox"));
  }
  async function directChallenge(target:string) {
    if(!account){setShowConnect(true);return;}await gameplaySigner();await authenticateApp();
    await appApi("/challenges","POST",{recipient:target,mode,ranked:false},account);window.dispatchEvent(new Event("pongit:inbox"));setMessage("Challenge sent. Your opponent can accept directly from their notification.");
  }
  async function joinQueue() {
    if (!account) {
      setShowConnect(true);
      return;
    }
    const own = await gameplaySigner();
    const expires = nowSeconds() + 300;
    const signature = await own.account.signMessage({
      message: (config?.version || 1)>=2 ? queueV2Message(account,expires,tournamentId,mode,config!) : queueMessage(account, expires, tournamentId),
    });
    readyRoom.current = "";
    revealSent.current = "";
    lastDirection.current = 0;
    expectedRoom.current={mode,ranked:true};
    await api("/queue", { player: account, expires, signature, tournamentId,mode });
    queueTicket.current = keccak256(signature);
    persistMatch();closeOwner();
    setQueued(true);
    setMessage("Finding an opponent. Both players approve the same match.");
  }
  async function cancelQueue() {
    if (!config || !queueTicket.current) return;
    const own = await gameplaySigner();
    const expires = nowSeconds()+120;
    const ticket = queueTicket.current;
    const signature = await own.account.signMessage({message:cancelQueueMessage(account,ticket,expires,config.chainId,config.game)});
    closeOwner();
    const result = await api("/queue/cancel",{player:account,ticket,expires,signature});
    if (!result.cancelled) {
      setQueued(true);
      setMessage("Match creation already submitted. Wait for confirmation, then use Concede to leave.");
      return;
    }
    setQueued(false);
    queueTicket.current = "";
    readyRoom.current = "";
    revealSent.current = "";
    if(config?.version!==3){session.current?.end();session.current = null;}
    sessionMatch.current="";persistMatch();
    secret.current = null;
    setMessage("Search cancelled. Ready when you are.");
  }
  async function restoreSession() {
    if (!config || !selected) return;
    const own = await gameplaySigner();
    const info = await api(`/player/${account}`);
    if(config.version===3)session.current=arcade.current!.identity;
    else {session.current?.end();session.current=gameSession();}
    const now = nowSeconds();
    const m = {
      player: account as Address,
      matchId: BigInt(selected),
      sessionKey: session.current.account.address,
      expiry: BigInt(config.version===3?arcade.current!.expires:now + 3600),
      maxInputs: 12000,
      nonce: BigInt(info.gameNonce),
      deadline: BigInt(now + 120),
    };
    const signature = await own.account.signTypedData({
      domain: domain("PONG", config.chainId, config.game),
      types: sessionTypes,
      primaryType: "Session",
      message: m,
    });
    closeOwner();
    await relay({
      contract: "game",
      functionName: "authorizeSession",
      args: [
        selected,
        account,
        m.sessionKey,
        m.expiry,
        m.maxInputs,
        m.nonce,
        m.deadline,
        signature,
      ],
    });
    sessionMatch.current = selected;
    lastDirection.current = 0;
    setMessage("Game session restored.");
  }
  async function playerAction(action: number) {
    if (!config || !selected) return;
    const own = await gameplaySigner();
    const info = await api(`/player/${account}`);
    const m = {
      player: account as Address,
      matchId: BigInt(selected),
      action,
      nonce: BigInt(info.gameNonce),
      deadline: BigInt(nowSeconds() + 120),
    };
    const sig = await own.account.signTypedData({
      domain: domain("PONG", config.chainId, config.game),
      types: actionTypes,
      primaryType: "GameAction",
      message: m,
    });
    closeOwner();
    await relay({
      contract: "game",
      functionName: "playerAction",
      args: [account, selected, action, m.nonce, m.deadline, sig],
    });
    if(config?.version!==3){session.current?.end();session.current = null;}
    sessionMatch.current="";persistMatch();
    setMessage(action === 1 ? "Session revoked." : "Match conceded.");
  }
  async function credits() {
    const own = await signingOwner();
    const expires = nowSeconds() + 300;
    const signature = await own.account.signMessage({
      message: `PONG test credits\nPlayer: ${account.toLowerCase()}\nExpires: ${expires}`,
    });
    closeOwner();
    const job = await api("/faucet", { player: account, expires, signature });
    await waitJob(job.id);
    await refreshPlayer();
    setMessage("Test MON credited to your vault.");
  }
  useEffect(() => {
    if (!selected || !match || match.status !== 2 || side >= 0) {
      setOdds(null);
      return;
    }
    const load = () =>
      api("/quote", {
        matchId: selected,
        side: 0,
        shares: parseEther("0.00001").toString(),
      })
        .then(setOdds)
        .catch(() => setOdds(null));
    void load();
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [selected, match?.status, side]);
  async function bet(betSide: number) {
    if (!config || !selected) return;
    if (!account) {
      setShowConnect(true);
      return;
    }
    const own = await signingOwner();
    const info = await api(`/player/${account}`);
    const quantity = parseEther(shares);
    setMessage("Waiting for a fresh betting window...");
    let quote;
    for (let attempt = 0; attempt < 40; attempt++) {
      quote = await api("/quote", { matchId: selected, side: betSide, shares: quantity.toString() });
      if (quote.open && BigInt(quote.remainingUs) >= 1400000n) break;
      await new Promise(r => setTimeout(r, 400));
    }
    if (!quote?.open || BigInt(quote.remainingUs) < 1400000n) throw new Error("No safe betting window available. Try again during the next rally.");
    const m = {
      player: account as Address,
      matchId: BigInt(selected),
      side: betSide,
      shares: quantity,
      maxCost: (BigInt(quote.amount) * 101n) / 100n,
      version: BigInt(quote.version),
      nonce: BigInt(info.marketNonce),
      deadline: BigInt(nowSeconds() + 20),
    };
    const sig = await own.account.signTypedData({
      domain: domain("PONG Market", config.chainId, config.market),
      types: betTypes,
      primaryType: "Bet",
      message: m,
    });
    closeOwner();
    await relay({ contract: "market", functionName: "buy", args: [m, sig] });
    await refreshPlayer();
    setMessage("Bet confirmed onchain.");
  }
  async function withdraw() {
    if (!config) return;
    const own = await signingOwner();
    const info = await api(`/player/${account}`);
    const m = {
      player: account as Address,
      recipient: recipient as Address,
      amount: parseEther(withdrawAmount),
      nonce: BigInt(info.vaultNonce),
      deadline: BigInt(nowSeconds() + 120),
    };
    const sig = await own.account.signTypedData({
      domain: domain("PONG Vault", config.chainId, config.vault),
      types: withdrawTypes,
      primaryType: "Withdraw",
      message: m,
    });
    closeOwner();
    await relay({
      contract: "vault",
      functionName: "withdraw",
      args: [account, recipient, m.amount, m.nonce, m.deadline, sig],
    });
    await refreshPlayer();
    setMessage("Withdrawal confirmed.");
  }
  async function registerTournament(id: string) {
    if (!config) return;
    const own = await signingOwner();
    const info = await api(`/player/${account}`);
    const m = {
      player: account as Address,
      tournamentId: BigInt(id),
      nonce: BigInt(info.tournamentNonce),
      deadline: BigInt(nowSeconds() + 120),
    };
    const sig = await own.account.signTypedData({
      domain: domain("PONG Tournaments", config.chainId, config.tournaments),
      types: enterTypes,
      primaryType: "Enter",
      message: m,
    });
    closeOwner();
    await relay({
      contract: "tournaments",
      functionName: "enter",
      args: [id, account, m.nonce, m.deadline, sig],
    });
    setTournaments((await api("/tournaments")).tournaments);
    await refreshPlayer();
  }
  async function loadReplay(id: string) {
    setReplayPlaying(false);
    setSelected(id);
    setTab("Archive");
    setMessage("Loading confirmed events from Envio…");
    const m = await api(`/matches/${id}`);
    setMatch(m.match);
    let after = "0";
    const result = [];
    for (let page = 0; page < 100; page++) {
      const data = await api(`/replay/${id}?after=${after}`);
      result.push(...data.Frame);
      if (data.Frame.length < 1000) break;
      after = data.Frame.at(-1).version;
    }
    if (!result.length)
      throw new Error(m.match.status===4 && m.match.startBlock==="0"?"Match cancelled before play. No replay was recorded.":"No indexed replay yet. Check Envio synchronization.");
    setFrames(result);
    setFrameIndex(0);
    showFrame(result[0]);
    setMessage(
      `${result.length} confirmed snapshots. Replay follows the match clock.`,
    );
  }
  function showFrame(frame: any) {
    const [decoded] = decodeAbiParameters(
      [{ type: "tuple", components: stateComponents }],
      frame.state,
    );
    const s = stateFromJson(decoded);
    setState(s);
    setClock(s.t);
    setObservedAt(Date.now());
  }
  useEffect(() => {
    if (!replayPlaying || !frames.length || tab !== "Archive") return;
    let index = frameIndex;
    if (index >= frames.length - 1) {
      index = 0;
      showFrame(frames[0]);
      setFrameIndex(0);
    }
    const initial = BigInt(frames[index].clock);
    const started = performance.now();
    const timer = setInterval(() => {
      const target =
        initial + BigInt(Math.floor((performance.now() - started) * 1000));
      while (
        index + 1 < frames.length &&
        BigInt(frames[index + 1].clock) <= target
      ) {
        index++;
        showFrame(frames[index]);
        setFrameIndex(index);
      }
      setClock(target);
      if (index === frames.length - 1) setReplayPlaying(false);
    }, 16);
    return () => clearInterval(timer);
  }, [replayPlaying, frames, tab]);
  async function adminCall(
    target: "game" | "market" | "tournaments",
    fn: string,
    args: unknown[],
    value = 0n,
  ) {
    if (!config || !player?.admin)
      throw new Error("Onchain admin role required");
    const own = await signingOwner();
    const chain = defineChain({
      id: config.chainId,
      name: "PONG test network",
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: [API + "/rpc"] } },
    });
    const client = createWalletClient({
      account: own.account,
      chain,
      transport: http(API + "/rpc"),
    });
    const abi =
      target === "game"
        ? gameAbi
        : target === "market"
          ? marketAbi
          : tournamentsAbi;
    const data = encodeFunctionData({
      abi,
      functionName: fn as never,
      args: args as never,
    });
    const hash = await client.sendTransaction({
      to: config[target],
      data,
      value,
    });
    closeOwner();
    setMessage(`Admin transaction submitted: ${hash}`);
    const reader = createPublicClient({ chain, transport: http(API + "/rpc"), pollingInterval: 500 });
    const receipt = await reader.waitForTransactionReceipt({ hash, confirmations: config.chainId === 10143 ? 5 : 1 });
    if (receipt.status !== "success") throw new Error("Admin transaction reverted. Refresh before retrying.");
    setMessage(`Admin transaction confirmed: ${hash}`);

  }
  const scoreA = state?.scoreA ?? 0,
    scoreB = state?.scoreB ?? 0;
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/" aria-label="PONGIT home">
          <img className="brand-mark orbit-mark" src="/brand/opposing-orbits.webp" alt="" width="72" height="72"/>
          PONGIT
          <span className="brand-sub">ONCHAIN ARCADE / 003</span>
        </a>
        <div className="top-right"><ArcadeAmbience onSound={setSound}/>
          <span className="network">
            <span className={connected ? "dot pulse" : "dot"} />
            {config?.chainId === 31337 ? "LOCAL CHAIN" : "MONAD TESTNET"}
          </span>
          <button aria-label={account ? "Open account details" : "Connect passkey"} disabled={!config} onClick={() => { setDirection(0); setCopiedAddress(false); account ? setShowAccount(true) : setShowConnect(true); }}>
            {account ? short(account) : "Connect passkey"} <span>↗</span>
          </button>
        </div>
      </header>
      <nav aria-label="Main navigation">
        {tabs.map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => {
              setTab(t);
              setError("");
            }}
          >
            {t}
            {t === "Live" && (
              <small>
                {items
                  .filter((m) => m.status === 2)
                  .length.toString()
                  .padStart(2, "0")}
              </small>
            )}
          </button>
        ))}
        {player?.admin && (
          <button
            className={tab === "Admin" ? "active" : ""}
            onClick={() => setTab("Admin")}
          >
            Admin
          </button>
        )}
        <span className="nav-note">EVERY POINT HAS A RECEIPT.</span>
      </nav>
      <section className="page-heading">
        <div>
          <p className="eyebrow">
            {tab === "Archive"
              ? "CHAIN MEMORY"
              : tab === "Admin"
                ? "CONTROL ROOM"
                : "A GAME OF ANGLES. A RECORD OF EVERYTHING."}
          </p>
          <h1>
            {tab === "Play"
              ? "The arena."
              : tab === "Live"
                ? "Watch it happen."
                : tab === "Ladder"
                  ? "The ladder."
                  : tab === "Rivals" ? "Choose your opponent." : tab === "Tournaments"
                    ? "Raise the stakes."
                    : tab === "Archive"
                      ? "Nothing lost."
                      : "Operator console."}
          </h1>
        </div>
        <div className="heading-meta">
          <span>{connected ? "● CONNECTED" : "○ OFFLINE"}</span>
          <span>BLOCK {head ? head.toLocaleString() : "—"}</span>
        </div>
      </section>
      {account && config?.version===3 && !arcadeExpires && <button className="primary" disabled={busy} onClick={()=>void act(()=>renewArcade())}>Renew arcade session</button>}
      <SocialHub ready={!busy && (config?.version!==3 || arcadeExpires>Date.now()/1000)} mode={mode} key={account} account={account} config={config} visible={tab==="Rivals"} target={challengeTarget} authenticate={authenticateApp} identity={()=>owner.current} open={()=>setTab("Rivals")} enter={enterChallenge} matchRef={noteContext?.ref || (selected?`v${config?.version || 1}:${selected}`:undefined)} atUs={noteContext?.atUs || String(clock)} applyPreferences={settings=>{if(queued || canControl)throw new Error("Finish the active match or search before applying preferences.");setMode(settings.preferredMode===1?1:0);arcadeAudio.configure({enabled:settings.sound,entered:true});}}/>
      <Outcome id={selected} match={match} account={account} rating={player?Number((match?.mode===1?player.chaosRating:player.rating)?.elo || 1000):null} sound={sound} replay={tab==="Archive"} rematch={rematch} watch={()=>void act(()=>loadReplay(selected!))} again={()=>{setSelected(null);setMatch(null);setState(null);setTournamentId("0");setTab("Play");}}/>
      {(["Play","Ladder"].includes(tab)) && <div className="mode-switch" role="group" aria-label="Game mode"><button disabled={queued || busy || canControl} aria-pressed={mode===0} onClick={()=>setMode(0)}>01 / Classic</button><button disabled={queued || busy || canControl || tournamentId!=="0"} aria-pressed={mode===1} onClick={()=>setMode(1)}>02 / Chaos</button><p>{mode===1?"Crowd pressure shrinks the favourite's paddle. Changes apply between rallies.":"Pure Pong. Separate ranked ladder. First to seven."}</p></div>}
      {fundingWarning && <p className="notice" role="status">Sponsorship: {fundingWarning}</p>}
      {!["Play", "Live", "Archive"].includes(tab) && <p className="status-line" role="status">{message}</p>}
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {(tab === "Play" || tab === "Live" || tab === "Archive") && (
        <div className="arena-grid">
          <section className="game-panel">
            <div className="match-bar">
              <span>
                ARENA {selected ? selected.padStart(3, "0") : "—"}{" "}
                <small>{match?.mode===1?" CHAOS":" CLASSIC"} / {match?.ranked===false?"FRIENDLY":"RANKED"}</small>
                <b>
                  {tab === "Archive"
                    ? "REPLAY"
                    : match?.status === 2
                      ? "IN PLAY"
                      : match?.status === 3
                        ? "FINAL"
                        : match?.status === 4
                          ? "CANCELLED"
                          : "STANDBY"}
                </b>
              </span>
              <span>
                {side >= 0
                  ? `YOU / ${side === 0 ? "LEFT" : "RIGHT"}`
                  : "SPECTATOR VIEW"}
              </span>
            </div>
            {match?.mode===1 && state && <div className="chaos-rally"><span>CHAOS / {state.awaitingServe && !state.finished?"INTERMISSION":"RALLY"}</span><span>P01 {Number(state.halfA)*2/1e6} · P02 {Number(state.halfB)*2/1e6} / 96 HEIGHT</span></div>}
            <div className="scoreboard">
              <div>
                <small>PLAYER 01</small>
                <strong>
                  {match ? short(match.playerA) : "Awaiting player"}
                </strong>
              </div>
              <div className="score">
                <span className="score-change" key={`a-${scoreA}`}>{scoreA.toString().padStart(2, "0")}</span>
                <i>:</i>
                <span className="score-change" key={`b-${scoreB}`}>{scoreB.toString().padStart(2, "0")}</span>
              </div>
              <div className="right">
                <small>PLAYER 02</small>
                <strong>
                  {match ? short(match.playerB) : "Awaiting player"}
                </strong>
              </div>
            </div>
            <div className="court-wrap">
              <Court
                state={state}
                clock={clock}
                observedAt={observedAt}
                direction={direction}
                side={tab === "Archive" ? -1 : side}
                replay={tab === "Archive" || match?.status !== 2}
                matchId={selected || ""}
                controllable={canControl && !showAccount && !showConnect}
                pending={inputPending || direction !== lastDirection.current}
                onStats={(f, p, waiting) => {
                  setFps(f);
                  setPredicted(p);
                  setWaitingImpact(waiting);
                }}
              />
              {!state && (
                <div className="court-empty">
                  <p>
                    TWO PADDLES.
                    <br />
                    ONE SHARED TRUTH.
                  </p>
                  <span>
                    {config
                      ? "Ready when you are."
                      : "Waiting for the game service."}
                  </span>
                </div>
              )}
            </div>
            <div className="court-footer">
              <span>FIRST TO 07</span>
              <span>
                {tab === "Archive"
                  ? "CONFIRMED REPLAY"
                  : waitingImpact
                    ? "AWAITING IMPACT CONFIRMATION"
                  : predicted
                    ? "LIVE PREVIEW"
                    : "CONFIRMED STATE"}{" "}
                {correction > 8
                  ? `/ CORRECTION ${correction.toFixed(0)}px`
                  : ""}
              </span>
              <span title={inputTiming ? `Queue & preparation: ${inputTiming.queueMs} ms; broadcast: ${inputTiming.broadcastMs} ms; chain & receipt: ${inputTiming.confirmationMs} ms` : "Input request to confirmed receipt, including queue and network"}>
                {inputLatency === null ? "" : inputLatency + " ms INPUT / "}
                {fps || "—"} FPS
              </span>
            </div>
            {tab === "Archive" && frames.length > 0 ? (
              <div className="replay-controls">
                <button onClick={() => setReplayPlaying(!replayPlaying)}>
                  {replayPlaying ? "Pause" : "Play"} replay
                </button>
                <button disabled={!account} onClick={()=>{setReplayPlaying(false);setNoteContext({ref:`v${config?.version || 1}:${selected}`,atUs:String(clock)});setTab("Rivals");}}>Note this moment</button>
                <input
                  aria-label="Replay position"
                  type="range"
                  min="0"
                  max={frames.length - 1}
                  value={frameIndex}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setFrameIndex(n);
                    showFrame(frames[n]);
                  }}
                />
                <span>
                  {frameIndex + 1}/{frames.length}
                </span>
              </div>
            ) : (
              <div className="controls">
                <div>
                  <kbd>W</kbd>
                  <kbd>S</kbd>
                  <span>or</span>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd>
                  <span>move your paddle</span>
                </div>
                <div className="touch-controls">
                  <button
                    aria-label="Move up"
                    disabled={!canControl}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDirection(-1);
                    }}
                    onPointerUp={() => setDirection(0)}
                    onPointerCancel={() => setDirection(0)}
                  >
                    ↑
                  </button>
                  <button
                    aria-label="Move down"
                    disabled={!canControl}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDirection(1);
                    }}
                    onPointerUp={() => setDirection(0)}
                    onPointerCancel={() => setDirection(0)}
                  >
                    ↓
                  </button>
                </div>
              </div>
            )}
            <div className="status-line" role="status">
              {busy ? "Working… " : ""}
              {message}
            </div>
            {canControl && <p className="input-hint">Your paddle responds immediately. The outline shows its confirmed path; collisions wait for the chain.</p>}
            {inputLatency !== null && inputLatency > 1000 && canControl && <p className="input-hint">Chain confirmation is taking {(inputLatency / 1000).toFixed(1)} s. Anticipate your moves; the preview cannot remove inclusion delay.</p>}
          </section>
          <aside>
            <section className="side-card">
              <p className="eyebrow">
                {side >= 0 && match?.status === 2 ? "YOUR SESSION" : "NEXT UP"}
              </p>
              <h2>
                {queued
                  ? "Finding your match."
                  : side >= 0 && match?.status === 2
                    ? "You’re in."
                    : "Take your side."}
              </h2>
              <p>
                {side >= 0
                  ? "Only paddle movements are delegated. Your funds require a separate signature."
                  : "A passkey. An opponent. Seven points. Gas is on us."}
              </p>
              {side >= 0 && match?.status === 2 ? (
                <>
                  <button
                    className="primary"
                    disabled={busy || canControl}
                    onClick={() => void act(restoreSession)}
                  >
                    {canControl ? "Game session active" : "Restore game session ↗"}
                  </button>
                  <div className="split">
                    <button
                      disabled={busy}
                      onClick={() => void act(() => playerAction(1))}
                    >
                      Revoke
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void act(() => playerAction(2))}
                    >
                      Concede
                    </button>
                  </div>
                </>
              ) : (
                <button
                  className="primary"
                  disabled={busy || queued || !config}
                  onClick={() => void act(joinQueue)}
                >
                  {queued
                    ? "Searching…"
                    : account
                      ? "Find an opponent"
                      : "Connect & play"}{" "}
                  <span>↗</span>
                </button>
              )}
              {queueTicket.current && <button disabled={busy} onClick={() => void act(cancelQueue)}>Cancel search</button>}
              {tournamentId !== "0" && <button disabled={busy || queued} onClick={() => { setTournamentId("0"); setMessage("Open matchmaking selected."); }}>Return to open matchmaking</button>}
              <dl>
                <div>
                  <dt>YOUR RATING</dt>
                  <dd>{(mode===1?player?.chaosRating:player?.rating)?.elo || "—"}</dd>
                </div>
                <div>
                  <dt>GAS COST TO PLAY</dt>
                  <dd>0 MON</dd>
                </div>
                <div>
                  <dt>SESSION</dt>
                  <dd>{config?.version===3 && arcadeExpires ? "ARCADE / THIS TAB" : session.current ? "MEMORY ONLY" : "NOT ACTIVE"}</dd>
                </div>
              </dl>
            </section>
            <section className="side-card market-card">
              <div className="card-title">
                <p className="eyebrow">LIVE MARKET</p>
                <span>{odds?.open ? "OPEN" : "LOCKED"}</span>
              </div>
              <h2>Back your read.</h2>{match?.mode===1 && <p className="chaos-warning">CHAOS: supporting a player can shrink their paddle next rally. Above 0.002 MON total, a side with over 60% of paid bets loses up to 25% of its height.</p>}
              <p>
                {side >= 0
                  ? "Players cannot bet on their own match."
                  : "Binary market on the match winner. Test MON only."}
              </p>
              <div className="probability">
                <span>
                  {odds
                    ? `${Math.min(100, (Number(odds.amount) / 1e13) * 100).toFixed(1)}%`
                    : "—"}
                </span>
                <small>PLAYER 01 / INDICATIVE</small>
              </div>
              <label>
                Shares (1 winning share = 1 MON)
                <input
                  inputMode="decimal"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                />
              </label>
              <div className="split">
                <button
                  disabled={busy || side >= 0 || !odds || match?.status !== 2}
                  onClick={() => void act(() => bet(0))}
                >
                  Back 01 ↗
                </button>
                <button
                  disabled={busy || side >= 0 || !odds || match?.status !== 2}
                  onClick={() => void act(() => bet(1))}
                >
                  Back 02 ↗
                </button>
              </div>
              {selected && match?.status >= 3 && (
                <button
                  disabled={busy || !account}
                  onClick={() =>
                    void act(async () => {
                      await relay({
                        contract: "market",
                        functionName: "claim",
                        args: [selected, account],
                      });
                      await refreshPlayer();
                      setMessage("Settlement credited to your vault.");
                    })
                  }
                >
                  Claim payout / refund
                </button>
              )}
              <small className="muted">
                Bets pause near collisions. Confirmation required.
              </small>
            </section>
          </aside>
        </div>
      )}
      {(tab === "Play" || tab === "Live" || tab === "Archive") && (
        <section className="match-list">
          <div className="section-title">
            <h2>{tab === "Archive" ? "Match archive" : "Around the arena"}</h2>
            <span>
              {visibleItems.length.toString().padStart(2, "0")} MATCHES
            </span>
          </div>
          {visibleItems.length ? (
            <div className="rows">
              {visibleItems.map((m) => (
                <button
                  key={m.id}
                  className="match-row"
                  data-match-id={m.id}
                  onClick={() =>
                    tab === "Archive"
                      ? void act(() => loadReplay(m.id))
                      : (setSelected(m.id), setTab("Live"))
                  }
                >
                  <span className="row-id">#{m.id.padStart(3, "0")}</span>
                  <span>
                    {short(m.playerA)} <small>vs</small> {short(m.playerB)}
                  </span>
                  <strong>
                    {m.state ? `${m.state.scoreA} : ${m.state.scoreB}` : "—"}
                  </strong>
                  <span>
                    {["", "WAITING", "LIVE", "FINAL", "CANCELLED"][m.status]}
                  </span>
                  <span>↗</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty">
              No matches yet. The first point is yours to make.
            </div>
          )}
          {tab === "Archive" && moreHistory && (
            <button
              disabled={busy}
              onClick={() => void act(() => loadHistory(true))}
            >
              Load older matches
            </button>
          )}
        </section>
      )}
      {tab === "Archive" && config?.legacy && allDeployments(config).slice(1).map(d=><Legacy key={d.game} legacy={d} config={config} account={account} signer={signingOwner} closeSigner={closeOwner}/>)}
      {tab === "Ladder" && (
        <section className="table-panel">
          <div className="section-title">
            <h2>Season standings</h2>
            <span>VERIFIED RESULTS / ENVIO</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>ELO</th>
                <th>Played</th>
                <th>Wins</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((p, i) => (
                <tr key={p.id}>
                  <td>{String(i + 1).padStart(2, "0")}</td>
                  <td><span>{p.handle || short(p.address)}</span><button className="ladder-challenge" disabled={busy || p.address.toLowerCase()===account.toLowerCase()} onClick={()=>void act(()=>directChallenge(p.address))}>Challenge ↗</button></td>
                  <td>{p.elo}</td>
                  <td>{p.played}</td>
                  <td>{p.wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ladder.length && (
            <div className="empty">
              Standings appear after the first indexed result.
            </div>
          )}
        </section>
      )}
      {tab === "Tournaments" && (
        <>
          <div className="tournament-grid">
            {tournaments.map((t) => (
              <section className="side-card" key={t.id}>
                <p className="eyebrow">TOURNAMENT #{t.id}</p>
                <h2>{t.capacity}-player bracket</h2>
                <p>
                  {t.entrants.length}/{t.capacity} registered · Entry{" "}
                  {money(t.fee)} MON
                </p>
                <h3>{money(t.prize)} MON</h3>
                <p>
                  {
                    [
                      "",
                      "Registration",
                      "Round " + (Number(t.round) + 1),
                      "Complete",
                      "Cancelled",
                    ][t.status]
                  }
                </p>
                <div className="bracket">
                  {t.bracket.map((p: string, i: number) => (
                    <span key={i}>{short(p)}</span>
                  ))}
                </div>
                <div className="split">
                  <button
                    disabled={busy || !account || t.status !== 1}
                    onClick={() => void act(() => registerTournament(t.id))}
                  >
                    Register
                  </button>
                  <button
                    disabled={busy || t.status !== 1}
                    onClick={() =>
                      void act(async () => {
                        await relay({
                          contract: "tournaments",
                          functionName: "start",
                          args: [t.id],
                        });
                        setTournaments((await api("/tournaments")).tournaments);
                      })
                    }
                  >
                    Start bracket
                  </button>
                </div>
                <div className="split">
                  <button
                    disabled={busy || queued || !account || t.status !== 2 || !t.bracket.some((p: string) => p.toLowerCase() === account.toLowerCase())}
                    onClick={() => {
                      setMode(0);
                      setTournamentId(t.id);
                      setTab("Play");
                      setMessage(
                        `Queue scope: tournament #${t.id}. Pair with your bracket opponent.`,
                      );
                    }}
                  >
                    Play round ↗
                  </button>
                  <button
                    disabled={busy || t.status !== 2}
                    onClick={() =>
                      void act(async () => {
                        await relay({
                          contract: "tournaments",
                          functionName: "advance",
                          args: [t.id],
                        });
                        setTournaments((await api("/tournaments")).tournaments);
                      })
                    }
                  >
                    Resolve round
                  </button>
                </div>
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await relay({
                        contract: "tournaments",
                        functionName: t.status === 4 ? "refund" : "cancel",
                        args: t.status === 4 ? [t.id, account] : [t.id],
                      });
                      setTournaments((await api("/tournaments")).tournaments);
                    })
                  }
                >
                  {t.status === 4 ? "Claim entry refund" : "Cancel if expired"}
                </button>
              </section>
            ))}
          </div>
          {!tournaments.length && (
            <div className="empty">No tournaments scheduled.</div>
          )}
          <p className="muted">
            Round matches attach to the bracket automatically after creation.
            Resolve a round once every match has finished.
          </p>
        </>
      )}
      {tab === "Admin" &&
        (player?.admin ? (
          <div className="admin-grid">
            <section className="side-card">
              <h2>Create tournament</h2>
              <label>
                Capacity
                <select
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                >
                  {[2, 4, 8, 16, 32].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Registration minutes
                <input
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </label>
              <label>
                Entry fee (MON)
                <input value={fee} onChange={(e) => setFee(e.target.value)} />
              </label>
              <label>
                Prize (MON)
                <input
                  value={prize}
                  onChange={(e) => setPrize(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void act(() =>
                    adminCall(
                      "tournaments",
                      "create",
                      [
                        BigInt(
                          nowSeconds() + Number(minutes) * 60,
                        ),
                        Number(capacity),
                        parseEther(fee),
                      ],
                      parseEther(prize),
                    ),
                  )
                }
              >
                Create onchain ↗
              </button>
              <small>
                Admin transactions use the funded administrator account.
              </small>
            </section>
            <section className="side-card">
              <h2>Circuit breakers</h2>
              {(["game", "market"] as const).map((target) => (
                <div className="split" key={target}>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(() => adminCall(target, "setPaused", [true]))
                    }
                  >
                    Pause {target}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(() => adminCall(target, "setPaused", [false]))
                    }
                  >
                    Resume {target}
                  </button>
                </div>
              ))}
              <h3>Integrity signals</h3>
              {alerts.map((a) => (
                <p key={a.id}>{a.detail}</p>
              ))}
              {!alerts.length && <p>No indexed alerts.</p>}
            </section>
          </div>
        ) : (
          <div className="empty">
            Connect an account with the onchain ADMIN_ROLE to open this console.
            <button onClick={() => setShowConnect(true)}>
              Connect passkey
            </button>
          </div>
        ))}
      {account && (
        <section className="vault-strip">
          <div>
            <p className="eyebrow">YOUR TEST VAULT</p>
            <strong>{money(player?.balance)} MON</strong>
            <button className="account-copy" onClick={() => void act(async () => { await navigator.clipboard.writeText(account); setMessage("Account address copied."); })} title={account}>{short(account)} · Copy</button>
          </div>
          <button disabled={busy} onClick={() => void act(credits)}>
            Get test credits ↗
          </button>
          <details>
            <summary>Withdraw test MON</summary>
            <label>
              Recipient
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </label>
            <label>
              Amount
              <input
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
              />
            </label>
            <button disabled={busy} onClick={() => void act(withdraw)}>
              Sign withdrawal ↗
            </button>
          </details>
        </section>
      )}
      <footer>
        <span>PONGIT / BUILT ON MONAD</span>
        <span>GAME STATE ONCHAIN · MERA ACCOUNTS · ENVIO REPLAYS</span>
        <a
          href="https://testnet.monadscan.com"
          target="_blank"
          rel="noreferrer"
        >
          Explorer ↗
        </a>
      </footer>
      {showAccount && account && (
        <div className="modal-backdrop" onClick={() => setShowAccount(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="account-title" className="connect-modal account-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" aria-label="Close account details" onClick={() => setShowAccount(false)}>×</button>
            <p className="eyebrow">YOUR PONGIT ACCOUNT</p>
            <h2 id="account-title">Account details</h2>
            <p>{config?.chainId === 31337 ? "Local test account" : "Mera passkey · Monad Testnet"}</p>
            <label className="account-address">Full address<textarea aria-label="Full account address" value={account} rows={3} readOnly onFocus={(e) => e.currentTarget.select()} /></label>
            <button onClick={() => void navigator.clipboard.writeText(account).then(() => setCopiedAddress(true)).catch(() => setError("Copy unavailable. Select the full address above to copy it manually."))}>{copiedAddress ? "Address copied" : "Copy address"}</button>
            {config?.chainId === 10143 && <a className="account-explorer" href={`https://testnet.monadscan.com/address/${account}`} target="_blank" rel="noreferrer">View account on explorer ↗</a>}
            <p className="account-explanation">Disconnecting clears signing keys from this browser. Your passkey and funds stay available. It does not concede a match or cancel a transaction already submitted.</p>
            {config?.version===3 && <><p>Arcade session {arcadeExpires?`until ${new Date(arcadeExpires*1000).toLocaleTimeString()}`:"expired"}. Gameplay only; funds require your passkey.</p><button disabled={busy} onClick={()=>void act(()=>renewArcade())}>Renew arcade session</button></>}
            <button disabled={busy} onClick={()=>void act(async()=>{await disconnect();forgetAccount();setRemembered(null);})}>Forget this account</button>
            <button className="primary" disabled={busy} onClick={() => void act(disconnect)}>{queued ? "Cancel search and disconnect" : "Disconnect"}</button>
          </section>
        </div>
      )}
      {showConnect && (
        <div className="modal-backdrop" onClick={() => setShowConnect(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="connect-title"
            className="connect-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close"
              onClick={() => setShowConnect(false)}
            >
              ×
            </button>
            <p className="eyebrow">YOUR PASSKEY IS YOUR ACCOUNT</p>
            <h2 id="connect-title">Step up to the line.</h2>
            <p>
              No extension. No seed phrase. Your passkey creates and recovers
              your PONGIT account.
            </p>
            <button
              className="primary"
              disabled={busy || !config}
              onClick={() => void act(() => login("create"))}
            >
              Create a passkey ↗
            </button>
            <button
              disabled={busy || !config}
              onClick={() => void act(() => login("restore"))}
            >
              {remembered?`Continue as ${short(remembered.address)}`:"Use existing passkey"}
            </button>
            {remembered && <><button disabled={busy} onClick={()=>void act(()=>login("another"))}>Use another passkey</button><button onClick={()=>{forgetAccount();setRemembered(null);}}>Forget this account</button></>}
            <a
              href="https://mera.category.xyz/authenticator-support/"
              target="_blank"
              rel="noreferrer"
            >
              Compatible browsers & passkey providers ↗
            </a>
            {config?.localDev && (
              <div className="dev-options">
                <small>LOCAL DEVELOPMENT ONLY — NOT MERA</small>
                <button onClick={() => void act(() => login("local"))}>
                  Local test player
                </button>
                <button onClick={() => void act(() => login("operator"))}>
                  Local test operator
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
