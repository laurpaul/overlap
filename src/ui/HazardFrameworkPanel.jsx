// ── HazardFrameworkPanel ────────────────────────────────────────────────────
//
// In-sandbox front end for the OLF DLA hazard-zone computation (src/sim/
// hazardZones.js, ported from Aaron Mackey's lunar-radius framework). Lets a
// facilitator derive the live safety zones from hazard physics during a
// workshop instead of using the hardcoded defaults, and round-trip buffers.json
// / GeoJSON with the standalone GIS tool.
//
// Applying mutates the simulator's SAFETY_RADIUS in place (pad ← core,
// habitat/rover ← buffer, solar ← coordination) at THIS sim's scale. Reactor
// and comsat are not part of the framework mapping and keep their defaults.
// The change is explicit and fully reversible (Reset to defaults).
//
// Brand: Spectral + Bricolage, The Both palette, no em dashes.

import { useState, useMemo, useRef } from "react";
import {
  HAZARD_TYPES, CONFIDENCE_OPTIONS, MITIGATION_OPTIONS,
  DEFAULT_BUFFER_MULT, DEFAULT_COORD_MULT, ZONE_FOR_ASSET, REACTOR_ZONE_OPTIONS,
  computeDustRadii, computeManualRadii, classifyHazard,
  zonesToSafetyRadiusKm, parseBuffersJson, buildBuffersJson, buildGeoJson,
} from "../sim/hazardZones.js";
import { downloadBlob } from "../sim/utils.js";

const ZONE_COLOR = { core: "#E89BB5", buffer: "#A8A8F0", coord: "#80B0D8" };

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{
        fontFamily: "var(--sans)", fontWeight: 500, fontSize: 10,
        letterSpacing: "0.12em", textTransform: "uppercase",
        color: "var(--text-dim)", marginBottom: 5,
      }}>{label}</div>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  background: "var(--bg-elevated)", color: "var(--text-hi)",
  border: "1px solid var(--border-soft)", borderRadius: 5,
  padding: "7px 9px", fontFamily: "var(--mono)", fontSize: 13,
};

