// ── AnalyticsPanel ──────────────────────────────────────────────────────────
//
// Round-by-round analytics dashboard. Three side-by-side panels:
//   • Cumulative ice chart (paired bars per round)
//   • Budget per round (paired bars per round)
//   • Current snapshot stat table
//
// Empty state shows until the first round completes.

import { CRATER_DATA } from "../sim/index.js";

// Tiny paired-bar chart used by both cumulative-ice and budget panels.
// Each round renders two adjacent bars (Actor I and Actor II), scaled to
// the max value across all rounds.
function PairedBarChart({ title, history, accessor1, accessor2, gradient1, gradient2, tip1, tip2 }) {
  const max = Math.max(
    ...history.map((h) => Math.max(accessor1(h) || 0, accessor2(h) || 0)),
    1
  );
  return (
    <div style={{ flex: "1 1 180px" }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.22em", color: "#C0B8E8",
        paddingLeft: 8, borderLeft: "2px solid #A8A8F0", textTransform: "uppercase",
        fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 500,
        marginBottom: 8,
      }}>{title}</div>
      <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 54 }}>
        {history.map((h, i) => {
          const v1 = accessor1(h) || 0;
          const v2 = accessor2(h) || 0;
          return (
            <div key={i} style={{ display: "flex", gap: 1, alignItems: "flex-end", flex: 1 }}>
              <div
                title={tip1(v1)}
                style={{
                  flex: 1, background: gradient1,
                  borderRadius: "2px 2px 0 0",
                  height: `${Math.max(3, (v1 / max) * 100)}%`,
                }}
              />
              <div
                title={tip2(v2)}
                style={{
                  flex: 1, background: gradient2,
                  borderRadius: "2px 2px 0 0",
                  height: `${Math.max(3, (v2 / max) * 100)}%`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 1, marginTop: 4 }}>
        {history.map((h, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center", fontSize: 8, color: "#5A567A",
            fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
            letterSpacing: "-0.002em",
          }}>R{h.r}</div>
        ))}
      </div>
    </div>
  );
}

function SnapshotTable({ rows }) {
  return (
    <div style={{ flex: "1 1 180px", lineHeight: 1.7 }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.22em", color: "#C0B8E8",
        paddingLeft: 8, borderLeft: "2px solid #A8A8F0", textTransform: "uppercase",
        fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 500,
        marginBottom: 8,
      }}>Current snapshot</div>
      {rows.map(([label, val]) => (
        <div key={label} style={{
          display: "flex", justifyContent: "space-between",
          borderBottom: "1px solid rgba(200,196,220,0.06)",
          paddingBottom: 3, paddingTop: 2,
        }}>
          <span style={{
            color: "#8B86B0", fontSize: 10, letterSpacing: "-0.005em",
            fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
          }}>{label}</span>
          <span style={{
            color: "#C0B8E8",
            fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 400,
            fontSize: 9.5, letterSpacing: "-0.002em",
          }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsPanel({ open, history, totalIce1, totalIce2, depleted, p1, p2 }) {
  if (!open) return null;

  const snapshotRows = [
    ["Total ice",         `${totalIce1.toFixed(0)} / ${totalIce2.toFixed(0)} kg`],
    ["Craters depleted",  `${depleted} / ${CRATER_DATA.length}`],
    ["Asset points",      `${p1?.assetPts ?? 0} / ${p2?.assetPts ?? 0}`],
    ["Budget",            `${Math.round(p1?.budget ?? 0)} / ${Math.round(p2?.budget ?? 0)} cr`],
    ["R&D accumulator",   `${Math.round(p1?.rdAccum ?? 0)} / ${Math.round(p2?.rdAccum ?? 0)}`],
    ["Military score",    `${(p1?.milScore ?? 1).toFixed(2)} / ${(p2?.milScore ?? 1).toFixed(2)}`],
    ["Safety violations", `${Math.round(p1?.safetyViolations ?? 0)} / ${Math.round(p2?.safetyViolations ?? 0)}`],
  ];

  return (
    <div style={{
      width: "100%", maxWidth: 1400, marginTop: 8,
      background: "rgba(20,18,32,0.92)",
      border: "1px solid rgba(200,196,220,0.10)",
      borderRadius: 7, padding: "16px 18px",
      animation: "fadeIn 0.2s ease",
    }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.22em", color: "#C0B8E8", marginBottom: 14,
        paddingLeft: 10, borderLeft: "2px solid #A8A8F0", textTransform: "uppercase",
        fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 500,
      }}>Analytics Dashboard</div>

      {history.length === 0 ? (
        <div style={{
          fontSize: 11, color: "#5A567A", textAlign: "center", padding: "18px 0",
          fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
          letterSpacing: "-0.005em",
        }}>
          Analytics will populate after the first round completes.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <PairedBarChart
            title="Cumulative ice (kg)"
            history={history}
            accessor1={(h) => h.d1}
            accessor2={(h) => h.d2}
            gradient1="linear-gradient(180deg,#28B9AEcc,#28B9AE44)"
            gradient2="linear-gradient(180deg,#F0902Ecc,#F0902E44)"
            tip1={(v) => `Actor I: ${v}kg total`}
            tip2={(v) => `Actor II: ${v}kg total`}
          />
          <PairedBarChart
            title="Budget per round (cr)"
            history={history}
            accessor1={(h) => h.bud1}
            accessor2={(h) => h.bud2}
            gradient1="rgba(40,185,174,0.6)"
            gradient2="rgba(240,144,46,0.6)"
            tip1={(v) => `Actor I: ${v}cr`}
            tip2={(v) => `Actor II: ${v}cr`}
          />
          <SnapshotTable rows={snapshotRows} />
        </div>
      )}
    </div>
  );
}
