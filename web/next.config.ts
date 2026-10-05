import type { NextConfig } from "next";
import path from "node:path";
import createMDX from "@next/mdx";
import {readFileSync,existsSync} from "node:fs";
import {createRequire} from 'node:module';
// Next's compiled config module does not retain a relative parent filename.
const {agentPoolCspOrigins}=createRequire(path.resolve('web/next.config.ts'))('../shared/agent-pool-csp.ts') as typeof import('../shared/agent-pool-csp');
const {INTERLUDE_REGIONS}=createRequire(path.resolve('web/next.config.ts'))('../shared/interlude-regions.ts') as typeof import('../shared/interlude-regions');
const {independentCspOrigins}=createRequire(path.resolve('web/next.config.ts'))('../shared/independent-csp.ts') as typeof import('../shared/independent-csp');
const interludeLab=JSON.parse(readFileSync(path.resolve("deployments/interlude-lab.json"),"utf8")) as {node:string};
const interludeRooms=JSON.parse(readFileSync(path.resolve("deployments/interlude-rooms.json"),"utf8")) as {node:string};
const independentPath=path.resolve("deployments/independent.json");
const independentOrigins=existsSync(independentPath)?independentCspOrigins(JSON.parse(readFileSync(independentPath,"utf8"))):"";
const agentPath=path.resolve('deployments/agents.json');
const agentOrigins=existsSync(agentPath)?(()=>{
 const m=JSON.parse(readFileSync(agentPath,'utf8'));
 if(m.chainId!==10143||!/^0x[\da-fA-F]{40}$/.test(m.app)||!/^https:\/\/il-[a-f0-9]+\.fly\.dev$/.test(m.node))throw Error('Unapproved agent arena in CSP manifest');
 return `${m.node} ${m.node.replace(/^http/,'ws')}`;
})():'';
// Private and migration builds must bind the same reviewed manifest as their
// reader. Never broaden connect-src to all provider hosts for a new deployment.
const poolPath=path.resolve(process.env.PONG_AGENT_POOL_MANIFEST??'deployments/agent-pool.json');
if((process.env.PONG_REQUIRE_AGENT_POOL_MANIFEST==='true'||process.env.PONG_AGENT_POOL_MANIFEST)&&!existsSync(poolPath))
 throw Error('Agent Arcade build requires its configured manifest for the network security policy');
const poolOrigins=existsSync(poolPath)?agentPoolCspOrigins(JSON.parse(readFileSync(poolPath,'utf8'))):'';
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  turbopack: { root: path.join(import.meta.dirname, "..") },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'" +
              (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "") +
              "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' " +
              new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").origin +
              " " +
              (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000") +
              " https://testnet-rpc.monad.xyz " + new URL(interludeLab.node).origin + " " + new URL(interludeRooms.node).origin +
              " " + new URL(interludeRooms.node).origin.replace(/^http/,"ws") +
              " " + independentOrigins +
              " " + agentOrigins +
              " " + poolOrigins +
              " " + INTERLUDE_REGIONS.map(r=>r.node).join(" ") +
              "; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
          },
        ],
      },
    ];
  },
};
export default createMDX({options:{remarkPlugins:["remark-gfm"],rehypePlugins:["rehype-slug"]}})(nextConfig);
