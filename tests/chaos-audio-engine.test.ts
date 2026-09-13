import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ArcadeAudio} from '../web/lib/audio';
class Param {
 value=0;events:{kind:string;value:number;at:number}[]=[];
 setValueAtTime(value:number,at:number){this.events.push({kind:'set',value,at});}
 setTargetAtTime(value:number,at:number){this.events.push({kind:'target',value,at});}
 linearRampToValueAtTime(value:number,at:number){this.events.push({kind:'linear',value,at});}
 exponentialRampToValueAtTime(value:number,at:number){this.events.push({kind:'exponential',value,at});}
 cancelScheduledValues(at:number){this.events=this.events.filter(e=>e.at<at);}
}
class Link {connect(){}disconnect(){}}
class Gain extends Link {gain=new Param();}
class Oscillator extends Link {type='triangle';frequency=new Param();onended:(()=>void)|null=null;start(){}stop(){}}
class Context {
 currentTime=10;state='running';gains:Gain[]=[];oscillators:Oscillator[]=[];destination={};onstatechange=()=>{};
 createGain(){const x=new Gain();this.gains.push(x);return x;}
 createDynamicsCompressor(){return Object.assign(new Link(),{threshold:new Param(),knee:new Param(),ratio:new Param(),attack:new Param(),release:new Param()});}
 createAnalyser(){return Object.assign(new Link(),{fftSize:2048,getFloatTimeDomainData:()=>{}});}
 createMediaElementSource(){return new Link();}
 createOscillator(){const x=new Oscillator();this.oscillators.push(x);return x;}
 async resume(){this.state='running';}async suspend(){this.state='suspended';}
}
class Media {paused=true;readyState=4;loop=false;preload='';duration=215;addEventListener(){}pause(){this.paused=true;}async play(){this.paused=false;}load(){}}
async function fixture(run:(audio:ArcadeAudio,c:Context,doc:{hidden:boolean})=>Promise<void>|void){
 const names=['window','document','localStorage','Audio'] as const;
 const previous=names.map(name=>Object.getOwnPropertyDescriptor(globalThis,name));const doc={hidden:false};
 Object.assign(globalThis,{window:{AudioContext:Context,dispatchEvent(){}},document:doc,localStorage:{setItem(){},getItem(){return null;}},Audio:Media});
 try{const audio=new ArcadeAudio();audio.configure({enabled:true});await audio.activate();await run(audio,audio.context as unknown as Context,doc);}
 finally{for(let i=0;i<names.length;i++){const p=previous[i];if(p)Object.defineProperty(globalThis,names[i],p);else delete (globalThis as any)[names[i]];}}
}
test('identified Chaos events deduplicate and respect mute, visibility and voice budget',async()=>fixture((a,c,doc)=>{
 a.playChaos(1,'announce','arena:epoch:match:draw1');const count=c.oscillators.length;assert(count>0);
 a.playChaos(1,'announce','arena:epoch:match:draw1');assert.equal(c.oscillators.length,count);
 doc.hidden=true;a.playChaos(2,'announce','hidden');assert.equal(c.oscillators.length,count);doc.hidden=false;
 a.configure({enabled:false});a.playChaos(3,'announce','muted');assert.equal(c.oscillators.length,count);
 a.configure({enabled:true});for(let i=0;i<10;i++)a.playChaos(4,'impact',`impact:${i}`);
 assert(a.diagnostics().voices<=12);
}));
test('music restoration survives settings changes during a jingle and short Chaos cues',async()=>fixture((a,c)=>{
 a.play('victory','result');a.setGameplay(true);a.configure({music:.4});
 const gain=c.gains[0].gain;assert(gain.events.some(e=>e.at===12&&e.value===.4*.48));
 c.currentTime=10.5;a.playChaos(2,'announce','draw');
 assert(gain.events.some(e=>e.at===12&&e.value===.4*.48),'short cue cannot shorten an existing jingle');
 a.configure({enabled:false});assert(gain.events.filter(e=>e.at>=c.currentTime).every(e=>e.value===0));
}));
