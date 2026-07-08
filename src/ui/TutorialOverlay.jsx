// ── TutorialOverlay ─────────────────────────────────────────────────────────
//
// A separate guided "How to play" tour, distinct from the keyboard-shortcuts
// HelpOverlay (`?`). Closes the v46 README gap: a first-time workshop
// participant pressing `?` learned how to drive the keyboard, not how to
// actually play. This walks them through the goal, the map, the asset roster,
// ice mining, safety-zone governance, scoring, and the turn loop.
//
// Triggered three ways:
//   1. Auto-shown once per browser on first entry to the game (App.jsx guards
//      it behind a localStorage flag, set on close, so it never surprises a
//      returning facilitator mid-projection).
//   2. The "How to play" control in the HUD strip.
//   3. The "H" keyboard shortcut, and a link in the shortcuts overlay footer.
//
// Step copy lives in the exported `TUTORIAL_STEPS` pure-data array so it can be
// validated framework-free in tests (no DOM), the same pattern the sim core
// uses. Numbers are pulled straight from the live model:
//   score = ice banked (1/kg) + carried ice (0.5/kg)
//         + asset points (15 each) − safety violations (25 each)
// Asset points: solar 2 · habitat 10 · rover 3 · pad 5 · reactor 15 · comsat 6.
//
// Brand: Spectral (serif) + Bricolage Grotesque (sans), The Both palette via
// CSS vars. No em dashes in any visible string (enforced by tutorial.test.js).

import { useState, useEffect, useCallback } from "react";
import { TUTORIAL_STEPS, TUTORIAL_STORAGE_KEY } from "./tutorialContent.js";

export { TUTORIAL_STEPS, TUTORIAL_STORAGE_KEY };

function Glyph({ children }) {
  return (
    <div style={{
      width: 44, height: 44, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--serif)", fontSize: 24, lineHeight: 1,
      color: "var(--periwinkle)",
      background: "var(--accent-soft)",
      border: "1px solid var(--border-strong)",
      borderRadius: 8,
    }}>{children}</div>
  );
}

export function TutorialOverlay({ open, onClose, startIndex = 0 }) {
  const [i, setI] = useState(startIndex);
  const last = TUTORIAL_STEPS.length - 1;

  // Reset to the requested start step every time the overlay opens.
  useEffect(() => { if (open) setI(startIndex); }, [open, startIndex]);

  const next = useCallback(() => setI((n) => Math.min(last, n + 1)), [last]);
  const prev = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  // Left / right arrows page through the tour while it is focused. Escape is
  // handled by the App-level key handler (it closes the tour first), so we
  // only own horizontal navigation here and stop it bubbling to map pan.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "ArrowRight") { next(); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === "ArrowLeft") { prev(); e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, next, prev]);

  if (!open) return null;
  const step = TUTORIAL_STEPS[i];
  const onLast = i === last;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 2100,
        background: "rgba(20,18,32,0.80)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="How to play"
        style={{
          width: 520, maxWidth: "100%",
          background: "rgba(32,30,64,0.96)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          padding: "26px 30px 22px",
          fontFamily: "var(--sans)",
          color: "var(--text-bright)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header: section label + close */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          marginBottom: 18,
        }}>
          <div style={{
            fontFamily: "var(--sans)", fontWeight: 500, fontSize: 10,
            letterSpacing: "0.16em", textTransform: "uppercase",
            color: "var(--mist)",
          }}>How to play · step {i + 1} of {TUTORIAL_STEPS.length}</div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none",
              color: "var(--text-mid)", fontSize: 22,
              cursor: "pointer", lineHeight: 1, padding: 0, marginTop: -4,
            }}
            aria-label="Close how-to-play tour"
          >×</button>
        </div>

        {/* Body: glyph + title + paragraphs */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", minHeight: 196 }}>
          <Glyph>{step.glyph}</Glyph>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: "var(--sans)", fontWeight: 500, fontSize: 10,
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: "var(--text-dim)", marginBottom: 6,
            }}>{step.kicker}</div>
            <h2 style={{
              margin: "0 0 12px",
              fontFamily: "var(--serif)", fontWeight: 600,
              fontSize: 23, fontStyle: "italic", lineHeight: 1.15,
              color: "var(--text-hi)",
            }}>{step.title}</h2>
            {step.body.map((para, k) => (
              <p key={k} style={{
                margin: "0 0 10px",
                fontFamily: "var(--serif)", fontSize: 14, lineHeight: 1.5,
                color: "var(--text-mid)",
              }}>{para}</p>
            ))}
            {step.formula && (
              <div style={{
                marginTop: 14, padding: "12px 14px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-soft)",
                borderRadius: 6,
                display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "7px 12px",
                alignItems: "baseline",
              }}>
                {step.formula.map(([sign, label, weight], k) => (
                  <div key={k} style={{ display: "contents" }}>
                    <span style={{
                      fontFamily: "var(--mono)", fontSize: 15, fontWeight: 600,
                      color: sign === "−" ? "#E89BB5" : "#9BD4B5", textAlign: "center",
                    }}>{sign}</span>
                    <span style={{
                      fontFamily: "var(--sans)", fontSize: 13, fontWeight: 500,
                      color: "var(--text-bright)",
                    }}>{label}</span>
                    <span style={{
                      fontFamily: "var(--mono)", fontSize: 11,
                      color: "var(--text-dim)", whiteSpace: "nowrap",
                    }}>{weight}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer: progress dots + nav */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: 20, paddingTop: 16,
          borderTop: "1px solid var(--border-soft)",
        }}>
          <div style={{ display: "flex", gap: 7 }}>
            {TUTORIAL_STEPS.map((s, k) => (
              <button
                key={s.id}
                onClick={() => setI(k)}
                aria-label={`Go to step ${k + 1}: ${s.kicker}`}
                style={{
                  width: 8, height: 8, padding: 0, borderRadius: "50%",
                  cursor: "pointer", border: "none",
                  background: k === i ? "var(--periwinkle)" : "rgba(200,196,220,0.22)",
                  transition: "background 0.15s",
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {i === 0 ? (
              <button onClick={onClose} style={btnStyle(false)}>Skip tour</button>
            ) : (
              <button onClick={prev} style={btnStyle(false)}>Back</button>
            )}
            {onLast ? (
              <button onClick={onClose} style={btnStyle(true)}>Start playing</button>
            ) : (
              <button onClick={next} style={btnStyle(true)}>Next</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function btnStyle(primary) {
  return {
    fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 13, fontWeight: primary ? 600 : 400,
    padding: "7px 16px", borderRadius: 5, cursor: "pointer",
    color: primary ? "#141220" : "var(--text-bright)",
    background: primary ? "var(--periwinkle)" : "rgba(200,196,220,0.06)",
    border: `1px solid ${primary ? "var(--periwinkle)" : "var(--border-soft)"}`,
    letterSpacing: "-0.005em",
  };
}
