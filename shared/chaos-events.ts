/** Candidate rules 6 catalogue. Not enabled by the current rules 5 deployment. */
export const CHAOS_EVENTS_VERSION = 6;
export const CHAOS_ANNOUNCEMENT_MS = 1000;
export const CHAOS_MAX_EFFECTS = 2;
export type ChaosEventId = 1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24;
export type ChaosTarget = 'player'|'both'|'court';
export type ChaosEventDefinition = {
 id:ChaosEventId; key:string; name:string; durationMs:number; weight:1|4;
 target:ChaosTarget; color:string; description:string; visual:string; sound:string;
};
export const chaosEvents = [
 {id:1,key:'mega-paddle',name:'MEGA PADDLE',durationMs:6000,weight:4,target:'player',color:'#75f5df',description:'Your paddle is 25% taller.',visual:'Light extends from both ends of the paddle.',sound:'power-up'},
 {id:2,key:'overdrive',name:'OVERDRIVE',durationMs:5000,weight:4,target:'player',color:'#63dfff',description:'Your paddle moves 30% faster.',visual:'An electric trail follows your paddle.',sound:'overdrive'},
 {id:3,key:'last-chance',name:'LAST CHANCE',durationMs:12000,weight:4,target:'player',color:'#7dbbff',description:'A barrier returns one missed ball, then breaks.',visual:'A shield lights up behind the paddle and shatters on use.',sound:'shield'},
 {id:4,key:'power-shot',name:'POWER SHOT',durationMs:8000,weight:4,target:'player',color:'#ff9c54',description:'Your next return is 20% faster until its next impact.',visual:'Orange fire follows the charged shot.',sound:'power-shot'},
 {id:5,key:'curveball',name:'CURVEBALL',durationMs:8000,weight:4,target:'player',color:'#b793ff',description:'Your next return curves by 20 degrees over 1.5 seconds. Your last movement chooses its direction.',visual:'A violet ribbon follows the curve.',sound:'curve'},
 {id:6,key:'perfect-parry',name:'PERFECT PARRY',durationMs:8000,weight:4,target:'player',color:'#ffdf80',description:'Return with the central 25% of your paddle for a shot 30% faster until its next impact.',visual:'The paddle centre glows gold, with a brief spark on a perfect return.',sound:'parry'},
 {id:7,key:'pocket-paddle',name:'POCKET PADDLE',durationMs:6000,weight:4,target:'player',color:'#fa8bda',description:'Your paddle becomes 20% shorter.',visual:'The paddle contracts into pixels.',sound:'power-down'},
 {id:8,key:'heavy-metal',name:'HEAVY METAL',durationMs:5000,weight:4,target:'player',color:'#a6b6cc',description:'Your paddle moves 20% slower.',visual:'Metal panels and a weight marker appear on the paddle.',sound:'heavy'},
 {id:9,key:'glass-cannon',name:'GLASS CANNON',durationMs:8000,weight:4,target:'player',color:'#a3ebff',description:'Your paddle is 20% shorter. Each return is 20% faster until its next impact.',visual:'Crystal facets surround the paddle.',sound:'glass'},
 {id:10,key:'hot-potato',name:'HOT POTATO',durationMs:7000,weight:4,target:'player',color:'#ff8a65',description:'The charge moves to the last hitter. After 4 seconds its holder moves 20% slower for 3 seconds.',visual:'A burning charge changes sides with each return.',sound:'potato'},
 {id:11,key:'split-paddle',name:'SPLIT PADDLE',durationMs:6000,weight:4,target:'player',color:'#eb9bff',description:'Your paddle splits into two segments with a 16-unit gap. The glowing connector cannot return the ball.',visual:'Two solid segments separate around a thin light connector.',sound:'split'},
 {id:12,key:'size-swap',name:'SIZE SWAP',durationMs:6000,weight:4,target:'both',color:'#adacff',description:'Exchange the two paddle heights determined by betting pressure, before other size bonuses apply.',visual:'Two brief arcs connect the paddles.',sound:'swap'},
 {id:13,key:'pinball',name:'PINBALL',durationMs:10000,weight:4,target:'court',color:'#ffba6a',description:'A circular bumper with radius 28 appears at the centre.',visual:'A segmented bumper pulses at each impact.',sound:'bumper'},
 {id:14,key:'portal-pair',name:'PORTAL PAIR',durationMs:10000,weight:4,target:'court',color:'#aa85ff',description:'Two diagonal portals with radius 24 teleport the ball without changing its velocity.',visual:'Two luminous rings swallow and release the ball. Its trail breaks at the portal.',sound:'portal'},
 {id:15,key:'warp-lane',name:'WARP LANE',durationMs:8000,weight:4,target:'court',color:'#79d5ff',description:'The ball moves 20% faster inside a 64-unit-wide central lane, returning to normal outside it.',visual:'Chevron marks identify the speed lane.',sound:'warp'},
 {id:16,key:'gravity-well',name:'GRAVITY WELL',durationMs:8000,weight:4,target:'court',color:'#c38fff',description:'A central gravity well bends the ball towards its core, by at most 15 degrees per crossing within radius 160.',visual:'Concentric marks identify the influence area.',sound:'gravity'},
 {id:17,key:'solar-wind',name:'SOLAR WIND',durationMs:8000,weight:4,target:'court',color:'#ffc980',description:'A vertical force of 24 units per second squared pushes the ball up or down.',visual:'Directional filaments show the wind.',sound:'wind'},
 {id:18,key:'ricochet',name:'RICOCHET',durationMs:10000,weight:4,target:'court',color:'#9be6ee',description:'A 96-unit central deflector appears at a 45-degree angle.',visual:'A diagonal metal strip sparks on impact.',sound:'ricochet'},
 {id:19,key:'breakout',name:'BREAKOUT',durationMs:12000,weight:4,target:'court',color:'#fbb47d',description:'Three 56 by 16-unit bricks each reflect the ball once, then break.',visual:'Three pixel bricks explode individually on impact.',sound:'brick'},
 {id:20,key:'bank-shot',name:'BANK SHOT',durationMs:8000,weight:4,target:'court',color:'#6ee2ca',description:'Wall rebounds increase the vertical slope by 25% while preserving the ball’s total speed.',visual:'Segmented wall markings show the altered rebound.',sound:'bank'},
 {id:21,key:'multiball',name:'MULTIBALL',durationMs:12000,weight:1,target:'court',color:'#daf8ff',description:'A second real ball appears with opposite vertical velocity. The first goal ends the rally.',visual:'Two distinct balls each have their own trail.',sound:'multiball'},
 {id:22,key:'jackpot-rally',name:'JACKPOT RALLY',durationMs:12000,weight:1,target:'both',color:'#ffda6d',description:'The next point is worth two score points. Betting payouts are not multiplied.',visual:'A gold announcement and a ×2 marker appear by the score.',sound:'jackpot'},
 {id:23,key:'boss-round',name:'BOSS ROUND',durationMs:8000,weight:1,target:'both',color:'#ff738b',description:'Both paddles grow by 25% and the ball moves 25% faster during the effect.',visual:'Red and gold highlights frame the court.',sound:'boss'},
 {id:24,key:'mystery-pickup',name:'MYSTERY PICKUP',durationMs:12000,weight:1,target:'court',color:'#dfadff',description:'A capsule gives the last hitter Mega Paddle, Overdrive, Last Chance or Power Shot. An existing bonus is refreshed, never stacked; otherwise it replaces this slot.',visual:'A pixel capsule opens into the awarded bonus icon.',sound:'mystery'},
] as const satisfies readonly ChaosEventDefinition[];

export function chaosEvent(id:number):ChaosEventDefinition {
 const event=chaosEvents[id-1];if(!event||event.id!==id)throw new Error('Unknown Chaos event');return event;
}

/** Milliseconds use the authoritative game clock; UI wall clocks never activate effects. */
export type ChaosEffectState = {
 id:ChaosEventId; slot:0|1; target:0|1|2; startsAt:number; expiresAt:number;
 variant:number; consumed:boolean; chargeRemaining?:number;
};
export type ChaosCollision = {
 arena:string; epoch:string; matchId:string; rally:number; sequence:number;
 ballId:number; kind:'paddle'|'wall'|'shield'|'bumper'|'deflector'|'brick';
 x:bigint;y:bigint;
};
export function chaosCollisionId(c:ChaosCollision){return `${c.arena.toLowerCase()}:${c.epoch}:${c.matchId}:${c.rally}:${c.sequence}:${c.ballId}`;}
