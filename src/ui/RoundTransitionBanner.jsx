// ── RoundTransitionBanner ───────────────────────────────────────────────────
//
// Centered overlay shown for ~2.4s at the end of each round. Fades through
// end-of-round so the next round's start reads as a beat rather than a blur.
// Lives in the canvas-overlay layer; pointer-events disabled so it doesn't
// block clicks on the map underneath.
//
// Props:
//   roundTransition -- { round, until } | null. When null, renders nothing.

export function RoundTransitionBanner({ roundTransition }) {
  if (!roundTransition) return null;
  return (
    <div style={{
      position: "absolute", top: "50%", left: "50%",
      transform: "translate(-50%, -50%)", zIndex: 7,
      pointerEvents: "none",
      animation: "round-flash 2.4s cubic-bezier(0.22, 1, 0.36, 1) forwards",
    }}>
      <div style={{
        padding: "18px 36px",
        background: "linear-gradient(135deg, rgba(46,32,104,0.92), rgba(20,18,32,0.92))",
        border: "1.5px solid rgba(168,168,240,0.55)",
        borderRadius: 8,
        boxShadow: "0 0 50px rgba(168,168,240,0.45), 0 12px 32px rgba(0,0,0,0.5)",
        textAlign: "center",
        fontFamily: "'Spectral', Georgia, serif",
      }}>
        <div style={{
          fontSize: 10.5, letterSpacing: "0.22em", color: "#A8A8F0",
          fontWeight: 600, textTransform: "uppercase", marginBottom: 3,
          fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
        }}>Round Concluded</div>
        <div style={{
          fontSize: 30, color: "#ECEAF8", fontWeight: 300,
          fontStyle: "italic", letterSpacing: "-0.01em",
        }}>Round {roundTransition.round}</div>
      </div>
    </div>
  );
}
