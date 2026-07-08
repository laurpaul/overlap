// ── AssetDetailSidebar ──────────────────────────────────────────────────────
//
// Slide-in panel on the left when an asset has been clicked. Shows full
// stats and any available actions (rover: clear waypoints; structures:
// order resupply).
//
// Props:
//   assetDetail    -- { kind, idx, pi } | null
//   p1, p2         -- player states
//   p1Done, p2Done -- done flags for action gating
//   canControlActor(pi) -- whether the current viewer can act for this actor
//   clearWaypoints -- call (pi) → routes through App.jsx's gated path
//   setAssetDetail -- close action
//   buildStructure -- call (pi, type) → e.g. for "resupply"

import { RESUPPLY_COST, pxToLatLon, PAD_DUST_MITIGATION, padCostMultiplier, SAFETY_RADIUS, MAP_KM_PER_PX, POWER_CAP, HABITAT_POWER_CAP } from "../sim/index.js";
import { functionalPadCount } from "../sim/playerState.js";
import { AssetIcon } from "../AssetIcons.jsx";

// Power is stored in absolute units (rover: 0-POWER_CAP, habitat:
// 0-HABITAT_POWER_CAP), NOT as a 0-1 fraction. v174: the stat panel was
// rendering `power * 100`, so a rover at 72/120 power read "7221%" and one at
// 14.4 read "1440%". Convert to a clamped 0-100% of the relevant cap.
const pctOfCap = (val, cap) =>
  Math.max(0, Math.min(100, Math.round(((val ?? cap) / cap) * 100)));

// Format a source-pixel position as a polar coordinate (e.g. "89.7°S, 129.2°E").
// Workshop participants see lat/lon on the map; showing raw pixel xy makes
// the asset stats panel feel like a debug view rather than a mission readout.
function formatPos(asset) {
  if (!asset || asset.x == null || asset.y == null) return "·";
  const { lat, lon } = pxToLatLon(asset.x, asset.y);
  return `${Math.abs(lat).toFixed(2)}°S, ${lon.toFixed(1)}°E`;
}

function statRowsFor(assetDetail, p, sh) {
  if (assetDetail.kind === "rover") {
    const r = assetDetail.idx === 0 ? p : (p.extraRovers || [])[assetDetail.idx - 1];
    const healthVal = assetDetail.idx === 0 ? 1.0 : (sh.extraRovers?.[assetDetail.idx - 1] ?? 1.0);
    return {
      asset: r, healthVal,
      title: `Rover R${assetDetail.idx + 1}`,
      kindLabel: "Rover",
      stats: [
        ["Status",            r?.status || "idle"],
        ["Power",             `${pctOfCap(r?.power, POWER_CAP)}%`],
        ["Ice carried",       `${Math.round(r?.ice ?? 0)} kg`],
        ["Health",            `${Math.round(healthVal * 100)}%`],
        ["Waypoints queued",  `${(r?.waypoints || []).length}`],
        ["Position",          formatPos(r)],
      ],
    };
  }
  if (assetDetail.kind === "habitat") {
    const habs = p.habitats || (p.habitat ? [p.habitat] : []);
    const habPwr = p.habitatPower || [];
    const healthVal = sh.habitats?.[assetDetail.idx] ?? 1.0;
    const asset = habs[assetDetail.idx];
    return {
      asset, healthVal,
      title: `Habitat H${assetDetail.idx + 1}`,
      kindLabel: "Habitat module",
      stats: [
        ["Health",   `${Math.round(healthVal * 100)}%`],
        ["Power",    `${pctOfCap(habPwr[assetDetail.idx], HABITAT_POWER_CAP)}%`],
        ["Position", formatPos(asset)],
      ],
    };
  }
  if (assetDetail.kind === "solar") {
    const panels = p.panels || p.solarPanels || [];
    const healthVal = sh.panels?.[assetDetail.idx] ?? 1.0;
    const asset = panels[assetDetail.idx];
    return {
      asset, healthVal,
      title: `Solar array S${assetDetail.idx + 1}`,
      kindLabel: "Photovoltaic array",
      stats: [
        ["Health",   `${Math.round(healthVal * 100)}%`],
        ["Position", formatPos(asset)],
        ["Terrain",  asset?.onRidge ? "ridge (always sunlit)" : "valley floor"],
      ],
    };
  }
  if (assetDetail.kind === "reactor") {
    const reactors = p.reactors || [];
    const healthVal = sh.reactors?.[assetDetail.idx] ?? 1.0;
    const asset = reactors[assetDetail.idx];
    return {
      asset, healthVal,
      title: `Reactor N${assetDetail.idx + 1}`,
      kindLabel: "Fission surface power",
      stats: [
        ["Health",   `${Math.round(healthVal * 100)}%`],
        ["Output",   healthVal > 0.5 ? "nominal" : healthVal > 0.2 ? "degraded" : "critical"],
        ["Position", formatPos(asset)],
      ],
    };
  }
  if (assetDetail.kind === "pad") {
    const pads = p.landingPads || (p.landingPad ? [p.landingPad] : []);
    const healthVal = sh.landingPads?.[assetDetail.idx] ?? 1.0;
    const asset = pads[assetDetail.idx];
    return {
      asset, healthVal,
      title: `Landing pad P${assetDetail.idx + 1}`,
      kindLabel: "Landing pad",
      stats: [
        ["Health",   `${Math.round(healthVal * 100)}%`],
        ["Position", formatPos(asset)],
      ],
    };
  }
  return { asset: null, healthVal: 1.0, title: "", kindLabel: "", stats: [] };
}

