import test from "node:test";
import assert from "node:assert/strict";
import {
  nextPair,
  rotateMembers,
  roomAuthMessage,
  type RoomMember,
} from "../shared/rooms";
const members: RoomMember[] = ["a", "b", "c", "d", "e", "f", "g", "h"].map(
  (player, i) => ({ player, joined: i, position: i, away: false, seen: 1000 }),
);
test("winner stays and loser goes behind six waiting members", () => {
  const rotated = rotateMembers(members, "a", "b", "b");
  assert.deepEqual(
    nextPair(rotated, "b", 1000).map((m) => m.player),
    ["b", "c"],
  );
  assert.equal(rotated.find((m) => m.player === "a")!.position, 8);
  assert.equal(members[0].position, 0);
});
test("away and disconnected members never consume an offer", () => {
  const list = members.map((m) => ({
    ...m,
    away: m.player === "b",
    seen: m.player === "a" ? 0 : 40000,
  }));
  assert.deepEqual(
    nextPair(list, "b", 40000).map((m) => m.player),
    ["c", "d"],
  );
});
test("two members can repeat a duel", () => {
  const rotated = rotateMembers(members.slice(0, 2), "a", "b", "a");
  assert.deepEqual(
    nextPair(rotated, "a", 1000).map((m) => m.player),
    ["a", "b"],
  );
});
test("social proof binds the deployment and is not a financial authorization", () => {
  const a = roomAuthMessage("0xAbc", "nonce", 100, "app1"),
    b = roomAuthMessage("0xAbc", "nonce", 100, "app2");
  assert.notEqual(a, b);
  assert(a.includes("No funds."));
  assert(a.includes("Player: 0xabc"));
});
