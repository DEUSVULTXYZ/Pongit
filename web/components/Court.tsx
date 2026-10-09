"use client";
import {presentationWait,type PresentationWait} from '../lib/presentation-wait';
import { useEffect, useRef, useMemo } from "react";
import {responsiveState,rulesPaddleSpeed} from '../../shared/physics-rules';
import { arcadeAudio } from "../lib/audio";
import { move, SCALE, type State } from "../../shared/physics-v2";
import { predictPaddle, boundedClock, projectConfirmed, projectLive, type PendingInput } from "../lib/presentation";
import { LivePaddle, LiveClock } from "../lib/live-paddle";
import { createCourtSurface } from "../lib/court-art";
import { BallTrail } from "../lib/ball-trail";
import type {ChaosDecoded} from '../../shared/chaos-codec';
import {chaosLegacy} from '../../shared/chaos-codec';
import {chaosEvent,type ChaosEffectState} from '../../shared/chaos-events';
import {projectChaos,eventCanvas,eventPaddles,eventHud,SpectatorChaosProjection} from '../lib/chaos-presentation';
import {drawChaosCourt,drawChaosPaddles,drawChaosBalls,type ChaosCanvasFrame} from '../lib/chaos-canvas';
import {courtSprites} from '../lib/court-sprites';
import {chaosContactResolution} from '../../shared/chaos-rules';
import {SpectatorPlayout,visibleBall} from '../lib/spectator-playout';
import {projectParticipant,projectChaosParticipant,type TimedControl,type HousePrediction} from '../lib/participant-projection';
import {ParticipantReconciliation,participantContinuationTime,participantMotionMs,participantSourceChanged,type ParticipantPose} from '../lib/participant-reconciliation';
import {localMotion,type LocalIntent,type ParticipantPresentationClock} from '../lib/participant-inputs';
function participantPose(state:State,chaos?:ChaosDecoded['physics']):ParticipantPose{
 const paddles=chaos?eventPaddles(chaos):null;
 return {paddles:[Number(state.left)/1e6,Number(state.right)/1e6],
  halves:paddles?[Number(paddles.heightA)/2e6+(paddles.splitA?8:0),Number(paddles.heightB)/2e6+(paddles.splitB?8:0)]:[Number(state.halfA)/1e6,Number(state.halfB)/1e6],
  balls:chaos?chaos.balls.flatMap((b,i)=>b.alive?[{id:i+1,x:Number(b.x)/1e12,y:Number(b.y)/1e12,vx:Number(b.vx),continuity:`${chaos.score.rally}:${b.trailRevision}`}]:[]):
   [{id:1,x:Number(state.x)/1e6,y:Number(state.y)/1e6,vx:Number(state.vx),continuity:`${state.scoreA}:${state.scoreB}`}],
 };
}
export type CourtPlayback={matchId:string;scoreA:number;scoreB:number;gameMs:number;finished:boolean;effects:ChaosEffectState[]};
type Props = {
  state: State | null;
  chaos?:ChaosDecoded;
  rulesVersion?:number;
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
  coherentControls?:readonly TimedControl[];
  confirmedInputRevision?:number;
  housePrediction?:HousePrediction;
  progressionLimit?:bigint;
  debug?: boolean;
  liveEngine?: boolean;
  bufferedSpectator?: boolean;
  externalIntermission?: boolean;
  onNetwork?:(age:number,correction:number)=>void;
  onPlayback?:(frame:CourtPlayback)=>void;
  onInputClock?:(matchId:string,frame:ParticipantPresentationClock)=>void;
  onPaint?:(matchId:string)=>void;
  readIntent?:(processed:bigint)=>{direction:number;controls:readonly TimedControl[];revision:number;local?:readonly LocalIntent[]};
  subscribeIntent?:(listener:()=>void)=>(()=>void);
  onStats: (fps: number, extrapolated: boolean, waiting: boolean,cause?:PresentationWait) => void;
};
export function Court({
  state,
  chaos,
  rulesVersion,
  clock,
  observedAt,
  direction,
  side,
  replay,
  matchId,
  controllable,
  pending,
  onStats, pendingInputs = [], confirmedNonce = 0n, coherentControls,confirmedInputRevision,housePrediction,progressionLimit,debug = false, liveEngine = false, bufferedSpectator = false, externalIntermission = false, onNetwork = ()=>{}, onPlayback = ()=>{}, onInputClock,onPaint,readIntent,subscribeIntent,
}: Props) {
  state=useMemo(()=>state?responsiveState(state,rulesVersion??0):null,[state,rulesVersion]);
  chaos=useMemo(()=>chaos?{...chaos,physics:responsiveState(chaos.physics,rulesVersion??0)}:undefined,[chaos,rulesVersion]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef({
    state,
    chaos,
    rulesVersion,
    clock,
    observedAt,
    direction,
    side,
    replay,
    matchId, controllable, pending,
    onStats, pendingInputs, confirmedNonce,coherentControls,confirmedInputRevision,housePrediction,progressionLimit, debug, liveEngine, bufferedSpectator, externalIntermission, onNetwork, onPlayback, onInputClock,onPaint,readIntent,
  });
  current.current = {
    state,
    chaos,
    rulesVersion,
    clock,
    observedAt,
    direction,
    side,
    replay,
    matchId, controllable, pending,
    onStats, pendingInputs, confirmedNonce,coherentControls,confirmedInputRevision,housePrediction,progressionLimit, debug, liveEngine, bufferedSpectator, externalIntermission, onNetwork, onPlayback, onInputClock,onPaint,readIntent,
  };
  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const surface = createCourtSurface();
    const trail = new BallTrail();
    const chaosTrails=[new BallTrail(),new BallTrail()];
    let seenEffects=new Set<number>(),seenHits=new Set<string>();
    let impacts:NonNullable<ChaosCanvasFrame['impacts']>[number][]=[];
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const sprites = courtSprites(ctx);
    const fontFamily=getComputedStyle(document.body).fontFamily;
    let previousSound:{vx:bigint;vy:bigint;score:number;time:number}|null=null;
    let frame = 0,
      count = 0,
      last = performance.now();
    let lastDraw = last, visualY: number | null = null, context = "";
    let anchor=last,anchorObserved=0,anchorAge=0,localDirection=0,localAt=last,correction=0;
    let played="",playedAt=0,lastWaiting:boolean|undefined,lastCause:PresentationWait|undefined;
    const livePaddle = new LivePaddle(), liveClock = new LiveClock();
    const playout=new SpectatorPlayout(),playerPlayout=new SpectatorPlayout(true);
    const spectatorChaos=new SpectatorChaosProjection();
    const reconciliation=new ParticipantReconciliation();
    const measureControls=sessionStorage.getItem('pongit:measure-controls')==='1';
    let previousParticipant:typeof current.current|undefined,previousTarget=0n;
    let localPaintAt=performance.now();
    function draw(now: number) {
      let p = current.current;
      if(measureControls)el.dataset.frameAt=String(now);
      const paintedAt=performance.now(),priorPaintAt=localPaintAt;localPaintAt=paintedAt;
      let localControls:readonly LocalIntent[]|undefined;
      // Keyboard intent and ACKs are stored outside React. An unrelated render
      // or scoreboard update must never delay the next animation frame.
      if(p.readIntent&&p.state){const intent=p.readIntent(p.state.t);localControls=intent.local;p={...p,direction:intent.direction,coherentControls:intent.controls,confirmedInputRevision:intent.revision};}
      const identity = `${p.matchId}:${p.side}:${p.replay}:${p.liveEngine}:${p.bufferedSpectator}`;
      if (identity !== context) { reconciliation.reset();previousParticipant=undefined;played="";playout.reset();playerPlayout.reset();spectatorChaos.reset();trail.reset();chaosTrails.forEach(t=>t.reset());seenEffects=new Set(p.chaos?.physics.effects.map(e=>e.serial)||[]);seenHits.clear();impacts=[]; previousSound=null; context = identity; visualY = null; livePaddle.reset(); liveClock.reset(); anchorObserved=0; localDirection=p.direction; localAt=now; }
      const coherent=p.coherentControls!==undefined&&p.side>=0&&!p.replay;
      const buffered=(p.bufferedSpectator||p.liveEngine)&&!coherent&&!p.replay&&!!p.state;
      const timeline=p.side>=0?playerPlayout:playout;
      if(buffered)timeline.push({state:p.state!,chaos:p.chaos,at:now-Math.max(0,Date.now()-p.observedAt)});
      const playback=buffered?timeline.sample(now):null;
      if(playback)p={...p,state:playback.frame.state,chaos:playback.frame.chaos,clock:playback.target};
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
      let target=p.replay||playback?p.clock:p.liveEngine?liveClock.sample(timing.target,p.progressionLimit):timing.target;
      if(p.progressionLimit!==undefined&&target>p.progressionLimit)target=p.progressionLimit;
      let waiting = false,pointBoundary=false,contactBoundary=false;
      let drawnBalls:{id:number;x:number;y:number}[]=[];
      const cp=p.chaos?(p.replay?{state:p.chaos.physics,collisions:[],waiting:false}:coherent?projectChaosParticipant(p.chaos.physics,target,p.coherentControls!,chaosContactResolution(p.rulesVersion??10),p.housePrediction,p.rulesVersion===17||p.rulesVersion===18):playback?spectatorChaos.sample(p.chaos.physics,target,chaosContactResolution(p.rulesVersion??10)):projectChaos(p.chaos.physics,target,p.rulesVersion===undefined?undefined:chaosContactResolution(p.rulesVersion))):null;
      if(cp){contactBoundary='contactBoundary' in cp&&!!cp.contactBoundary;pointBoundary='pointBoundary' in cp&&!!cp.pointBoundary;s=chaosLegacy(cp.state,p.state?.finished);waiting=cp.waiting||timing.stale;}
      else if (s) {
        const projected = p.replay ? { state: s, waiting: false }
          : coherent?projectParticipant(s,target,p.coherentControls!,p.housePrediction,p.rulesVersion===17||p.rulesVersion===18):p.liveEngine ? projectLive(s, target) : projectConfirmed(s, target);
        contactBoundary='contactBoundary' in projected&&!!projected.contactBoundary;
        pointBoundary='pointBoundary' in projected&&!!projected.pointBoundary;
        s = projected.state;
        waiting = projected.waiting || timing.stale;
      }
      let yA = s ? Number(s.left) / Number(SCALE) : 288,
        yB = s ? Number(s.right) / Number(SCALE) : 288;
      let participantPicture:ParticipantPose|undefined;
      if(coherent&&s){
        const previous=previousParticipant;
        let before:ParticipantPose|undefined;
        // A local key release is an intentional change, not a server correction.
        // An ACK may also retime an input before the next physical snapshot.
        if(previous?.state&&participantSourceChanged(previous,p)){
          // A fresh sample can reanchor the engine clock tens of milliseconds
          // ahead. Continue the old picture by one real frame, not by that new
          // clock offset, or perfectly predicted bots still jump on receipt.
          const oldTarget=participantContinuationTime(previousTarget,dt,previous.progressionLimit);
          if(previous.chaos){
            const old=projectChaosParticipant(previous.chaos.physics,oldTarget,previous.coherentControls!,chaosContactResolution(previous.rulesVersion??10),previous.housePrediction,previous.rulesVersion===17||previous.rulesVersion===18);
            before=participantPose(chaosLegacy(old.state,previous.state.finished),old.state);
            before.contactBoundary=old.contactBoundary;
          }else{const old=projectParticipant(previous.state,oldTarget,previous.coherentControls!,previous.housePrediction,previous.rulesVersion===17||previous.rulesVersion===18);
            before={...participantPose(old.state),contactBoundary:old.contactBoundary};}
        }
        const predictedPose=participantPose(s,cp?.state);
        predictedPose.contactBoundary=contactBoundary;
        const motion=cp?eventPaddles(cp.state):null;
        const localSpeed=motion?Number(p.side===0?motion.speedA:motion.speedB)/1e6:Number(rulesPaddleSpeed(p.rulesVersion??0))/1e6;
        const responsive=p.rulesVersion===17||p.rulesVersion===18;
        const motionMs=responsive?participantMotionMs(dt,p.controllable,timing.stale,s.finished):undefined;
        participantPicture=reconciliation.sample(predictedPose,before,dt,{side:p.side as 0|1,direction:p.direction,speed:localSpeed,motionMs,
         motion:responsive&&localControls?localMotion(localControls,priorPaintAt,paintedAt,p.controllable&&!timing.stale&&!s.finished):undefined});
        if(measureControls)window.dispatchEvent(new CustomEvent('pongit:presentation-timing',{detail:{ref:p.matchId,frameAt:now,
         processedUs:String(p.state?.t),displayedUs:String(target),paddleError:participantPicture.paddles.map((y,i)=>y-predictedPose.paddles[i]),
         ballError:participantPicture.balls.map((b,i)=>({id:b.id,x:b.x-predictedPose.balls[i].x,y:b.y-predictedPose.balls[i].y}))}}));
        [yA,yB]=participantPicture.paddles;
        previousParticipant=p;previousTarget=target;
        // Ref-only callback: input timing must see the most recent paint without
        // scheduling React renders or waiting for the slower scoreboard update.
        p.onInputClock?.(p.matchId,{clock:target,observedAt:Date.now()});
      }else{reconciliation.reset();previousParticipant=undefined;}
      if (p.state && !coherent && !cp && !p.replay && target > p.state.t) {
        // Paddles keep moving along their confirmed directions even while the
        // ball waits at an unresolved impact; their bounds are independent.
        const paddles = move(p.state, target);
        yA = Number(paddles.left) / Number(SCALE);
        yB = Number(paddles.right) / Number(SCALE);
      }
      if(playback&&p.side<0){yA=playback.left;yB=playback.right;}
      if(playback)waiting=playback.stalled||playback.buffering;
      const cause=presentationWait({starting:p.state?.t===0n&&p.clock===0n,stale:!playback&&timing.stale,point:pointBoundary,serve:!!s?.awaitingServe,projection:waiting,interrupted:!!playback?.stalled,paused:(current.current.housePrediction?.pause?.status??0)>=2});
      if(el.dataset.waitCause!==(cause??''))el.dataset.waitCause=cause??'';
      if(lastCause!==cause||buffered&&lastWaiting!==waiting){lastCause=cause;lastWaiting=waiting;p.onStats(0,false,waiting,cause);}
      const buffering=String(playback?.buffering??false);
      if(el.dataset.buffering!==buffering)el.dataset.buffering=buffering;
      const mod=cp?eventPaddles(cp.state):null;
      const halfA=mod?Number(mod.heightA)/2e6+(mod.splitA?8:0):Number(s?.halfA || 48000000n)/1e6, halfB=mod?Number(mod.heightB)/2e6+(mod.splitB?8:0):Number(s?.halfB || 48000000n)/1e6;
      const half=p.side===0?halfA:halfB;
      // The scene has a short presentation delay; local controls must remain
      // immediate and reconcile against the latest authoritative paddle.
      const ownerState=current.current.state;
      const ownerMods=current.current.chaos?eventPaddles(current.current.chaos.physics):null;
      const ownerSpeed=ownerMods?Number(p.side===0?ownerMods.speedA:ownerMods.speedB)/1e6:Number(rulesPaddleSpeed(p.rulesVersion??0))/1e6;
      const ownerAge=Math.min(600,Math.max(0,Date.now()-current.current.observedAt))/1000;
      const confirmedY = p.liveEngine&&ownerState?Math.max(half,Math.min(576-half,
        Number(p.side===0?ownerState.left:ownerState.right)/1e6+(p.side===0?ownerState.leftDir:ownerState.rightDir)*ownerSpeed*ownerAge)):p.side === 0 ? yA : yB;
      if (s && !coherent && !s.awaitingServe && (p.controllable || p.liveEngine) && !p.replay && p.side >= 0) {
        if (p.liveEngine) {
          const owner = livePaddle.step(confirmedY, p.controllable ? p.direction : 0,
            p.side === 0 ? ownerState!.leftDir : ownerState!.rightDir,
            half, dt, timing.stale || !p.controllable, p.pending,mod?Number(p.side===0?mod.speedA:mod.speedB)/1e6:180);
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
      const renderedRally=cp?String(cp.state.score.rally):`${s?.scoreA}:${s?.scoreB}`;
      if(el.dataset.rally!==renderedRally)el.dataset.rally=renderedRally;
      if(cp&&p.chaos){
        const f=eventCanvas(cp.state,arcadeAudio.settings.background,reducedMotion.matches);
        if(participantPicture)for(const ball of f.balls){const picture=participantPicture.balls.find(b=>b.id===ball.id);if(picture){ball.x=picture.x;ball.y=picture.y;}}
        if(!p.replay)for(const ball of f.balls)Object.assign(ball,visibleBall(ball.x,ball.y));
        f.paddles[0].y=yA;f.paddles[1].y=yB;
        const epoch=p.chaos.request>>64n&0xffffffffn;
        if(!p.replay&&!document.hidden){
          for(const e of p.chaos.physics.effects)if(e.id&&!seenEffects.has(e.serial)){
            seenEffects.add(e.serial);
            if(f.gameMs-e.startsAt<0&&f.gameMs>=e.startsAt-1000&&timing.ageMs<400)arcadeAudio.playChaos(chaosEvent(e.id).id,'announce',`${p.matchId}:${epoch}:effect:${e.serial}`);
          }
          for(const hit of [...p.chaos.collisions,...cp.collisions]){
            const key=`${p.matchId}:${epoch}:${hit.rally}:${hit.sequence}:${hit.ball}`;
            if(seenHits.has(key))continue;seenHits.add(key);
            if(cp.state.t-hit.at>250000n||cp.state.t<hit.at||timing.ageMs>400)continue;
            const kind=hit.kind<=2?'wall':hit.kind<=4?'paddle':hit.kind<=8?'shield':hit.kind===9?'bumper':hit.kind===14?'deflector':'brick';
            const event=kind==='shield'?3:kind==='bumper'?13:kind==='deflector'?18:kind==='brick'?19:0;
            if(event)arcadeAudio.playChaos(event,'impact',key);else arcadeAudio.play('bounce',key);
            impacts.push({id:key,kind,x:Number(hit.x)/1e12,y:Number(hit.y)/1e12,at:Number(hit.at/1000n),color:event?'#ffc680':'#bdf7ff'});
          }
          while(seenHits.size>512)seenHits.delete(seenHits.values().next().value!);
        }
        impacts=impacts.filter(h=>f.gameMs-h.at<=260&&f.gameMs>=h.at).slice(-16);f.impacts=impacts;
        drawChaosCourt(ctx,f);
        for(const ball of f.balls){const original=cp.state.balls[ball.id-1];
          const points=chaosTrails[ball.id-1].sample({x:ball.x,y:ball.y,at:now,clock:cp.state.t,rally:`${p.matchId}:${epoch}:${cp.state.score.rally}:${original.trailRevision}`},f.effectsEnabled&&!f.reducedMotion&&!p.state?.finished);
          ctx.save();for(const point of points){const size=3+6*point.strength;ctx.globalAlpha=.42*point.strength;ctx.fillStyle=ball.id===1?'#84efff':'#d6a0ff';ctx.fillRect(point.x-size/2,point.y-size/2,size,size);}ctx.restore();
        }
        for(let i=0;i<2;i++)if(!cp.state.balls[i].alive)chaosTrails[i].reset();
        drawChaosPaddles(ctx,f);drawChaosBalls(ctx,f);drawnBalls=f.balls.map(({id,x,y})=>({id,x,y}));
      }
      if (s&&!cp) {
        const points = trail.sample({ x: participantPicture?.balls[0]?.x??Number(s.x) / 1e6, y: participantPicture?.balls[0]?.y??Number(s.y) / 1e6,
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
      if(!cp){sprites.paddle(0, yA - halfA, halfA*2);
      sprites.paddle(1, yB - halfB, halfB*2);}
      if(s?.awaitingServe && !s.finished && !p.externalIntermission) {
        const remaining=Math.max(0,Number(s.resumeAt-p.clock)/1e6);
        ctx.fillStyle="#e5e1ff";ctx.textAlign="center";ctx.font=`30px ${fontFamily}`;
        ctx.fillText(p.liveEngine?"PREPARING RALLY":remaining>0?remaining.toFixed(1):"SYNCING SERVE",512,230);
        ctx.font=`12px ${fontFamily}`;ctx.fillText("CHAOS / NEXT RALLY",512,190);ctx.textAlign="left";
      }
      if(s && !cp && !p.replay && !document.hidden){
        const score=s.scoreA+s.scoreB;
        if(previousSound && now-previousSound.time<100 && score===previousSound.score && (s.vx!==previousSound.vx || s.vy!==previousSound.vy))arcadeAudio.play("bounce",`${p.matchId}:impact:${p.state?.t}:${s.vx}:${s.vy}`);
        if(s.awaitingServe&&!p.liveEngine){const count=Math.ceil(Math.max(0,Number(s.resumeAt-target)/1e6));if(count>0 && count<=3)arcadeAudio.play("countdown",`${p.matchId}:count:${s.resumeAt}:${count}`);}
        previousSound={vx:s.vx,vy:s.vy,score,time:now};
      } else previousSound=null;
      if (s&&!cp) {
        // A predicted goal remains unconfirmed. Keep its last visible edge
        // position instead of leaving the spectator with an empty court.
        const ball=participantPicture?.balls[0]??(playback?visibleBall(Number(s.x)/1e6,Number(s.y)/1e6):{x:Number(s.x)/1e6,y:Number(s.y)/1e6});
        sprites.ball(ball.x,ball.y);drawnBalls=[{id:1,x:ball.x,y:ball.y}];
      } else if(!s) {
        ctx.strokeStyle = "#777";
        ctx.strokeRect(506, 282, 12, 12);
      }
      if (p.debug) {
      ctx.fillStyle = "#697a8f";
      ctx.font = `10px ${fontFamily}`;
      ctx.fillText("0,0", 12, 20);
      ctx.fillText("1024 × 576", 912, 560);
      }
      if((buffered||coherent)&&s){
        // Both buffered spectators and coherent players report an actually
        // painted frame. Player liveness must keep working after F5 and while
        // paused; coherent rendering deliberately bypasses the spectator buffer.
        // Score and effects follow this same displayed frame.
        const rally=`${s.scoreA}:${s.scoreB}:${s.finished}:${cp?.state.effects.map(e=>`${e.serial}:${e.remaining}`).join(',')??''}`;
        if(rally!==played||now-playedAt>=250){played=rally;playedAt=now;p.onPlayback({matchId:p.matchId,scoreA:s.scoreA,scoreB:s.scoreB,gameMs:Number(s.t)/1000,finished:s.finished,effects:cp?eventHud(cp.state):[]});}
      }
      if(s&&!document.hidden){
        p.onPaint?.(p.matchId);
        if(measureControls)window.dispatchEvent(new CustomEvent('pongit:court-frame',{detail:{ref:p.matchId,at:now,
         rules:p.rulesVersion,side:p.side,balls:drawnBalls,paddles:[yA,yB],rally:renderedRally,score:[s.scoreA,s.scoreB],
         sourceUs:String(p.state?.t??0n),renderedUs:String(s.t),contactBoundary,
         collisions:p.chaos?.collisions.map(h=>({...h,at:String(h.at),x:String(h.x),y:String(h.y)}))??[],
         sourceVelocity:p.state?{vx:String(p.state.vx),x:String(p.state.x),score:[p.state.scoreA,p.state.scoreB]}:undefined}}));
      }
      count++;
      if (now - last > 1000) {
        if(buffered){
          // Diagnostics use this draw's timestamp, rather than the later poll
          // that happens to read the once-per-second DOM sample.
          el.dataset.sampledAt=String(now);
          el.dataset.processedUs=String(current.current.state?.t??0n);
          el.dataset.renderedUs=String(s?.t??0n);
          el.dataset.finished=String(s?.finished??false);
          el.dataset.bufferMs=String(Math.round(playback?.delayMs??0));
          el.dataset.streamStalled=String(playback?.stalled??false);
        }
        p.onNetwork(timing.ageMs,correction);
        p.onStats(
          Math.round((count * 1000) / (now - last)),
          !!s && !p.replay && target > (p.state?.t || 0n),
          waiting,cause,
        );
        count = 0;
        last = now;
      }
      frame = requestAnimationFrame(draw);
    }
    const visibility=()=>{cancelAnimationFrame(frame);reconciliation.reset();previousParticipant=undefined;playout.reset();playerPlayout.reset();trail.reset();chaosTrails.forEach(t=>t.reset());if(!document.hidden){last=lastDraw=performance.now();count=0;previousSound=null;seenEffects=new Set(current.current.chaos?.physics.effects.map(e=>e.serial)||[]);frame=requestAnimationFrame(draw);}};
    const unsubscribe=subscribeIntent?.(()=>{if(!document.hidden){cancelAnimationFrame(frame);draw(performance.now());}});
    document.addEventListener("visibilitychange",visibility);
    if(!document.hidden)frame = requestAnimationFrame(draw);
    return () => {unsubscribe?.();cancelAnimationFrame(frame);document.removeEventListener("visibilitychange",visibility);};
  }, []);
  return (
    <canvas
      ref={canvas}
      aria-label="Pong court. Use W and S or arrow keys to move your paddle."
      role="img"
    />
  );
}
