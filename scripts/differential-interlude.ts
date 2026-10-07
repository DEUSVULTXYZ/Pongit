import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { toHex, type Abi, type Hex } from "viem";
import { localChain } from "./local-chain";
import { initial as originalInitial, advance, accelerate } from "../shared/physics-interlude";
import { next } from "../shared/physics-v2";

const reportDirectory=process.env.PONG_QUALIFICATION_OUTPUT??"artifacts/interlude";
const responsive=process.env.PONG_PHYSICS_RULES==='responsive-300';
assert(!process.env.PONG_PHYSICS_RULES||responsive);
const initial=(seed:Hex)=>({...originalInitial(seed),...(responsive?{paddleSpeed:300_000_000n}:{})});
const physical=(s:ReturnType<typeof initial>)=>{const {paddleSpeed,...physics}=s;return physics;};
const chain = await localChain();
try {
  const a = JSON.parse(await readFile(responsive?"contracts/out/ResponsivePhysicsHarness.sol/ResponsivePhysicsHarness.json":"contracts/out/PhysicsInterlude.sol/PhysicsInterludeHarness.json", "utf8"));
  const hash = await chain.wallet.deployContract({ abi: a.abi as Abi, bytecode: a.bytecode.object as Hex });
  const address = (await chain.publicClient.waitForTransactionReceipt({ hash })).contractAddress!;
  let seed = 0xc0ffee;
  const random = () => seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  for (let i = 0; i < 10000; i += 24) {
    const cases = Array.from({length: Math.min(24,10000-i)}, (_,j) => {
      const entropy = toHex(BigInt(random()), {size:32});
      let s = initial(entropy);
      // Exercise long rallies well beyond the former proposed 2x cap.
      for(let hit=0,n=random()%41;hit<n;hit++)s=accelerate(s);
      s.leftDir = random()%3-1; s.rightDir = random()%3-1;
      [s] = advance(s,BigInt(random()%60000000));
      s.leftDir = random()%3-1; s.rightDir = random()%3-1;
      let target = s.t + BigInt(random()%600000000);
      if (!s.finished && j%3===0) target = next(s).at;
      if (!s.finished && j%3===1) target = next(s).at > s.t ? next(s).at-1n : s.t;
      return {s,target,limit:[0,1,2,32,128][random()%5],entropy};
    });
    await Promise.all(cases.map(async ({s,target,limit,entropy},j) => {
      const actual = await chain.publicClient.readContract({address,abi:a.abi,functionName:"advance",args:[s,target,BigInt(limit)]});
      const expected=advance(s,target,limit);
      assert.deepEqual(actual,[physical(expected[0]),expected[1]],`case ${i+j}`);
      if(i===0) assert.deepEqual(await chain.publicClient.readContract({address,abi:a.abi,functionName:"initial",args:[entropy]}),physical(initial(entropy)));
    }));
    if(i%1200===0)console.log(`Interlude rules 3: ${Math.min(i+24,10000)}/10000`);
  }
  await mkdir(reportDirectory,{recursive:true});
  await writeFile(`${reportDirectory}/differential-classic.json`,JSON.stringify({cases:10000,mismatches:0,rulesVersions:responsive?[17,18]:[3],seed:"0xc0ffee",checkedAt:new Date().toISOString()},null,2));
  console.log("PASS: 10000 Classic differential cases.");
} finally {chain.close();}
