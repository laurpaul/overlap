// ─────────────────────────────────────────────────────────────────────────────
// Overlap · multiplayer relay
// ─────────────────────────────────────────────────────────────────────────────
//
// This is a thin relay. The HOST browser owns the simulation. Peer clients
// receive serialized state snapshots from the host and send back actor-bound
// actions (clicks, button presses). The server's job is just to route those
// messages and remember the latest snapshot so latecomers can catch up.
//
// Run with:   node server/server.js
// Listens on: 0.0.0.0:8787   (override via env PORT)

import { createServer } from "node:http";
import { Server } from "socket.io";
import os from "node:os";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
// How long a room (and its snapshot) survives after the HOST socket drops,
// before the room is closed. A transient host blip, wifi, laptop sleep, tab
// background, must NOT destroy a live session, so the host can reconnect with
// its host token within this window and resume. Override via env for tests.
const HOST_GRACE_MS = Number(process.env.HOST_GRACE_MS || 45000);
const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(
    "Overlap · multiplayer relay\n" +
      "Ready. Connect a Socket.io client to this port.\n" +
      `Active rooms: ${rooms.size}\n`
  );
});

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 50 * 1024 * 1024, // snapshots can be chunky
});

// ── In-memory room registry ────────────────────────────────────────────────
// rooms: code → { hostId, snapshot, members: Map<socketId, {seat, name}> }
const rooms = new Map();

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // omit confusing chars
  let code;
  do {
    code = Array.from(
      { length: 4 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)]
    ).join("");
  } while (rooms.has(code));
  return code;
}

function roomSummary(room) {
  if (!room) return null;
  return {
    hostId: room.hostId,
    members: Array.from(room.members.entries()).map(([id, m]) => ({
      id,
      seat: m.seat,
      name: m.name,
      isHost: id === room.hostId,
    })),
  };
}

function broadcastRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit("room:update", roomSummary(room));
}

// Fully close a room: cancel any pending host-grace timer, tell everyone, drop it.
function closeRoom(code, reason) {
  const room = rooms.get(code);
  if (!room) return;
  if (room.graceTimer) { clearTimeout(room.graceTimer); room.graceTimer = null; }
  io.to(code).emit("room:closed", reason ? { reason } : undefined);
  rooms.delete(code);
}

