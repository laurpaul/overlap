// ── ClaimsPanel ─────────────────────────────────────────────────────────────
//
// The public-claims / propaganda board (v181). Everyone sees every claim; an
// actor posts production claims (auto-verifiable) or pledges (free text), the
// room marks believe/doubt, and anyone can verify a claim against ground truth
//, which dents the author's credibility if it was a bluff. Pairs with fog of
// war: under fog you can only trust what your surveillance lets you check.

import { useState } from "react";
import {
  CLAIM_METRICS, CLAIM_OPS, credibilityLabel, tallyStances,
} from "../sim/index.js";

const TIER_COLOR = { unknown: "#8B86B0", good: "#9BD4B5", mixed: "#E8C998", bad: "#E89BB5" };

export function ClaimsPanel({
  claims, viewer, actorLabel, p1, p2, isFacilitator, onPost, onVote, onVerify, onClose,
}) {
  const [kind, setKind] = useState("production");
  const [metric, setMetric] = useState("ice");
  const [op, setOp] = useState(">=");
  const [value, setValue] = useState(100);
  const [text, setText] = useState("");

  const canPost = viewer === 0 || viewer === 1;
  const posterP = viewer === 0 ? p1 : viewer === 1 ? p2 : null;
  const currentVal = posterP ? CLAIM_METRICS[metric]?.get(posterP) : null;

  const submit = () => {
    if (!canPost) return;
    if (kind === "pledge") {
      if (!text.trim()) return;
      onPost({ kind: "pledge", text: text.trim() });
      setText("");
    } else {
      onPost({ kind: "production", metric, op, value: Number(value) || 0 });
    }
  };

  const labelCol = (a) => (a === 0 ? "#28B9AE" : "#F0902E");
  const sorted = [...(claims || [])].reverse();

  return (
    <div style={{
      position: "fixed", left: 14, bottom: 14, zIndex: 40, width: 320, maxHeight: "70vh",
      display: "flex", flexDirection: "column",
      background: "linear-gradient(160deg, rgba(20,18,32,0.97), rgba(32,30,64,0.97))",
      border: "1px solid rgba(168,168,240,0.32)", borderRadius: 8,
      boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
      fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 12px", borderBottom: "1px solid rgba(200,196,220,0.10)" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#C0B8E8", fontWeight: 600, textTransform: "uppercase" }}>
          ⚑ Public Claims
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#8B86B0",
          cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
      </div>

      {/* Credibility chips */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderBottom: "1px solid rgba(200,196,220,0.06)" }}>
        {[0, 1].map(a => {
          const cl = credibilityLabel(claims, a);
          return (
            <div key={a} style={{ flex: 1, fontSize: 8.5 }}>
              <span style={{ color: labelCol(a), fontWeight: 600 }}>{actorLabel(a)}</span>
              <span style={{ color: "#5A567A" }}> credibility: </span>
              <span style={{ color: TIER_COLOR[cl.tier], fontStyle: "italic" }}>{cl.text}</span>
            </div>
          );
        })}
      </div>

      {/* Post form */}
      {canPost && (
        <div style={{ padding: "9px 12px", borderBottom: "1px solid rgba(200,196,220,0.08)" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 7 }}>
            {["production", "pledge"].map(k => (
              <button key={k} onClick={() => setKind(k)} style={{
                flex: 1, padding: "4px 0", borderRadius: 4, cursor: "pointer",
                fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500,
                background: kind === k ? "rgba(168,168,240,0.18)" : "rgba(200,196,220,0.04)",
                border: `1px solid ${kind === k ? "rgba(168,168,240,0.45)" : "rgba(200,196,220,0.10)"}`,
                color: kind === k ? "#ECEAF8" : "#8B86B0",
              }}>{k === "production" ? "Production claim" : "Pledge"}</button>
            ))}
          </div>

          {kind === "production" ? (
            <>
              <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 9, color: "#8B86B0", fontStyle: "italic", fontFamily: "'Spectral',serif" }}>I have</span>
                <select value={op} onChange={e => setOp(e.target.value)} style={selStyle}>
                  {Object.keys(CLAIM_OPS).map(o => <option key={o} value={o}>{o === ">=" ? "≥" : o === "<=" ? "≤" : "="}</option>)}
                </select>
                <input type="number" value={value} onChange={e => setValue(e.target.value)} style={{ ...selStyle, width: 56 }} />
                <select value={metric} onChange={e => setMetric(e.target.value)} style={{ ...selStyle, flex: 1 }}>
                  {Object.entries(CLAIM_METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </select>
              </div>
              {currentVal != null && (
                <div style={{ fontSize: 8, color: "#5A567A", fontStyle: "italic", marginBottom: 6,
                  fontFamily: "'Spectral',serif" }}>
                  your actual: <span style={{ color: "#C0B8E8" }}>{currentVal}</span>, claim the truth, or bluff and risk getting caught.
                </div>
              )}
            </>
          ) : (
            <input value={text} onChange={e => setText(e.target.value)} placeholder="e.g. We will not expand into the south PSR"
              style={{ ...selStyle, width: "100%", marginBottom: 6 }} />
          )}
          <button onClick={submit} style={{
            width: "100%", padding: "5px 0", borderRadius: 4, cursor: "pointer",
            background: "rgba(168,168,240,0.16)", border: "1px solid rgba(168,168,240,0.4)",
            color: "#C0B8E8", fontSize: 8.5, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 500,
          }}>Post as {actorLabel(viewer)}</button>
        </div>
      )}

      {/* Claims list */}
      <div style={{ overflowY: "auto", padding: "6px 12px 10px" }}>
        {sorted.length === 0 && (
          <div style={{ fontSize: 9, color: "#5A567A", fontStyle: "italic", padding: "10px 0", textAlign: "center",
            fontFamily: "'Spectral',serif" }}>No claims posted yet.</div>
        )}
        {sorted.map(c => {
          const t = tallyStances(c);
          const mine = c.author === viewer;
          const myStance = c.stances?.[viewer];
          const statusBadge =
            c.status === "true" ? { txt: "✓ verified true", col: "#9BD4B5" } :
            c.status === "false" ? { txt: "✗ verified false", col: "#E89BB5" } :
            { txt: "unverified", col: "#8B86B0" };
          return (
            <div key={c.id} style={{ padding: "7px 0", borderBottom: "1px solid rgba(200,196,220,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: labelCol(c.author) }}>{actorLabel(c.author)}</span>
                <span style={{ fontSize: 7.5, color: "#5A567A" }}>R{c.round} · {c.kind}</span>
              </div>
              <div style={{ fontSize: 9.5, color: "#ECEAF8", lineHeight: 1.4, fontStyle: "italic",
                fontFamily: "'Spectral',Georgia,serif", marginBottom: 4 }}>
                "{c.text}"{c.status === "false" && c.verifiedActual != null &&
                  <span style={{ color: "#E89BB5", fontStyle: "normal", fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 8 }}> (actual: {c.verifiedActual})</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 8, color: statusBadge.col, fontWeight: 500 }}>{statusBadge.txt}</span>
                <span style={{ fontSize: 8, color: "#5A567A" }}>· {t.believe}👍 {t.doubt}👎</span>
                {!mine && (viewer === 0 || viewer === 1) && c.status === "unverified" && (
                  <span style={{ display: "inline-flex", gap: 4 }}>
                    <button onClick={() => onVote(c.id, myStance === "believe" ? null : "believe")}
                      style={voteStyle(myStance === "believe", "#9BD4B5")}>believe</button>
                    <button onClick={() => onVote(c.id, myStance === "doubt" ? null : "doubt")}
                      style={voteStyle(myStance === "doubt", "#E89BB5")}>doubt</button>
                  </span>
                )}
                {c.kind === "production" && c.status === "unverified" && (
                  <button onClick={() => onVerify(c.id)} title="Resolve this claim against ground truth (costs the author credibility if it's a bluff)"
                    style={{ fontSize: 7.5, padding: "2px 7px", borderRadius: 3, cursor: "pointer",
                      background: "rgba(192,184,232,0.10)", border: "1px solid rgba(192,184,232,0.3)", color: "#C0B8E8",
                      letterSpacing: "0.08em", textTransform: "uppercase" }}>verify</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const selStyle = {
  background: "rgba(0,0,0,0.3)", border: "1px solid rgba(200,196,220,0.16)", borderRadius: 3,
  color: "#ECEAF8", fontSize: 9, padding: "3px 5px", fontFamily: "'Bricolage Grotesque',sans-serif",
};
function voteStyle(active, col) {
  return {
    fontSize: 7.5, padding: "2px 7px", borderRadius: 3, cursor: "pointer",
    background: active ? col + "22" : "rgba(200,196,220,0.04)",
    border: `1px solid ${active ? col + "88" : "rgba(200,196,220,0.12)"}`,
    color: active ? col : "#8B86B0", letterSpacing: "0.05em", textTransform: "uppercase",
  };
}
