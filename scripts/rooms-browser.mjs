// HTTPS-origin UI tests routed entirely to private VPS containers.
import { chromium } from "playwright";
import WebSocket from "ws";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createPublicClient, http } from "viem";
import assert from "node:assert/strict";
assert.equal(process.env.ROOMS_BROWSER_TEST, "isolated-vps");
const origin = "https://pongit.xyz",
  out = "artifacts/interlude-rooms/browser";
const manifest = JSON.parse(
  await readFile("deployments/interlude-rooms.json", "utf8"),
);
const abi = JSON.parse(
  await readFile(
    "contracts/out/PongInterludeRooms.sol/PongInterludeRooms.json",
    "utf8",
  ),
).abi;
const engine = createPublicClient({
  transport: http(manifest.node, { retryCount: 0 }),
});
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const contexts = [],
  pages = [],
  errors = [],
  assertions = [0, 0, 0],
  report = {
    startedAt: new Date().toISOString(),
    checks: [],
    viewports: [],
    api: [],
    network: [],
  };
await mkdir(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, timeout = 35000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await fn()) return;
    } catch {}
    await wait(150);
  }
  throw Error("Timed out: " + label);
}
async function init(i) {
  const context = await browser.newContext({
    viewport:
      i === 1 ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
  });
  contexts.push(context);
  await context.route(origin + "/**", async (route) => {
    const u = new URL(route.request().url());
    const response = await route.fetch({
      url: u.pathname.startsWith("/api/")
        ? "http://rooms-api:4000" + u.pathname.slice(4) + u.search
        : "http://rooms-web:3000" + u.pathname + u.search,
    });
    await route.fulfill({ response });
  });
  await context.routeWebSocket("wss://pongit.xyz/ws", async (route) => {
    const cookie = (await context.cookies(origin))
        .map((c) => c.name + "=" + c.value)
        .join("; "),
      pending = [];
    const server = new WebSocket("ws://rooms-api:4000/ws", {
      headers: { origin, cookie },
    });
    route.onMessage((m) =>
      server.readyState === 1 ? server.send(m) : pending.push(m),
    );
    server.on("open", () => pending.splice(0).forEach((m) => server.send(m)));
    server.on("message", (m) => route.send(m.toString()));
    server.on("error", () => route.close());
    server.on("close", () => route.close());
    route.onClose(() => server.close());
  });
  const page = await context.newPage();
  pages.push(page);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => {
    if (report.network.length < 20)
      report.network.push({
        url: r.url().split("?")[0],
        failure: r.failure()?.errorText,
      });
  });
  page.on("console", (m) => {
    if (m.type() === "error" && report.network.length < 20)
      report.network.push({
        console: m.text().split("Request body")[0].slice(0, 400),
      });
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/interlude/") && r.request().method() !== "GET")
      report.api.push({
        player: i,
        path: new URL(r.url()).pathname,
        status: r.status(),
      });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: true,
    },
  });
  cdp.on("WebAuthn.credentialAsserted", () => assertions[i]++);
  await page.goto(origin + "/rooms");
  await page.getByRole("button", { name: "Enter muted", exact: true }).click();
  return page;
}
const state = (page) =>
  page.evaluate(async () => {
    const key = Object.keys(sessionStorage).find(
      (k) => k.startsWith("pongit:rooms:") && k.endsWith(":account"),
    );
    const r = await fetch("/api/interlude/state", {
      headers: { "x-pongit-player": sessionStorage.getItem(key) || "" },
    });
    return r.json();
  });
