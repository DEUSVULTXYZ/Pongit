export type ArcadeSound="button"|"invite"|"match"|"countdown"|"bounce"|"point"|"handicap"|"victory"|"defeat";
export type AudioSettings={entered:boolean;enabled:boolean;music:number;effects:number;background:boolean;intensity:"subtle"|"full"};
const defaults:AudioSettings={entered:false,enabled:false,music:.2,effects:.6,background:true,intensity:"full"};
const notes=(m:number)=>440*2**((m-69)/12);
class ArcadeAudio {
  settings={...defaults};context:AudioContext|null=null;
  private musicGain:GainNode|null=null;private effectsGain:GainNode|null=null;
  private meter:AnalyserNode|null=null;private voices=new Set<OscillatorNode>();
  private music:HTMLAudioElement|null=null;private musicSource:MediaElementAudioSourceNode|null=null;
  private musicError=false;private gameplay=false;private duckUntil=0;
  private seen=new Map<string,number>();private lastBounce=0;
  private signal(){if(typeof window!=="undefined")window.dispatchEvent(new Event("pongit:audio"));}
  load(){try{const saved=JSON.parse(localStorage.getItem("pongit:arcade-audio")||"null");if(saved)this.settings={...defaults,entered:saved.entered===true,enabled:saved.enabled===true,music:this.volume(saved.music,.2),effects:this.volume(saved.effects,.6),background:saved.background!==false,intensity:saved.intensity==="subtle"?"subtle":"full"};}catch{}return this.settings;}
  private volume(value:unknown,fallback:number){return typeof value==="number"&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;}
  configure(patch:Partial<AudioSettings>){this.settings={...this.settings,...patch};this.settings.music=this.volume(this.settings.music,.2);this.settings.effects=this.volume(this.settings.effects,.6);try{localStorage.setItem("pongit:arcade-audio",JSON.stringify(this.settings));}catch{}this.gains();if(!this.settings.enabled){this.stopVoices();this.music?.pause();}this.signal();}
  async activate(retry=false){
    if(!this.settings.enabled || document.hidden)return;
    const AudioCtor=window.AudioContext || (window as any).webkitAudioContext;if(!AudioCtor){this.musicError=true;this.signal();return;}
    if(!this.context){
      const c:AudioContext=new AudioCtor();this.context=c;this.musicGain=c.createGain();this.effectsGain=c.createGain();
      const limiter=c.createDynamicsCompressor();limiter.threshold.value=-10;limiter.knee.value=10;limiter.ratio.value=4;limiter.attack.value=.003;limiter.release.value=.12;
      this.musicGain.connect(limiter);this.effectsGain.connect(limiter);this.meter=c.createAnalyser();this.meter.fftSize=2048;limiter.connect(this.meter);this.meter.connect(c.destination);
      c.onstatechange=()=>this.signal();this.gains();
    }
    try{if(this.context!.state!=="running")await this.context!.resume();}catch{this.signal();return;}
    if(!this.music){
      const media=new Audio("/audio/last-stop.mp3");media.preload="metadata";media.loop=true;this.music=media;
      this.musicSource=this.context!.createMediaElementSource(media);this.musicSource.connect(this.musicGain!);
      for(const event of ["loadedmetadata","canplay","playing","pause","waiting"])media.addEventListener(event,()=>this.signal());
      media.addEventListener("error",()=>{this.musicError=true;this.signal();});
    }
    if(retry && this.musicError){this.musicError=false;this.music.load();}
    if(!this.musicError && this.music.paused){void this.music.play().then(()=>this.signal()).catch(error=>{if(error.name!=="NotAllowedError" && error.name!=="AbortError")this.musicError=true;this.signal();});}
  }
  setGameplay(active:boolean){if(this.gameplay===active)return;this.gameplay=active;this.gains();}
  private gains(){if(!this.context)return;const t=this.context.currentTime;
    const duck=t<this.duckUntil?.16:this.gameplay?.48:1;
    this.musicGain?.gain.cancelScheduledValues(t);this.musicGain?.gain.setTargetAtTime(this.settings.enabled?this.settings.music*duck:0,t,this.settings.enabled?.22:.012);
    this.effectsGain?.gain.setTargetAtTime(this.settings.enabled?this.settings.effects:0,t,.02);
  }
  private tone(frequency:number,at:number,duration:number,gain:number,type:OscillatorType,slide?:number){
    if(!this.context || !this.effectsGain || this.voices.size>=12)return;
    const osc=this.context.createOscillator(),env=this.context.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,at);if(slide)osc.frequency.exponentialRampToValueAtTime(slide,at+duration);
    env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(gain,at+.003);env.gain.exponentialRampToValueAtTime(.0001,at+duration);osc.connect(env);env.connect(this.effectsGain);this.voices.add(osc);
    osc.onended=()=>{this.voices.delete(osc);osc.disconnect();env.disconnect();};osc.start(at);osc.stop(at+duration+.02);
  }
  play(sound:ArcadeSound,key?:string){const c=this.context,now=performance.now();if(!c || !this.settings.enabled || document.hidden || c.state!=="running")return;
    if(key){if(this.seen.has(key))return;this.seen.set(key,now);if(this.seen.size>512)this.seen.delete(this.seen.keys().next().value!);}
    if(sound==="bounce"){if(now-this.lastBounce<45)return;this.lastBounce=now;this.tone(1047,c.currentTime,.075,.30,"triangle",740);this.tone(2100,c.currentTime,.028,.045,"square",1300);return;}
    const sequences:Record<Exclude<ArcadeSound,"bounce">,number[]>={button:[76],invite:[69,76,81],match:[57,64,69,81],countdown:[72],point:[60,72,79],handicap:[69,65,60],victory:[72,76,79,84,88,91,96],defeat:[67,63,60,55,48,36]};
    const seq=sequences[sound],jingle=sound==="victory"||sound==="defeat",time=c.currentTime;
    if(jingle){this.duckUntil=time+2;this.gains();this.musicGain!.gain.setTargetAtTime(this.settings.enabled?this.settings.music*(this.gameplay?.48:1):0,time+2,.5);}
    seq.forEach((note,i)=>{this.tone(notes(note),time+i*(jingle?.18:.085),sound==="button"?.04:jingle?.35:.17,sound==="button"?.13:jingle?.20:.28,jingle?"square":"triangle");if(jingle && i%2===0)this.tone(notes(note-12),time+i*.18,.4,.13,"triangle");});
  }
  async test(){await this.activate(true);this.play("point");}
  private stopVoices(){for(const voice of this.voices){try{voice.stop();}catch{}}this.voices.clear();}
  hidden(){this.stopVoices();this.music?.pause();void this.context?.suspend();}
  status(){if(!this.settings.enabled)return "muted";if(!this.context || this.context.state!=="running")return "suspended";if(this.musicError)return "loading failed";if(!this.music || this.music.readyState<2)return "loading";if(this.music.paused)return "suspended";return "enabled";}
  diagnostics(){const data=new Float32Array(2048);this.meter?.getFloatTimeDomainData(data);let sum=0,peak=0;for(const x of data){sum+=x*x;peak=Math.max(peak,Math.abs(x));}const rms=Math.sqrt(sum/data.length);return {state:this.context?.state||"uninitialized",status:this.status(),voices:this.voices.size,settings:this.settings,rms,peak,rmsDb:rms?20*Math.log10(rms):-120,musicDuration:Number.isFinite(this.music?.duration)?this.music!.duration:0,musicLoop:this.music?.loop||false,gameplay:this.gameplay};}
}
export const arcadeAudio=new ArcadeAudio();
