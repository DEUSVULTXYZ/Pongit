export type ChaosScore={a:number;b:number;rally:number;finished:boolean;winner:number};
/** Called once with the union of goals at the earliest collision timestamp. */
export function resolveChaosGoals(score:ChaosScore,simultaneousGoals:number,jackpot:boolean):[ChaosScore,boolean,boolean]{
 const s={...score};
 if(!Number.isInteger(s.a)||!Number.isInteger(s.b)||s.a<0||s.b<0||s.a>7||s.b>7||![0,1,2,3].includes(simultaneousGoals))throw Error('Invalid goal state');
 if(s.finished||simultaneousGoals===0)return[s,false,false];
 if(s.a>=7||s.b>=7||!Number.isSafeInteger(s.rally)||s.rally<0||s.rally>=0xffffffff)throw Error('Invalid goal state');
 s.rally++;
 if(simultaneousGoals===3)return[s,false,false];
 const delta=jackpot?2:1;
 if(simultaneousGoals===1)s.a=Math.min(7,s.a+delta);else s.b=Math.min(7,s.b+delta);
 s.finished=s.a>=7||s.b>=7;if(s.finished)s.winner=s.a>=7?1:2;
 return[s,true,s.finished];
}
