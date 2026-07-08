// ── DiplomacyBanner ─────────────────────────────────────────────────────────
//
// Prominent overlay shown while a Conference of Parties session is in effect.
// Reads the talk-only freeze to the whole room: a countdown, who convened it,
// and (for the chair / host) an Adjourn button. Positioned top-center below the
// toolbar so it doesn't cover the map; pointer-events are off except on the
// button so the map stays interactive underneath.
//
// Props:
//   session       -- the session record | null (renders nothing when null)
//   convenerLabel -- display name of who convened it
//   clock         -- "M:SS" remaining
//   progress      -- 0..1 elapsed fraction (drives the bar)
//   canAdjourn    -- whether to show the Adjourn button (facilitator / host)
//   onAdjourn     -- () => void

export function DiplomacyBanner({ session, convenerLabel, clock, progress, canAdjourn, onAdjourn }) {
  if (!session || session.ended) return null;
  const urgent = progress > 0.85;
  return (
    <div style={{
      position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
      zIndex: 9, pointerEvents: "none",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
      minWidth: 300, maxWidth: 460,
    }}>
      <div style={{
        width: "100%",
        padding: "13px 22px 12px",
        background: "linear-gradient(135deg, rgba(46,32,104,0.96), rgba(20,18,32,0.96))",
        border: "1.5px solid rgba(168,168,240,0.6)",
        borderRadius: "8px 8px 0 0",
        boxShadow: "0 0 48px rgba(168,168,240,0.4), 0 12px 32px rgba(0,0,0,0.5)",
        textAlign: "center",
        fontFamily: "'Spectral', Georgia, serif",
      }}>
        <div style={{
          fontSize: 9.5, letterSpacing: "0.24em", color: "#A8A8F0",
          fontWeight: 600, textTransform: "uppercase", marginBottom: 4,
          fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <span>⚖ Conference of Parties, in session</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 12 }}>
          <div style={{
            fontSize: 30, color: urgent ? "#E8C998" : "#ECEAF8", fontWeight: 300,
            fontStyle: "italic", letterSpacing: "-0.01em", lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            textShadow: urgent ? "0 0 16px rgba(232,201,152,0.5)" : "0 0 14px rgba(168,168,240,0.4)",
          }}>{clock}</div>
        </div>
        <div style={{
          fontSize: 10.5, color: "#8B86B0", fontStyle: "italic", marginTop: 3,
        }}>
          Clock paused, talk only · convened by {convenerLabel}
        </div>
        {canAdjourn && (
          <button
            onClick={onAdjourn}
            style={{
              pointerEvents: "auto",
              marginTop: 9,
              background: "rgba(200,196,220,0.06)",
              border: "1px solid rgba(168,168,240,0.5)",
              color: "#C0B8E8", borderRadius: 5, padding: "5px 16px",
              fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
              fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase",
              fontWeight: 500, cursor: "pointer",
            }}
          >Adjourn now</button>
        )}
      </div>
      {/* Countdown progress bar (drains left→right). */}
      <div style={{
        width: "100%", height: 4, background: "rgba(20,18,32,0.9)",
        borderRadius: "0 0 8px 8px", overflow: "hidden",
        border: "1.5px solid rgba(168,168,240,0.6)", borderTop: "none",
      }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, (1 - progress) * 100))}%`, height: "100%",
          background: urgent ? "linear-gradient(90deg,#E8C998,#E89BB5)" : "linear-gradient(90deg,#28B9AE,#F0902E)",
          transition: "width 0.25s linear",
        }} />
      </div>
    </div>
  );
}
