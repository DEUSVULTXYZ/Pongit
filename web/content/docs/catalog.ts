export const groups = ["Getting started","Playing","Your account","Betting & payments","Help","Technical reference"] as const;
export type DocEntry={slug:string;title:string;description:string;group:string;updated:string;keywords:string[]};
const entry=(slug:string,title:string,description:string,group:number,keywords:string[]):DocEntry=>({slug,title,description,group:groups[group],updated:"2026-09-07",keywords});
export const catalog:DocEntry[]=[
 entry("getting-started/welcome","Welcome to PONGIT","An arcade for good rivals, close matches and verifiable results.",0,["overview","testnet","free"]),
 entry("getting-started/first-match","Your first match","From Play now to your first seven points.",0,["start","controls","connect","play"]),
 entry("getting-started/passkeys","Passkeys & arcade sessions","Keep your account, renew your session and understand what you sign.",0,["login","connect","renew","reconnect","F5","disconnect"]),
 entry("playing/classic","Classic","Two paddles. One ball. First to seven.",1,["rules","paddle","controls"]),
 entry("playing/chaos","Chaos","Understand how betting pressure changes the next rally.",1,["handicap","96","72","shrink","bets"]),
 entry("playing/challenges","Matchmaking, challenges & rematches","Find an opponent or invite the rival you already know.",1,["duel","invite","cancel","friendly","ranked"]),
 entry("playing/rankings","Rankings & seasons","Separate Classic and Chaos ladders, with results recorded onchain.",1,["elo","leaderboard","placements","rating"]),
 entry("playing/tournaments","Tournaments","Join a Classic bracket and play each round from the tournament screen.",1,["prize","entry","registration","round","bracket"]),
 entry("playing/spectating","Watching live","Follow the arena as a spectator without a wallet connection.",1,["live","watch","spectator"]),
 entry("playing/replays","Replays & match history","Revisit your last three finished games and understand replay availability.",1,["archive","retention","history","notes"]),
 entry("account/profile","Usernames & avatars","Choose a unique name and your character in the arcade.",2,["profile","save","username","avatar","character"]),
 entry("account/notebook","Private notebook","Keep favourite rivals, private nicknames and timestamped replay notes.",2,["mera","encryption","notes","save","privacy"]),
 entry("account/balances","Wallet, betting credit & legacy balances","Know where your test MON is held and how to withdraw it.",2,["funds","vault","withdraw","credits","legacy","faucet"]),
 entry("account/settings","Audio & accessibility","Tune the music, test the effects and make the cabinet comfortable.",2,["sound","muted","music","Karl Casey","background","motion"]),
 entry("betting/how-it-works","How betting works","Review the cost, signed maximum and potential payout before supporting a player.",3,["LMSR","shares","quote","market","bet"]),
 entry("betting/payments","Automatic payouts & refunds","Winning bets, tournament prizes and refunds go to your wallet automatically.",3,["claim","payment","delayed","retry","winnings","refund"]),
 entry("help/troubleshooting","Troubleshooting","Recover from connection, input, audio and payment problems.",4,["error","lag","latency","stuck","failed","support"]),
 entry("help/faq","FAQ & glossary","Quick answers and the language used around the arcade.",4,["questions","gas","MON","terms","free"]),
 entry("technical/architecture","Architecture & integrations","How the browser, relayer, Envio and Monad work together.",5,["Mera","Envio","Interlude","VPS","transport"]),
 entry("technical/physics","Physics, prediction & latency","The contract determines collisions; the browser makes the motion readable.",5,["block","clock","bigint","inputs","prediction","confirmation"]),
 entry("technical/contracts","Contracts & deployments","Public addresses and versioned references for V4 and its archives.",5,["addresses","V1","V2","V3","V4","explorer"]),
 entry("technical/permissions","Authentication & permissions","Separate gameplay authorization, app access and owner-approved spending.",5,["EIP-712","nonce","security","signature","session"]),
 entry("technical/api","HTTP API & WebSocket reference","Read application data and understand the authenticated transaction interfaces.",5,["API","HTTP","WebSocket","endpoints","integration"]),
 entry("technical/operations","Administration & operations","Operate the testnet service while preserving results and financial rights.",5,["admin","pause","backups","rollback","treasury"]),
];
