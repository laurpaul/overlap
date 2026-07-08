// ── ExploreSidebar ──────────────────────────────────────────────────────────
//
// Slide-in panel on the left when the user is in Explore Terrain mode and
// has clicked a point on the map. Pulls analyzePixel() data and renders:
//   • Lat/lon plus pixel coords
//   • Physical data block (PSR / slope / sunlight / Earth comms / ice / temp)
//   • Equipment recommendations (good / ok / bad per asset type)
//   • Asset placement buttons (active player only, during PLAYING phase)
//
// The placement buttons route through buildAndPlaceAt and respect a
// pending placement set by the build palette (placingFor / placingType).

import { analyzePixel, calcAssetCosts, PHASE, VIABLE, INDEX_CARDS, favorabilityClass, adjacencySites } from "../sim/index.js";

const ASSET_LABELS = {
  solar:   "Solar panel array",
  habitat: "Habitat module",
  reactor: "Fission reactor",
  pad:     "Landing pad",
  rover:   "Rover route",
  mining:  "Ice mining",
};

const BUILDABLES = [
  { type: "solar",   label: "Solar panel",  icon: "☀" },
  { type: "habitat", label: "Habitat",      icon: "🏠" },
  { type: "reactor", label: "Reactor",      icon: "☢" },
  { type: "pad",     label: "Landing pad",  icon: "🛬" },
  { type: "rover",   label: "Rover",        icon: "🚗" },
  { type: "comsat",  label: "Comsat relay", icon: "📡" },
];

const verdictColor = (v) => v === "good" ? "#9BD4B5" : v === "ok" ? "#E8C998" : "#E89BB5";
const verdictGlyph = (v) => v === "good" ? "✓" : v === "ok" ? "~" : "✗";

