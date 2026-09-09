"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  createWalletClient,
  http,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { monadTestnet } from "viem/chains";
import { Court } from "./Court";
import { PixelPalaceArt } from "./PixelPalaceArt";
import { RoomsMarketPanel } from "./RoomsMarketPanel";
import { EngineCredit } from "./EngineCredit";
import { ArcadeAmbience, MusicCredit } from "./ArcadeAmbience";
import { Avatar, AvatarPicker } from "./Avatar";
import { Dialog } from "./Dialog";
import { IconButton } from "./IconButton";
import { Outcome } from "./Outcome";
import {
  connect,
  rememberedAccount,
  forgetAccount,
  type Identity,
} from "../lib/wallet";
import { arcadeAudio } from "../lib/audio";
import { api, API, WS } from "../lib/api";
import {
  createRoomsClient,
  roomsManifest,
  roomsChaos,
  roomsScope,
  roomsAccountKey,
  authenticateRooms,
  roomsAction,
  roomsApi,
  type RoomsClient,
  type RoomsSession,
} from "../lib/interlude-rooms";
import {
  LabLane,
  labSnapshot,
  labSide,
  type LabSnapshot,
} from "../lib/interlude-lab";
import type { LobbyRoom, LobbyOffer } from "../../shared/rooms";
import {readEngineSnapshot} from "../../shared/engine-snapshot";
import {engineRead, engineReadRetryMs} from "../../shared/engine-read";
type Profile = {
  player: string;
  handle?: string;
  avatar?: number;
  count?: number;
};
type Lobby = {
  room?: LobbyRoom;
  queue?: { at: number; mode?: 0 | 1 };
  inbox: any[];
  outbox: any[];
  profiles: Profile[];
  online: boolean;
  admission: boolean;
  error: string;
  rating?: { live: any; published: any };
};
const short = (p: string) => `${p.slice(0, 6)}…${p.slice(-4)}`;
const quiet = () => {};
function RoomsModal({
  title,
  children,
  busy,
  error,
  onClose,
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  error: string;
  onClose: () => void;
}) {
  return (
    <Dialog label={title} className="rooms-dialog" onClose={onClose}>
      <IconButton
        className="modal-close"
        aria-label={`Close ${title}`}
        disabled={busy}
        onClick={onClose}
      />
      <h2>{title}</h2>
      {children}
      {error && (
        <p className="rooms-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
function ChoiceIcon({ kind }: { kind: "match" | "invite" | "room" }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        d={
          kind === "match"
            ? "M10 9v30M38 9v30M18 18l12 12m-2-12H18v10"
            : kind === "invite"
              ? "M30 16a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM12 39v-5c0-11 24-11 24 0v5M37 9h10m-5-5v10"
              : "M7 9h34v25H7zM14 40h20M19 34v6m10-6v6M15 16v11m18-11v11M23 21h3v3h-3z"
        }
      />
    </svg>
  );
}
async function tabLock(p: string) {
  if (!navigator.locks)
    throw new Error(
      "This browser cannot protect the arcade session. Use a current browser.",
    );
  return new Promise<() => void>((resolve, reject) => {
    void navigator.locks
      .request(
        `pongit:rooms:${roomsManifest.app}:${p.toLowerCase()}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            reject(
              new Error(
                "This account is already controlling PONGIT in another tab.",
              ),
            );
            return;
          }
          await new Promise<void>((release) => resolve(release));
        },
      )
      .catch(reject);
  });
}
export function RoomsHub({ roomId }: { roomId?: string }) {
  const [mode,setMode] = useState<0|1>(0);
  const [account, setAccount] = useState<Address>(),
    [saved, setSaved] = useState<Address>(),
    [ready, setReady] = useState(false),
    [online, setOnline] = useState(false),
    [admission, setAdmission] = useState(false);
  const [lobby, setLobby] = useState<Lobby>({
      inbox: [],
      outbox: [],
      profiles: [],
      online: false,
      admission: false,
      error: "",
    }),
    [snapshot, setSnapshot] = useState<LabSnapshot | null>(null);
  const [panel, setPanel] = useState<
    | "connect"
    | "account"
    | "contacts"
    | "create"
    | "members"
    | "tools"
    | "more"
    | "ladder"
    | "market"
    | null
  >(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [direction, setDirection] = useState(0),
    [latency, setLatency] = useState(0),
    [fps, setFps] = useState(0),
    [now, setNow] = useState(Date.now());
  const [contacts, setContacts] = useState<Profile[]>([]),
    [frequent, setFrequent] = useState<Profile[]>([]),
    [search, setSearch] = useState(""),
    [found, setFound] = useState<Profile[]>([]),
    [selected, setSelected] = useState<string[]>([]);
  const [handle, setHandle] = useState(""),
    [avatar, setAvatar] = useState(0),
    [ladder, setLadder] = useState<any[]>([]),
    [copyText, setCopyText] = useState("");
  const [rankMode, setRankMode] = useState<"classic" | "chaos" | "previous">("classic");
  const [rankLoading, setRankLoading] = useState(false), [rankError, setRankError] = useState(""), [rankReload, setRankReload] = useState(0);
  useEffect(() => {
    if (panel !== "ladder") return;
    let cancelled = false;
    setRankLoading(true); setRankError(""); setLadder([]);
    const currentRanking=rankMode === "classic" || roomsChaos && rankMode === "chaos";
    void (currentRanking ? api(`/interlude/ladder?mode=${rankMode === "chaos" ? 1 : 0}`) : api(`/leaderboard?mode=${rankMode === "chaos" ? 1 : 0}`))
      .then(r => { if (!cancelled) setLadder(currentRanking ? r.items.map((p:any) => ({...p, elo:(p.live || p.published).elo, played:(p.live || p.published).played, wins:(p.live || p.published).wins})) : r.Player.map((p:any) => ({...p, player:p.address}))); })
      .catch(e => { if (!cancelled) setRankError(e.message); })
      .finally(() => { if (!cancelled) setRankLoading(false); });
    return () => { cancelled = true; };
  }, [panel, rankMode, rankReload]);
  const [preview, setPreview] = useState<any>(null),
    [entry, setEntry] = useState(roomId),
    [showResultKey, setShowResultKey] = useState(0);
  const [syncError, setSyncError] = useState("");
  const client = useRef<RoomsClient | null>(null),
    session = useRef<RoomsSession | null>(null),
    lane = useRef<LabLane | null>(null),
    snapshotRef = useRef<LabSnapshot | null>(null),
    matchRef = useRef<string | undefined>(undefined);
  const accountRef = useRef<Address | undefined>(undefined),
    release = useRef<(() => void) | null>(null),
    alive = useRef(false),
    busyRef = useRef(false),
    intent = useRef<(() => Promise<void>) | null>(null),
    autoAccept = useRef(false),
    sendTail = useRef<Promise<unknown>>(Promise.resolve()),
    lobbyRef = useRef(lobby),
    refreshRef = useRef<() => Promise<void>>(async () => {});
  const profileLoaded = useRef<string | undefined>(undefined);
  const room = lobby.room,
    offer = room?.offer,
    side = labSide(snapshot, account),
    isDuel =
      !!offer && [offer.a, offer.b].includes(account?.toLowerCase() || "");
  const active =
      snapshot?.phase === 2 && room?.offer?.id === snapshot.id.toString(),
    canPlay = !!active && side >= 0 && ready && online && !busy && !panel && !syncError;
  const playable = useRef(false);
  playable.current = canPlay;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  lobbyRef.current = lobby;
  const name = (p: string) =>
    lobby.profiles.find((x) => x.player === p.toLowerCase())?.handle ||
    short(p);
  const me = room?.members.find((m) => m.player === account?.toLowerCase());
  const receive = (s: LabSnapshot, ms?: number) => {
    if (!alive.current || s.id.toString() !== matchRef.current) return;
    const old = snapshotRef.current;
    // A process restart may lower the block head without erasing accepted state.
    // Revision remains the ordering authority across that recovery.
    if (old?.id === s.id && (s.revision < old.revision || s.revision === old.revision && s.head < old.head))
      return;
    snapshotRef.current = s;
    setSyncError("");
    setSnapshot(s);
    if (ms !== undefined) setLatency(Math.round(ms));
    if (s.phase !== 2) {
      lane.current?.intent(0);
      setDirection(0);
    }
  };
  const failed = () => {
    lane.current?.stop();
    setReady(false);
    setDirection(0);
    setError(
      "The engine did not confirm this action. Reconnect to read the current match before continuing.",
    );
  };
  const read = async () =>
    labSnapshot(
      await readEngineSnapshot(client.current!, BigInt(matchRef.current || "0")),
    );
  function move(d: number) {
    if (d !== 0 && !playable.current) return;
    lane.current?.intent(d);
    setDirection(d);
    if (lane.current && !lane.current.stopped) void lane.current.pump(false);
  }
  async function refresh() {
    const next = await roomsApi<Lobby>("/interlude/state");
    if (!alive.current) return;
    setLobby(next);
    if(next.room || next.queue)setMode(next.room?.mode || next.queue?.mode || 0);
    setOnline(next.online);
    setAdmission(next.admission);
    const mine = next.profiles.find(
      (p) => p.player === accountRef.current?.toLowerCase(),
    );
    if (accountRef.current && profileLoaded.current !== accountRef.current) {
      profileLoaded.current = accountRef.current;
      setHandle(mine?.handle || "");
      setAvatar(mine?.avatar || 0);
    }
    if (next.room) {
      setEntry(undefined);
      if (location.pathname !== `/rooms/${next.room.id}`)
        history.replaceState(null, "", `/rooms/${next.room.id}`);
    }
  }
  refreshRef.current = refresh;
  async function run(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message.split("\n")[0]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function ensure(fn: () => Promise<void>) {
    if (ready) {
      await run(fn);
      return;
    }
    intent.current = fn;
    if (saved || account) {
      await login();
    } else setPanel("connect");
  }
  async function install(p: Address, next: RoomsSession) {
    // A single serialization point owns the SDK's transaction nonce for this tab.
    const serial = new Proxy(next, {
      get(target, key) {
        if (key === "send")
          return (...args: any[]) => {
            const pending = sendTail.current
              .catch(() => {})
              .then(() => (target.send as any)(...args));
            sendTail.current = pending;
            return pending;
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await authenticateRooms(p);
    session.current = serial;
    accountRef.current = p;
    sessionStorage.setItem(roomsAccountKey, p);
    setAccount(p);
    setReady(true);
    setSaved(p);
    setError("");
    await refresh();
  }
  async function login(create = false, another = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    let identity: Identity | undefined;
    try {
      lane.current?.stop();
      release.current?.();
      release.current = null;
      const previous = another ? undefined : account || saved;
      if (previous && !create) {
        release.current = await tabLock(previous);
        const restored = await client.current!.restoreSession(previous, {
          scope: roomsScope,
        });
        if (restored) {
          await install(previous, restored);
          setPanel(null);
          const action = intent.current;
          intent.current = null;
          if (action) await action();
          return;
        }
        release.current();
        release.current = null;
      }
      identity = await connect(create, another);
      release.current = await tabLock(identity.account.address);
      const next = await client.current!.openSession({
        wallet: createWalletClient({
          account: identity.account,
          chain: monadTestnet,
          transport: http(),
        }),
        scope: roomsScope,
        expirySeconds: 1800,
        assertDigest: true,
      });
      await install(identity.account.address, next);
      setPanel(null);
      const action = intent.current;
      intent.current = null;
      if (action) await action();
    } catch (e) {
      intent.current = null;
      release.current?.();
      release.current = null;
      setReady(false);
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Connection cancelled."
          : (e as Error).message.split("\n")[0],
      );
    } finally {
      identity?.end();
      busyRef.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    client.current = createRoomsClient();
    setSaved(rememberedAccount()?.address);
    let done = false,
      configTimer: ReturnType<typeof setTimeout>;
    const config = async () => {
      try {
        const c = await api("/interlude/config");
        if (c.app !== roomsManifest.app)
          throw new Error("Deployment changed. Reload to continue.");
        if (!done) {
          setOnline(c.online);
          setAdmission(c.admission);
          if(c.maintenance?.stage && c.maintenance.stage!=='playing')setNotice(c.maintenance.stage==='draining'?'Current matches are finishing before scheduled maintenance. New games will resume after renewal.':'The arcade is renewing its delegation. This includes a one-hour challenge period. Payments continue in the background.');
          else if (!c.online) setNotice("The game service is reconnecting. Please retry shortly.");
          else setNotice("");
        }
      } catch (e) {
        if (!done) {
          setOnline(false);
          setNotice((e as Error).message);
        }
      }
      if (!done) configTimer = setTimeout(config, 10000);
    };
    void config();
    const previous = sessionStorage.getItem(roomsAccountKey);
    if (previous && isAddress(previous)) {
      busyRef.current = true;
      setBusy(true);
      setAccount(previous);
      accountRef.current = previous;
      void (async () => {
        try {
          release.current = await tabLock(previous);
          const s = await client.current!.restoreSession(previous, {
            scope: roomsScope,
          });
          if (done) {
            release.current?.();
            return;
          }
          if (s) await install(previous, s);
          else {
            release.current?.();
            release.current = null;
          }
        } catch (e) {
          if (!done) setError((e as Error).message);
        } finally {
          if (!done) {
            busyRef.current = false;
            setBusy(false);
          }
        }
      })();
    }
    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => {
      done = true;
      alive.current = false;
      clearTimeout(configTimer);
      clearInterval(clock);
      lane.current?.stop();
      release.current?.();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let done = false,
      timer: ReturnType<typeof setTimeout>,
      socket: WebSocket | undefined,
      retry: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await refreshRef.current();
      } catch (e) {
        if (!done) {
          setError((e as Error).message);
          if (String(e).includes("Renew") || String(e).includes("revoked")) {
            setReady(false);
            lane.current?.stop();
          }
        }
      }
      if (!done) timer = setTimeout(poll, document.hidden ? 10000 : 4000);
    };
    const open = () => {
      socket = new WebSocket(WS);
      socket.onopen = () =>
        socket!.send(
          JSON.stringify({
            type: "subscribe-rooms",
            player: account?.toLowerCase(),
          }),
        );
      socket.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.type === "rooms-changed")
            void refreshRef.current().catch(() => {});
          if (m.type === "rooms-expired") {
            setReady(false);
            lane.current?.stop();
          }
        } catch {}
      };
      socket.onclose = () => {
        if (!done) retry = setTimeout(open, 3000);
      };
    };
    open();
    void poll();
    return () => {
      done = true;
      clearTimeout(timer);
      clearTimeout(retry);
      socket?.close();
    };
  }, [ready, account]);
  useEffect(() => {
    const id = offer?.id;
    matchRef.current = id;
    lane.current?.stop();
    snapshotRef.current = null;
    setSnapshot(null);
    setSyncError("");
    if (!id) return;
    let done = false,
      pollTimer: ReturnType<typeof setTimeout>;
    const readSnapshot = engineRead(async () => labSnapshot(
      await readEngineSnapshot(client.current!, BigInt(id)),
    ));
    if (session.current && account)
      lane.current = new LabLane(
        readSnapshot,
        session.current,
        account,
        receive,
        failed,
        () => {
          setSyncError("Synchronizing game state. Your session is still connected.");
          setDirection(0);
        },
      );
    const poll = async () => {
      let retryMs = 0;
      try {
        // The player's command lane already observes state. Keep polling for
        // spectators, pending/result states and a stopped lane, without a second
        // concurrent polling loop on every active player.
        const controlled = ready && lane.current && !lane.current.stopped && !document.hidden
          && snapshotRef.current?.phase === 2 && labSide(snapshotRef.current, account) >= 0;
        if (!controlled) {
          const s = await readSnapshot();
          if (!done) receive(s);
        }
      } catch (e) {
        retryMs = engineReadRetryMs(e);
        if (!done) setSyncError("Synchronizing game state. Your session is still connected.");
      }
      if (!done) pollTimer = setTimeout(poll, Math.max(retryMs, document.hidden ? 2000 : 250));
    };
    void poll();
    const pump = setInterval(() => {
      if (
        !done &&
        !document.hidden &&
        onlineRef.current &&
        ready &&
        snapshotRef.current?.phase === 2 &&
        labSide(snapshotRef.current, account) >= 0
      )
        void lane.current?.pump(
          !snapshotRef.current.state.awaitingServe &&
            (labSide(snapshotRef.current, account) === 0 ||
              snapshotRef.current.clock - snapshotRef.current.state.t > 300000n),
        );
    }, 100);
    return () => {
      done = true;
      clearTimeout(pollTimer);
      clearInterval(pump);
      lane.current?.stop();
    };
  }, [offer?.id, ready, account]);
  useEffect(() => {
    if (entry)
      void api(`/interlude/rooms/${entry}`)
        .then(setPreview)
        .catch((e) => setError(e.message));
  }, [entry]);
  useEffect(() => {
    arcadeAudio.setGameplay(canPlay);
    return () => arcadeAudio.setGameplay(false);
  }, [canPlay]);
  useEffect(() => {
    const pressed = new Set<string>();
    const stop = () => {
      pressed.clear();
      move(0);
    };
    const key = (e: KeyboardEvent) => {
      if (
        !["w", "s", "ArrowUp", "ArrowDown"].includes(e.key) ||
        !playable.current ||
        document.querySelector('[role="dialog"]') ||
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"]',
        )
      )
        return;
      e.preventDefault();
      if (e.type === "keydown") pressed.add(e.key);
      else pressed.delete(e.key);
      move(
        pressed.has("w") || pressed.has("ArrowUp")
          ? -1
          : pressed.has("s") || pressed.has("ArrowDown")
            ? 1
            : 0,
      );
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", stop);
    window.addEventListener("pongit:overlay", stop);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", stop);
      window.removeEventListener("pongit:overlay", stop);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!search.trim()) {
      setFound([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void api(`/profiles?search=${encodeURIComponent(search.trim())}`)
        .then((r: any) => {
          if (!cancelled) setFound(r.profiles || r);
        })
        .catch(() => {});
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);
  async function startQueue() {
    await roomsAction("queue", {mode});
    await refresh();
    setPanel(null);
  }
  async function openContacts(kind: "contacts" | "create") {
    const data = await roomsApi("/interlude/contacts");
    setContacts(data.contacts);
    setFrequent(data.frequent);
    setSelected([]);
    setSearch("");
    setPanel(kind);
  }
  async function createRoom() {
    const data = await roomsAction("rooms", { players: selected, mode });
    setPanel(null);
    history.replaceState(null, "", `/rooms/${data.room}`);
    await refresh();
  }
  async function invitePlayer(player: string) {
    const data = await roomsAction(room ? "rooms/invite" : "invitations", {
      player,
      mode,
    });
    setPanel(null);
    if (data.room) history.replaceState(null, "", `/rooms/${data.room}`);
    await refresh();
  }
  async function join(id: string) {
    const joined = await roomsAction("rooms/join", { room: id });
    autoAccept.current = !!joined.acceptFirstDuel;
    setEntry(undefined);
    await refresh();
  }
  async function accept(o: LobbyOffer) {
    await roomsAction("offers/accept", { id: o.id });
    const t = {
      id: BigInt(o.id),
      room: o.room as Hex,
      a: o.a as Address,
      b: o.b as Address,
      ranked: o.ranked,
      ...(roomsChaos ? {mode:o.mode || 0}:{}),
      expires: BigInt(o.expires),
      rules: BigInt(o.rules),
      entropy: o.entropy as Hex,
    };
    if (!session.current) throw new Error("Renew your arcade session.");
    await session.current.send("acceptMatch", [t, o.signature]);
    if (matchRef.current === o.id) receive(await read());
    await refresh();
  }
  useEffect(() => {
    if (
      autoAccept.current &&
      offer?.status === "offered" &&
      isDuel &&
      ready &&
      !busy
    ) {
      autoAccept.current = false;
      void run(() => accept(offer));
    }
  }, [offer?.id, ready, busy]);
  async function backOffer() {
    if (!offer) return;
    const s = await read();
    if (s.phase === 2)
      throw new Error("The match has started. Use Concede to leave.");
    if (s.phase === 1 && session.current)
      await session.current.send("cancelMatch", [s.id]);
    await roomsAction("offers/back", { id: offer.id });
    autoAccept.current = false;
    await refresh();
  }
  async function leave() {
    await roomsAction("rooms/leave");
    history.replaceState(null, "", "/");
    setEntry(undefined);
    await refresh();
  }
  async function another() {
    if (room) await leave();
    await startQueue();
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied");
      setTimeout(() => setNotice(""), 2000);
    } catch {
      setCopyText(text);
    }
  }
  async function disconnect() {
    move(0);
    if (lane.current && !lane.current.stopped) await lane.current.pump(false);
    lane.current?.stop();
    session.current?.discard();
    session.current = null;
    release.current?.();
    release.current = null;
    sessionStorage.removeItem(roomsAccountKey);
    await fetch(API + "/interlude/auth/session", {
      method: "DELETE",
      credentials: "include",
      headers: { "x-pongit-player": accountRef.current || "" },
    }).catch(() => {});
    accountRef.current = undefined;
    setAccount(undefined);
    setReady(false);
    setLobby({
      inbox: [],
      outbox: [],
      profiles: [],
      online,
      admission,
      error: "",
    });
    setPanel(null);
    setNotice(
      "Session removed from this tab. Other copies remain valid until expiry.",
    );
  }
  const openPanel = (p: typeof panel) => {
    move(0);
    setPanel(p);
  };
  const modalProps = {
    busy,
    error,
    onClose: () => {
      if (!busy) {
        intent.current = null;
        setPanel(null);
      }
    },
  };
  const canAccept =
    offer?.status === "offered" &&
    Number(offer.expires) * 1000 > now &&
    isDuel &&
    snapshot?.phase !== 2;
  const players = [
    ...new Map(
      [
        ...contacts,
        ...frequent,
        ...found,
        ...(isAddress(search) ? [{ player: search.toLowerCase() }] : []),
      ]
        .filter((p) => p.player !== account?.toLowerCase())
        .map((p) => [p.player, p]),
    ).values(),
  ];
  return (
    <main className={`cabinet-ui rooms-shell ${active ? "rooms-playing" : ""}`}>
      <header className="rooms-header">
        <a href="/" className="brand" aria-label="PONGIT home">
          <img
            className="brand-mark"
            src="/brand/opposing-orbits.webp"
            width="40"
            height="40"
            alt=""
          />
          <span className="brand-word">PONGIT</span>
        </a>
        <div className="rooms-header-actions">
          <ArcadeAmbience onSound={quiet} />
          <a href="/docs" target="_blank" rel="noreferrer">
            Docs ↗
          </a>
          <button className="rooms-ranking-toggle" onClick={() => openPanel("ladder")}>Ranking</button>
          <button
            onClick={() => openPanel("more")}
            aria-label="More arcade activities"
          >
            More
          </button>
          <button
            className="rooms-account-toggle"
            disabled={busy}
            onClick={() =>
              ready
                ? openPanel("account")
                : void ensure(async () => openPanel("account"))
            }
          >
            {ready && account
              ? name(account)
              : busy
                ? "Connecting…"
                : account
                  ? "Renew session"
                  : "Connect"}
          </button>
        </div>
      </header>
      {notice && (
        <div className="rooms-notice" role="status">
          {notice}
        </div>
      )}
      {error && !panel && (
        <div className="rooms-error" role="alert">
          {error}
          {!ready && account && (
            <button disabled={busy} onClick={() => void login()}>
              Reconnect
            </button>
          )}
        </div>
      )}
      {syncError && <div className="rooms-notice" role="status">{syncError}</div>}
      {lobby.inbox.length > 0 && !entry && (
        <aside className="rooms-invitation" role="status">
          <Avatar
            index={
              lobby.profiles.find((p) => p.player === lobby.inbox[0].creator)
                ?.avatar
            }
          />
          <strong>{name(lobby.inbox[0].creator)}</strong>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void ensure(() => join(lobby.inbox[0].room))}
          >
            Accept
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await roomsAction("invitations/decline", {
                  id: lobby.inbox[0].id,
                });
                await refresh();
              })
            }
          >
            Back
          </button>
        </aside>
      )}
      {entry && !room ? (
        <section className="rooms-entry">
          <span className="rooms-choice-icon">
            <ChoiceIcon kind="room" />
          </span>
          <h1>{preview?.profiles?.[0]?.handle || "PONGIT room"}</h1>
          {preview && (
            <small>
              {preview.mode === 1 ? "Chaos" : "Classic"} · {preview.count} / {preview.kind === "group" ? 8 : 2}
            </small>
          )}
          <div className="rooms-button-row">
            <button
              className="primary"
              disabled={busy}
              onClick={() => void ensure(() => join(entry))}
            >
              Accept
            </button>
            <a className="rooms-button" href="/">
              Back
            </a>
          </div>
        </section>
      ) : !room && !lobby.queue ? (
        <section className="rooms-home">
          <div className="palace-marquee">
            <span className="palace-star" aria-hidden="true" />
            <h1><span>Pong is back</span><span>Bring a rival</span></h1>
            <span className="palace-star" aria-hidden="true" />
          </div>
          <div className="rooms-choices">
            <button
              className="rooms-choice rooms-choice-match"
              disabled={busy}
              onClick={() => void ensure(startQueue)}
            >
              <span className="rooms-choice-stage">
                <PixelPalaceArt kind="match" />
              </span>
              <strong>Matchmaking</strong>
              <span>{mode === 1 ? "Chaos" : "Classic"} · Ranked</span>
              <i className="palace-key" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m7 4 13 8-13 8Z" fill="currentColor" /></svg></i>
            </button>
            <button
              className="rooms-choice rooms-choice-invite"
              disabled={busy}
              onClick={() => void ensure(() => openContacts("contacts"))}
            >
              <span className="rooms-choice-stage">
                <PixelPalaceArt kind="invite" />
              </span>
              <strong>Invite someone</strong>
              <span>Your next rival</span>
              <i className="palace-key" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m10 8 3-3a4 4 0 0 1 6 6l-3 3m-2 2-3 3a4 4 0 0 1-6-6l3-3m1 5 6-6" /></svg></i>
            </button>
            <button
              className="rooms-choice rooms-choice-room"
              disabled={busy}
              onClick={() => void ensure(() => openContacts("create"))}
            >
              <span className="rooms-choice-stage">
                <PixelPalaceArt kind="room" />
              </span>
              <strong>Create room</strong>
              <span>8 friends · Winner stays</span>
              <i className="palace-key" aria-hidden="true"><ChoiceIcon kind="room" /></i>
            </button>
          </div>
          {roomsChaos && <div className="control-segments rooms-mode-choice" role="group" aria-label="Game mode">
            <button aria-pressed={mode===0} disabled={busy} onClick={()=>setMode(0)}>Classic</button>
            <button aria-pressed={mode===1} disabled={busy} onClick={()=>setMode(1)}>Chaos</button>
          </div>}
          <p className="rooms-caption">
            Free to play · Monad Testnet
          </p>
          {ready &&
            !lobby.profiles.some(
              (p) => p.player === account?.toLowerCase() && p.handle,
            ) && (
              <button
                className="rooms-profile-prompt"
                onClick={() => openPanel("account")}
              >
                Choose your username ↗
              </button>
            )}
        </section>
      ) : lobby.queue ? (
        <section className="rooms-entry">
          <span className="rooms-choice-icon">
            <ChoiceIcon kind="match" />
          </span>
          <h1>Finding your rival</h1>
          <p className="rooms-timer">
            {Math.floor((now - lobby.queue.at) / 60000)}:
            {String(Math.floor((now - lobby.queue.at) / 1000) % 60).padStart(
              2,
              "0",
            )}
          </p>
          <span>{lobby.queue.mode === 1 ? "Chaos" : "Classic"} · Ranked</span>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await roomsAction("queue/cancel");
                await refresh();
              })
            }
          >
            Cancel
          </button>
        </section>
      ) : room ? (
        <>
          <div className="rooms-room-bar">
            <span>
              {room.kind === "ranked"
                ? `${room.mode === 1 ? "CHAOS" : "CLASSIC"} / RANKED`
                : room.kind === "group"
                  ? `${room.mode === 1 ? "CHAOS" : "CLASSIC"} / WINNER STAYS`
                  : `${room.mode === 1 ? "CHAOS" : "CLASSIC"} / FRIENDLY`}
            </span>
            <div>
              <button
                onClick={() => void copy(`${location.origin}/rooms/${room.id}`)}
              >
                Copy room link
              </button>
              <button onClick={() => openPanel("members")}>
                Members {room.members.length}
              </button>
              <button onClick={() => openPanel("tools")}>Tools</button>
              {roomsChaos && room.mode===1 && <button onClick={()=>openPanel("market")}>Market</button>}
            </div>
          </div>
          {canAccept ? (
            <section className="rooms-entry rooms-duel">
              <div className="rooms-versus">
                <span>{name(offer!.a)}</span>
                <b>VS</b>
                <span>{name(offer!.b)}</span>
              </div>
              <small>
                {Math.max(
                  0,
                  Math.ceil((Number(offer!.expires) * 1000 - now) / 1000),
                )}
                s
              </small>
              <div className="rooms-button-row">
                <button
                  className="primary"
                  disabled={
                    busy || offer!.accepted.includes(account!.toLowerCase())
                  }
                  onClick={() => void ensure(() => accept(offer!))}
                >
                  {offer!.accepted.includes(account!.toLowerCase())
                    ? "Waiting…"
                    : "Accept"}
                </button>
                <button disabled={busy} onClick={() => void run(backOffer)}>
                  Back
                </button>
              </div>
            </section>
          ) : snapshot && snapshot.phase >= 2 ? (
            <section className="rooms-court court-card">
              <div className="scoreboard">
                <div className="player-label">
                  <Avatar index={lobby.profiles.find(p => p.player.toLowerCase() === snapshot.a.toLowerCase())?.avatar || 0}/>
                  <small>PLAYER 01</small>
                  <span>{name(snapshot.a)}</span>
                  <div className="arena-rounds" aria-hidden="true">{Array.from({length:7},(_,i)=><b key={i} data-won={i<snapshot.state.scoreA}/>)}</div>
                </div>
                <div className="arena-score-module"><small>FIRST TO SEVEN</small><div className="score">
                  <span>{String(snapshot.state.scoreA).padStart(2, "0")}</span>
                  <i>:</i>
                  <span>{String(snapshot.state.scoreB).padStart(2, "0")}</span>
                </div></div>
                <div className="player-label right">
                  <Avatar index={lobby.profiles.find(p => p.player.toLowerCase() === snapshot.b.toLowerCase())?.avatar || 0}/>
                  <small>PLAYER 02</small>
                  <span>{name(snapshot.b)}</span>
                  <div className="arena-rounds" aria-hidden="true">{Array.from({length:7},(_,i)=><b key={i} data-won={i<snapshot.state.scoreB}/>)}</div>
                </div>
              </div>
              <div className="rooms-canvas">
                {snapshot.state.awaitingServe && <div className="rooms-serve-status" role="status">{snapshot.clock<snapshot.state.resumeAt ? `Next rally in ${Math.ceil(Number(snapshot.state.resumeAt-snapshot.clock)/1e6)}s` : "Waiting for the betting checkpoint"}</div>}
                <Court
                  liveEngine
                  state={snapshot.state}
                  clock={snapshot.clock}
                  observedAt={snapshot.observedAt}
                  direction={direction}
                  side={side}
                  replay={!active}
                  matchId={`interlude:10143:${roomsManifest.app}:${snapshot.id}`}
                  controllable={canPlay}
                  pending={!!lane.current?.inputPending}
                  confirmedNonce={
                    side === 0 ? snapshot.nonceA : snapshot.nonceB
                  }
                  onStats={setFps}
                />
              </div>
              <div className="rooms-court-controls">
                <span>
                  {side >= 0
                    ? "W / S · ↑ / ↓"
                    : `YOUR TURN ${Math.max(
                        1,
                        room.members
                          .filter((m) => !m.away)
                          .sort((a, b) => a.position - b.position)
                          .findIndex(
                            (m) => m.player === account?.toLowerCase(),
                          ) + 1,
                      )}`}
                </span>
                {active && side >= 0 ? (
                  <div className="touch-controls">
                    {([-1, 1] as const).map((d) => (
                      <IconButton
                        key={d}
                        icon={d === -1 ? "up" : "down"}
                        aria-label={d === -1 ? "Move up" : "Move down"}
                        disabled={!canPlay}
                        onPointerDown={(e) => {
                          e.currentTarget.setPointerCapture(e.pointerId);
                          move(d);
                        }}
                        onPointerUp={() => move(0)}
                        onPointerCancel={() => move(0)}
                        onLostPointerCapture={() => move(0)}
                      />
                    ))}
                  </div>
                ) : (
                  snapshot.phase === 3 && (
                    <button onClick={() => setShowResultKey((n) => n + 1)}>
                      View result
                    </button>
                  )
                )}
              </div>
            </section>
          ) : (
            <section className="rooms-entry">
              <span className="rooms-choice-icon">
                <ChoiceIcon kind="room" />
              </span>
              <h1>
                {room.status === "capacity"
                  ? "Waiting for an arena"
                  : me?.away
                    ? "Take your next turn"
                    : "Bring a rival."}
              </h1>
              <div className="rooms-member-strip">
                {room.members.map((m) => (
                  <span key={m.player}>
                    <Avatar
                      index={
                        lobby.profiles.find((p) => p.player === m.player)
                          ?.avatar
                      }
                    />
                    {name(m.player)}
                  </span>
                ))}
              </div>
              <div className="rooms-button-row">
                {me?.away ? (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await roomsAction("rooms/rejoin");
                        await refresh();
                      })
                    }
                  >
                    Rejoin queue
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void run(() => openContacts("contacts"))}
                  >
                    Invite someone
                  </button>
                )}
                <button disabled={busy} onClick={() => void run(leave)}>
                  Back
                </button>
              </div>
              {lobby.outbox.some((i) => i.room === room.id) && (
                <small>
                  {lobby.outbox
                    .filter((i) => i.room === room.id)
                    .map((i) => `${short(i.recipient)} · ${i.status}`)
                    .join(" / ")}
                </small>
              )}
            </section>
          )}
        </>
      ) : null}
      <Outcome
        id={
          snapshot
            ? `interlude:10143:${roomsManifest.app}:${snapshot.id}`
            : null
        }
        match={
          snapshot
            ? {
                status: snapshot.phase,
                playerA: snapshot.a,
                playerB: snapshot.b,
                winner: snapshot.winner,
                state: snapshot.state,
                ranked: offer?.ranked,
                mode: offer?.mode || 0,
                ratingFinalized: true,
              }
            : null
        }
        account={account || ""}
        rating={lobby.rating?.live.elo ?? null}
        sound
        replay={false}
        confirmation="engine"
        showResultKey={showResultKey}
        rematch={async () => {
          await roomsAction("rooms/rejoin");
          await refresh();
        }}
        againLabel={
          room?.kind === "group" ? "Back to room" : "Find another opponent"
        }
        again={() => {
          if (room?.kind !== "group") void run(another);
        }}
      />
      {panel === "connect" && (
        <RoomsModal {...modalProps} title="Connect">
          <button
            className="primary"
            disabled={busy}
            onClick={() => void login()}
          >
            {saved ? `Continue as ${short(saved)}` : "Use a passkey"}
          </button>
          <button disabled={busy} onClick={() => void login(false, true)}>
            Use another passkey
          </button>
          <button disabled={busy} onClick={() => void login(true)}>
            Create a passkey
          </button>
        </RoomsModal>
      )}
      {panel === "account" && account && (
        <RoomsModal {...modalProps} title="Your account">
          <p className="rooms-address">{account}</p>
          <button onClick={() => void copy(account)}>Copy address</button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await roomsAction("profile", { handle, avatar });
                await refresh();
                setNotice("Profile saved");
              });
            }}
          >
            <label>
              Username
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                minLength={3}
                maxLength={20}
                required
                pattern="[A-Za-z][A-Za-z0-9_]{2,19}"
                title="3 to 20 letters, numbers or underscores, starting with a letter"
                autoComplete="off"
              />
            </label>
            <AvatarPicker value={avatar} disabled={busy} onChange={setAvatar} />
            <button className="primary" disabled={busy}>
              Save profile
            </button>
          </form>
          <button disabled={busy} onClick={() => void run(disconnect)}>
            Disconnect
          </button>
          <button
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await disconnect();
                forgetAccount();
                setSaved(undefined);
              });
            }}
          >
            Forget this account
          </button>
          {roomsChaos && <button onClick={()=>openPanel("market")}>Betting credit & wallet</button>}
          <a href="/legacy" target="_blank" rel="noreferrer">Previous balances & notebook ↗</a>
        </RoomsModal>
      )}
      {(panel === "contacts" || panel === "create") && (
        <RoomsModal
          {...modalProps}
          title={panel === "create" ? "Create room" : "Invite someone"}
          >
            <p>{mode === 1 ? "Chaos" : "Classic"} · Friendly</p>
          <label>
            Username or address
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
              placeholder="Find a rival"
            />
          </label>
          <div className="rooms-contact-list">
            {players.map((p) => (
              <div key={p.player} className="rooms-contact">
                <Avatar index={p.avatar} />
                <span>
                  <strong>{p.handle || short(p.player)}</strong>
                  <small>
                    {frequent.find((x) => x.player === p.player)?.count
                      ? `${frequent.find((x) => x.player === p.player)?.count} recent matches`
                      : short(p.player)}
                  </small>
                </span>
                {panel === "create" ? (
                  <button
                    aria-pressed={selected.includes(p.player)}
                    disabled={
                      busy ||
                      (selected.length >= 7 && !selected.includes(p.player))
                    }
                    onClick={() =>
                      setSelected((v) =>
                        v.includes(p.player)
                          ? v.filter((x) => x !== p.player)
                          : [...v, p.player],
                      )
                    }
                  >
                    {selected.includes(p.player) ? "Selected" : "Select"}
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => void run(() => invitePlayer(p.player))}
                  >
                    Invite
                  </button>
                )}
                <button
                  aria-label={`${contacts.some((x) => x.player === p.player) ? "Remove" : "Save"} contact ${p.handle || short(p.player)}`}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await roomsAction(
                        contacts.some((x) => x.player === p.player)
                          ? "contacts/remove"
                          : "contacts/add",
                        { player: p.player },
                      );
                      const r = await roomsApi("/interlude/contacts");
                      setContacts(r.contacts);
                    })
                  }
                >
                  {contacts.some((x) => x.player === p.player)
                    ? "Saved ✓"
                    : "Save"}
                </button>
              </div>
            ))}
          </div>
          {!players.length && (
            <p>
              Your contacts and recent rivals appear here. Find someone by
              username or address.
            </p>
          )}
          {panel === "create" && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void run(createRoom)}
            >
              Create room{" "}
              {selected.length > 0 ? `· ${selected.length} invited` : ""}
            </button>
          )}
        </RoomsModal>
      )}
      {panel === "members" && room && (
        <RoomsModal {...modalProps} title="Room members">
          <ol className="rooms-member-list">
            {room.members.map((m) => (
              <li key={m.player}>
                <Avatar
                  index={
                    lobby.profiles.find((p) => p.player === m.player)?.avatar
                  }
                />
                <span>
                  {name(m.player)}
                  <small>
                    {m.away
                      ? "Away"
                      : offer && [offer.a, offer.b].includes(m.player)
                        ? "At the cabinet"
                        : "In queue"}
                    {m.player === room.host ? " · Host" : ""}
                  </small>
                </span>
                <button onClick={() => void copy(m.player)}>
                  Copy address
                </button>
              </li>
            ))}
          </ol>
          <button onClick={() => void run(() => openContacts("contacts"))}>
            Invite someone
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await roomsAction("rooms/rejoin");
                await refresh();
                setPanel(null);
              })
            }
          >
            Rejoin queue
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await leave();
                setPanel(null);
              })
            }
          >
            Leave room
          </button>
        </RoomsModal>
      )}
      {panel === "tools" && (
        <RoomsModal {...modalProps} title="Cabinet tools">
          <dl>
            <dt>Engine response</dt>
            <dd>{latency} ms</dd>
            <dt>Rendering</dt>
            <dd>{fps} FPS</dd>
            <dt>Game service</dt>
            <dd>{online ? "Online" : "Reconnecting"}</dd>
          </dl>
          <p>
            Live scores and ratings appear before their published copy on Monad.
            Committed batches remain subject to challenges.
          </p>
          {lobby.rating && (
            <p>
              ELO live {lobby.rating.live.elo} · Monad{" "}
              {lobby.rating.published.elo}
            </p>
          )}
          {active && side >= 0 && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await lane.current!.action("concede", [snapshot!.id]);
                  await refresh();
                  setPanel(null);
                })
              }
            >
              Concede
            </button>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await leave();
                setPanel(null);
              })
            }
          >
            Leave room
          </button>
          <MusicCredit />
        </RoomsModal>
      )}
      {panel === "market" && account && <RoomsModal {...modalProps} title="Betting & wallet"><RoomsMarketPanel player={account} matchId={room?.mode===1?offer?.id:undefined} onBusy={value=>{busyRef.current=value;setBusy(value);}}/></RoomsModal>}
      {panel === "more" && (
        <RoomsModal {...modalProps} title="Around the arcade">
          <button onClick={() => void ensure(() => openContacts("contacts"))}>
            Contacts
          </button>
          <a href="/legacy">V4 arcade · Chaos, tournaments & betting ↗</a>
          <a href="/labs/interlude">Previous practice arena ↗</a>
          <a href="/docs" target="_blank" rel="noreferrer">
            Documentation ↗
          </a>
          <MusicCredit />
        </RoomsModal>
      )}
      {panel === "ladder" && (
        <RoomsModal {...modalProps} title="Ranking">
          <div className="control-segments ranking-modes" role="group" aria-label="Ranking mode">
            <button aria-pressed={rankMode === "classic"} onClick={() => setRankMode("classic")}>Classic</button>
            <button aria-pressed={rankMode === "chaos"} onClick={() => setRankMode("chaos")}>Chaos</button>
            <button aria-pressed={rankMode === "previous"} onClick={() => setRankMode("previous")}>Previous Classic</button>
          </div>
          <p>{rankMode === "classic" ? (roomsChaos ? "Classic ratings carried forward" : "Current season · Starting ELO 1000") : rankMode === "chaos" && roomsChaos ? "Chaos season · Starting ELO 1000" : "Original arena ratings"}</p>
          {!rankLoading && !rankError && ladder.some(p=>p.player.toLowerCase()===account?.toLowerCase()) && <p className="rooms-own-elo">Your ELO <strong>{ladder.find(p=>p.player.toLowerCase()===account?.toLowerCase())?.elo}</strong></p>}
          {rankError ? <p role="alert">{rankError} <button onClick={() => setRankReload(x => x + 1)}>Retry</button></p> : rankLoading ? <p role="status">Loading rankings…</p> : ladder.length ? (
            <div className="ranking-scroll">
            <table>
              <caption className="sr-only">{rankMode} ELO rankings</caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th>Player</th>
                  <th>ELO</th>
                  <th>Wins</th>
                </tr>
              </thead>
              <tbody>
                {ladder.map((p, i) => (
                  <tr key={p.player}>
                    <td>{i + 1}</td>
                    <td><span className="ranking-player"><Avatar index={p.avatar} /><span title={p.player}>{p.handle || short(p.player)}</span></span></td>
                    <td><strong>{p.elo}</strong>{p.published && <small className="ranking-settled">{p.live?'Published: '+p.published.elo:'Published copy · Live unavailable'}</small>}</td>
                    <td>{p.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <p>No ranked results yet. Find your first rival.</p>
          )}
          {(rankMode === "classic" || roomsChaos && rankMode === "chaos") && <small>Published ratings are the latest onchain copy and remain subject to the challenge period.</small>}
        </RoomsModal>
      )}
      {!active && <footer className="rooms-powered"><EngineCredit /></footer>}
      {copyText && (
        <Dialog label="Copy manually" onClose={() => setCopyText("")}>
          <IconButton aria-label="Close copy" onClick={() => setCopyText("")} />
          <h2>Copy manually</h2>
          <input
            aria-label="Copy value"
            readOnly
            value={copyText}
            onFocus={(e) => e.target.select()}
          />
        </Dialog>
      )}
    </main>
  );
}
