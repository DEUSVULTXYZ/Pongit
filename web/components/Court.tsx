"use client";
import { useEffect, useRef } from "react";
import { arcadeAudio } from "../lib/audio";
import { move, SCALE, type State } from "../../shared/physics-v2";
import { predictPaddle, boundedClock, projectConfirmed, projectLive, type PendingInput } from "../lib/presentation";
import { LivePaddle, LiveClock } from "../lib/live-paddle";
import { createCourtSurface } from "../lib/court-art";
import { BallTrail } from "../lib/ball-trail";
type Props = {
  state: State | null;
  clock: bigint;
  observedAt: number;
  direction: number;
  side: number;
  replay: boolean;
  matchId: string;
  controllable: boolean;
  pending: boolean;
  pendingInputs?: PendingInput[];
  confirmedNonce?: bigint;
  debug?: boolean;
  liveEngine?: boolean;
  onNetwork?:(age:number,correction:number)=>void;
  onStats: (fps: number, extrapolated: boolean, waiting: boolean) => void;
};
export function Court({
  state,
  clock,
  observedAt,
  direction,
  side,
  replay,
  matchId,
  controllable,
  pending,
  onStats, pendingInputs = [], confirmedNonce = 0n, debug = false, liveEngine = false, onNetwork = ()=>{},
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef({
    state,
    clock,
    observedAt,
    direction,
    side,
    replay,
    matchId, controllable, pending,
    onStats, pendingInputs, confirmedNonce, debug, liveEngine, onNetwork,
  });
  current.current = {
    state,
    clock,
    observedAt,
    direction,
    side,
    replay,
    matchId, controllable, pending,
    onStats, pendingInputs, confirmedNonce, debug, liveEngine, onNetwork,
  };
  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const surface = createCourtSurface();
    const trail = new BallTrail();
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    // Paint all bevels inside the existing rectangles: appearance never enlarges a hitbox.
    function prism(x: number, y: number, w: number, h: number, face: CanvasGradient | string, light: string, dark: string) {
      const b = Math.min(2.5, w / 5, h / 5);
      ctx.fillStyle = face;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = light;
      ctx.fillRect(x, y, w, b);
      ctx.fillRect(x, y, b, h);
      ctx.fillStyle = dark;
      ctx.fillRect(x + w - b, y + b, b, h - b);
      ctx.fillRect(x + b, y + h - b, w - b, b);
    }
    const leftFace = ctx.createLinearGradient(22, 0, 34, 0);
    leftFace.addColorStop(0, "#bbfaff"); leftFace.addColorStop(.35, "#5de9ff"); leftFace.addColorStop(1, "#269ed0");
    const rightFace = ctx.createLinearGradient(990, 0, 1002, 0);
    rightFace.addColorStop(0, "#f2d5ff"); rightFace.addColorStop(.35, "#db9cfc"); rightFace.addColorStop(1, "#9753dc");
    const fontFamily=getComputedStyle(document.body).fontFamily;
    let previousSound:{vx:bigint;vy:bigint;score:number;time:number}|null=null;
    let frame = 0,
      count = 0,
      last = performance.now();
    let lastDraw = last, visualY: number | null = null, context = "";
    let anchor=last,anchorObserved=0,anchorAge=0,localDirection=0,localAt=last,correction=0;
    const livePaddle = new LivePaddle(), liveClock = new LiveClock();
    function draw(now: number) {
      const p = current.current;
      const identity = `${p.matchId}:${p.side}:${p.replay}:${p.liveEngine}`;
      if (identity !== context) { trail.reset(); previousSound=null; context = identity; visualY = null; livePaddle.reset(); liveClock.reset(); anchorObserved=0; localDirection=p.direction; localAt=now; }
      const dt = Math.max(0, Math.min(50, now - lastDraw));
      lastDraw = now;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const width = el.clientWidth;
      const height = (width * 576) / 1024;
      if (el.width !== Math.round(width * dpr)) {
        el.width = Math.round(width * dpr);
        el.height = Math.round(height * dpr);
      }
      ctx.setTransform(el.width / 1024, 0, 0, el.height / 576, 0, 0);
      ctx.drawImage(surface, 0, 0);
      let s = p.state;
      if(anchorObserved!==p.observedAt){anchorObserved=p.observedAt;anchor=now;anchorAge=Math.max(0,Date.now()-p.observedAt);}
      if(localDirection!==p.direction){localDirection=p.direction;localAt=now;}
      const timing=boundedClock(p.clock,anchorAge,now-anchor);
      const target=p.replay?p.clock:p.liveEngine?liveClock.sample(timing.target):timing.target;
      let waiting = false;
      if (s) {
        const projected = p.replay ? { state: s, waiting: false }
          : p.liveEngine ? projectLive(s, target) : projectConfirmed(s, target);
        s = projected.state;
        waiting = projected.waiting || timing.stale;
      }
      let yA = s ? Number(s.left) / Number(SCALE) : 288,
        yB = s ? Number(s.right) / Number(SCALE) : 288;
      if (p.state && !p.replay && target > p.state.t) {
        // Paddles keep moving along their confirmed directions even while the
        // ball waits at an unresolved impact; their bounds are independent.
        const paddles = move(p.state, target);
        yA = Number(paddles.left) / Number(SCALE);
        yB = Number(paddles.right) / Number(SCALE);
      }
      const halfA=Number(s?.halfA || 48000000n)/1e6, halfB=Number(s?.halfB || 48000000n)/1e6;
      const half=p.side===0?halfA:halfB;
      const confirmedY = p.side === 0 ? yA : yB;
      if (s && !s.awaitingServe && (p.controllable || p.liveEngine) && !p.replay && p.side >= 0) {
        if (p.liveEngine) {
          const owner = livePaddle.step(confirmedY, p.controllable ? p.direction : 0,
            p.side === 0 ? p.state!.leftDir : p.state!.rightDir,
            half, dt, timing.stale || !p.controllable, p.pending);
          visualY = owner.y; correction = owner.correction;
        } else {
        const initialY=Number(p.side===0?p.state!.left:p.state!.right)/1e6;
        const confirmedDir=p.side===0?p.state!.leftDir:p.state!.rightDir;
        const intentions=p.pendingInputs.filter(i=>i.nonce>p.confirmedNonce).map(i=>({...i,at:p.clock+BigInt(Math.floor((i.at-anchor+anchorAge)*1000))}));
        // The key event is rendered immediately, even before its signature ACK.
        const latest=intentions.at(-1);
        if((latest?.direction??confirmedDir)!==p.direction)intentions.push({nonce:(latest?.nonce??p.confirmedNonce)+1n,direction:p.direction,at:p.clock+BigInt(Math.floor((localAt-anchor+anchorAge)*1000))});
        const rebuilt=predictPaddle(initialY,confirmedDir,half,p.state!.t,target,p.confirmedNonce,intentions);
        // A bounded correction prevents independent drift from accumulating.
        // New keyboard input still changes the reconstruction on this frame.
        const desired=Math.max(confirmedY-108,Math.min(confirmedY+108,rebuilt));
        correction=visualY===null?0:Math.abs(desired-visualY);
        visualY=visualY===null?desired:visualY+(desired-visualY)*(1-Math.exp(-dt/60));
        if(Math.abs(desired-visualY)>54)visualY=desired;
        }
        if(p.side===0)yA=visualY;else yB=visualY;
        if(p.debug && Math.abs(visualY-confirmedY)>3){ctx.strokeStyle="#738497";ctx.strokeRect(p.side===0?22:990,confirmedY-half,12,2*half);}
      } else { visualY = null; livePaddle.reset(); }
      if (s) {
        const points = trail.sample({ x: Number(s.x) / 1e6, y: Number(s.y) / 1e6,
          at: now, clock: s.t, rally: `${p.matchId}:${s.scoreA}:${s.scoreB}` },
          !reducedMotion.matches && !s.finished && !s.awaitingServe);
        ctx.save();
        for (const point of points) {
          const size = 3 + 6 * point.strength;
          ctx.globalAlpha = .42 * point.strength;
          ctx.fillStyle = point.strength > .55 ? "#84efff" : "#b68aff";
          ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
        }
        ctx.restore();
      } else trail.reset();
      prism(22, yA - halfA, 12, halfA*2, leftFace, "#e0ffff", "#357787");
      prism(990, yB - halfB, 12, halfB*2, rightFace, "#f3e8ff", "#67478b");
      if(s?.awaitingServe && !s.finished) {
        const remaining=Math.max(0,Number(s.resumeAt-p.clock)/1e6);
        ctx.fillStyle="#e5e1ff";ctx.textAlign="center";ctx.font=`30px ${fontFamily}`;
        ctx.fillText(remaining>0?remaining.toFixed(1):"SYNCING SERVE",512,230);
        ctx.font=`12px ${fontFamily}`;ctx.fillText("CHAOS / NEXT RALLY",512,190);ctx.textAlign="left";
      }
      if(s && !p.replay && !document.hidden){
        const score=s.scoreA+s.scoreB;
        if(previousSound && now-previousSound.time<100 && score===previousSound.score && (s.vx!==previousSound.vx || s.vy!==previousSound.vy))arcadeAudio.play("bounce",`${p.matchId}:impact:${p.state?.t}:${s.vx}:${s.vy}`);
        if(s.awaitingServe){const count=Math.ceil(Math.max(0,Number(s.resumeAt-target)/1e6));if(count>0 && count<=3)arcadeAudio.play("countdown",`${p.matchId}:count:${s.resumeAt}:${count}`);}
        previousSound={vx:s.vx,vy:s.vy,score,time:now};
      } else previousSound=null;
      if (s) {
        prism(Number(s.x) / 1e6 - 6, Number(s.y) / 1e6 - 6, 12, 12, "#f3fcff", "#fff", "#9eafb9");
      } else {
        ctx.strokeStyle = "#777";
        ctx.strokeRect(506, 282, 12, 12);
      }
      if (p.debug) {
      ctx.fillStyle = "#697a8f";
      ctx.font = `10px ${fontFamily}`;
      ctx.fillText("0,0", 12, 20);
      ctx.fillText("1024 × 576", 912, 560);
      }
      count++;
      if (now - last > 1000) {
        p.onNetwork(timing.ageMs,correction);
        p.onStats(
          Math.round((count * 1000) / (now - last)),
          !!s && !p.replay && target > (p.state?.t || 0n),
          waiting,
        );
        count = 0;
        last = now;
      }
      frame = requestAnimationFrame(draw);
    }
    const visibility=()=>{cancelAnimationFrame(frame);trail.reset();if(!document.hidden){last=lastDraw=performance.now();count=0;previousSound=null;frame=requestAnimationFrame(draw);}};
    document.addEventListener("visibilitychange",visibility);
    if(!document.hidden)frame = requestAnimationFrame(draw);
    return () => {cancelAnimationFrame(frame);document.removeEventListener("visibilitychange",visibility);};
  }, []);
  return (
    <canvas
      ref={canvas}
      aria-label="Pong court. Use W and S or arrow keys to move your paddle."
      role="img"
    />
  );
}
