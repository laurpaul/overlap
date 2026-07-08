// ── Scorebar ────────────────────────────────────────────────────────────────
//
// Three-cell HUD strip rendered above the canvas: P1 score · round/craters
// counter · P2 score. Each cell shows score, ice totals, asset points, and
// budget. In workshop mode the sub-line is simpler (ice deposited only).
//
// v165+: the two actor score cells are clickable, they drop a breakdown
// popover (banked ice / carried / infrastructure / policy / penalties) so the
// table can see *why* a composite score is what it is. The whole point of a
// tradeoff workshop is reading that decomposition, and scoreBreakdown() was
// computed in economy.js but never surfaced.
//
// Props:
//   actorLabel(idx) -- display name for Actor I / II
//   roundCounterLabel -- e.g. "R4/12"
//   score1, score2 -- final composite scores
//   totalIce1, totalIce2 -- kg ice deposited (cumulative)
//   share1 -- Actor I's share of total ice in [0, 1]
//   p1, p2 -- player state objects (read budget / safetyViolations / assetPts)
//   depleted -- count of fully-depleted craters
//   workshopMode -- hides engineering detail when true
//   totalCraters -- denominator for the craters-depleted display

import { useState } from "react";
import { scoreBreakdown, scoreProxyLabel } from "../sim/index.js";

