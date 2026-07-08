// ── RoleBanner ──────────────────────────────────────────────────────────────
//
// Top-of-screen banner shown only in multiplayer sessions. Indicates the
// user's seat (Facilitator / Actor I / Actor II), the room code, member
// count, and gives the facilitator override-as controls plus a button to
// open the inject deck.

export function RoleBanner({ mp, hostSeat, overrideAs, onSetOverride, onOpenInjects }) {
  const mySeat = mp.status === "hosting" ? hostSeat : mp.seat;
  const seatLabel =
    mySeat === 0 ? "Facilitator" :
    mySeat === 1 ? "Actor I" :
    mySeat === 2 ? "Actor II" :
    `Seat ${mySeat}`;
  const seatColor =
    mySeat === 0 ? "var(--blue-lavender)" :
    mySeat === 1 ? "var(--p1)" :
                   "var(--p2)";
  const isFac = mySeat === 0;
  const hostName = mp.members.find((m) => m.isHost)?.name || "host";

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
      padding: "8px 18px",
      background: "linear-gradient(180deg, rgba(46,32,104,0.92) 0%, rgba(32,30,64,0.86) 100%)",
      borderBottom: "1px solid var(--border-strong)",
      backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", gap: 14,
      fontFamily: "var(--sans)", fontSize: 12, color: "var(--text-bright)",
      boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: seatColor, boxShadow: `0 0 10px ${seatColor}`,
        }}/>
        <span style={{ color: seatColor, fontWeight: 600, letterSpacing: "0.08em" }}>
          {mp.status === "hosting" ? "HOSTING · " : ""}{seatLabel.toUpperCase()}
        </span>
      </span>

      {isFac && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 6 }}>
          <span style={{ color: "var(--text-mid)", fontStyle: "italic", fontFamily: "var(--serif)", fontSize: 11 }}>
            Override as:
          </span>
          {[null, 0, 1].map((opt) => {
            const label    = opt === null ? "off"   : opt === 0 ? "Actor I" : "Actor II";
            const optColor = opt === null ? "var(--text-mid)" : opt === 0 ? "var(--p1)" : "var(--p2)";
            const active   = overrideAs === opt;
            return (
              <button
                key={String(opt)}
                onClick={() => onSetOverride(opt)}
                style={{
                  background: active ? `${optColor}22` : "transparent",
                  border: `1px solid ${active ? optColor : "var(--border-soft)"}`,
                  color: active ? optColor : "var(--text-bright)",
                  padding: "3px 9px", borderRadius: 3, fontSize: 10.5,
                  cursor: "pointer", fontFamily: "var(--sans)", letterSpacing: "0.04em",
                }}>{label}</button>
            );
          })}
          <button onClick={onOpenInjects} title="Open inject deck" style={{
            background: "linear-gradient(135deg, rgba(192,184,232,0.18), rgba(192,184,232,0.04))",
            border: "1px solid rgba(192,184,232,0.55)",
            color: "#ECEAF8", padding: "3px 11px", borderRadius: 3,
            fontSize: 10.5, cursor: "pointer",
            fontFamily: "var(--sans)", fontWeight: 600, letterSpacing: "0.06em",
            marginLeft: 6,
          }}>+ INJECT</button>
        </span>
      )}

      <span style={{
        color: "var(--text-mid)", flex: 1, fontStyle: "italic",
        fontFamily: "var(--serif)", textAlign: "right", marginRight: 10,
      }}>
        {isFac
          ? "God view: both actors' state fully visible."
          : mp.status === "hosting"
            ? `Hosting · driving the simulation as ${seatLabel}.`
            : `${hostName} is hosting · you control ${seatLabel}.`}
      </span>

      <span style={{
        fontFamily: "var(--mono)", letterSpacing: "0.18em", fontSize: 11,
        color: "var(--periwinkle)", padding: "3px 10px",
        border: "1px solid var(--border-soft)", borderRadius: 3,
      }}>
        ROOM {mp.roomCode}
      </span>
      <span style={{ color: "var(--text-mid)", fontSize: 11 }}>· {mp.members.length} connected</span>
      <button
        onClick={() => mp.leave()}
        style={{
          background: "transparent", border: "1px solid var(--border-soft)",
          color: "var(--text-bright)", padding: "4px 10px", borderRadius: 3,
          fontSize: 11, cursor: "pointer", fontFamily: "var(--sans)",
        }}>
        Leave
      </button>
    </div>
  );
}
