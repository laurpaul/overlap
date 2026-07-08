// ── MissionLogPanel ─────────────────────────────────────────────────────────
//
// Collapsible chronological event log. Shows the most recent 60 events
// in reverse-chronological order. Workshop facilitators use this to
// narrate what just happened on the map; the CSV export lets researchers
// take a structured record away from the workshop.

import { craterName } from "../sim/labels.js";

export function MissionLogPanel({ open, missionLog, exportMissionData }) {
  if (!open) return null;

  // v45: cap visible-events count is 60, but earlier events ARE in CSV
  // export -- surface this so facilitators know what they're looking at
  // during long workshops where event totals run into hundreds.
  const totalEvents = missionLog.length;
  const visibleCount = Math.min(totalEvents, 60);
  const hasMore = totalEvents > 60;

  return (
    <div style={{
      width: "100%", maxWidth: 1400, marginTop: 8,
      background: "rgba(20,18,32,0.92)", border: "1px solid rgba(200,196,220,0.10)",
      borderRadius: 7, padding: "14px 16px", maxHeight: 240, overflow: "hidden",
      display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: 10,
      }}>
        <span style={{
          fontSize: 9, letterSpacing: "0.22em", color: "#C0B8E8",
          paddingLeft: 10, borderLeft: "2px solid #A8A8F0",
          textTransform: "uppercase",
          fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 500,
        }}>Event Log</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{
            fontSize: 10, color: "#5A567A",
            fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
          }}>
            {hasMore
              ? `latest ${visibleCount} of ${totalEvents}`
              : `${totalEvents} event${totalEvents === 1 ? "" : "s"}`}
          </span>
          <button
            onClick={exportMissionData}
            disabled={missionLog.length === 0}
            style={{
              background: "rgba(155,212,181,0.10)", border: "1px solid rgba(155,212,181,0.28)",
              color: "#9BD4B5", borderRadius: 4, padding: "3px 10px", cursor: "pointer",
              fontSize: 10, fontFamily: "'Spectral',Georgia,serif",
              fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.005em",
            }}
          >Export CSV</button>
        </div>
      </div>
      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        {missionLog.length === 0 ? (
          <div style={{
            fontSize: 11, color: "#5A567A", textAlign: "center", padding: "24px 0",
            fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
            letterSpacing: "-0.005em",
          }}>
            Events will appear here as the exercise progresses.
          </div>
        ) : missionLog.slice(-60).reverse().map((ev, i) => {
          const col =
            ev.type === "deposit" ? "#9BD4B5" :
            ev.type === "mine"    ? "#C0B8E8" :
            ev.type === "place"   ? "#E8C998" :
            ev.type === "grid"    ? "#C0B8E8" :
            ev.type === "diplomacy" ? "#A8A8F0" :
            ev.type === "claim" ? "#C0B8E8" :
                                    "#8B86B0";
          return (
            <div key={i} style={{
              display: "flex", gap: 10, fontSize: 9.5,
              color: col, padding: "3px 0", borderBottom: "1px solid rgba(200,196,220,0.04)",
              fontFamily: "'Bricolage Grotesque',sans-serif",
              fontWeight: 400, letterSpacing: "-0.002em",
            }}>
              <span style={{
                color: "#5A567A", minWidth: 50,
                fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
              }}>R{ev.round} · D{ev.day}</span>
              <span style={{
                minWidth: 60,
                fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
                letterSpacing: "-0.005em",
              }}>{ev.type}</span>
              {ev.kg != null && <span>{ev.kg.toFixed(1)} kg</span>}
              {ev.craterIdx != null && (
                <span style={{ color: "#5A567A" }}>
                  {craterName(ev.craterIdx) || `crater #${ev.craterIdx}`}
                </span>
              )}
              {ev.label && <span style={{ color: col }}>{ev.label}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