function BreakdownPopover({ player, color, onClose }) {
  const bd = scoreBreakdown(player);
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 60,
        background: "rgba(18,16,34,0.98)",
        border: `1px solid ${color}55`, borderTop: `2px solid ${color}`,
        borderRadius: 6, padding: "10px 12px",
        boxShadow: "0 18px 48px rgba(0,0,0,0.6)",
        textAlign: "left", cursor: "default",
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
        <span style={{ fontSize: 8, letterSpacing: "0.2em", color, fontWeight: 600, textTransform: "uppercase", fontFamily: "'Bricolage Grotesque',sans-serif" }}>Score breakdown</span>
        <span onClick={onClose} style={{ fontSize: 11, color: "#8B86B0", cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>✕</span>
      </div>
      {bd.terms.map((t) => {
        const pos = t.value > 0.05, neg = t.value < -0.05;
        const vcol = pos ? "#9BD4B5" : neg ? "#E89BB5" : "#8B86B0";
        return (
          <div key={t.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", padding: "3px 0", borderBottom: "1px solid rgba(200,196,220,0.07)" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, color: "#ECEAF8", fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic", lineHeight: 1.25 }}>{t.label}</div>
              <div style={{ fontSize: 8.5, color: "#5A567A", fontFamily: "'Bricolage Grotesque',sans-serif", lineHeight: 1.3 }}>{t.detail}</div>
            </div>
            <span style={{ fontSize: 11.5, color: vcol, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              {t.value > 0 ? "+" : ""}{t.value.toFixed(0)}
            </span>
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, paddingTop: 5, borderTop: `1px solid ${color}33` }}>
        <span style={{ fontSize: 10, color: "#C0B8E8", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "'Bricolage Grotesque',sans-serif" }}>Composite</span>
        <span style={{ fontSize: 13, color, fontWeight: 600, fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic", fontVariantNumeric: "tabular-nums" }}>{bd.total.toFixed(0)}</span>
      </div>
    </div>
  );
}

export function Scorebar({
  actorLabel, roundCounterLabel,
  score1, score2, totalIce1, totalIce2, share1,
  p1, p2, depleted, workshopMode, totalCraters,
  scoreVisibility = "shown", revealScores = false,
}) {
  const [expanded, setExpanded] = useState(null); // 0 | 1 | null
  // v175: when the facilitator hides the score, exact numbers + the clickable
  // breakdown are suppressed during play and only the DONE screen reveals them.
  const showExact = scoreVisibility === "shown" || revealScores;
  const proxy = showExact ? null : scoreProxyLabel(score1, score2, actorLabel);
  const hiddenVal = scoreVisibility === "proxy" ? "•" : ", ";
  // Center cell carries the standing when scores are hidden, craters otherwise.
  const proxyTierColor = proxy
    ? (proxy.tier === "even" ? "#C0B8E8"
       : proxy.tier === "slight" ? "#E8C998"
       : proxy.tier === "clear" ? "#80B0D8" : "#9BD4B5")
    : "#8B86B0";
  const cells = [
    {
      label: actorLabel(0),
      val: showExact ? score1.toFixed(0) : hiddenVal,
      color: p1?.color || "#28B9AE",
      actorIdx: 0, player: p1,
      sub: workshopMode
        ? `${totalIce1.toFixed(0)} kg ice deposited`
        : `${totalIce1.toFixed(0)}kg ice · ${p1?.assetPts ?? 0}ap · ${p1?.safetyViolations ?? 0} viol.`,
      sub2: workshopMode ? "" : (showExact ? `${Math.round(p1?.budget ?? 0)}cr · ${(share1 * 100).toFixed(0)}%` : `${Math.round(p1?.budget ?? 0)}cr`),
    },
    {
      label: showExact ? roundCounterLabel : "STANDING",
      val: showExact ? `${depleted}/${totalCraters}` : (scoreVisibility === "proxy" ? "" : "hidden"),
      color: showExact ? "#8B86B0" : proxyTierColor,
      actorIdx: null, player: null,
      sub: showExact ? "craters depleted" : (proxy ? proxy.text : "scores hidden until debrief"),
      sub2: showExact ? "" : roundCounterLabel,
      centerProxy: !showExact,
    },
    {
      label: actorLabel(1),
      val: showExact ? score2.toFixed(0) : hiddenVal,
      color: p2?.color || "#F0902E",
      actorIdx: 1, player: p2,
      sub: workshopMode
        ? `${totalIce2.toFixed(0)} kg ice deposited`
        : `${totalIce2.toFixed(0)}kg ice · ${p2?.assetPts ?? 0}ap · ${p2?.safetyViolations ?? 0} viol.`,
      sub2: workshopMode ? "" : (showExact ? `${Math.round(p2?.budget ?? 0)}cr · ${((1 - share1) * 100).toFixed(0)}%` : `${Math.round(p2?.budget ?? 0)}cr`),
    },
  ];

  return (
    <div style={{ display: "flex", gap: 5, width: "100%", maxWidth: 1400, marginBottom: 5 }}>
      {cells.map(({ label, val, color, sub, sub2, actorIdx, player, centerProxy }) => {
        const clickable = actorIdx !== null && player && showExact;
        const isOpen = expanded === actorIdx && actorIdx !== null;
        return (
        <div key={label}
          onClick={clickable ? () => setExpanded(isOpen ? null : actorIdx) : undefined}
          style={{
            flex: 1, background: "rgba(27,25,52,0.92)",
            border: `1px solid ${isOpen ? color + "88" : color + "22"}`, borderTop: `2px solid ${color}66`,
            borderRadius: 6, padding: "9px 11px", textAlign: "center",
            position: "relative", overflow: "visible",
            boxShadow: `inset 0 0 24px ${color}08`,
            cursor: clickable ? "pointer" : "default",
          }}>
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: `radial-gradient(ellipse at 50% 0%, ${color}10 0%, transparent 70%)`,
          }} />
          <div style={{
            fontSize: 9, color, opacity: 0.7, letterSpacing: "0.18em", marginBottom: 2,
            textTransform: "uppercase",
            fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 500,
          }}>{label}</div>
          <div style={{
            fontSize: 24, fontWeight: 400, fontStyle: "italic", color, lineHeight: 1.05,
            letterSpacing: "-0.015em",
            fontFamily: "'Spectral','Iowan Old Style',Georgia,serif",
            textShadow: `0 0 14px ${color}44`,
          }}>{val}</div>
          {actorIdx !== null && (
            <div style={{
              fontSize: 8, color, opacity: 0.5, letterSpacing: "-0.002em", marginTop: 1,
              fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
            }}>{showExact ? (isOpen ? "score ▴" : "score ▾") : (scoreVisibility === "proxy" ? "standing hidden" : "hidden")}</div>
          )}
          <div style={centerProxy ? {
            fontSize: 12, color, marginTop: 2, letterSpacing: "-0.005em",
            fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic", fontWeight: 500,
          } : {
            fontSize: 8.5, color: "#8B86B0", marginTop: 4, letterSpacing: "-0.002em",
            fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 400,
          }}>{sub}</div>
          {sub2 && <div style={{
            fontSize: 8.5, color: "#5A567A", letterSpacing: "-0.002em",
            fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 400,
          }}>{sub2}</div>}
          {isOpen && <BreakdownPopover player={player} color={color} onClose={() => setExpanded(null)} />}
        </div>
        );
      })}
    </div>
  );
}
