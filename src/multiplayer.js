// ─────────────────────────────────────────────────────────────────────────────
// Overlap · multiplayer client
// ─────────────────────────────────────────────────────────────────────────────
//
// Design:
//   - The HOST is authoritative: it owns the real React state and runs the
//     simulation. After each user action that changes state, the host calls
//     broadcastSnapshot(snapshot) to push a serialized view to peers.
//   - PEERS receive snapshots and apply them to their local React state via
//     ingestSnapshot(snapshot) → which the App component wires into setters.
//   - Peer user input is sent through sendAction(actionName, payload). The
//     server forwards it to the host, which applies it as if it were local.
//
// This keeps the existing 6,000+ line single-player codebase intact and adds
// multiplayer as a thin layer on top.

import { useEffect, useRef, useState, useCallback } from "react";
import { io as ioClient } from "socket.io-client";
// Snapshot (de)serialization lives in a pure, node-testable module so the
// host→peer wire contract is pinned by tests and can't silently drift. See
// src/sim/snapshotSync.js and tests/snapshotSync.test.js.
import { SNAPSHOT_KEYS, packSnapshot, unpackSnapshot } from "./sim/snapshotSync.js";
export { SNAPSHOT_KEYS, packSnapshot, unpackSnapshot };

// The relay server defaults to the SAME hostname the app is being served from,
// on port 8787, which is right whenever the client and relay share a host
// (localhost, a LAN IP, or a Tailscale IP). When they DON'T (relay on a
// different host/port, or you just want to point a client somewhere specific
// without rebuilding), override it, in priority order:
//   1. ?relay=http://host:port   (full URL, persisted to localStorage)
//   2. ?mpport=8799              (port only, persisted)
//   3. VITE_RELAY_URL            (build-time env)
//   4. previously-saved override (localStorage)
//   5. same host : 8787          (default)
export function defaultServerURL() {
  if (typeof window === "undefined") return "http://localhost:8787";
  const { protocol, hostname, search } = window.location;
  const qs = new URLSearchParams(search || "");
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
  const load = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };

  // 1. explicit full URL via query param (and remember it for this browser)
  const relayParam = qs.get("relay");
  if (relayParam) { save("mp_relay_url", relayParam); return relayParam; }

  // 2. port-only override via query param
  const portParam = qs.get("mpport");
  if (portParam) save("mp_relay_port", portParam);

  // 3. build-time env (vite)
  const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
  if (env.VITE_RELAY_URL) return env.VITE_RELAY_URL;

  // 4. saved full-URL override from a previous ?relay=
  const savedUrl = load("mp_relay_url");
  if (savedUrl) return savedUrl;

  // 5. resolve a port and build same-host URL
  const port = portParam || window.__MP_PORT__ || load("mp_relay_port") || env.VITE_RELAY_PORT || 8787;
  return `${protocol}//${hostname}:${port}`;
}

// ── Snapshot serializer ────────────────────────────────────────────────────
// Moved to src/sim/snapshotSync.js (pure, node-testable) and re-exported above.
// The host curates exactly which fields to send in App.jsx's
// `snapshotForBroadcast`; packSnapshot passes that object through verbatim
// (encoding only typed arrays), so adding a synced field in App.jsx is now the
// only step required, no separate allowlist to keep in sync.