io.on("connection", (socket) => {
  let joinedCode = null;

  socket.on("room:host", ({ name, seat } = {}, ack) => {
    const code = makeRoomCode();
    const hostSeat = (seat === 0 || seat === 1 || seat === 2) ? seat : 1;
    // hostToken is the secret that lets THIS host (and only this host) reclaim
    // the room after a disconnect. It never goes to peers.
    const hostToken = randomUUID();
    rooms.set(code, {
      hostId: socket.id,
      hostToken,
      hostSeat,
      hostName: name || "Host",
      snapshot: null,
      graceTimer: null,
      members: new Map([[socket.id, { seat: hostSeat, name: name || "Host" }]]),
    });
    socket.join(code);
    joinedCode = code;
    ack && ack({ ok: true, code, hostToken, you: { id: socket.id, seat: hostSeat, isHost: true } });
    broadcastRoom(code);
  });

  socket.on("room:join", ({ code, name, requestSeat } = {}, ack) => {
    code = String(code || "").toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) {
      ack && ack({ ok: false, error: "Room not found." });
      return;
    }
    const usedSeats = new Set(Array.from(room.members.values()).map((m) => m.seat));
    // Seat selection: requested seat wins if free; otherwise next free seat
    // among {1, 2, 0 (facilitator), 3, 4, …}. Seat 0 = facilitator, multiple
    // facilitators are allowed.
    let seat;
    if (requestSeat === 0) {
      seat = 0; // facilitators don't conflict
    } else if ((requestSeat === 1 || requestSeat === 2) && !usedSeats.has(requestSeat)) {
      seat = requestSeat;
    } else {
      // fallback: first free actor slot, then unique observer slot
      seat = !usedSeats.has(1) ? 1 : !usedSeats.has(2) ? 2 : 0;
    }
    room.members.set(socket.id, { seat, name: name || `Peer` });
    socket.join(code);
    joinedCode = code;
    ack &&
      ack({
        ok: true,
        code,
        you: { id: socket.id, seat, isHost: false },
        snapshot: room.snapshot,
      });
    broadcastRoom(code);
  });

  // Host → server: reclaim a room after a reconnect, using the host token.
  // The host's browser still holds the authoritative sim state across a socket
  // blip, so resuming just re-attaches this (new) socket as the room's host and
  // cancels the pending grace timer. Peers are told the host is back.
  socket.on("room:resume-host", ({ code, hostToken, name } = {}, ack) => {
    code = String(code || "").toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) { ack && ack({ ok: false, error: "Room not found." }); return; }
    if (!room.hostToken || room.hostToken !== hostToken) {
      ack && ack({ ok: false, error: "Invalid host token." });
      return;
    }
    if (room.graceTimer) { clearTimeout(room.graceTimer); room.graceTimer = null; }
    room.hostId = socket.id;
    const hostSeat = room.hostSeat;
    room.members.set(socket.id, { seat: hostSeat, name: name || room.hostName || "Host" });
    socket.join(code);
    joinedCode = code;
    ack && ack({ ok: true, code, you: { id: socket.id, seat: hostSeat, isHost: true }, snapshot: room.snapshot });
    socket.to(code).emit("room:host-reconnected");
    broadcastRoom(code);
  });

  // Any member can change their own seat. Host can also reassign others.
  socket.on("room:set-role", ({ memberId, seat } = {}) => {
    if (!joinedCode) return;
    const room = rooms.get(joinedCode);
    if (!room) return;
    const target = memberId || socket.id;
    // Only host can change others; anyone can change self
    if (target !== socket.id && socket.id !== room.hostId) return;
    const m = room.members.get(target);
    if (!m) return;
    // Seat 1/2 must be exclusive, if claiming an occupied actor seat, swap.
    if (seat === 1 || seat === 2) {
      for (const [id, member] of room.members.entries()) {
        if (id !== target && member.seat === seat) {
          member.seat = m.seat === 0 ? 0 : (m.seat === seat ? 1 : m.seat);
        }
      }
    }
    m.seat = seat;
    broadcastRoom(joinedCode);
  });

  socket.on("room:leave", () => {
    if (!joinedCode) return;
    const room = rooms.get(joinedCode);
    if (room) {
      room.members.delete(socket.id);
      socket.leave(joinedCode);
      if (socket.id === room.hostId || room.members.size === 0) {
        // Explicit leave by the host (or last member) disbands immediately, no
        // grace window, because this is intentional, not a connection blip.
        closeRoom(joinedCode);
      } else {
        broadcastRoom(joinedCode);
      }
    }
    joinedCode = null;
  });

  // Host → peers: full state snapshot
  socket.on("state:snapshot", (snapshot) => {
    if (!joinedCode) return;
    const room = rooms.get(joinedCode);
    if (!room || room.hostId !== socket.id) return;
    room.snapshot = snapshot;
    socket.to(joinedCode).emit("state:snapshot", snapshot);
  });

  // Peer → host: an action to apply (e.g. "place waypoint", "confirm turn")
  socket.on("action", (action) => {
    if (!joinedCode) return;
    const room = rooms.get(joinedCode);
    if (!room) return;
    const me = room.members.get(socket.id);
    if (!me) return;
    if (!room.hostId) return; // host is mid-reconnect; drop transient actions
    const enriched = { ...action, from: { id: socket.id, seat: me.seat, name: me.name } };
    io.to(room.hostId).emit("action", enriched);
  });

  // Chat / facilitator messages (broadcast)
  socket.on("chat", (msg) => {
    if (!joinedCode) return;
    const room = rooms.get(joinedCode);
    if (!room) return;
    const me = room.members.get(socket.id);
    io.to(joinedCode).emit("chat", {
      text: String(msg?.text || "").slice(0, 500),
      from: me?.name || "anon",
      seat: me?.seat,
      ts: Date.now(),
    });
  });

  socket.on("disconnect", () => {
    if (!joinedCode) return;
    const room = rooms.get(joinedCode);
    if (!room) return;
    const code = joinedCode;
    room.members.delete(socket.id);
    if (socket.id === room.hostId) {
      // The HOST dropped. Do NOT destroy the room, a transient blip would take
      // the whole session with it. Keep the room and its snapshot, tell peers
      // the host is reconnecting, and start a grace timer. The host can reclaim
      // the room with its host token (room:resume-host) within the window; if it
      // never comes back, the timer closes the room.
      room.hostId = null;
      socket.to(code).emit("room:host-disconnected", { graceMs: HOST_GRACE_MS });
      broadcastRoom(code);
      if (room.graceTimer) clearTimeout(room.graceTimer);
      room.graceTimer = setTimeout(() => closeRoom(code, "host-timeout"), HOST_GRACE_MS);
    } else if (room.members.size === 0) {
      // No host attached and the last peer left, nothing left to preserve.
      closeRoom(code);
    } else {
      broadcastRoom(code);
    }
  });
});

// ── Print LAN addresses on startup ─────────────────────────────────────────
function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === "IPv4" && !ni.internal) {
        out.push({ iface: name, address: ni.address });
      }
    }
  }
  return out;
}

httpServer.listen(PORT, "0.0.0.0", () => {
  const addrs = lanAddresses();
  console.log("");
  console.log("  Overlap · multiplayer relay");
  console.log("  ─────────────────────────────────────────");
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const a of addrs) {
    console.log(`  LAN:     http://${a.address}:${PORT}   (${a.iface})`);
  }
  console.log("");
  console.log("  Share the LAN URL with the other laptops.");
  console.log("  In the app, they enter the room code shown on the host's screen.");
  console.log("");
});