export function AssetDetailSidebar({
  assetDetail, p1, p2,
  p1Done, p2Done,
  canControlActor, clearWaypoints,
  setAssetDetail, buildStructure,
}) {
  if (!assetDetail) return null;
  const p = assetDetail.pi === 0 ? p1 : p2;
  if (!p) return null;

  const color = assetDetail.pi === 0 ? "#28B9AE" : "#F0902E";
  const sh = p.structureHealth || {};
  const isOwn = canControlActor(assetDetail.pi);
  const isDone = assetDetail.pi === 0 ? p1Done : p2Done;
  const { asset, healthVal, title, kindLabel, stats } = statRowsFor(assetDetail, p, sh);
  const healthColor =
    healthVal > 0.6 ? "#9BD4B5" :
    healthVal > 0.3 ? "#E8C998" : "#E89BB5";

  return (
    <div style={{
      position: "fixed", top: 54, left: 14, width: 340,
      maxHeight: "calc(100vh - 110px)", overflowY: "auto",
      zIndex: 997,
      background: "rgba(20,18,32,0.97)",
      border: `1px solid ${color}66`,
      borderLeft: `3px solid ${color}`,
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }}>
            <AssetIcon type={assetDetail.kind} color={color} size={42} />
          </div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.22em", color, fontWeight: 600 }}>
              ACTOR {assetDetail.pi === 0 ? "I" : "II"} {isOwn ? "" : "· OPPONENT"}
            </div>
            <div style={{
              fontFamily: "'Spectral',Georgia,serif", fontSize: 18, fontWeight: 500,
              fontStyle: "italic", color: "#ECEAF8", letterSpacing: "-0.01em",
              marginTop: 2,
            }}>{title}</div>
            <div style={{
              fontSize: 10, color: "#8B86B0", fontStyle: "italic",
              fontFamily: "'Spectral',Georgia,serif", marginTop: 1,
            }}>{kindLabel}</div>
          </div>
        </div>
        <button
          onClick={() => setAssetDetail(null)}
          style={{
            background: "transparent", border: "none", color: "#8B86B0",
            cursor: "pointer", fontSize: 22, lineHeight: 1, padding: "0 4px",
          }}
          aria-label="Close asset details"
        >×</button>
      </div>

      {/* Health bar (prominent) */}
      <div style={{ marginBottom: 14 }}>
        <div style={{
          display: "flex", justifyContent: "space-between", marginBottom: 4,
          fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase",
          color: "#8B86B0", fontWeight: 500,
        }}>
          <span>Health</span>
          <span style={{ color: healthColor, fontWeight: 600 }}>
            {Math.round(healthVal * 100)}%
          </span>
        </div>
        <div style={{
          height: 8, background: "rgba(27,25,52,0.85)",
          borderRadius: 4, overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${Math.max(0, healthVal * 100)}%`,
            background: healthColor,
            boxShadow: `0 0 8px ${healthColor}`,
            transition: "width 0.3s",
          }}/>
        </div>
      </div>

      {/* Stat rows */}
      <div style={{ marginBottom: 12 }}>
        {stats.map(([k, v]) => (
          <div key={k} style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 11.5, padding: "5px 0",
            borderBottom: "1px solid rgba(200,196,220,0.08)",
          }}>
            <span style={{ color: "#8B86B0" }}>{k}</span>
            <span style={{ color: "#ECEAF8", fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>

      {/* v164: landing-pad benefits readout, make the three pad perks legible
          at the point of inspection. */}
      {assetDetail.kind === "pad" && (() => {
        const functional = healthVal > 0.1;
        const padN = functionalPadCount(p);
        const discountPct = Math.round((1 - padCostMultiplier(padN)) * 100);
        const apronKm = (SAFETY_RADIUS.pad * MAP_KM_PER_PX).toFixed(1);
        const dustPct = Math.round(PAD_DUST_MITIGATION * 100);
        const Row = ({ label, value, on }) => (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10.5, lineHeight: 1.5, padding: "2px 0" }}>
            <span style={{ color: on ? "#C0B8E8" : "#5A567A", fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic" }}>{label}</span>
            <span style={{ color: on ? "#A8A8F0" : "#5A567A", fontWeight: 600, textAlign: "right", flexShrink: 0 }}>{value}</span>
          </div>
        );
        return (
          <div style={{
            marginBottom: 12, padding: "9px 11px", borderRadius: 6,
            background: "rgba(168,168,240,0.06)",
            border: "1px solid rgba(168,168,240,0.20)",
            borderLeft: "2px solid #A8A8F0",
          }}>
            <div style={{ fontSize: 8, letterSpacing: "0.2em", color: "#A8A8F0", fontWeight: 600, textTransform: "uppercase", marginBottom: 6, fontFamily: "'Bricolage Grotesque',sans-serif" }}>
              Dust-mitigation infrastructure
            </div>
            <Row label="Dust apron" value={functional ? `−${dustPct}% within ${apronKm} km` : "offline"} on={functional} />
            <Row label="Logistics discount" value={discountPct > 0 ? `−${discountPct}% equipment` : ", "} on={functional && discountPct > 0} />
            <Row label="Geopolitical" value="+stewardship" on={functional} />
            {!functional && (
              <div style={{ fontSize: 9.5, color: "#E89BB5", marginTop: 5, fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic", lineHeight: 1.4 }}>
                Pad destroyed, provides no dust shield, discount, or standing until repaired.
              </div>
            )}
          </div>
        );
      })()}

      {/* Actions */}
      {isOwn && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {assetDetail.kind === "rover" && (asset?.waypoints || []).length > 0 && !isDone && (
            <button
              onClick={() => clearWaypoints(assetDetail.pi)}
              style={{
                background: "rgba(200,196,220,0.04)",
                border: `1px solid ${color}55`,
                color: "#C0B8E8", borderRadius: 4, padding: "8px 12px",
                fontFamily: "'Spectral',Georgia,serif", fontSize: 12, fontStyle: "italic",
                cursor: "pointer", textAlign: "left",
              }}
            >Clear waypoints</button>
          )}
          {healthVal < 0.95 && assetDetail.kind !== "rover" && !isDone && (p?.budget ?? 0) >= RESUPPLY_COST && (
            <button
              onClick={() => buildStructure(assetDetail.pi, "resupply")}
              style={{
                background: `linear-gradient(135deg, ${color}28, ${color}10)`,
                border: `1px solid ${color}aa`,
                color: "#ECEAF8", borderRadius: 4, padding: "8px 12px",
                fontFamily: "'Spectral',Georgia,serif", fontSize: 12, fontStyle: "italic",
                cursor: "pointer", textAlign: "left", fontWeight: 500,
              }}
            >Order resupply ({RESUPPLY_COST} cr)</button>
          )}
        </div>
      )}
    </div>
  );
}
