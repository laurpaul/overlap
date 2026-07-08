// ── HelpOverlay ─────────────────────────────────────────────────────────────
//
// Modal listing keyboard shortcuts. Triggered by `?`, dismissed by Escape
// or by clicking the backdrop. Workshop facilitators frequently want to
// drive the simulation from the keyboard during a projected demo; this
// lists what's available.

const ROWS = [
  { keys: ["?"],                  desc: "Toggle this shortcuts overlay" },
  { keys: ["H"],                  desc: "How to play · guided tour" },
  { keys: ["Esc"],                desc: "Dismiss panels, modes, and overlays" },
  { keys: ["L"],                  desc: "Mission log" },
  { keys: ["A"],                  desc: "Analytics charts" },
  { keys: ["P"],                  desc: "Physics parameters" },
  { keys: ["Z"],                  desc: "DLA hazard zones" },
  { keys: ["G"],                  desc: "Published map figures" },
  { keys: ["+", "="],             desc: "Zoom in on the map" },
  { keys: ["−", "_"],             desc: "Zoom out" },
  { keys: ["0"],                  desc: "Reset zoom to auto-fit" },
  { keys: ["←", "↑", "↓", "→"], desc: "Pan the map" },
];

function Key({ children }) {
  return (
    <kbd style={{
      display: "inline-block",
      minWidth: 22,
      padding: "2px 7px",
      fontFamily: "var(--mono)",
      fontSize: 11,
      fontWeight: 600,
      lineHeight: 1.4,
      color: "var(--text-hi)",
      background: "var(--bg-elevated)",
      border: "1px solid var(--border-strong)",
      borderRadius: 3,
      textAlign: "center",
      boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.4)",
    }}>{children}</kbd>
  );
}

export function HelpOverlay({ open, onClose, onOpenTutorial }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(20,18,32,0.78)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460, maxWidth: "100%",
          background: "rgba(32,30,64,0.95)",
          border: "1px solid var(--border-strong)",
          borderRadius: 8,
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          padding: "28px 32px",
          fontFamily: "var(--sans)",
          color: "var(--text-bright)",
        }}
      >
        <div style={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
          marginBottom: 18,
        }}>
          <h2 style={{
            margin: 0,
            fontFamily: "var(--serif)", fontWeight: 600,
            fontSize: 22, fontStyle: "italic",
            color: "var(--text-hi)",
          }}>Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none",
              color: "var(--text-mid)", fontSize: 22,
              cursor: "pointer", lineHeight: 1, padding: 0,
            }}
            aria-label="Close shortcuts overlay"
          >×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 18px" }}>
          {ROWS.map((row, i) => (
            <div key={i} style={{ display: "contents" }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {row.keys.map((k, j) => (
                  <span key={j} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Key>{k}</Key>
                    {j < row.keys.length - 1 && (
                      <span style={{ color: "var(--text-dim)", fontSize: 10 }}>or</span>
                    )}
                  </span>
                ))}
              </div>
              <div style={{
                color: "var(--text-mid)",
                fontFamily: "var(--serif)", fontSize: 13,
                lineHeight: 1.4,
                alignSelf: "center",
              }}>{row.desc}</div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 20, paddingTop: 16,
          borderTop: "1px solid var(--border-soft)",
          color: "var(--text-dim)", fontSize: 11,
          fontStyle: "italic", fontFamily: "var(--serif)",
          letterSpacing: "0.02em",
        }}>
          {onOpenTutorial && (
            <div style={{ marginBottom: 10, fontStyle: "normal" }}>
              <span style={{ color: "var(--text-mid)" }}>New here? </span>
              <button
                onClick={onOpenTutorial}
                style={{
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  color: "var(--periwinkle)", fontFamily: "var(--serif)", fontStyle: "italic",
                  fontSize: 12, textDecoration: "underline", textUnderlineOffset: 2,
                }}
              >Take the how-to-play tour</button>
            </div>
          )}
          Shortcuts are ignored when typing in a text field. Press <Key>?</Key> again to close.
        </div>
      </div>
    </div>
  );
}