async function createPlayer(page) {
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page
    .getByRole("button", { name: "Create a passkey", exact: true })
    .click();
  await until(
    () => page.getByRole("dialog", { name: "Your account" }).isVisible(),
    "Mera connected",
  );
  const address = await page.locator(".rooms-address").textContent();
  await page
    .getByRole("button", { name: "Close Your account", exact: true })
    .click();
  return address;
}
try {
  const a = await init(0),
    b = await init(1),
    c = await init(2);
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 1000 },
    { width: 844, height: 390 },
  ]) {
    await c.setViewportSize(viewport);
    await wait(150);
    const boxes = await c.locator(".rooms-choice").evaluateAll((es) =>
      es.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          bottom: r.bottom,
        };
      }),
    );
    assert.equal(boxes.length, 3);
    assert(boxes.every((x) => x.height >= 44));
    if (viewport.width === 360)
      assert(
        boxes.every((x) => x.bottom <= 640),
        "Three choices visible at 360x640",
      );
    assert(
      await c.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await c.screenshot({ path: `${out}/home-${viewport.width}.png` });
    report.viewports.push({ viewport, boxes });
  }
  const addresses = [
    await createPlayer(a),
    await createPlayer(b),
    await createPlayer(c),
  ];
  report.assertionsConnected = [...assertions];
  report.players = addresses;
  await a.locator(".rooms-account-toggle").click();
  const username = "browserqa" + Date.now().toString().slice(-7);
  await a.getByLabel("Username", { exact: true }).fill(username);
  await wait(4500);
  assert.equal(
    await a.getByLabel("Username", { exact: true }).inputValue(),
    username,
  );
  await a.getByRole("button", { name: "Save profile", exact: true }).click();
  await until(
    () => a.getByText("Profile saved", { exact: true }).isVisible(),
    "profile persisted",
  );
  await a
    .getByRole("button", { name: "Close Your account", exact: true })
    .click();
  await a.getByRole("button", { name: /Create room/ }).click();
  await a
    .getByRole("dialog", { name: "Create room" })
    .getByRole("button", { name: /^Create room/ })
    .click();
  await until(async () => !!(await state(a)).room, "group room");
  const room = (await state(a)).room.id;
  await b.goto(origin + "/rooms/" + room);
  await b.getByRole("button", { name: "Accept", exact: true }).click();
  await until(
    () => a.getByRole("button", { name: "Accept", exact: true }).isVisible(),
    "pair proposal",
  );
  await a.getByRole("button", { name: "Accept", exact: true }).click();
  await until(
    () => a.locator(".rooms-playing canvas").isVisible(),
    "first player arena",
  );
  await until(
    () => b.locator(".rooms-playing canvas").isVisible(),
    "invitation automatically accepts first duel",
  );
  await c.goto(origin + "/rooms/" + room);
  await c.getByRole("button", { name: "Accept", exact: true }).click();
  await until(
    () => c.locator(".rooms-playing canvas").isVisible(),
    "room spectator",
  );
  const off = (await state(a)).room.offer;
  report.match = off.id;
  for (const p of [a, b]) {
    assert.equal(await p.locator("footer").count(), 0);
    const shape = await p.locator("canvas").boundingBox();
    assert(
      Math.abs(shape.width / shape.height - 16 / 9) < 0.03,
      "Rectangular 16:9 court",
    );
  }
  await a.screenshot({path:out+"/game-desktop.png"});
  await b.screenshot({path:out+"/game-mobile.png"});
  await a.keyboard.down("w");
  await wait(220);
  await a.keyboard.up("w");
  await until(async () => {
    const s = await engine.readContract({
      address: manifest.app,
      abi,
      functionName: "getSnapshot",
      args: [BigInt(off.id)],
    });
    return s[9] > 0n && s[12].leftDir === 0;
  }, "release reaches engine");
  await a.reload();
  await until(
    () => a.locator(".rooms-playing canvas").isVisible(),
    "F5 restores active game",
  );
  assert.deepEqual(assertions, report.assertionsConnected);
  await a.getByRole("button", { name: "Tools", exact: true }).click();
  await a.getByRole("button", { name: "Concede", exact: true }).click();
  await a.getByRole("dialog", { name: "Confirmed match result" }).waitFor();
  await b.getByRole("dialog", { name: "Confirmed match result" }).waitFor();
  assert.equal(await a.locator(".outcome h2").textContent(), "DEFEAT");
  assert.equal(await b.locator(".outcome h2").textContent(), "VICTORY");
  assert.equal(
    await a.evaluate(() => getComputedStyle(document.body).position),
    "fixed",
  );
  await a.screenshot({ path: `${out}/result-desktop.png` });
  await b.screenshot({ path: `${out}/result-mobile.png` });
  await until(async () => {
    const r = (await state(c)).room;
    return r.offer.id !== off.id;
  }, "next pair proposed");
  assert(
    await c.getByRole("button", { name: "Accept", exact: true }).isVisible(),
    "A spectator must explicitly accept their next turn",
  );
  await c.getByRole("button", { name: "Back", exact: true }).click();
  await until(
    () =>
      c.getByRole("button", { name: "Rejoin queue", exact: true }).isVisible(),
    "declined turn is away",
  );
  report.checks.push(
    "Three actions visible at 360x640",
    "Mera PRF account creation, saved profile and preserved edit focus",
    "Private WebSocket notifications",
    "Accept invitation starts first duel without second click",
    "Spectator automatically sees game and must accept their next turn",
    "16:9 court, no footer below game",
    "Keyboard release reaches engine",
    "F5 without another passkey ceremony",
    "VICTORY / DEFEAT with locked background",
  );
  assert.deepEqual(errors, []);
  report.finishedAt = new Date().toISOString();
} catch (e) {
  report.failure = e.message;
  report.pages = [];
  for (let i = 0; i < pages.length; i++) {
    await pages[i]
      .screenshot({ path: `${out}/failure-${i}.png` })
      .catch(() => {});
    report.pages.push({
      url: pages[i].url(),
      text: await pages[i]
        .locator("body")
        .innerText()
        .catch(() => ""),
    });
  }
  process.exitCode = 1;
  console.error(e.message);
} finally {
  report.errors = errors;
  report.assertions = assertions;
  await writeFile(out + "/report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  for (const c of contexts) await c.unrouteAll({ behavior: "ignoreErrors" });
  await browser.close();
}
