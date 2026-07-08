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

// 7. Peer receives room:closed when host disconnects
let peerClosed=false;
peer.on("room:closed", () => { peerClosed = true; });
host.disconnect();
await wait(400);
log("peer notified when host leaves", peerClosed === true);

peer.disconnect();
const passed = results.filter(r=>r.ok).length;
console.log(`\n${passed}/${results.length} multiplayer checks passed`);
process.exit(passed === results.length ? 0 : 1);