// ── React hook ─────────────────────────────────────────────────────────────
export function useMultiplayer() {
  // status: 'offline' | 'connecting' | 'lobby' | 'hosting' | 'joined' | 'error'
  const [status, setStatus] = useState("offline");
  const [serverURL, setServerURL] = useState(defaultServerURL());
  const [roomCode, setRoomCode] = useState("");
  const [you, setYou] = useState(null); // { id, seat, isHost }
  const [members, setMembers] = useState([]);
  const [chat, setChat] = useState([]); // [{from, seat, text, ts}]
  const [errorMsg, setErrorMsg] = useState("");
  const [lastSnapshot, setLastSnapshot] = useState(null);
  // Reconnection surface: `reconnecting` is true while OUR socket is re-establishing
  // mid-session; `hostPresent` is false while (for a peer) the host is mid-reconnect;
  // `notice` is a human-readable banner string ("" when clear).
  const [reconnecting, setReconnecting] = useState(false);
  const [hostPresent, setHostPresent] = useState(true);
  const [notice, setNotice] = useState("");

  const socketRef = useRef(null);
  const actionHandlerRef = useRef(null); // host installs this to receive peer actions
  const snapshotHandlerRef = useRef(null); // peer installs this to receive host state
  // What to re-establish if the socket reconnects mid-session. Set on a
  // successful host()/join(), cleared on leave() or a genuine room close.
  const resumeRef = useRef(null); // { role:'host'|'peer', code, seat, name, hostToken? }

  const connect = useCallback(
    (url) => {
      if (socketRef.current) socketRef.current.disconnect();
      setStatus("connecting");
      setErrorMsg("");
      const sock = ioClient(url || serverURL, {
        transports: ["websocket", "polling"],
        reconnectionAttempts: 4,
        timeout: 8000,
      });
      socketRef.current = sock;

      sock.on("connect", () => {
        // A bare connect with no active session → lobby (the initial host()/join()
        // flows drive room entry via their own once("connect")). A connect WITH a
        // stored session is a reconnect: transparently reclaim the room.
        const sess = resumeRef.current;
        if (sess && sess.role === "host") {
          sock.emit("room:resume-host", { code: sess.code, hostToken: sess.hostToken, name: sess.name }, (ack) => {
            if (ack?.ok) {
              setYou(ack.you); setRoomCode(ack.code); setStatus("hosting");
              setReconnecting(false); setHostPresent(true); setNotice("");
            } else {
              resumeRef.current = null;
              setStatus("lobby"); setReconnecting(false); setMembers([]); setRoomCode(""); setYou(null);
              setErrorMsg(ack?.error || "Session ended while disconnected.");
            }
          });
        } else if (sess && sess.role === "peer") {
          sock.emit("room:join", { code: sess.code, name: sess.name, requestSeat: sess.seat }, (ack) => {
            if (ack?.ok) {
              setYou(ack.you); setRoomCode(ack.code); setStatus("joined");
              setReconnecting(false); setHostPresent(true); setNotice("");
              if (ack.snapshot) {
                const u = unpackSnapshot(ack.snapshot);
                setLastSnapshot(u);
                if (snapshotHandlerRef.current) snapshotHandlerRef.current(u);
              }
            } else {
              resumeRef.current = null;
              setStatus("lobby"); setReconnecting(false); setMembers([]); setRoomCode(""); setYou(null);
              setErrorMsg(ack?.error || "Session ended while disconnected.");
            }
          });
        } else {
          setStatus("lobby");
        }
      });
      sock.on("connect_error", (err) => {
        // Only surface a hard error if we're not mid-session; during a session
        // blip socket.io keeps retrying and the banner already says "reconnecting".
        if (!resumeRef.current) {
          setStatus("error");
          const target = url || serverURL;
          // Most common cause is the relay simply not running / not reachable on
          // that host:port, make the message actionable rather than just "ws error".
          let hint = "Make sure the relay server is running on that machine "
            + "(use `npm start`, not just `npm run dev`) and that its port is open in the firewall "
            + "and reachable from this device (same LAN / Tailscale).";
          try {
            if (typeof window !== "undefined"
                && window.location.protocol === "https:"
                && /^http:/.test(target)) {
              hint = "The page is served over HTTPS but the relay is plain HTTP, so the browser "
                + "blocks the connection (mixed content). Serve the relay over HTTPS, or open the "
                + "app over http://, or override with ?relay=…";
            }
          } catch { /* ignore */ }
          setErrorMsg(`Could not reach the relay at ${target}. ${hint} (${err.message})`);
        }
      });
      sock.on("disconnect", () => {
        if (resumeRef.current) {
          // Mid-session blip: keep the room view in place and let socket.io
          // reconnect; the "connect" handler above will reclaim the room.
          setReconnecting(true);
          setNotice("Connection lost, reconnecting…");
        } else {
          setStatus("offline");
          setMembers([]);
          setRoomCode("");
          setYou(null);
        }
      });

      sock.on("room:update", (summary) => {
        if (summary) setMembers(summary.members || []);
      });
      sock.on("room:closed", (info) => {
        resumeRef.current = null;
        setStatus("lobby");
        setMembers([]);
        setRoomCode("");
        setYou(null);
        setReconnecting(false);
        setHostPresent(true);
        setNotice("");
        setErrorMsg(info?.reason === "host-timeout"
          ? "The host did not reconnect in time and the room was closed."
          : "The room was closed.");
      });
      // Peer-side host presence during the host's grace window.
      sock.on("room:host-disconnected", () => {
        setHostPresent(false);
        setNotice("Host connection lost, waiting for them to reconnect…");
      });
      sock.on("room:host-reconnected", () => {
        setHostPresent(true);
        setNotice("");
      });

      sock.on("state:snapshot", (snap) => {
        const unpacked = unpackSnapshot(snap);
        setLastSnapshot(unpacked);
        if (snapshotHandlerRef.current) snapshotHandlerRef.current(unpacked);
      });

      sock.on("action", (action) => {
        if (actionHandlerRef.current) actionHandlerRef.current(action);
      });

      sock.on("chat", (msg) => {
        setChat((c) => [...c.slice(-99), msg]);
      });
      return sock;
    },
    [serverURL]
  );

  const host = useCallback(
    (name, seat) => {
      // v110: connect lazily. The lobby no longer opens a socket on mount
      // (which spammed the console with WebSocket errors during solo play),
      // so host() establishes the connection first if needed, then emits
      // room:host once the socket is actually connected.
      const doHost = (sock) => {
        sock.emit("room:host", { name, seat }, (ack) => {
          if (ack?.ok) {
            setRoomCode(ack.code);
            setYou(ack.you);
            setStatus("hosting");
            resumeRef.current = { role: "host", code: ack.code, seat: ack.you?.seat, name, hostToken: ack.hostToken };
          } else {
            setErrorMsg("Could not host a room.");
          }
        });
      };
      const existing = socketRef.current;
      if (existing && existing.connected) { doHost(existing); return; }
      const sock = connect();
      if (sock) sock.once("connect", () => doHost(sock));
    },
    [connect]
  );

  const join = useCallback((code, name, requestSeat) => {
    // v110: connect lazily (see host()).
    const doJoin = (sock) => {
      sock.emit("room:join", { code, name, requestSeat }, (ack) => {
        if (ack?.ok) {
          setRoomCode(ack.code);
          setYou(ack.you);
          setStatus("joined");
          resumeRef.current = { role: "peer", code: ack.code, seat: ack.you?.seat, name };
          if (ack.snapshot) {
            const unpacked = unpackSnapshot(ack.snapshot);
            setLastSnapshot(unpacked);
            if (snapshotHandlerRef.current) snapshotHandlerRef.current(unpacked);
          }
        } else {
          setErrorMsg(ack?.error || "Could not join.");
        }
      });
    };
    const existing = socketRef.current;
    if (existing && existing.connected) { doJoin(existing); return; }
    const sock = connect();
    if (sock) sock.once("connect", () => doJoin(sock));
  }, [connect]);

  // Change my own seat (or, host-only, someone else's).
  const setRole = useCallback((seat, memberId) => {
    const sock = socketRef.current;
    if (!sock) return;
    sock.emit("room:set-role", { seat, memberId });
    // Optimistic local update for "you" when changing self
    if (!memberId) {
      setYou((prev) => prev ? { ...prev, seat } : prev);
    }
  }, []);

  const leave = useCallback(() => {
    const sock = socketRef.current;
    if (!sock) return;
    resumeRef.current = null; // intentional exit, do not auto-resume
    sock.emit("room:leave");
    setStatus("lobby");
    setMembers([]);
    setRoomCode("");
    setYou(null);
    setReconnecting(false);
    setHostPresent(true);
    setNotice("");
  }, []);

  const broadcastSnapshot = useCallback((state) => {
    const sock = socketRef.current;
    if (!sock || status !== "hosting") return;
    sock.emit("state:snapshot", packSnapshot(state));
  }, [status]);

  const sendAction = useCallback((name, payload) => {
    const sock = socketRef.current;
    if (!sock) return;
    sock.emit("action", { name, payload });
  }, []);

  const sendChat = useCallback((text) => {
    const sock = socketRef.current;
    if (!sock) return;
    sock.emit("chat", { text });
  }, []);

  // Register host's action-receive callback. We use a ref so the host can swap
  // the handler later without retriggering connect effects.
  const onPeerAction = useCallback((fn) => { actionHandlerRef.current = fn; }, []);
  const onIncomingSnapshot = useCallback((fn) => { snapshotHandlerRef.current = fn; }, []);

  const reassignSeat = useCallback((memberId, seat) => {
    const sock = socketRef.current;
    if (!sock) return;
    sock.emit("room:set-role", { memberId, seat });
  }, []);

  useEffect(() => () => {
    if (socketRef.current) socketRef.current.disconnect();
  }, []);

  return {
    status, setStatus,
    serverURL, setServerURL,
    roomCode,
    you,
    members,
    chat,
    errorMsg, setErrorMsg,
    lastSnapshot,
    reconnecting,
    hostPresent,
    notice,
    isHost: !!you?.isHost,
    seat: you?.seat || null,
    connect,
    host,
    join,
    leave,
    setRole,
    broadcastSnapshot,
    sendAction,
    sendChat,
    onPeerAction,
    onIncomingSnapshot,
    reassignSeat,
  };
}