export function HazardFrameworkPanel({ open, onClose, onApply, onReset, active, defaultRadii, pixelsPerKm = 2 }) {
  const [mode, setMode] = useState("dust");
  const [dustRate, setDustRate] = useState(500);
  const [conf, setConf] = useState(0.25);
  const [mit, setMit] = useState(1.0);

  const [hazardType, setHazardType] = useState("radiation");
  const [value, setValue] = useState(20);
  const [ratioIn, setRatioIn] = useState(HAZARD_TYPES.radiation.defaultRatioIn);
  const [ratioOut, setRatioOut] = useState(HAZARD_TYPES.radiation.defaultRatioOut);
  const [bufMult, setBufMult] = useState(DEFAULT_BUFFER_MULT);
  const [coordMult, setCoordMult] = useState(DEFAULT_COORD_MULT);
  const [customUnit, setCustomUnit] = useState("");

  const [siteName, setSiteName] = useState("");
  const [lat, setLat] = useState(-89.9);
  const [lon, setLon] = useState(0);
  const [reactorZone, setReactorZone] = useState("off");  // optional reactor mapping

  const [imported, setImported] = useState(null);   // { core, buffer, coord } from buffers.json
  const [notice, setNotice] = useState(null);        // { kind: 'ok'|'err', text }
  const fileRef = useRef(null);

  const unit = hazardType === "custom" ? (customUnit.trim() || "units") : (HAZARD_TYPES[hazardType]?.unit ?? "units");

  const onHazardType = (t) => {
    setHazardType(t);
    const m = HAZARD_TYPES[t];
    if (t !== "custom" && m) { setRatioIn(m.defaultRatioIn); setRatioOut(m.defaultRatioOut); }
  };

  const zones = useMemo(() => {
    if (imported) return imported;
    if (mode === "dust") return computeDustRadii(Number(dustRate), Number(conf), Number(mit));
    return computeManualRadii(Number(value), Number(conf), Number(mit), Number(ratioIn), Number(ratioOut), Number(bufMult), Number(coordMult));
  }, [imported, mode, dustRate, conf, mit, value, ratioIn, ratioOut, bufMult, coordMult]);

  const cls = classifyHazard(zones.core);
  const radiiKm = useMemo(() => {
    const m = zonesToSafetyRadiusKm(zones);
    if (reactorZone !== "off") m.reactor = zones[reactorZone];
    return m;
  }, [zones, reactorZone]);

  if (!open) return null;

  const meta = {
    siteName: siteName.trim() || null, lat: Number(lat), lon: Number(lon),
    inputMode: imported ? "imported" : mode,
    hazardType: imported ? null : (mode === "dust" ? "dust" : hazardType),
  };

  const apply = () => {
    onApply(radiiKm, {
      zones, cls,
      label: imported ? "imported buffers.json" : (mode === "dust" ? `dust ${dustRate} kg/hr` : `${HAZARD_TYPES[hazardType]?.label ?? hazardType} ${value} ${unit}`),
      site: meta.siteName,
      reactorZone: reactorZone === "off" ? null : reactorZone,
    });
    setNotice({
      kind: "ok",
      text: reactorZone === "off"
        ? "Applied. Safety zones now reflect this hazard. Reactor and comsat keep defaults."
        : `Applied. Safety zones now reflect this hazard, with reactor mapped to the ${reactorZone === "coord" ? "coordination" : reactorZone} zone. Comsat keeps its default.`,
    });
  };

  const exportBuffers = () => {
    const json = buildBuffersJson({ core: zones.core, buffer: zones.buffer, coord: zones.coord, meta, pixelsPerKm });
    downloadBlob(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }), "buffers.json");
  };
  const exportGeoJson = () => {
    const gj = buildGeoJson({ lat: Number(lat), lon: Number(lon), siteName: meta.siteName, core: zones.core, buffer: zones.buffer, coord: zones.coord, properties: { hazard: meta.hazardType, input_mode: meta.inputMode } });
    downloadBlob(new Blob([JSON.stringify(gj, null, 2)], { type: "application/geo+json" }), "dla_zones.geojson");
  };

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const { zones: z, meta: m } = parseBuffersJson(data);
      setImported(z);
      if (m.site) setSiteName(m.site);
      setNotice({ kind: "ok", text: `Imported ${m.site ? `"${m.site}" ` : ""}from buffers.json. Pixels reprojected to this sim's scale (km values used).` });
    } catch (err) {
      setNotice({ kind: "err", text: `Could not read that file: ${err.message}` });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const clearImport = () => { setImported(null); setNotice(null); };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 2050,
      background: "rgba(20,18,32,0.80)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="DLA hazard framework" style={{
        width: 720, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto",
        background: "rgba(32,30,64,0.97)", border: "1px solid var(--border-strong)",
        borderRadius: 10, boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
        padding: "24px 28px", fontFamily: "var(--sans)", color: "var(--text-bright)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <div style={{ fontFamily: "var(--sans)", fontWeight: 500, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--mist)" }}>
              Open Lunar · DLA If/Then toolkit
            </div>
            <h2 style={{ margin: "4px 0 0", fontFamily: "var(--serif)", fontWeight: 600, fontStyle: "italic", fontSize: 24, color: "var(--text-hi)" }}>
              Hazard framework
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close hazard framework" style={{ background: "none", border: "none", color: "var(--text-mid)", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <p style={{ margin: "8px 0 18px", fontFamily: "var(--serif)", fontSize: 13, lineHeight: 1.5, color: "var(--text-mid)", maxWidth: 600 }}>
          Compute operational exclusion zones from a hazard input, then drive the live safety zones from them. The ratio is the if/then logic: a stated hazard level implies a core radius, with buffer and coordination rings around it.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
          {/* ── Left: inputs ── */}
          <div>
            {!imported && (
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                {["dust", "manual"].map((m) => (
                  <button key={m} onClick={() => setMode(m)} style={{
                    flex: 1, padding: "7px 0", borderRadius: 5, cursor: "pointer",
                    fontFamily: "var(--sans)", fontWeight: 500, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase",
                    color: mode === m ? "#141220" : "var(--text-bright)",
                    background: mode === m ? "var(--periwinkle)" : "rgba(200,196,220,0.06)",
                    border: `1px solid ${mode === m ? "var(--periwinkle)" : "var(--border-soft)"}`,
                  }}>{m === "dust" ? "Dust" : "Manual hazard"}</button>
                ))}
              </div>
            )}

            {imported ? (
              <div style={{ padding: "12px 14px", background: "var(--accent-soft)", border: "1px solid var(--border-strong)", borderRadius: 6, marginBottom: 14 }}>
                <div style={{ fontFamily: "var(--sans)", fontWeight: 500, fontSize: 11, color: "var(--text-hi)" }}>Loaded from buffers.json</div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 12, color: "var(--text-mid)", marginTop: 4 }}>
                  Zone radii taken in km and reprojected to this sim's scale. Clear to return to live computation.
                </div>
                <button onClick={clearImport} style={ghostBtn}>Clear import</button>
              </div>
            ) : mode === "dust" ? (
              <>
                <Field label="Dust production rate (kg/hr)">
                  <input type="number" min="0" step="50" value={dustRate} onChange={(e) => setDustRate(e.target.value)} style={inputStyle} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Hazard type">
                  <select value={hazardType} onChange={(e) => onHazardType(e.target.value)} style={inputStyle}>
                    {Object.entries(HAZARD_TYPES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                  </select>
                </Field>
                {hazardType === "custom" && (
                  <Field label="Unit label">
                    <input value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} placeholder="e.g. counts/s" style={inputStyle} />
                  </Field>
                )}
                <Field label={`Hazard level (${unit})`}>
                  <input type="number" min="0" step="1" value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle} />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label={`Ratio in (${unit})`}>
                    <input type="number" min="0.01" step="1" value={ratioIn} onChange={(e) => setRatioIn(e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="Ratio out (km core)">
                    <input type="number" min="0" step="0.5" value={ratioOut} onChange={(e) => setRatioOut(e.target.value)} style={inputStyle} />
                  </Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Buffer × core">
                    <input type="number" min="1" step="0.1" value={bufMult} onChange={(e) => setBufMult(e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="Coordination × core">
                    <input type="number" min="1" step="0.1" value={coordMult} onChange={(e) => setCoordMult(e.target.value)} style={inputStyle} />
                  </Field>
                </div>
              </>
            )}

            {!imported && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Confidence">
                  <select value={conf} onChange={(e) => setConf(e.target.value)} style={inputStyle}>
                    {CONFIDENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Mitigation">
                  <select value={mit} onChange={(e) => setMit(e.target.value)} style={inputStyle}>
                    {MITIGATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
              </div>
            )}

            <div style={{ borderTop: "1px solid var(--border-soft)", margin: "6px 0 14px" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 10 }}>
              <Field label="Site name"><input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="optional" style={inputStyle} /></Field>
              <Field label="Lat °"><input type="number" step="0.1" value={lat} onChange={(e) => setLat(e.target.value)} style={inputStyle} /></Field>
              <Field label="Lon °"><input type="number" step="0.1" value={lon} onChange={(e) => setLon(e.target.value)} style={inputStyle} /></Field>
            </div>
            <Field label="Reactor zone (optional)">
              <select value={reactorZone} onChange={(e) => setReactorZone(e.target.value)} style={inputStyle}>
                {REACTOR_ZONE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>

          {/* ── Right: results ── */}
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {[["core", "Core · no entry"], ["buffer", "Buffer · restricted"], ["coord", "Coordination · notify"]].map(([k, lbl]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: ZONE_COLOR[k], flexShrink: 0 }} />
                  <div style={{ flex: 1, fontFamily: "var(--sans)", fontSize: 11, color: "var(--text-mid)" }}>{lbl}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 600, color: "var(--text-hi)" }}>{zones[k].toFixed(2)} <span style={{ fontSize: 11, color: "var(--text-dim)" }}>km</span></div>
                </div>
              ))}
            </div>

            <div style={{
              padding: "8px 12px", borderRadius: 6, marginBottom: 16,
              fontFamily: "var(--serif)", fontSize: 12.5, lineHeight: 1.4,
              color: cls.cls === "high" ? "#E89BB5" : cls.cls === "medium" ? "#E8C998" : "#9BD4B5",
              background: "var(--bg-elevated)", border: "1px solid var(--border-soft)",
            }}>{cls.text}</div>

            <div style={{ fontFamily: "var(--sans)", fontWeight: 500, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 8 }}>
              Resulting safety radii (this sim, {pixelsPerKm} px/km)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: "6px 10px", alignItems: "baseline", marginBottom: 16 }}>
              {[
                ...Object.entries(ZONE_FOR_ASSET).map(([asset, { zone }]) => ({ asset, zone })),
                ...(reactorZone !== "off" ? [{ asset: "reactor", zone: reactorZone }] : []),
              ].map(({ asset, zone }) => {
                const km = radiiKm[asset];
                const prevPx = defaultRadii?.[asset];
                return (
                  <div key={asset} style={{ display: "contents" }}>
                    <div style={{ width: 9, height: 9, borderRadius: 2, background: ZONE_COLOR[zone], alignSelf: "center" }} />
                    <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--text-bright)", textTransform: "capitalize" }}>{asset}</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-hi)", textAlign: "right" }}>{km.toFixed(2)} km</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)", textAlign: "right" }}>
                      {(km * pixelsPerKm).toFixed(1)} px{prevPx != null ? <span title="current value"> · now {prevPx.toFixed(1)}</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontFamily: "var(--serif)", fontSize: 11, fontStyle: "italic", color: "var(--text-dim)", lineHeight: 1.4 }}>
              {reactorZone === "off"
                ? "Reactor and comsat are not part of the framework mapping and keep their defaults."
                : "Comsats are orbital relays with no surface footprint and keep their defaults."}
            </div>
          </div>
        </div>

        {/* Notice */}
        {notice && (
          <div style={{
            marginTop: 16, padding: "9px 13px", borderRadius: 6,
            fontFamily: "var(--serif)", fontSize: 12.5,
            color: notice.kind === "err" ? "#E89BB5" : "#9BD4B5",
            background: "var(--bg-elevated)",
            border: `1px solid ${notice.kind === "err" ? "rgba(232,155,181,0.3)" : "rgba(155,212,181,0.3)"}`,
          }}>{notice.text}</div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border-soft)", alignItems: "center" }}>
          <button onClick={apply} style={primaryBtn}>Apply to simulation</button>
          {active && <button onClick={() => { onReset(); setNotice({ kind: "ok", text: "Reverted to default safety radii." }); }} style={ghostBtn}>Reset to defaults</button>}
          <div style={{ flex: 1 }} />
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onImportFile} style={{ display: "none" }} />
          <button onClick={() => fileRef.current?.click()} style={ghostBtn}>Import buffers.json</button>
          <button onClick={exportBuffers} style={ghostBtn}>Export buffers.json</button>
          <button onClick={exportGeoJson} style={ghostBtn}>Export GeoJSON</button>
        </div>
      </div>
    </div>
  );
}

const primaryBtn = {
  fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14, fontWeight: 600,
  padding: "8px 18px", borderRadius: 5, cursor: "pointer",
  color: "#141220", background: "var(--periwinkle)", border: "1px solid var(--periwinkle)",
};
const ghostBtn = {
  fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 12.5, fontWeight: 400,
  padding: "7px 13px", borderRadius: 5, cursor: "pointer", marginTop: 0,
  color: "var(--text-bright)", background: "rgba(200,196,220,0.06)", border: "1px solid var(--border-soft)",
};
