// ── ChatDrawer ──────────────────────────────────────────────────────────────
//
// Bottom-right floating chat drawer for multiplayer sessions. Tracks unread
// messages while collapsed and resets the counter when the drawer opens.
// v45: each message stamped with HH:MM so workshop facilitators can
// cross-reference chat moments with mission-log rounds during debrief.
// v45: autoscrolls to the latest message when the drawer is open.

import { useState, useEffect, useRef } from "react";

// Format a server timestamp (ms since epoch) as HH:MM in the viewer's
// local time. Workshop sessions are in-room with everyone on the same
// clock, so local time is the right reference frame.
function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function ChatDrawer({ mp }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const seenRef = useRef(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (open) {
      seenRef.current = mp.chat.length;
      setUnread(0);
    } else {
      setUnread(Math.max(0, mp.chat.length - seenRef.current));
    }
  }, [mp.chat.length, open]);

  // v45: autoscroll on new messages when the drawer is open. Use a small
  // requestAnimationFrame deferral so the message has actually rendered
  // before we measure scrollHeight.
  useEffect(() => {
    if (!open || !scrollRef.current) return;
    const el = scrollRef.current;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [mp.chat.length, open]);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", bottom: 14, right: 14, zIndex: 1000,
          background: "linear-gradient(135deg, rgba(46,32,104,0.85), rgba(52,96,168,0.55))",
          color: "var(--text-hi)",
          border: "1px solid var(--border-strong)",
          padding: "10px 16px",
          borderRadius: 22,
          fontFamily: "var(--sans)",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.06em",
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(236,234,248,0.08)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
        <span style={{ fontSize: 14 }}>◐</span>
        WORKSHOP CHAT
        {!open && unread > 0 && (
          <span style={{
            background: "var(--periwinkle)", color: "var(--bg-base)",
            borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700,
          }}>{unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 60, right: 14, width: 320, maxHeight: 480,
          zIndex: 1000,
          background: "rgba(20,18,32,0.94)",
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          backdropFilter: "blur(14px)",
          boxShadow: "0 20px 50px rgba(0,0,0,0.55)",
          display: "flex", flexDirection: "column",
          fontFamily: "var(--sans)",
        }}>
          <div style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--border-soft)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 11, letterSpacing: "0.14em", color: "var(--text-mid)",
          }}>
            <span>WORKSHOP CHAT · ROOM {mp.roomCode}</span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "var(--text-mid)",
              fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 0,
            }}>×</button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 14px", maxHeight: 340 }}>
            {mp.chat.length === 0 && (
              <div style={{
                color: "var(--text-dim)", fontStyle: "italic",
                fontFamily: "var(--serif)", fontSize: 12,
                textAlign: "center", padding: "16px 0",
              }}>
                No messages yet.
              </div>
            )}
            {mp.chat.map((m, i) => {
              const color =
                m.seat === 1 ? "var(--p1)" :
                m.seat === 2 ? "var(--p2)" :
                               "var(--text-bright)";
              return (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{
                    fontSize: 10, letterSpacing: "0.08em",
                    marginBottom: 2, fontWeight: 500,
                    display: "flex", alignItems: "baseline", gap: 8,
                  }}>
                    <span style={{ color }}>{m.from?.toUpperCase()}</span>
                    {m.ts && (
                      <span style={{
                        color: "var(--text-dim)", fontSize: 9,
                        fontFamily: "ui-monospace, monospace",
                        letterSpacing: "0.04em", fontWeight: 400,
                      }}>{formatTime(m.ts)}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-hi)", lineHeight: 1.45 }}>
                    {m.text}
                  </div>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) { mp.sendChat(draft.trim()); setDraft(""); }
            }}
            style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid var(--border-soft)" }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message…"
              style={{
                flex: 1, padding: "7px 10px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-soft)",
                borderRadius: 4,
                color: "var(--text-hi)",
                fontFamily: "var(--sans)", fontSize: 12,
                outline: "none",
              }}
            />
            <button type="submit" style={{
              background: "rgba(168,168,240,0.18)",
              border: "1px solid var(--border-strong)",
              color: "var(--text-hi)",
              padding: "7px 12px", borderRadius: 4, cursor: "pointer",
              fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.06em",
            }}>SEND</button>
          </form>
        </div>
      )}
    </>
  );
}
