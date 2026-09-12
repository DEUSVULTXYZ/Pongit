import type { NextConfig } from "next";
import path from "node:path";
import createMDX from "@next/mdx";
import {readFileSync,existsSync} from "node:fs";
const interludeLab=JSON.parse(readFileSync(path.resolve("deployments/interlude-lab.json"),"utf8")) as {node:string};
const interludeRooms=JSON.parse(readFileSync(path.resolve("deployments/interlude-rooms.json"),"utf8")) as {node:string};
const independentPath=path.resolve("deployments/independent.json");
const independentOrigins=existsSync(independentPath)?JSON.parse(readFileSync(independentPath,"utf8")).arenas.flatMap((a:{app:string;node?:string})=>{
 if(!/^0x[\da-fA-F]{40}$/.test(a.app))throw Error("Invalid arena in CSP manifest");
 const node=a.node??`https://il-${a.app.slice(2,18).toLowerCase()}.fly.dev`;
 if(!/^https:\/\/il-[a-f0-9]+\.fly\.dev$/.test(node))throw Error("Unapproved arena in CSP manifest");
 return [node,node.replace(/^http/,"ws")];
}).join(" "):"";
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
              (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000") +
              " " +
              (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000") +
              " https://testnet-rpc.monad.xyz " + new URL(interludeLab.node).origin + " " + new URL(interludeRooms.node).origin +
              " " + new URL(interludeRooms.node).origin.replace(/^http/,"ws") +
              " " + independentOrigins +
              "; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
          },
        ],
      },
    ];
  },
};
export default createMDX({options:{remarkPlugins:["remark-gfm"],rehypePlugins:["rehype-slug"]}})(nextConfig);