export function ExploreSidebar({
  exploreMode, exploreClick, setExploreClick,
  phase, mp, myActor, activeTurn,
  p1, p2,
  placingFor, placingType, setPlacingFor, setPlacingType,
  buildAndPlaceAt,
}) {
  if (!(exploreMode && exploreClick)) return null;

  // Resolve the active player (who is the placing actor right now) first, so
  // analyzePixel can fold that player's comsat relays into the comms-dependent
  // SOFI term, deploying a relay then visibly raises operations favorability.
  const activePi = mp
    ? (myActor === 0 || myActor === 1 ? myActor : null)
    : activeTurn;
  const showPlacement = phase === PHASE.PLAYING && (activePi === 0 || activePi === 1);
  const activeP = activePi === 0 ? p1 : activePi === 1 ? p2 : null;

  const a = analyzePixel(exploreClick.x, exploreClick.y, activeP?.comsats || null);
  if (!a) return null;

  let costs = {};
  let vMap = {};
  if (showPlacement && activeP) {
    costs = calcAssetCosts(activeP.alloc || { mil: 20, rd: 20, econ: 60 }, activeP?.stakeholderId).costs;
    for (const r of a.recs) vMap[r.asset] = r.verdict;
  }

  return (
    <div style={{
      position: "fixed", top: 54, left: 14, width: 360,
      maxHeight: "calc(100vh - 110px)", overflowY: "auto",
      zIndex: 997,
      background: "rgba(20,18,32,0.97)",
      border: "1px solid rgba(168,168,240,0.45)",
      borderLeft: "3px solid #A8A8F0",
      borderRadius: 6, padding: "18px 22px 20px",
      backdropFilter: "blur(14px)",
      boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
      fontFamily: "'Bricolage Grotesque',sans-serif", color: "#ECEAF8",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        marginBottom: 14, paddingBottom: 12,
        borderBottom: "1px solid rgba(200,196,220,0.1)",
      }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#A8A8F0", fontWeight: 600 }}>
            TERRAIN ANALYSIS
          </div>
          <div style={{
            fontSize: 18, fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
            fontWeight: 500, color: "#ECEAF8", letterSpacing: "-0.01em", marginTop: 2,
          }}>
            {Math.abs(a.lat).toFixed(2)}°S · {a.lon.toFixed(1)}°E
          </div>
          <div style={{
            fontSize: 11, color: "#8B86B0", marginTop: 4,
            fontFamily: "'Bricolage Grotesque',monospace",
          }}>
            px ({exploreClick.x}, {exploreClick.y})
          </div>
        </div>
        <button
          onClick={() => setExploreClick(null)}
          style={{
            background: "transparent", border: "1px solid rgba(200,196,220,0.2)",
            color: "#8B86B0", borderRadius: 3, padding: "3px 8px", cursor: "pointer",
            fontSize: 11, fontFamily: "'Bricolage Grotesque',sans-serif",
          }}
          aria-label="Close terrain analysis"
        >close</button>
      </div>

      {/* Recommendations */}
      <div style={{
        fontSize: 9, letterSpacing: "0.22em", color: "#8B86B0", fontWeight: 600,
        marginBottom: 8, textTransform: "uppercase",
      }}>
        Equipment recommendations
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {a.recs.map((r, i) => (
          <div key={i} style={{
            padding: "8px 10px", borderRadius: 4,
            background: `${verdictColor(r.verdict)}12`,
            borderLeft: `3px solid ${verdictColor(r.verdict)}`,
            fontSize: 11.5, lineHeight: 1.45,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{
                fontSize: 13, color: verdictColor(r.verdict), fontWeight: 700,
                fontFamily: "monospace", width: 14, textAlign: "center",
              }}>{verdictGlyph(r.verdict)}</span>
              <span style={{
                color: "#ECEAF8", fontWeight: 600,
                fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
              }}>{ASSET_LABELS[r.asset] || r.asset}</span>
              <span style={{
                color: verdictColor(r.verdict), fontSize: 10, fontWeight: 600,
                letterSpacing: "0.1em", textTransform: "uppercase", marginLeft: "auto",
              }}>{r.verdict}</span>
            </div>
            <div style={{ color: "#8B86B0", paddingLeft: 20 }}>{r.reason}</div>
          </div>
        ))}
      </div>

      {/* Asset placement buttons -- only during the active player's PLAYING turn */}
      {showPlacement && activeP && (
        <>
          <div style={{
            marginTop: 14, fontSize: 9, letterSpacing: "0.22em", color: "#8B86B0",
            fontWeight: 600, textTransform: "uppercase",
          }}>
            {placingType ? `Confirm ${placingType} placement` : "Place asset here"}
          </div>

          {/* Pending-placement confirm row */}
          {placingType && placingFor === activePi && (() => {
            const b = BUILDABLES.find((x) => x.type === placingType);
            if (!b) return null;
            const cost = costs[placingType] ?? 0;
            const affordable = (activeP.budget ?? 0) >= cost;
            const verdictBad = vMap[placingType] === "bad";
            const disabled = !affordable || verdictBad;
            return (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button
                  onClick={() => {
                    if (disabled) return;
                    buildAndPlaceAt(activePi, placingType, exploreClick.x, exploreClick.y);
                    // v25: stay in explore mode after placement; clear the click
                    // marker so the panel closes and the user can pick another site.
                    setExploreClick(null);
                    setPlacingFor(null);
                    setPlacingType(null);
                  }}
                  disabled={disabled}
                  style={{
                    flex: 1,
                    background: disabled
                      ? "rgba(200,196,220,0.04)"
                      : "linear-gradient(135deg, rgba(155,212,181,0.32), rgba(155,212,181,0.12))",
                    border: `1.5px solid ${disabled ? "rgba(200,196,220,0.12)" : "rgba(155,212,181,0.75)"}`,
                    color: disabled ? "#5A567A" : "#ECEAF8",
                    borderRadius: 4, padding: "10px 12px",
                    cursor: disabled ? "default" : "pointer",
                    fontSize: 12, fontFamily: "'Bricolage Grotesque',sans-serif",
                    fontWeight: 700, textAlign: "left",
                    display: "flex", alignItems: "center", gap: 8,
                    boxShadow: disabled ? "none" : "0 0 12px rgba(155,212,181,0.30)",
                    transition: "all 0.12s",
                  }}>
                  <span style={{ fontSize: 16 }}>{b.icon}</span>
                  <span style={{ flex: 1 }}>Confirm {b.label.toLowerCase()}</span>
                  <span style={{
                    fontSize: 11, opacity: 0.85,
                    color: disabled ? "#5A567A" : "#C0B8E8",
                  }}>{cost}cr</span>
                </button>
                <button
                  onClick={() => {
                    // v25: cancel the pending placement, stay in explore mode.
                    setPlacingFor(null);
                    setPlacingType(null);
                  }}
                  title="Cancel pending placement (stay in explore mode)"
                  style={{
                    background: "rgba(200,196,220,0.05)",
                    border: "1px solid rgba(200,196,220,0.18)",
                    color: "#8B86B0", borderRadius: 4, padding: "10px 12px",
                    cursor: "pointer", fontSize: 11,
                    fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 500,
                  }}>Cancel</button>
              </div>
            );
          })()}

          {/* Buildable grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: 6, marginTop: 6,
          }}>
            {BUILDABLES.map((b) => {
              const cost = costs[b.type] ?? 0;
              const affordable = (activeP.budget ?? 0) >= cost;
              const verdictBad = vMap[b.type] === "bad";
              const disabled = !affordable || verdictBad;
              const isPending = placingType === b.type && placingFor === activePi;
              const dimmed = placingType && !isPending;
              return (
                <button
                  key={b.type}
                  onClick={() => {
                    if (disabled) return;
                    buildAndPlaceAt(activePi, b.type, exploreClick.x, exploreClick.y);
                    setExploreClick(null);
                    setPlacingFor(null);
                    setPlacingType(null);
                  }}
                  disabled={disabled}
                  title={
                    verdictBad   ? `Not recommended: ${vMap[b.type] || "site review failed"}` :
                    !affordable  ? `Need ${cost}cr, have ${activeP.budget ?? 0}cr` :
                    `Place ${b.label.toLowerCase()} here for ${cost}cr`
                  }
                  style={{
                    background: disabled
                      ? "rgba(200,196,220,0.04)"
                      : isPending
                        ? "linear-gradient(135deg, rgba(155,212,181,0.28), rgba(155,212,181,0.10))"
                        : "linear-gradient(135deg, rgba(168,168,240,0.18), rgba(168,168,240,0.06))",
                    border: `1px solid ${
                      disabled    ? "rgba(200,196,220,0.12)" :
                      isPending   ? "rgba(155,212,181,0.7)"  :
                                    "rgba(168,168,240,0.5)"
                    }`,
                    color: disabled ? "#5A567A" : "#ECEAF8",
                    opacity: dimmed ? 0.55 : 1,
                    borderRadius: 4, padding: "8px 10px",
                    cursor: disabled ? "default" : "pointer",
                    fontSize: 11, fontFamily: "'Bricolage Grotesque',sans-serif",
                    fontWeight: 600, textAlign: "left",
                    display: "flex", alignItems: "center", gap: 6,
                    transition: "all 0.12s",
                  }}>
                  <span style={{ fontSize: 14 }}>{b.icon}</span>
                  <span style={{ flex: 1 }}>{b.label}</span>
                  <span style={{
                    fontSize: 10, opacity: 0.8,
                    color: disabled ? "#5A567A" : "#C0B8E8",
                  }}>{cost}cr</span>
                </button>
              );
            })}
          </div>
        </>
      )}


      {/* v122 (item 7): geology / terrain detail moved BELOW the assets
          cluster so explore mode leads with placement + recommendations and
          ends with the deeper geological readout. */}
      {/* Physical data block */}
      <div style={{
        background: "rgba(168,168,240,0.06)", borderRadius: 4,
        padding: "10px 12px", marginBottom: 14,
        fontSize: 11.5, lineHeight: 1.7,
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
          <span style={{ color: "#8B86B0" }}>PSR:</span>
          <span style={{ color: a.psr ? "#80B0D8" : "#C0B8E8" }}>
            {a.psr ? "yes (permanently shadowed)" : "no (sunlit at least seasonally)"}
          </span>
          <span style={{ color: "#8B86B0" }}>Slope:</span>
          <span style={{ color: a.slope > 20 ? "#E89BB5" : a.slope > 12 ? "#E8C998" : "#9BD4B5" }}>
            {a.slope.toFixed(1)}°
          </span>
          <span style={{ color: "#8B86B0" }}>Sunlight:</span>
          <span style={{ color: a.illum > 0.6 ? "#E8C998" : "#C0B8E8" }}>
            {(a.illum * 100).toFixed(0)}% annual max
          </span>
          <span style={{ color: "#8B86B0" }}>Earth comms:</span>
          <span style={{ color: a.earth > 0.4 ? "#9BD4B5" : a.earth < 0.15 ? "#E89BB5" : "#E8C998" }}>
            {(a.earth * 100).toFixed(0)}% visibility
          </span>
          <span style={{ color: "#8B86B0" }}>Ice signature:</span>
          <span style={{ color: a.ice > 0.3 ? "#80B0D8" : "#C0B8E8" }}>
            {(a.ice * 100).toFixed(0)}%
          </span>
          <span style={{ color: "#8B86B0" }}>Temperature:</span>
          <span style={{ color: a.temp < (110 - 25) / 275 ? "#80B0D8" : a.temp < (180 - 25) / 275 ? "#C0B8E8" : "#E8C998" }}>
            {Math.round(25 + a.temp * 275)}K
            {" "}
            <span style={{ color: "#5A567A", fontSize: 10 }}>
              ({a.temp < (110 - 25) / 275 ? "cold trap, water-ice stable"
                : a.temp < (180 - 25) / 275 ? "shadowed terrain"
                : "sunlit terrain"})
            </span>
          </span>
        </div>
      </div>

      {/* Mission-phase favorability, LFI / SOFI / IFI, in the Blog Post 2
          index-card style: each index poses a mission question, weights the
          same terrain differently, and lands in one of four favorability
          classes. The verdict below is the post's headline: no location
          maximizes all three. */}
      {a.indices && (() => {
        const ix = a.indices;
        const valOf = { lfi: ix.lfi, sofi: ix.sofi, ifi: ix.ifi };
        const BAR_LO = -0.3, BAR_HI = 1;
        const barPct = (v) => Math.round(Math.max(0, Math.min(1, (v - BAR_LO) / (BAR_HI - BAR_LO))) * 100);
        // Adjacency: for phases this pixel does NOT satisfy, how far is the
        // nearest viable site? "Adjacency is the resource" (post §6).
        const adj = adjacencySites(exploreClick.x, exploreClick.y);
        const adjRows = [
          { key: "land", label: "landable ground", site: adj.land,  accent: "#5DCAA5" },
          { key: "ops",  label: "operable ground", site: adj.ops,   accent: "#EF9F27" },
          { key: "ice",  label: "ice",             site: adj.ice,   accent: "#A8A8F0" },
        ].filter((r) => r.site && !r.site.self); // only phases not satisfied here

        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 9, letterSpacing: "0.22em", color: "#8B86B0", fontWeight: 600,
              marginBottom: 8, textTransform: "uppercase",
              fontFamily: "'Bricolage Grotesque',sans-serif",
            }}>
              Mission-phase favorability
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {INDEX_CARDS.map((c) => {
                const v = valOf[c.key];
                const fc = favorabilityClass(v);
                return (
                  <div key={c.key} style={{
                    position: "relative", background: "rgba(20,18,32,0.55)",
                    borderRadius: 4, padding: "9px 11px 9px 14px", overflow: "hidden",
                  }}>
                    {/* accent strip */}
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: c.accent }} />
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                        <span style={{ fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic", fontSize: 18, color: c.accent, lineHeight: 1 }}>{c.abbr}</span>
                        <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 9, letterSpacing: "0.06em", color: "#8B86B0", textTransform: "uppercase" }}>{c.name}</span>
                      </span>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontSize: 9, color: c.accent, fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 600, letterSpacing: "0.04em" }}>{fc.label}</span>
                        <span style={{ fontSize: 12, color: "#ECEAF8", fontVariantNumeric: "tabular-nums" }}>{v >= 0 ? "+" : ""}{v.toFixed(2)}</span>
                      </span>
                    </div>
                    <div style={{
                      fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
                      fontSize: 11, color: "#A8A8F0", lineHeight: 1.35, margin: "4px 0 6px",
                    }}>{c.question}</div>
                    {/* favorability bar with the viability threshold marker */}
                    <div style={{ position: "relative", height: 5, background: "rgba(200,196,220,0.12)", borderRadius: 2, overflow: "hidden", marginBottom: 5 }}>
                      <div style={{ width: `${barPct(v)}%`, height: "100%", background: c.accent, opacity: 0.85 }} />
                      <div style={{ position: "absolute", left: `${barPct(VIABLE)}%`, top: 0, bottom: 0, width: 1, background: "rgba(236,234,248,0.55)" }} />
                    </div>
                    {/* weight breakdown, as the post prints it */}
                    <div style={{ fontSize: 8.5, color: "#5A567A", fontFamily: "'Bricolage Grotesque',sans-serif", letterSpacing: "0.01em" }}>
                      {c.weights.map(([n, w], i) => (
                        <span key={n}>{i > 0 ? " · " : ""}<span style={{ color: "#8B86B0" }}>{n}</span> {w.toFixed(2)}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* The headline: no location maximizes all three. */}
            <div style={{
              fontSize: 11, lineHeight: 1.5, color: "#C0B8E8", marginTop: 9,
              fontStyle: "italic", fontFamily: "'Spectral',Georgia,serif",
              borderLeft: "2px solid #A8A8F0", paddingLeft: 9,
            }}>
              {ix.verdict}
            </div>

            {/* Adjacency is the resource: nearest complementary sites. */}
            {adjRows.length > 0 && (
              <div style={{ marginTop: 10, padding: "8px 11px", background: "rgba(52,96,168,0.10)", borderRadius: 4 }}>
                <div style={{
                  fontSize: 8.5, letterSpacing: "0.2em", color: "#8B86B0", fontWeight: 600,
                  textTransform: "uppercase", marginBottom: 5, fontFamily: "'Bricolage Grotesque',sans-serif",
                }}>Adjacency · nearest viable</div>
                {adjRows.map((r) => (
                  <div key={r.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 11, marginBottom: 2 }}>
                    <span style={{ color: "#C0B8E8" }}>
                      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 1, background: r.accent, marginRight: 6 }} />
                      Nearest {r.label}
                    </span>
                    <span style={{ color: "#ECEAF8", fontVariantNumeric: "tabular-nums" }}>{r.site.km < 1 ? "<1" : r.site.km.toFixed(1)} km</span>
                  </div>
                ))}
                <div style={{ fontSize: 9, color: "#5A567A", marginTop: 4, fontStyle: "italic", fontFamily: "'Spectral',Georgia,serif", lineHeight: 1.4 }}>
                  No pixel does all three. The resource is how close the complements sit.
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <div style={{
        marginTop: 12, paddingTop: 10,
        borderTop: "1px solid rgba(200,196,220,0.1)",
        fontSize: 10, color: "#5A567A", fontStyle: "italic",
        fontFamily: "'Spectral',Georgia,serif",
      }}>
        Click another point to re-analyze · ESC to exit
      </div>
    </div>
  );
}
