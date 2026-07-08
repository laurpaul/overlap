// ── InjectResponseModal ──────────────────────────────────────────────────────
//
// Shown to actor-seat users when the facilitator pushes an event inject.
// Displays the event description and lets the actor choose their response.
// The chosen deltas are sent back to the host via dispatchAction.

import { useState } from "react";

const DELTA_LABELS = {
  econ:           "ECON",
  rdAccum:        "R&D",
  milStock:       "MIL",
  credits:        "CREDITS",
  contentnessMod: "CONTENTNESS",
  scoreAdj:       "SCORE",
};

function DeltaChip({ k, v }) {
  if (k === "contentnessDecay") return null;
  const pos = v > 0;
  const col = pos ? "#9BD4B5" : "#E89BB5";
  const label = DELTA_LABELS[k] || k;
  const isScore = k === "scoreAdj";
  const display =
    k === "contentnessMod" ? (pos ? `+${v.toFixed(2)}` : v.toFixed(2)) :
    k === "credits"        ? (pos ? `+${v}` : `${v}`) :
    isScore                ? (pos ? `+${v}` : `${v}`) :
                             (pos ? `+${v.toFixed(1)}` : v.toFixed(1));
  return (
    <span style={{
      fontSize: 9, padding: "2px 6px", borderRadius: 3,
      background: pos ? "rgba(155,212,181,0.12)" : "rgba(232,155,181,0.12)",
      border: `1px solid ${col}${isScore ? "99" : "44"}`,
      color: col,
      fontFamily: "'Bricolage Grotesque',sans-serif",
      fontWeight: isScore ? 800 : 600, letterSpacing: "0.05em",
    }}>
      {display} {label}
    </span>
  );
}

export function InjectResponseModal({ inject, actorLabel, onChoose }) {
  const [hovered, setHovered] = useState(null);
  const [chosen,  setChosen]  = useState(null);

  if (!inject) return null;

  // v161: facilitator announcements / custom free-text injects have no choices , 
  // they are acknowledge-only popups. Render a single "Got it" dismiss instead
  // of a response picker.
  const isAnnounce = !!inject.announce || !inject.choices?.length;

  const confirmed = chosen !== null;

  function handleChoose(ci) {
    if (confirmed) return;
    setChosen(ci);
    // Brief pause so the actor sees their confirmed choice, then dismiss.
    setTimeout(() => onChoose(inject, inject.choices[ci]), 1200);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(8,6,20,0.82)",
      backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Bricolage Grotesque',sans-serif",
      animation: "fadeIn 0.2s ease",
    }}>
      <div style={{
        width: "min(560px, 94vw)",
        background: "rgba(18,16,34,0.98)",
        border: `1px solid ${inject.color}55`,
        borderLeft: `4px solid ${inject.color}`,
        borderRadius: 8,
        padding: "26px 28px 22px",
        boxShadow: `0 32px 80px rgba(0,0,0,0.7), 0 0 40px ${inject.color}18`,
        color: "#ECEAF8",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{
            width: 38, height: 38, borderRadius: 6, flexShrink: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
            background: `${inject.color}18`,
            border: `1px solid ${inject.color}55`,
            color: inject.color,
          }}>{inject.icon}</span>
          <div>
            <div style={{
              fontSize: 9, letterSpacing: "0.26em", color: inject.color,
              fontWeight: 600, marginBottom: 4, textTransform: "uppercase",
            }}>
              {isAnnounce ? "FACILITATOR" : "FACILITATOR INJECT"} · {actorLabel}
            </div>
            <div style={{
              fontFamily: "'Spectral',Georgia,serif", fontSize: 20,
              fontStyle: "italic", fontWeight: 400,
              color: "#ECEAF8", letterSpacing: "-0.01em",
            }}>{inject.label}</div>
          </div>
        </div>

        {/* Summary tag */}
        {inject.summary && (
          <div style={{
            fontSize: 10, color: "#8B86B0", marginBottom: 10,
            fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
          }}>{inject.summary}</div>
        )}

        {/* Blurb */}
        <div style={{
          fontFamily: "'Spectral',Georgia,serif", fontSize: 13,
          fontWeight: 300, color: "#C0B8E8", lineHeight: 1.6,
          marginBottom: 20, paddingBottom: 16,
          borderBottom: "1px solid rgba(200,196,220,0.1)",
        }}>{inject.blurb}</div>

        {isAnnounce ? (
          <button
            onClick={() => onChoose(inject, null)}
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 6, cursor: "pointer",
              background: `${inject.color}1a`,
              border: `1px solid ${inject.color}88`,
              color: "#ECEAF8",
              fontFamily: "'Spectral',Georgia,serif", fontSize: 14, fontStyle: "italic",
              fontWeight: 500, letterSpacing: "-0.005em",
            }}>
            Got it →
          </button>
        ) : (
        <>
        {/* Choice heading */}
        <div style={{
          fontSize: 9, letterSpacing: "0.22em", color: "#5A567A",
          fontWeight: 600, marginBottom: 10, textTransform: "uppercase",
        }}>
          {confirmed ? "YOUR RESPONSE" : "CHOOSE YOUR RESPONSE"}
        </div>

        {/* Choices */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {inject.choices.map((choice, ci) => {
            const isChosen  = chosen === ci;
            const isDimmed  = confirmed && !isChosen;
            const isHovered = hovered === ci && !confirmed;
            const accent = isChosen ? inject.color : isHovered ? `${inject.color}bb` : null;

            return (
              <button
                key={ci}
                onClick={() => handleChoose(ci)}
                onMouseEnter={() => !confirmed && setHovered(ci)}
                onMouseLeave={() => setHovered(null)}
                disabled={confirmed}
                style={{
                  padding: "12px 14px", borderRadius: 5,
                  textAlign: "left", cursor: confirmed ? "default" : "pointer",
                  background: isChosen
                    ? `${inject.color}1a`
                    : isHovered
                    ? "rgba(200,196,220,0.07)"
                    : "rgba(200,196,220,0.04)",
                  border: `1px solid ${accent || "rgba(200,196,220,0.12)"}`,
                  opacity: isDimmed ? 0.35 : 1,
                  transition: "all 0.13s",
                }}
              >
                <div style={{
                  fontSize: 13, marginBottom: 4,
                  fontFamily: "'Spectral',Georgia,serif",
                  fontStyle: "italic", fontWeight: isChosen ? 500 : 400,
                  color: isChosen ? inject.color : "#C8C4DC",
                  letterSpacing: "-0.005em",
                }}>
                  {isChosen && "✓ "}{choice.label}
                </div>
                <div style={{
                  fontSize: 11, color: "#8B86B0", lineHeight: 1.45, marginBottom: 8,
                  fontFamily: "'Bricolage Grotesque',sans-serif",
                }}>
                  {choice.desc}
                </div>
                {choice.deltas && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {Object.entries(choice.deltas).map(([k, v]) => (
                      <DeltaChip key={k} k={k} v={v} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {confirmed && (
          <div style={{
            marginTop: 16, textAlign: "center",
            fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
            fontSize: 12, color: "#5A567A",
          }}>
            Response logged to mission record.
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
