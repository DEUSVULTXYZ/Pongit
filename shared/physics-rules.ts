/** Immutable match rules select speed, including on historical replay routes. */
export function rulesPaddleSpeed(rules: number): bigint {
 return (rules===17||rules===18)?300_000_000n:180_000_000n;
}
export function responsiveState<T extends object>(state:T,rules:number):T&{paddleSpeed:bigint}{
 return {...state,paddleSpeed:rulesPaddleSpeed(rules)};
}
