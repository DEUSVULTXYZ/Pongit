// Game intents and cheap receipt reads have separate budgets. Eight players
// behind the same NAT must not consume the allowance for consent or finance.
export function trafficBudget(method:string|undefined,path:string) {
 if((method==="GET"&&path==="/interlude/state")||(method==="POST"&&["/interlude/presence","/interlude/diagnostics"].includes(path)))return {bucket:"rooms-read-ip",limit:6000};
 if(method==="POST" && path==="/inputs")return {bucket:"input",limit:2400};
 if(method==="GET" && (/^\/jobs\/0x[\da-f]{64}$/i.test(path)||/^\/inputs\/\d+\/0x[\da-f]{40}$/i.test(path)))return {bucket:"receipt",limit:2400};
 return {bucket:"general",limit:600};
}
