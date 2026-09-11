"use client";
import { useEffect, useRef, useState } from "react";
import { formatEther, parseEther, type Address, type Hex } from "viem";
import { connect, rememberedAccount } from "../lib/wallet";
import { roomsApi, roomsManifest } from "../lib/interlude-rooms";
import { waitJob } from "../lib/api";
import { betTypes, withdrawTypes, domain } from "../../shared/protocol";
import { roomsCreditMessage } from "../../shared/rooms-pressure";
import styles from "./RoomsMarketPanel.module.css";
const mon = (v: string | bigint | undefined) =>
  v === undefined
    ? "…"
    : Number(formatEther(BigInt(v))).toLocaleString("en", {
        maximumFractionDigits: 6,
      });
export function RoomsMarketPanel({
  player,
  matchId: initialMatchId,
  onBusy,
}: {
  player: Address;
  matchId?: string;
  onBusy: (busy: boolean) => void;
}) {
  const [matchId, setMatchId] = useState(initialMatchId),
    [transaction, setTransaction] = useState<string>();
  useEffect(() => {
    setMatchId(initialMatchId);
    setMarket(undefined);
    setTransaction(undefined);
  }, [initialMatchId, player]);
  const [account, setAccount] = useState<any>(),
    [accounts, setAccounts] = useState<any[]>([]),
    [selectedFinance, setSelectedFinance] = useState<string>(),
    [market, setMarket] = useState<any>(),
    [side, setSide] = useState<0 | 1>(0);
  const [shares, setShares] = useState("0.001"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const inFlight = useRef(false),
    mounted = useRef(true),
    readSequence = useRef(0);
  const lastAccountRead = useRef({ player: "", at: 0, value: null as any });
  const readTask = useRef<Promise<void> | null>(null);
  const quantity = (() => {
    try {
      return parseEther(shares);
    } catch {
      return 0n;
    }
  })();
  async function refresh(force = false) {
    if (readTask.current) {
      await readTask.current.catch(() => {});
      if (force) return refresh(true);
      return;
    }
    const work = (async () => {
      const sequence = ++readSequence.current;
      let a =
        lastAccountRead.current.player === player
          ? lastAccountRead.current.value
          : null;
      if (force || !a || Date.now() - lastAccountRead.current.at > 10000) {
        a = await roomsApi("/interlude/finance");
        lastAccountRead.current = { player, at: Date.now(), value: a };
      }
      const q = matchId
        ? await roomsApi(
            `/interlude/markets/${matchId}?side=${side}&shares=${quantity > 0n ? quantity : 1n}`,
          )
        : null;
      if (mounted.current && sequence === readSequence.current) {
        const available=[a,...(a.archives||[])];
        const target=q ? q.manifest.financeId||"" : selectedFinance??a.manifest.financeId??"";
        const selectedAccount=available.find(x=>(x.manifest.financeId||"")===target);
        if(!selectedAccount)throw new Error("Betting account unavailable. Refresh before signing.");
        setAccounts(available);
        setAccount(selectedAccount);
        setMarket(
          q ? { ...q, quoteSide: side, quoteShares: String(quantity) } : null,
        );
      }
    })();
    readTask.current = work;
    try {
      await work;
    } finally {
      if (readTask.current === work) readTask.current = null;
    }
  }
  useEffect(() => {
    mounted.current = true;
    let stopped = false;
    const poll = async () => {
      try {
        await refresh();
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    const first = setTimeout(() => void poll(), 200);
    const t = setInterval(() => {
      if (!document.hidden && !inFlight.current) void poll();
    }, 2500);
    return () => {
      stopped = true;
      mounted.current = false;
      readSequence.current++;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [player, matchId, side, shares, selectedFinance]);
  async function perform(action: () => Promise<any>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      const job = await action();
      setNotice("Transaction submitted. Waiting for confirmation…");
      const receipt = await waitJob(job.id);
      if (mounted.current) {
        setTransaction(receipt.tx_hash);
        await refresh(true);
        setNotice("Confirmed on Monad.");
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      inFlight.current = false;
      onBusy(false);
      if (mounted.current) setBusy(false);
    }
  }
  async function sign<T>(
    operation: (
      wallet: Awaited<ReturnType<typeof connect>>["account"],
    ) => Promise<T>,
  ) {
    const identity = await connect(
      false,
      false,
      rememberedAccount()?.credential,
    );
    try {
      if (!mounted.current) throw new Error("Action cancelled.");
      if (identity.account.address.toLowerCase() !== player.toLowerCase())
        throw new Error(
          "This passkey belongs to another account. Reconnect with the current player's passkey.",
        );
      return await operation(identity.account);
    } finally {
      identity.end();
    }
  }
  const participant =
    !!market &&
    [market.result[0], market.result[1]].some(
      (p) => p.toLowerCase() === player.toLowerCase(),
    );
  const blocksLeft = market
    ? (BigInt(market.window[1]) >> 8n) - BigInt(market.head)
    : 0n;
  const open = !!market?.window[0] && blocksLeft > 0n,
    cost =
      market?.quote === null ||
      market?.quoteSide !== side ||
      market?.quoteShares !== String(quantity)
        ? null
        : BigInt(market?.quote || 0),
    maxCost = cost === null ? 0n : cost + (cost * 3n) / 100n + 1n;
  const position = market?.position,
    paid = BigInt(position?.[2] || 0),
    claimed = !!position?.[3],
    payout = market?.payout;
  async function buy() {
    if (!account || !matchId || !open || participant || !cost || quantity <= 0n)
      throw new Error("This market is not open for your bet.");
    const version = BigInt(market.window[1]),
      cap = maxCost,
      amount = quantity,
      selected = side;
    return sign(async (wallet) => {
      const financeId=market.manifest.financeId||"";
      const fresh = await roomsApi(`/interlude/finance?financeId=${encodeURIComponent(financeId)}`);
      const bet = {
        player,
        matchId: BigInt(matchId),
        side: selected,
        shares: amount,
        maxCost: cap,
        version,
        nonce: BigInt(fresh.marketNonce),
        deadline: BigInt(Math.floor(Date.now() / 1000) + 90),
      };
      const signature = await wallet.signTypedData({
        domain: domain("PONG Market", 10143, fresh.manifest.market),
        types: betTypes,
        primaryType: "Bet",
        message: bet,
      });
      return roomsApi("/interlude/finance/buy", { bet, signature, financeId });
    });
  }
  return (
    <section className={styles.panel}>
      {accounts.length>1 && <label>Betting account
        <select aria-label="Betting account" value={account?.manifest.financeId||""} disabled={busy} onChange={e=>{setSelectedFinance(e.target.value);setMatchId(undefined);setMarket(undefined);}}>
          {accounts.map(a=><option key={a.manifest.market} value={a.manifest.financeId||""}>{a.manifest.settlement ? "Current · Early testnet payouts" : "Previous · Finalized payouts"} · {mon(a.balance)} MON</option>)}
        </select>
      </label>}
      <div className="rooms-finance-balances">
        <div>
          <span>Wallet balance</span>
          <strong>{mon(account?.walletBalance)} MON</strong>
        </div>
        <div>
          <span>Betting credit</span>
          <strong>{mon(account?.balance)} MON</strong>
        </div>
      </div>
      <p>
        Test MON only. Betting credit is separate from your wallet and your
        previous arena balances.
      </p>
      {!!account?.history?.length && (
        <details>
          <summary>Your recent positions</summary>
          <div className="rooms-finance-actions">
            {account.history.map((h: any) => (
              <button
                key={h.id}
                disabled={busy}
                aria-pressed={matchId === h.id}
                onClick={() => {
                  setMarket(undefined);
                  setMatchId(h.id);
                }}
              >
                Match …{h.id.slice(-6)} · {h.phase >= 3 ? "Result" : "In play"}
              </button>
            ))}
          </div>
        </details>
      )}
      {matchId && market && (
        <>
          <div className="rooms-market-status" role="status">
            {open ? "Bets open" : "Bets closed"}
            <span>
              {open
                ? `${blocksLeft} blocks left`
                : market.terminal
                  ? "Match finished"
                  : "Between rallies"}
            </span>
          </div>
          <p>
            Each betting window lasts about 12 seconds. The next rally waits for
            the confirmed betting cutoff.
          </p>
          <p>
            Supporting a player can shrink their paddle for the next rally. The
            testnet bridge on PONGIT's VPS attests paid bets.
          </p>
          {participant ? (
            <p>You cannot bet on your own match.</p>
          ) : (
            <>
              <div
                className="control-segments"
                role="group"
                aria-label="Back a player"
              >
                <button
                  disabled={busy}
                  aria-pressed={side === 0}
                  onClick={() => setSide(0)}
                >
                  Player 01
                </button>
                <button
                  disabled={busy}
                  aria-pressed={side === 1}
                  onClick={() => setSide(1)}
                >
                  Player 02
                </button>
              </div>
              <label>
                Winning shares (1 share = 1 MON)
                <input
                  inputMode="decimal"
                  value={shares}
                  disabled={busy}
                  onChange={(e) => setShares(e.target.value)}
                />
              </label>
              <dl className="rooms-bet-quote">
                <div>
                  <dt>Estimated cost</dt>
                  <dd>{cost === null ? "Unavailable" : mon(cost)} MON</dd>
                </div>
                <div>
                  <dt>Signed maximum</dt>
                  <dd>{mon(maxCost)} MON</dd>
                </div>
                <div>
                  <dt>Payout if this player wins</dt>
                  <dd>{mon(quantity)} MON</dd>
                </div>
              </dl>
              <button
                className="primary"
                disabled={
                  busy ||
                  !open ||
                  cost === null ||
                  quantity <= 0n ||
                  BigInt(account?.balance || 0) < maxCost
                }
                onClick={() => void perform(buy)}
              >
                Confirm bet with passkey
              </button>
            </>
          )}
          <p>
            {market.settlementPolicy==="early-published-testnet"
              ? "Testnet payouts use the first Interlude result published on Monad, without waiting for the challenge period. Later disputes are logged; completed payments are not reversed."
              : "These previous markets pay after delegation closure and the challenge period. Their balances remain separate."}
          </p>
          {paid > 0n && (
            <div className="rooms-position">
              <strong>
                {claimed
                  ? payout?.[2] === 1
                    ? "Payment delayed"
                    : BigInt(payout?.[1] || 0) > 0n
                      ? "Paid to your wallet"
                      : "Losing position · No payout"
                  : market.result[3] >= 3
                    ? "Payment pending"
                    : market.terminal
                      ? market.settlementPolicy==="early-published-testnet" ? "Waiting for result publication" : "Result awaiting finality"
                      : "Position open"}
              </strong>
              <span>Paid: {mon(paid)} MON</span>
              {market.payment?.tx_hash && (
                <a
                  href={`https://testnet.monadexplorer.com/tx/${market.payment.tx_hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Payment transaction ↗
                </a>
              )}
              {payout?.[2] === 1 && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(() =>
                      roomsApi("/interlude/finance/retry", { id: matchId }),
                    )
                  }
                >
                  Retry payment
                </button>
              )}
            </div>
          )}
        </>
      )}
      {account && (
        <div className="rooms-finance-actions">
          <button
            disabled={busy}
            onClick={() =>
              void perform(() =>
                sign(async (wallet) => {
                  const expires = Math.floor(Date.now() / 1000) + 240;
                  const signature = await wallet.signMessage({
                    message: roomsCreditMessage(
                      player,
                      roomsManifest.app,
                      expires,
                    ),
                  });
                  return roomsApi("/interlude/finance/credit", {
                    expires,
                    signature,
                    financeId:account.manifest.financeId||"",
                  });
                }),
              )
            }
          >
            Get test betting credit
          </button>
          <button
            disabled={busy || BigInt(account.balance) === 0n}
            onClick={() =>
              void perform(() =>
                sign(async (wallet) => {
                  const financeId=account.manifest.financeId||"";
                  const fresh = await roomsApi(`/interlude/finance?financeId=${encodeURIComponent(financeId)}`),
                    amount = BigInt(fresh.balance),
                    nonce = BigInt(fresh.nonce),
                    deadline = BigInt(Math.floor(Date.now() / 1000) + 90);
                  if (amount === 0n)
                    throw new Error("No betting credit to withdraw.");
                  const signature = await wallet.signTypedData({
                    domain: domain("PONG Vault", 10143, fresh.manifest.vault),
                    types: withdrawTypes,
                    primaryType: "Withdraw",
                    message: {
                      player,
                      recipient: player,
                      amount,
                      nonce,
                      deadline,
                    },
                  });
                  return roomsApi("/interlude/finance/withdraw", {
                    financeId,
                    player,
                    recipient: player,
                    amount,
                    nonce,
                    deadline,
                    signature,
                  });
                }),
              )
            }
          >
            Withdraw credit to wallet
          </button>
          <a href="/legacy" target="_blank" rel="noreferrer">
            Previous balances ↗
          </a>
        </div>
      )}
      {busy && <p role="status">Confirming your action…</p>}
      {notice && <p role="status">{notice}</p>}
      {transaction && (
        <a
          href={`https://testnet.monadexplorer.com/tx/${transaction}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction ↗
        </a>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            disabled={busy}
            onClick={() => {
              setError("");
              void refresh(true).catch((e) => setError(e.message));
            }}
          >
            Refresh
          </button>
        </p>
      )}
    </section>
  );
}
