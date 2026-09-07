"use client";
import { InputController } from "../lib/input-controller";
import { intentMessage, intentTypes } from "../../shared/input-transport";
import {MatchPayment,PaymentHistory} from "./Payments";
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
import {Avatar} from "./Avatar";
import {ProfileEditor,usePublicProfile} from "./PublicProfile";
import {HomeCabinet} from "./HomeCabinet";
import {Dialog,CabinetTools} from "./Dialog";
import { ArcadeAmbience, MusicCredit } from "./ArcadeAmbience";
import {PixelOrnament} from "./PixelOrnament";
import {PixelMotion} from "./PixelMotion";
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
import { createArcade, restoreArcade, clearArcade, revokeArcade, InvalidArcadeSession, ArcadeNetworkError, type ArcadeSession } from "../lib/arcade";
import { Outcome } from "./Outcome";
import { monadTransport } from "../lib/transport";
import { acceptsSnapshot, type SnapshotCursor, type PendingInput } from "../lib/presentation";

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
  const publicProfile=usePublicProfile(account),profileA=usePublicProfile(match?.playerA),profileB=usePublicProfile(match?.playerB);
  const [showProfile,setShowProfile]=useState(false),[profileRevision,setProfileRevision]=useState(0);
  const pendingProfile=useRef(false);
  useEffect(()=>{const changed=()=>setProfileRevision(n=>n+1);window.addEventListener("pongit:profile",changed);return()=>window.removeEventListener("pongit:profile",changed);},[]);
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
  const [showTools,setShowTools]=useState(false),[showMore,setShowMore]=useState(false);
  const pendingLaunch=useRef<{mode:number;tournament:string}|null>(null);
  const [searchStarted,setSearchStarted]=useState(0),[searchSeconds,setSearchSeconds]=useState(0);
  const [rematchInvite,setRematchInvite]=useState<any>(null);
  const [recent,setRecent]=useState<any[]>([]),[recentError,setRecentError]=useState("");
  const [legacyReplay,setLegacyReplay]=useState<{deployment:string;id:string}|null>(null);
  const [betPreview,setBetPreview]=useState<{side:number;quote:any;quantity:string;matchId:string;player:string;game:string}|null>(null);
  useEffect(()=>setBetPreview(null),[selected,account,config?.game]);
  function closeConnect(){pendingProfile.current=false;pendingLaunch.current=null;setShowConnect(false);}
  useEffect(()=>{if(!queued){setSearchStarted(0);return;}setSearchStarted(Date.now());},[queued]);
  useEffect(()=>{if(!searchStarted)return;const tick=()=>setSearchSeconds(Math.floor((Date.now()-searchStarted)/1000));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[searchStarted]);
  useEffect(()=>{if(tab!=="Archive" || !account)return;let stop=false;setRecent([]);setRecentError("");void api(`/player/${account}/recent-matches`).then(d=>{if(!stop)setRecent(d.Match);}).catch(()=>{if(!stop)setRecentError("Your recent games could not load. Reopen Replays to retry.");});return()=>{stop=true;};},[tab,account]);
  useEffect(()=>{if(!rematchInvite)return;let stop=false;const poll=()=>void appApi(`/challenges/${rematchInvite.id}`,"GET",undefined,account).then(c=>{if(stop)return;setRematchInvite(c.status==="accepted"?null:c);}).catch(()=>{});const timer=setInterval(poll,2000);return()=>{stop=true;clearInterval(timer);};},[rematchInvite?.id,account]);
  useEffect(()=>setShowTools(false),[selected,match?.status]);
  const [showAccount, setShowAccount] = useState(false), [copiedAddress, setCopiedAddress] = useState(false);
  const [inputPending, setInputPending] = useState(false), [waitingImpact, setWaitingImpact] = useState(false);
  useEffect(()=>{arcadeAudio.setGameplay(match?.status===2 && !state?.awaitingServe && tab!=="Archive");return()=>arcadeAudio.setGameplay(false);},[match?.status,state?.awaitingServe,tab]);
  const [inputTiming, setInputTiming] = useState<any>(null);
  const [inputRtt,setInputRtt]=useState<number|null>(null);
  const [inputError,setInputError]=useState("");
  const [pendingInputs,setPendingInputs]=useState<PendingInput[]>([]);
  const [showNetwork,setShowNetwork]=useState(false);
  const [snapshotAge,setSnapshotAge]=useState(0),[paddleCorrection,setPaddleCorrection]=useState(0);
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
  const needsArcadeRenewal = !!account && (config?.version || 1) >= 3 &&
    (!arcade.current || !arcadeExpires || arcadeExpires <= nowSeconds());
  useEffect(()=>{if(pendingProfile.current&&account&&!busy&&!showConnect&&!needsArcadeRenewal){pendingProfile.current=false;setShowProfile(true);}},[account,busy,showConnect,needsArcadeRenewal]);
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
      : tab==="Live"?items.filter(m=>m.status===2):items;
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
  const canControl = side >= 0 && match?.status === 2 && !!session.current && !needsArcadeRenewal &&
    selected === sessionMatch.current &&
    (side === 0 ? match.a.key : match.b.key).toLowerCase() === session.current.account.address.toLowerCase();
  const controlsEnabled=useRef(false);controlsEnabled.current=canControl && ["Play","Live"].includes(tab) && !showAccount && !showConnect && !showTools;
  useEffect(()=>{
    if(match?.status===2 && side>=0 && ["Play","Live"].includes(tab))window.scrollTo({top:0,behavior:"instant"});
  },[selected,match?.status,side,tab]);
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
    if((config?.version||1)<3)return signingOwner();
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
  async function openProfile(){
    if(!account||needsArcadeRenewal){pendingProfile.current=true;try{await connectFromButton();}catch(e){pendingProfile.current=false;throw e;}}
    else setShowProfile(true);
  }
  async function connectFromButton() {
    setDirection(0);setShowAccount(false);setShowConnect(false);
    if (owner.current && needsArcadeRenewal) await renewArcade();
    else if (rememberedAccount()) await login("restore");
    else setShowConnect(true);
  }
  function persistMatch() {
    if(config && (config.version||1)>=3)sessionStorage.setItem("pongit:pending-match",json({player:owner.current?.account.address,game:config.game,expected:expectedRoom.current,ticket:queueTicket.current,secret:secret.current,room:readyRoom.current,match:sessionMatch.current,reveal:revealSent.current,ready:pendingReady.current}));
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
    }).catch(e=>{
      if(generation!==identityVersion.current)return;
      if(!(e instanceof ArcadeNetworkError)){const previous=e instanceof InvalidArcadeSession?rememberedAccount():null;if(previous){owner.current=accountStub(previous.address,previous.credential);setAccount(previous.address);setRecipient(previous.address);}setError(e.message);}
      else {restoreAttempt.current="";setMessage("Session verification interrupted. Retrying when the service reconnects; your arcade key stays in this tab.");}
    }).finally(()=>setBusy(false));
  },[config]);
  useEffect(()=>{if(!arcade.current)return;const check=()=>void arcade.current?.validate().catch(e=>{setDirection(0);if(e instanceof InvalidArcadeSession){setArcadeExpires(0);session.current=null;setMessage("Arcade session expired or revoked. Renew arcade session to play again.");}else setMessage("Connection interrupted. Your arcade session is preserved; reconnecting…");});const timer=setInterval(check,15000);return()=>clearInterval(timer);},[account,arcadeExpires]);
  async function authenticateApp() {
    if(!owner.current)throw new Error("Connect your passkey first");
    try {const current=await appApi("/auth/session");if(current.player===owner.current.account.address.toLowerCase())return;} catch {}
    const own=await gameplaySigner();const generation=identityVersion.current;
    const challenge=await appApi("/auth/challenge","POST",{player:owner.current.account.address});
    const signature=await own.account.signMessage({message:challenge.message});if((config?.version||1)<3)closeOwner();
    if(generation!==identityVersion.current)throw new Error("Account changed");
    await appApi("/auth/session","POST",{player:owner.current!.account.address,nonce:challenge.nonce,signature});
  }
  function enterChallenge(c:any) {
    setRematchInvite(null);
    if(expectedRoom.current?.roomId===c.room_id)return;
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
    if((config?.version||1)>=3)await renewArcade(identity);
    await refreshPlayer(identity.account.address);
    const all = await api("/matches");
    const active = all.matches.find((m:any)=>m.status === 2 && [m.playerA,m.playerB].some((p:string)=>p.toLowerCase()===identity.account.address.toLowerCase()));
    if (active && owner.current === identity) { pendingLaunch.current=null;sessionMatch.current=active.id;setSelected(active.id);setTab("Play"); }
    else if(pendingLaunch.current && owner.current===identity){const intent=pendingLaunch.current;pendingLaunch.current=null;await joinQueue(intent.mode,intent.tournament);}

  }
  async function disconnect() {
    pendingProfile.current=false;setShowProfile(false);
    pendingLaunch.current=null;setRematchInvite(null);setBetPreview(null);setRecent([]);setLegacyReplay(null);
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
      if(s.scoreA!==lastState.current.scoreA || s.scoreB!==lastState.current.scoreB)arcadeAudio.play("point",`${view.current.config?.game}:${id}:point:${s.scoreA}:${s.scoreB}`);
      if(s.halfA!==lastState.current.halfA || s.halfB!==lastState.current.halfB)arcadeAudio.play("handicap",`${view.current.config?.game}:${id}:size:${s.resumeAt}`);
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
    if (tab === "Ladder")
      void api(`/leaderboard?mode=${mode}`)
        .then((d) => setLadder(d.Player))
        .catch((e) => setError(e.message));
    if (tab === "Admin" && player?.admin)
      void api("/alerts")
        .then((d) => setAlerts(d.Alert))
        .catch((e) => setError(e.message));
  }, [tab, player?.admin,mode,profileRevision]);
  useEffect(()=>{
    if(tab!=="Tournaments")return;
    let stopped=false,pending=false;
    const refresh=async()=>{
      if(stopped || pending || document.hidden)return;
      pending=true;
      try{const data=await api("/tournaments");if(!stopped)setTournaments(data.tournaments);}
      catch{if(!stopped)setError("Tournament updates are unavailable. Reconnecting…");}
      finally{pending=false;}
    };
    void refresh();const timer=setInterval(()=>void refresh(),5000);
    document.addEventListener("visibilitychange",refresh);
    return()=>{stopped=true;clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};
  },[tab]);
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
          if((config.version||1)>=3)session.current=arcade.current?.identity || null;
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
            sessionExpiry: BigInt((config.version||1)>=3?arcade.current!.expires:now + 3600),
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
      if (!controlsEnabled.current || document.querySelector('[role="dialog"],.arena-grid.tools-open')) return;
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
    window.addEventListener("pongit:overlay",blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pongit:overlay",blur);
    };
  }, []);
  useEffect(() => {
    const controller=new InputController({
      reset:()=>{setPendingInputs([]);setInputError("");},
      state:()=>api(`/inputs/${view.current.selected}/${view.current.account}`),
      post:body=>api("/inputs",body),wait:waitJob,
      intent:(nonce,direction,at)=>setPendingInputs(old=>[...old.filter(i=>i.nonce!==nonce).slice(-15),{nonce,direction,at}]),pending:setInputPending,ack:setInputRtt,
      confirmed:(job,ms)=>{setInputError("");setInputLatency(ms);setInputTiming(job.timing||null);},
      error:setInputError,
    });
    const tick=()=>{
      const v=view.current,key=session.current?.account;
      if(!v.config || !key || !v.match || v.match.status!==2 || v.selected!==sessionMatch.current ||
        ((v.config.version||1)>=3 && (!arcade.current || arcade.current.expires<=Date.now()/1000))){controller.update(null);return;}
      const slot=v.match.playerA.toLowerCase()===v.account.toLowerCase()?v.match.a:v.match.b;
      if(slot.key.toLowerCase()!==key.address.toLowerCase()){controller.update(null);return;}
      const config=v.config;
      controller.update({key:`${identityVersion.current}:${config.game}:${v.selected}:${key.address}`,direction:v.direction,head:v.head,
        sign:async(nonce,sequence,direction,head)=>{
          const input={matchId:BigInt(v.selected!),player:v.account as Address,direction,nonce,observedBlock:head,validUntilBlock:head+16n};
          const signature=await key.signTypedData({domain:domain("PONG",config.chainId,config.game),types:inputTypes,primaryType:"Input",message:input});
          const intentSignature=await key.signTypedData({domain:domain("PONGIT Input Transport",config.chainId,config.game),types:intentTypes,primaryType:"InputIntent",message:intentMessage(input,sequence,config.chainId,config.game)});
          lastDirection.current=direction;
          return {request:{contract:"game",functionName:"submitInput",args:[input,signature]},intent:{sequence,signature:intentSignature}};
        }});
    };
    const timer=setInterval(tick,16);
    return ()=>{clearInterval(timer);controller.reset();};
  }, []);
  async function rematch() {
    if(!config || !selected) return;
    if(needsArcadeRenewal)await renewArcade();await gameplaySigner();await authenticateApp();
    const c=await appApi("/challenges/rematch","POST",{matchRef:`${deploymentId(config)}:${selected}`},account);
    if(c.creator!==account.toLowerCase() && c.status==="pending"){const accepted=await appApi(`/challenges/${c.id}/accept`,"POST",{},account);enterChallenge(accepted);setMessage("Rematch accepted. Starting your match…");window.dispatchEvent(new Event("pongit:inbox"));return;}
    setRematchInvite(c.status==="accepted"?null:c);setTab("Play");
    setMessage(c.status==="accepted"?"Rematch accepted. Starting your match…":"Rematch sent to your opponent. Waiting for acceptance (60 seconds).");window.dispatchEvent(new Event("pongit:inbox"));
  }
  async function directChallenge(target:string) {
    if(!account){setChallengeTarget(target);setTab("Rivals");setShowConnect(true);return;}if(needsArcadeRenewal)await renewArcade();await gameplaySigner();await authenticateApp();
    await appApi("/challenges","POST",{recipient:target,mode,ranked:false},account);window.dispatchEvent(new Event("pongit:inbox"));setMessage("Challenge sent. Your opponent can accept directly from their notification.");
  }
  async function joinQueue(chosenMode=mode,chosenTournament=tournamentId) {
    if(queueTicket.current || queued)return;
    const address=owner.current?.account.address;
    if (!address) {
      pendingLaunch.current={mode:chosenMode,tournament:chosenTournament};
      try{await connectFromButton();}catch(e){pendingLaunch.current=null;throw e;}
      return;
    }
    if(view.current.match?.status===2 && [view.current.match.playerA,view.current.match.playerB].some((p:string)=>p.toLowerCase()===address.toLowerCase())){setTab("Play");if(!canControl)await restoreSession();return;}
    let own;
    try { own = await gameplaySigner(); }
    catch (e) {
      if (arcade.current && !needsArcadeRenewal && !(e instanceof InvalidArcadeSession)) throw e;
      await renewArcade();
      own = await gameplaySigner();
    }
    const expires = nowSeconds() + 300;
    const signature = await own.account.signMessage({
      message: (config?.version || 1)>=2 ? queueV2Message(address,expires,chosenTournament,chosenMode,config!) : queueMessage(address, expires, chosenTournament),
    });
    readyRoom.current = "";
    revealSent.current = "";
    lastDirection.current = 0;
    expectedRoom.current={mode:chosenMode,ranked:true};
    await api("/queue", { player: address, expires, signature, tournamentId:chosenTournament,mode:chosenMode });
    queueTicket.current = keccak256(signature);
    persistMatch();closeOwner();
    setMode(chosenMode);setTournamentId(chosenTournament);setSelected(null);setMatch(null);setState(null);setRematchInvite(null);setTab("Play");setQueued(true);
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
    if((config?.version||1)<3){session.current?.end();session.current = null;}
    sessionMatch.current="";persistMatch();
    secret.current = null;
    setMessage("Search cancelled. Ready when you are.");
  }
  async function restoreSession() {
    if (!config || !selected) return;
    const own = await gameplaySigner();
    const info = await api(`/player/${account}`);
    if((config.version||1)>=3)session.current=arcade.current!.identity;
    else {session.current?.end();session.current=gameSession();}
    const now = nowSeconds();
    const m = {
      player: account as Address,
      matchId: BigInt(selected),
      sessionKey: session.current.account.address,
      expiry: BigInt((config.version||1)>=3?arcade.current!.expires:now + 3600),
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
    if((config?.version||1)<3){session.current?.end();session.current = null;}
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
  async function bet(betSide: number, confirmed=false) {
    if(!config || !selected)return;
    if(!account){setShowConnect(true);return;}
    const matchId=selected,quantity=parseEther(confirmed && betPreview?betPreview.quantity:shares);
    if(quantity<=0n)throw new Error("Enter a positive number of shares.");
    const current=()=>{if(view.current.selected!==matchId || view.current.account!==account || view.current.config?.game!==config.game)throw new Error("The selected match or account changed. Review your bet again.");};
    const quoteWindow=async()=>{
      let quote;setMessage("Waiting for a fresh betting window...");
      for(let attempt=0;attempt<40;attempt++){
        current();quote=await api("/quote",{matchId,side:betSide,shares:quantity.toString()});
        if(quote.open && BigInt(quote.remainingUs)>=1400000n)return quote;
        await new Promise(r=>setTimeout(r,400));
      }
      throw new Error("No safe betting window available. Try again during the next rally.");
    };
    if(!confirmed){const quote=await quoteWindow();current();setBetPreview({side:betSide,quote,quantity:shares,matchId,player:account,game:config.game});return;}
    if(!betPreview || shares!==betPreview.quantity || betPreview.matchId!==matchId || betPreview.player!==account || betPreview.game!==config.game || betPreview.side!==betSide)throw new Error("The match, account or amount changed. Review the bet again.");
    const limit=BigInt(betPreview.quote.amount)*101n/100n;
    const own=await signingOwner();
    try{
      // The human passkey ceremony can take seconds. Refresh the version only
      // after unlocking, while preserving the maximum the player reviewed.
      const quote=await quoteWindow();current();
      if(BigInt(quote.amount)>limit){setBetPreview({...betPreview,quote});throw new Error("The price changed. Review the updated cost before confirming.");}
      const info=await api(`/player/${account}`);
      const m={player:account as Address,matchId:BigInt(matchId),side:betSide,shares:quantity,maxCost:limit,version:BigInt(quote.version),nonce:BigInt(info.marketNonce),deadline:BigInt(nowSeconds()+20)};
      const signature=await own.account.signTypedData({domain:domain("PONG Market",config.chainId,config.market),types:betTypes,primaryType:"Bet",message:m});closeOwner();
      await relay({contract:"market",functionName:"buy",args:[m,signature]});
      await refreshPlayer();setBetPreview(null);setMessage("Bet confirmed onchain.");
    }finally{closeOwner();}
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
    setFrames([]);setState(null);
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
  const home=tab==="Play" && !queued && !rematchInvite && !(match?.status===2 && side>=0);
  const lobby=tab==="Play" && (queued || !!rematchInvite);
  const showArena=!!selected && (tab==="Live" || (tab==="Archive" && frames.length>0) || (tab==="Play" && !lobby && match?.status===2));
  const changeTab=(next:string)=>{window.dispatchEvent(new Event("pongit:overlay"));setDirection(0);setShowTools(false);setShowMore(false);setTab(next);setError("");window.scrollTo({top:0,behavior:"instant"});};
  const scoreA = state?.scoreA ?? 0,
    scoreB = state?.scoreB ?? 0;
  return (
    <main className={`neon-rush cabinet-ui ${home?"at-home":""} ${match?.status===2 && side>=0 && ["Play","Live"].includes(tab)?"in-game":""}`}>
      <header className="topbar">
        <PixelMotion/>
        <PixelOrnament kind="cabinet" className="pixel-header-left"/>
        <PixelOrnament kind="joystick" className="pixel-header-right"/>
        <a className="brand" href="/" aria-label="PONGIT home">
          <img className="brand-mark orbit-mark" src="/brand/opposing-orbits.webp" alt="" width="72" height="72"/>
          <span className="brand-word">PONGIT</span>
          <span className="brand-sub">NEON RUSH / MONAD</span>
        </a>
        <div className="top-right"><a className="header-docs" href="/docs" target="_blank" rel="noopener noreferrer" onClick={()=>setDirection(0)}>Docs ↗</a><ArcadeAmbience onSound={setSound}/>
          <span className="network">
            <span className={connected ? "dot pulse" : "dot"} />
            {config?.chainId === 31337 ? "LOCAL CHAIN" : "MONAD TESTNET"}
          </span>
          <button aria-label={needsArcadeRenewal ? "Renew arcade session" : account ? "Open account details" : "Connect passkey"} disabled={!config || busy} onClick={() => { setDirection(0); setCopiedAddress(false); account && !needsArcadeRenewal ? setShowAccount(true) : void act(connectFromButton); }}>
            {needsArcadeRenewal ? "Reconnect" : account ? short(account) : "Connect passkey"} <span>↗</span>
          </button>
          {(needsArcadeRenewal || (!account && remembered)) && <button aria-label="Account options" title="Choose another account or forget this passkey" disabled={busy} onClick={()=>{setDirection(0);account?setShowAccount(true):setShowConnect(true);}}>•••</button>}
        </div>
      </header>
      <nav aria-label="Main navigation"><button className={tab==="Play"?"active":""} aria-current={tab==="Play"?"page":undefined} onClick={()=>changeTab("Play")}>Play</button><button className={tab==="Live"?"active":""} onClick={()=>changeTab("Live")}>Live <small>{items.filter(m=>m.status===2).length}</small></button><button className={tab==="Rivals"?"active":""} onClick={()=>changeTab("Rivals")}>Rivals</button><button className={["Ladder","Tournaments","Archive","Admin"].includes(tab)?"active":""} aria-expanded={showMore} onClick={()=>setShowMore(true)}>More <span>⌄</span></button></nav>
      {showMore && <Dialog label="More arcade activities" onClose={()=>setShowMore(false)} className="more-menu"><button className="modal-close" aria-label="Close menu" onClick={()=>setShowMore(false)}>×</button><p className="eyebrow">AROUND THE ARCADE</p><h2>Stay a little longer.</h2>{["Ladder","Tournaments","Archive",...(player?.admin?["Admin"]:[])].map(t=><button key={t} onClick={()=>changeTab(t)}>{t==="Archive"?"Replays":t}<span>↗</span></button>)}</Dialog>}
      {!home && !lobby && <section className="page-heading">
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
              ? "Enter the rush."
              : tab === "Live"
                ? "Watch it happen."
                : tab === "Ladder"
                  ? "The ladder."
                  : tab === "Rivals" ? "Choose your opponent." : tab === "Tournaments"
                    ? "Raise the stakes."
                    : tab === "Archive"
                      ? "The last three."
                      : "Operator console."}
          </h1>
        </div>
        <div className="heading-meta">
          <span>{connected ? "● CONNECTED" : "○ OFFLINE"}</span>
          <span>BLOCK {head ? head.toLocaleString() : "—"}</span>
        </div>
      </section>}

      {tab==="Rivals" && (!account || needsArcadeRenewal) && <button className="primary" disabled={busy} onClick={()=>void act(connectFromButton)}>{account?"Reconnect to challenge":"Connect to challenge"}</button>}
      <SocialHub ready={!busy && ((config?.version||1)<3 || arcadeExpires>Date.now()/1000)} mode={mode} key={`social-${account}`} account={account} config={config} visible={tab==="Rivals"} target={challengeTarget} authenticate={authenticateApp} identity={()=>owner.current} open={()=>setTab("Rivals")} enter={enterChallenge} matchRef={noteContext?.ref || (selected?`v${config?.version || 1}:${selected}`:undefined)} atUs={noteContext?.atUs || String(clock)} applyPreferences={settings=>{if(queued || canControl)throw new Error("Finish the active match or search before applying preferences.");setMode(settings.preferredMode===1?1:0);arcadeAudio.configure({enabled:settings.sound,entered:true});}}/>
      <Outcome id={selected?`${config?.game}:${selected}`:null} match={match} account={account} rating={player?Number((match?.mode===1?player.chaosRating:player.rating)?.elo || 1000):null} sound={sound} replay={tab==="Archive"} rematch={rematch} watch={()=>void act(()=>loadReplay(selected!))} again={()=>{setSelected(null);setMatch(null);setState(null);setTournamentId("0");setTab("Play");void act(()=>joinQueue(mode,"0"));}}/>
      {(tab==="Ladder") && <div className="mode-switch" role="group" aria-label="Game mode"><button disabled={queued || busy || canControl} aria-pressed={mode===0} onClick={()=>setMode(0)}>01 / Classic</button><button disabled={queued || busy || canControl || tournamentId!=="0"} aria-pressed={mode===1} onClick={()=>setMode(1)}>02 / Chaos</button><p>{mode===1?"Crowd pressure shrinks the favourite's paddle. Changes apply between rallies.":"Pure Pong. Separate ranked ladder. First to seven."}</p></div>}
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
      {home && <HomeCabinet mode={mode} setMode={setMode} busy={busy||!config} active={!!player?.activeMatch && player.activeMatch!=="0"} play={()=>void act(()=>joinQueue(mode,"0"))} challenge={()=>changeTab("Rivals")} watch={()=>changeTab("Live")} profile={publicProfile} editProfile={()=>void act(openProfile)}/>}
      {showProfile && account && <Dialog label="Your public profile" onClose={()=>setShowProfile(false)} className="profile-dialog"><button className="modal-close" aria-label="Close profile" onClick={()=>setShowProfile(false)}>×</button><p className="eyebrow">YOUR NAME ON THE CABINET</p><h2>Make a name.</h2><ProfileEditor key={account} account={account} ready={!busy} authenticate={async()=>{if(needsArcadeRenewal)await renewArcade();await authenticateApp();}}/></Dialog>}
      {lobby && <section className="waiting-cabinet"><PixelOrnament kind="planet"/><p className="eyebrow">{rematchInvite?"ONE MORE ROUND?":"MATCHMAKING"}</p><h1>{rematchInvite?"Your rival is up next.":"Finding your player two."}</h1><div className="waiting-display">{rematchInvite?rematchInvite.status.toUpperCase():`${Math.floor(searchSeconds/60)}:${String(searchSeconds%60).padStart(2,"0")}`}</div><p>{rematchInvite?`Rematch invitation · expires ${new Date(Number(rematchInvite.expires)*1000).toLocaleTimeString()}`:`${mode===1?"Chaos":"Classic"} · ${tournamentId!=="0"?"Tournament":"Ranked"}`}</p><p className="status-line" role="status">{message}</p>{queueTicket.current && <button disabled={busy} onClick={()=>void act(cancelQueue)}>Cancel search</button>}{rematchInvite && <button disabled={busy} onClick={()=>void act(async()=>{if(rematchInvite.status==="pending")await appApi(`/challenges/${rematchInvite.id}/cancel`,"POST",{},account);setRematchInvite(null);})}>{rematchInvite.status==="pending"?"Cancel invitation":"Back to arcade"}</button>}</section>}
      {home && <p className="status-line home-status" role="status">{message}</p>}
      {showArena && (
        <div className={`arena-grid ${showTools?"tools-open":""}`}>
          <section className="game-panel">
            <PixelOrnament kind="planet" className="pixel-bezel-left"/>
            <PixelOrnament kind="star" className="pixel-bezel-right"/>
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
                {side>=0 && match?.status===2 && <button className="tools-toggle" aria-expanded={showTools} onClick={()=>{setDirection(0);setShowTools(!showTools);}}>Cabinet tools</button>}
                {side >= 0
                  ? `YOU / ${side === 0 ? "LEFT" : "RIGHT"}`
                  : "SPECTATOR VIEW"}
              </span>
            </div>
            {match?.mode===1 && state && <div className="chaos-rally"><span>CHAOS / {state.awaitingServe && !state.finished?"INTERMISSION":"RALLY"}</span><span>P01 {Number(state.halfA)*2/1e6} · P02 {Number(state.halfB)*2/1e6} / 96 HEIGHT</span></div>}
            <div className="scoreboard">
              <div>
                <small>PLAYER 01</small>
                <strong title={match?.playerA}>
                  {match ? profileA?.handle || short(match.playerA) : "Awaiting player"}
                </strong>
              </div>
              <div className="score">
                <span className="score-change" key={`a-${scoreA}`}>{scoreA.toString().padStart(2, "0")}</span>
                <i>:</i>
                <span className="score-change" key={`b-${scoreB}`}>{scoreB.toString().padStart(2, "0")}</span>
              </div>
              <div className="right">
                <small>PLAYER 02</small>
                <strong title={match?.playerB}>
                  {match ? profileB?.handle || short(match.playerB) : "Awaiting player"}
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
                matchId={`${config?.game}:${selected || ""}`}
                pendingInputs={pendingInputs}
                confirmedNonce={BigInt((side===0?match?.a:match?.b)?.nonce || 0)}
                debug={showNetwork}
                onNetwork={(age,correction)=>{setSnapshotAge(age);setPaddleCorrection(correction);}}
                controllable={canControl && !showAccount && !showConnect && !showTools}
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
                  : snapshotAge >= 600 && match?.status===2
                    ? "SYNCING / PREVIEW PAUSED"
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
                    disabled={!controlsEnabled.current}
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
                    disabled={!controlsEnabled.current}
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
            <details className="network-panel" onToggle={e=>setShowNetwork(e.currentTarget.open)}><summary>Network details</summary>
              <dl>{[["Server round trip",inputRtt],["Relayer queue",inputTiming?.queueMs],["Broadcast",inputTiming?.broadcastMs],["Chain + receipt",inputTiming?.confirmationMs],["Snapshot age",Math.round(snapshotAge)]].map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{value==null?"—":`${value} ms`}</dd></div>)}<div><dt>Visual correction</dt><dd>{paddleCorrection.toFixed(1)} px</dd></div></dl>
              <p>The outline is diagnostic. Preview freezes at its time limit; a receipt is required for collisions and points.</p>
            </details>
            {canControl && <p className="input-hint">Local controls are responsive. Collisions and points wait for chain confirmation.</p>}
            {canControl && inputError && <p className="input-hint" role="status">Controls resynchronizing. {inputError}</p>}
            {inputLatency !== null && inputLatency > 1000 && canControl && <p className="input-hint">Input confirmation is taking {(inputLatency / 1000).toFixed(1)} s. Anticipate your moves; the preview cannot remove inclusion delay.</p>}
          </section>
          <CabinetTools modal={side>=0 && match?.status===2} open={showTools} onClose={()=>setShowTools(false)}>
            <button className="tools-close" onClick={()=>setShowTools(false)}>Close cabinet tools ×</button>
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
                    onClick={() => void act(needsArcadeRenewal ? () => renewArcade() : restoreSession)}
                  >
                    {canControl ? "Game session active" : needsArcadeRenewal ? "Reconnect & resume ↗" : "Restore game session ↗"}
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
                    : needsArcadeRenewal
                      ? "Reconnect & play"
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
                  <dd>{(config?.version||1)>=3 && arcadeExpires ? "ARCADE / THIS TAB" : session.current ? "MEMORY ONLY" : "NOT ACTIVE"}</dd>
                </div>
              </dl>
            </section>
            {selected && side<0 && <section className="side-card market-card">
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
              {selected && account && config && match?.status >= 3 && <MatchPayment key={`${config.game}:${selected}:${account}`} account={account} matchId={selected} config={config} onRefresh={()=>refreshPlayer()}/>}
              <small className="muted">
                Bets pause near collisions. Confirmation required. {config?.version===4 && "Gains are sent automatically to your wallet."}
              </small>
            </section>}
          </CabinetTools>
        </div>
      )}
      {tab==="Archive" && account && <section className="match-list personal-replays"><p className="eyebrow">YOUR LAST THREE</p><h2>One more look.</h2>{recentError&&<p role="status">{recentError}</p>}{!recent.length&&!recentError&&<p>No completed games yet.</p>}{recent.map(m=><article key={m.id} className="recent-game"><span>{m.mode===1?"Chaos":"Classic"} · {m.ranked?"Ranked":"Friendly"}<small>{short(m.playerA)} vs {short(m.playerB)}</small></span><strong>{m.scoreA} : {m.scoreB}</strong><button disabled={m.replayAvailability!=="available"} onClick={()=>{if(m.deployment===deploymentId(config!))void act(()=>loadReplay(m.rawId));else setLegacyReplay({deployment:m.deployment,id:m.rawId});}}>{m.replayAvailability==="available"?"Watch replay":m.replayAvailability==="pruned"?"Replay retired":"Replay indexing"}</button></article>)}</section>}
      {(tab === "Live" || tab === "Archive") && (
        <section className="match-list">
          <div className="section-title">
            <h2>{tab === "Archive" ? "Match archive" : "Around the arena"}</h2>
            <span>
              {visibleItems.length.toString().padStart(2, "0")} MATCHES
            </span>
          </div>
          {visibleItems.length ? (
            <div className="rows">
              {(tab==="Live"?visibleItems.filter(m=>m.status===2):visibleItems).map((m) => (
                <button
                  key={m.id}
                  className="match-row"
                  data-match-id={m.id}
                  disabled={tab==="Archive" && ["pruned","not-played"].includes(m.replayAvailability)}
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
                    {m.state ? `${m.state.scoreA} : ${m.state.scoreB}` : `${m.scoreA || 0} : ${m.scoreB || 0}`}
                  </strong>
                  <span>
                    {tab==="Archive" && m.replayAvailability==="pruned"?"REPLAY RETIRED":["", "WAITING", "LIVE", "FINAL", "CANCELLED"][m.status]}
                  </span>
                  <span>↗</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty"><PixelOrnament kind="star"/>
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
      {tab === "Archive" && config?.legacy && allDeployments(config).slice(1).map(d=><Legacy key={d.game} legacy={d} config={config} account={account} signer={signingOwner} closeSigner={closeOwner} requested={legacyReplay?.deployment===deploymentId(d)?legacyReplay.id:undefined}/>)}
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
                  <td><span className="ladder-player"><Avatar index={p.avatar ?? parseInt(p.address.slice(-4),16)%12}/><span title={p.address}>{p.handle || short(p.address)}</span></span><button className="ladder-challenge" disabled={busy || p.address.toLowerCase()===account.toLowerCase()} onClick={()=>void act(()=>directChallenge(p.address))}>Challenge ↗</button></td>
                  <td>{p.elo}</td>
                  <td>{p.played}</td>
                  <td>{p.wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ladder.length && (
            <div className="empty"><PixelOrnament kind="star"/>
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
                    disabled={busy || !account || t.status !== 1 || t.entrants.some((p:string)=>p.toLowerCase()===account.toLowerCase())}
                    onClick={() => void act(() => registerTournament(t.id))}
                  >
                    {t.entrants.some((p:string)=>p.toLowerCase()===account.toLowerCase())?"Registered":"Register"}
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
                    onClick={() => void act(()=>joinQueue(0,t.id))}
                  >
                    Play round ↗
                  </button>
                  {config?.version===4 ? <p className="payment-note">Rounds resolve automatically. Prizes go to the winner’s wallet.</p> : <>
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
                  </>}
                </div>
                {config?.version===4 && t.status===4 ? <p className="payment-note">Entry refunds are sent automatically to participants’ wallets.</p> : <>
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
                </>}
              </section>
            ))}
          </div>
          {!tournaments.length && (
            <div className="empty"><PixelOrnament kind="star"/>No tournaments scheduled.</div>
          )}
          <p className="muted">
            Your next round appears when the bracket is ready. Results and prizes settle automatically.
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
          <div className="empty"><PixelOrnament kind="star"/>
            Connect an account with the onchain ADMIN_ROLE to open this console.
            <button disabled={busy || !config} onClick={() => void act(connectFromButton)}>
              Connect passkey
            </button>
          </div>
        ))}
      {betPreview && <Dialog label="Review your bet" onClose={()=>{if(!busy)setBetPreview(null);}}><button className="modal-close" disabled={busy} aria-label="Close bet review" onClick={()=>setBetPreview(null)}>×</button><p className="eyebrow">TEST MON ONLY</p><h2>Back player {betPreview.side+1}.</h2><p>{short(betPreview.side===0?match?.playerA:match?.playerB)}</p><dl className="bet-review"><dt>Estimated cost</dt><dd>{money(betPreview.quote.amount)} MON</dd><dt>Maximum cost (+1%)</dt><dd>{formatEther(BigInt(betPreview.quote.amount)*101n/100n)} MON</dd><dt>Payout if they win</dt><dd>{betPreview.quantity} MON</dd></dl>{match?.mode===1 && <p className="chaos-warning">Supporting this player can shrink their paddle next rally.</p>}<p>Paid to your wallet automatically if this position wins. Your passkey approves the spend.</p>{error&&<p role="alert">{error}</p>}<button className="primary" disabled={busy} onClick={()=>void act(()=>bet(betPreview.side,true))}>{busy?"Confirming…":"Confirm with passkey"}</button></Dialog>}
      <footer>
        <span>PONGIT / BUILT ON MONAD</span>
        <MusicCredit/>
        <a
          href="https://testnet.monadscan.com"
          target="_blank"
          rel="noreferrer"
        >
          Explorer ↗
        </a>
      </footer>
      {showAccount && account && (
        <Dialog label="Account details" onClose={()=>setShowAccount(false)} className="account-modal">
            <button className="modal-close" aria-label="Close account details" onClick={() => setShowAccount(false)}>×</button>
            <p className="eyebrow">YOUR PONGIT ACCOUNT</p>
            <h2 id="account-title">Account details</h2>
            <p>{config?.chainId === 31337 ? "Local test account" : "Mera passkey · Monad Testnet"}</p>
            <label className="account-address">Full address<textarea aria-label="Full account address" value={account} rows={3} readOnly onFocus={(e) => e.currentTarget.select()} /></label>
            <button onClick={() => void navigator.clipboard.writeText(account).then(() => setCopiedAddress(true)).catch(() => setError("Copy unavailable. Select the full address above to copy it manually."))}>{copiedAddress ? "Address copied" : "Copy address"}</button>
            {config?.chainId === 10143 && <a className="account-explorer" href={`https://testnet.monadscan.com/address/${account}`} target="_blank" rel="noreferrer">View account on explorer ↗</a>}
            <p className="account-feedback" role="status">{busy?"Please wait… ":""}{error||message}</p>
      {account && (
        <section className="vault-strip">
          <div>
            <p className="eyebrow">BETTING BALANCE</p>
            <strong>{money(player?.balance)} MON</strong>
            {config?.version===4 && <p className="wallet-balance">WALLET <strong>{money(player?.walletBalance)} MON</strong></p>}
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
      {account && config?.version===4 && <PaymentHistory key={`payments-${account}`} account={account} onRefresh={()=>refreshPlayer()}/>}
            {config?.legacy && <details><summary>Older balances</summary>{allDeployments(config).slice(1).map(d=><Legacy key={d.game} legacy={d} config={config} account={account} signer={signingOwner} closeSigner={closeOwner} requested={legacyReplay?.deployment===deploymentId(d)?legacyReplay.id:undefined}/>)}</details>}
            <p className="account-explanation">Disconnecting clears signing keys from this browser. Your passkey and funds stay available. It does not concede a match or cancel a transaction already submitted.</p>
            {(config?.version||1)>=3 && <><p>Arcade session {arcadeExpires?`until ${new Date(arcadeExpires*1000).toLocaleTimeString()}`:"expired"}. Gameplay only; funds require your passkey.</p><button disabled={busy} onClick={()=>void act(()=>renewArcade())}>Renew arcade session</button></>}
            <button disabled={busy} onClick={()=>void act(async()=>{await disconnect();forgetAccount();setRemembered(null);})}>Forget this account</button>
            <button className="primary" disabled={busy} onClick={() => void act(disconnect)}>{queued ? "Cancel search and disconnect" : "Disconnect"}</button>
        </Dialog>
      )}
      {showConnect && (
        <Dialog label="Connect your passkey" onClose={closeConnect}>
            <button
              className="modal-close"
              aria-label="Close"
              onClick={closeConnect}
            >
              ×
            </button>
            {error && <p role="alert" className="notice error">{error}</p>}
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
        </Dialog>
      )}
    </main>
  );
}
