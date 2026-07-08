// Multiplayer relay integration test (item 6 verification).
//
// Unlike the pure unit tests under `node --test`, this exercises the LIVE
// socket.io relay: it spins up two clients against a running server and walks
// the full host -> join -> snapshot -> action -> chat -> disconnect flow that
// "wifi / multi-device mode" depends on. Run with `npm run test:mp` (which
// starts the server on PORT=8799, runs this, and tears the server down).
//
// The client emit/listen event names in src/multiplayer.js are kept in sync
// with server/server.js; this test fails loudly if that contract drifts.

import { io } from "socket.io-client";

const URL = "http://localhost:8799";
const wait = (ms) => new Promise(r => setTimeout(r, ms));
function connect() {
  return io(URL, { transports: ["websocket","polling"], reconnectionAttempts: 2, timeout: 4000 });
}
const results = [];
const log = (name, ok, extra="") => { results.push({name, ok}); console.log(`${ok?"PASS":"FAIL"}  ${name}${extra?"  · "+extra:""}`); };

const host = connect();
const peer = connect();

await new Promise((resolve) => {
  let hostConnected=false, peerConnected=false;
  const checkBoth = () => { if (hostConnected && peerConnected) resolve(); };
  host.on("connect", () => { hostConnected=true; checkBoth(); });
  peer.on("connect", () => { peerConnected=true; checkBoth(); });
  setTimeout(resolve, 4000);
});
log("both clients connect to relay", host.connected && peer.connected, `host=${host.connected} peer=${peer.connected}`);

// 1. Host creates a room
const hostAck = await new Promise((res) => host.emit("room:host", { name:"Host", seat:1 }, res));
log("host creates room", hostAck?.ok === true && !!hostAck.code, `code=${hostAck?.code} seat=${hostAck?.you?.seat}`);
const code = hostAck.code;

// 2. Peer joins with the code, requesting seat 2
const peerJoinAck = await new Promise((res) => peer.emit("room:join", { code, name:"Peer", requestSeat:2 }, res));
log("peer joins room with code", peerJoinAck?.ok === true && peerJoinAck.you?.seat === 2, `seat=${peerJoinAck?.you?.seat}`);

// 3. Host broadcasts a state snapshot; peer should receive it
let peerSnapshot = null;
peer.on("state:snapshot", (snap) => { peerSnapshot = snap; });
host.emit("state:snapshot", { round: 3, day: 2, marker: "hello-from-host" });
await wait(300);
log("host snapshot reaches peer", peerSnapshot?.marker === "hello-from-host", `round=${peerSnapshot?.round}`);

// 4. Peer sends an action; host should receive it enriched with seat
let hostAction = null;
host.on("action", (a) => { hostAction = a; });
peer.emit("action", { name: "inject:respond", payload: { pi: 1, deltas: { scoreAdj: 15 } } });
await wait(300);
log("peer action reaches host (seat-enriched)", hostAction?.name === "inject:respond" && hostAction?.from?.seat === 2, `from.seat=${hostAction?.from?.seat}`);

// 4b. Facilitator round-control actions relay to the host (wire-contract pin:
// these names are dispatched from FacilitatorPanel via dispatchAction).
let facAction = null;
host.on("action", (a) => { if (a?.name?.startsWith("facilitator:")) facAction = a; });
peer.emit("action", { name: "facilitator:pushRound", payload: {} });
await wait(150);
peer.emit("action", { name: "facilitator:setRoundDuration", payload: { ms: 300000 } });
await wait(200);
log("facilitator round-control actions reach host", facAction?.from?.seat !== undefined && (facAction?.name === "facilitator:setRoundDuration"), `last=${facAction?.name}`);

// 5. Chat broadcast both ways
let peerChat=null, hostChat=null;
peer.on("chat", (m) => { peerChat = m; });
host.on("chat", (m) => { hostChat = m; });
host.emit("chat", { text: "sync check" });
await wait(300);
log("chat broadcasts to all members", peerChat?.text === "sync check" && hostChat?.text === "sync check");

// 6. room:update membership reflects 2 members with distinct seats
let roomUpdate=null;
peer.on("room:update", (r) => { roomUpdate = r; });
// trigger an update via set-role no-op (re-claim same seat)
peer.emit("room:set-role", { seat: 2 });
await wait(300);
log("room membership shows 2 members", roomUpdate?.members?.length === 2, `members=${roomUpdate?.members?.length}`);

// 7. Host DISCONNECT no longer nukes the room — peer is told the host is
// reconnecting and the room (and snapshot) survive a grace window.
let peerClosed=false, hostGone=false, hostBack=false;
peer.on("room:closed", () => { peerClosed = true; });
peer.on("room:host-disconnected", () => { hostGone = true; });
peer.on("room:host-reconnected", () => { hostBack = true; });
host.disconnect();
await wait(400);
log("host blip notifies peer without closing the room", hostGone === true && peerClosed === false,
    `hostGone=${hostGone} closed=${peerClosed}`);

// 8. Host reconnects with its token and reclaims the room; the snapshot the host
// pushed earlier is preserved and handed back on resume.
const host2 = connect();
await new Promise((res) => { host2.on("connect", res); setTimeout(res, 4000); });
const resumeAck = await new Promise((res) => host2.emit("room:resume-host", { code, hostToken: hostAck.hostToken, name: "Host" }, res));
await wait(300);
log("host resumes with token; snapshot preserved", resumeAck?.ok === true && resumeAck?.snapshot?.marker === "hello-from-host",
    `ok=${resumeAck?.ok} marker=${resumeAck?.snapshot?.marker}`);
log("peer notified host reconnected", hostBack === true);

// 9. A bad token cannot hijack the room.
const badAck = await new Promise((res) => connect().emit("room:resume-host", { code, hostToken: "not-the-token" }, res));
log("wrong host token is rejected", badAck?.ok === false, `error=${badAck?.error}`);

// 10. If the host stays gone past the grace window, the room finally closes.
peerClosed = false;
host2.disconnect();
await wait(2000); // > HOST_GRACE_MS (1500 in test)
log("room closes after the host grace window expires", peerClosed === true);

peer.disconnect();
const passed = results.filter(r=>r.ok).length;
console.log(`\n${passed}/${results.length} multiplayer checks passed`);
process.exit(passed === results.length ? 0 : 1);
