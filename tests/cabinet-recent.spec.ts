import {test,expect} from "@playwright/test";
import {allDeployments,deploymentId} from "../shared/protocol";

test("Recent matches uses the shared retention list and never falls through to account data",async({request})=>{
  const api=process.env.PONG_TEST_API||"http://localhost:3150/api";
  const get=async(path:string)=>{const r=await request.get(api+path);expect(r.ok()).toBe(true);return r.json();};
  const config=await get("/config");
  const histories=await Promise.all(allDeployments(config).map((d,i)=>get(i?`/legacy/history?deployment=${deploymentId(d)}`:"/history")));
  const records=histories.flatMap(h=>h.Match).filter(m=>m.played && m.status>=3).sort((a,b)=>b.endedAt.localeCompare(a.endedAt)||b.id.localeCompare(a.id));
  expect(records.length).toBeGreaterThan(0);
  const players=[...new Set<string>(records.flatMap(m=>[m.playerA,m.playerB]))].slice(0,8);
  for(const player of players){
    const response=await get(`/player/${player}/recent-matches`);
    expect(response.rating).toBeUndefined();
    expect(response.Match.map((m:any)=>m.id)).toEqual(records.filter(m=>m.playerA===player||m.playerB===player).slice(0,3).map(m=>m.id));
    for(const match of response.Match){expect(match.id).toMatch(/^v[1-4]:\d+$/);expect(match.replayAvailability).toBe("available");}
  }
  expect(await get("/player/0x0000000000000000000000000000000000000000/recent-matches")).toEqual({Match:[]});
});
