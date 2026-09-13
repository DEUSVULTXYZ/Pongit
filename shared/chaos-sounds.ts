import {type ChaosEventId} from './chaos-events';
export type ChaosTone={note:number;at:number;duration:number;gain:number;wave:'triangle'|'square'|'sawtooth';slide?:number};
const themes:readonly (readonly number[])[]=[
 [60,67,72,79],[69,76,81,88],[64,71,76,83],[48,60,72,84],
 [69,72,76,79],[76,83,88],[79,72,67,60],[43,43,38],
 [84,91,86,96],[57,69,58,70],[67,74,67,79],[60,76,72,64],
 [81,69,88],[60,72,84,72],[72,79,86],[48,55,62,69],
 [64,69,76,81],[76,64,81],[84,79,72],[69,81,76],
 [72,79,84,91],[72,76,79,84,91],[36,43,48,55,60],[67,70,74,81],
];
/** Original short synthesized cues, played by PONGIT's shared audio context. */
export function chaosSoundPattern(id:ChaosEventId,kind:'announce'|'impact'|'consume'='announce'):readonly ChaosTone[]{
 const melody=themes[id-1];if(!melody)throw Error('Unknown Chaos sound');
 const notes=kind==='impact'?melody.slice(-2):kind==='consume'?[...melody].reverse():melody;
 const step=kind==='impact'?.035:.075;
 return notes.map((note,i)=>({note,at:i*step,duration:kind==='impact'?.085:.16,gain:kind==='impact'?.16:.12,
  wave:id===8||id===23?'sawtooth':id>=21?'square':'triangle',
  ...(id===2||id===4||id===14||id===15?{slide:note+(kind==='consume'?-7:7)}:{}),
 }));
}
