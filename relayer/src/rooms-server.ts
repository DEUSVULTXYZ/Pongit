// Isolated validation entrypoint: never starts V4 relaying or payment workers.
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import pg from "pg";
import { createRoomsCoordinator } from "./interlude-rooms";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
await db.query(
  "CREATE TABLE IF NOT EXISTS profiles(player text PRIMARY KEY,handle text UNIQUE,avatar integer,updated_at timestamptz DEFAULT now());CREATE TABLE IF NOT EXISTS player_blocks(player text,blocked text,PRIMARY KEY(player,blocked));",
);
const origin = process.env.ALLOWED_ORIGIN || "https://pongit.xyz";
const send = (res: any, v: unknown, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(
    JSON.stringify(v, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
};
async function body(req: any) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 16384) throw new Error("Request too large");
  }
  return JSON.parse(text || "{}");
}
const coordinator = await createRoomsCoordinator({
  db,
  origin,
  send,
  body,
  graphql: async () => ({ Match: [] }),
});
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, origin);
    if (req.headers.origin && req.headers.origin !== origin) {
      send(res, { error: "Origin denied" }, 403);
      return;
    }
    if (await coordinator?.route(req, res, url.pathname)) return;
    if (url.pathname === "/profiles") {
      const search = (url.searchParams.get("search") || "")
        .trim()
        .toLowerCase();
      send(res, {
        profiles: (
          await db.query(
            "SELECT player,handle,avatar FROM profiles WHERE starts_with(handle,$1) OR player=$1 LIMIT 30",
            [search],
          )
        ).rows,
      });
      return;
    }
    send(res, { ok: true });
  } catch (e) {
    send(res, { error: (e as Error).message }, 400);
  }
});
const ws = new WebSocketServer({ server, path: "/ws", maxPayload: 1024 });
ws.on("connection", (socket, req) => {
  if (req.headers.origin !== origin) {
    socket.close(1008);
    return;
  }
  socket.on("message", async (text) => {
    try {
      const v = JSON.parse(text.toString());
      if (v.type === "subscribe-rooms")
        await coordinator?.subscribe(socket, req, v.player);
    } catch {
      socket.close(1008);
    }
  });
});
server.listen(Number(process.env.PORT || 4000), "0.0.0.0");
