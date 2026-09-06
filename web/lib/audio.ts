export type ArcadeSound="button"|"invite"|"match"|"countdown"|"bounce"|"point"|"handicap"|"victory"|"defeat";
export type AudioSettings={entered:boolean;enabled:boolean;music:number;effects:number;background:boolean};
const defaults:AudioSettings={entered:false,enabled:false,music:.2,effects:.6,background:true};
const notes=(m:number)=>440*2**((m-69)/12);
// Original 8-bar composition: a minor arpeggio over a descending arcade bass line.
const bass=[45,45,41,41,48,48,43,43],melody=[0,7,12,7,15,12,7,3,0,7,10,7,14,10,7,3];
class ArcadeAudio {
  settings={...defaults};context:AudioContext|null=null;
  private musicGain:GainNode|null=null;private effectsGain:GainNode|null=null;
  private voices=new Set<OscillatorNode>();private timer:ReturnType<typeof setInterval>|null=null;
  private beat=0;private nextBeat=0;private seen=new Map<string,number>();private lastEffect=0;
  load(){try{const saved=JSON.parse(localStorage.getItem("pongit:arcade-audio")||"null");if(saved)this.settings={...defaults,entered:saved.entered===true,enabled:saved.enabled===true,music:this.volume(saved.music,.2),effects:this.volume(saved.effects,.6),background:saved.background!==false};}catch{}return this.settings;}
  private volume(value:unknown,fallback:number){return typeof value==="number"&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;}
  configure(patch:Partial<AudioSettings>){this.settings={...this.settings,...patch};this.settings.music=this.volume(this.settings.music,.2);this.settings.effects=this.volume(this.settings.effects,.6);localStorage.setItem("pongit:arcade-audio",JSON.stringify(this.settings));this.gains();if(!this.settings.enabled)this.stopVoices();window.dispatchEvent(new Event("pongit:audio"));}
  async activate(){if(!this.settings.enabled || document.hidden)return;const AudioCtor=window.AudioContext || (window as any).webkitAudioContext;if(!AudioCtor)return;
    if(!this.context){this.context=new AudioCtor();this.musicGain=this.context!.createGain();this.effectsGain=this.context!.createGain();this.musicGain.connect(this.context!.destination);this.effectsGain.connect(this.context!.destination);this.gains();}
    try {await this.context!.resume();if(!this.timer){this.nextBeat=this.context!.currentTime+.06;this.timer=setInterval(()=>this.schedule(),40);}}catch{}
  }
  private gains(){if(!this.context)return;const t=this.context.currentTime;this.musicGain?.gain.setTargetAtTime(this.settings.enabled?this.settings.music:0,t,.025);this.effectsGain?.gain.setTargetAtTime(this.settings.enabled?this.settings.effects:0,t,.025);}
  private tone(frequency:number,at:number,duration:number,gain:number,type:OscillatorType,bus:GainNode,slide?:number){if(!this.context || this.voices.size>=12)return;const osc=this.context.createOscillator(),env=this.context.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,at);if(slide)osc.frequency.exponentialRampToValueAtTime(slide,at+duration);env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(gain,at+.006);env.gain.exponentialRampToValueAtTime(.0001,at+duration);osc.connect(env);env.connect(bus);this.voices.add(osc);osc.onended=()=>{this.voices.delete(osc);osc.disconnect();env.disconnect();};osc.start(at);osc.stop(at+duration+.02);}
  private schedule(){const c=this.context;if(!c || document.hidden || !this.settings.enabled || c.state!=="running")return;
    if(this.nextBeat<c.currentTime)this.nextBeat=c.currentTime+.05;
    while(this.nextBeat<c.currentTime+.14){const step=this.beat++%128,root=bass[Math.floor(step/16)],at=this.nextBeat;this.nextBeat+=60/112/4;
      if(this.settings.music<=0)continue;
      this.tone(notes(root+24+melody[step%16]),at,.105,.032,"square",this.musicGain!);
      if(step%4===0)this.tone(notes(root),at,.36,.095,"triangle",this.musicGain!);
      if(step%8===0)this.tone(125,at,.13,.13,"sine",this.musicGain!,38);
      if(step%8===4)this.tone(1700,at,.06,.026,"triangle",this.musicGain!,400);
    }
  }
  play(sound:ArcadeSound,key?:string){const c=this.context,now=performance.now();if(!c || !this.settings.enabled || document.hidden || c.state!=="running")return;
    if(key){if(this.seen.has(key))return;this.seen.set(key,now);if(this.seen.size>300)this.seen.delete(this.seen.keys().next().value!);}
    if(now-this.lastEffect<35 && sound==="bounce")return;this.lastEffect=now;
    const sequences:Record<ArcadeSound,number[]>={button:[76],invite:[69,76,81],match:[57,64,69,81],countdown:[72],bounce:[88],point:[60,72],handicap:[69,65,60],victory:[72,76,79,84,88,91],defeat:[67,63,60,55,48]};
    const seq=sequences[sound],jingle=sound==="victory"||sound==="defeat",time=c.currentTime;
    if(jingle){this.musicGain!.gain.cancelScheduledValues(time);this.musicGain!.gain.setTargetAtTime(this.settings.music*.18,time,.02);this.musicGain!.gain.setTargetAtTime(this.settings.music,time+1.5,.3);}
    seq.forEach((note,i)=>this.tone(notes(note),time+i*(jingle?.14:.09),sound==="bounce"?.065:jingle?.24:.13,sound==="bounce"?.035:.065,jingle?"square":"triangle",this.effectsGain!));
  }
  private stopVoices(){for(const voice of this.voices){try{voice.stop();}catch{}}this.voices.clear();}
  hidden(){if(this.timer)clearInterval(this.timer);this.timer=null;this.stopVoices();void this.context?.suspend();}
  diagnostics(){return {state:this.context?.state||"uninitialized",voices:this.voices.size,settings:this.settings};}
}
export const arcadeAudio=new ArcadeAudio();
