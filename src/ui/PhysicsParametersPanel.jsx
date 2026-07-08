// ── PhysicsParametersPanel ──────────────────────────────────────────────────
//
// Live-editable physics override panel. Each slider sets a key in
// `physOverrides`; the simulation reads overrides via the `po` argument
// to simDay (BASE_MINE_RATE, ROVER_STEP, POWER_MOVE_DRAIN, POWER_MINE_DRAIN,
// DEPLETION_RATE) or via inline reads (PASSIVE_DECAY, HOSTILE_DECAY).
//
// v27: ICE_MASS_FRACTION slider now scales BASE_MINE_RATE in stepPlayer
// (was previously a no-op slider -- see App.jsx changelog).

import {
  BASE_MINE_RATE, ROVER_STEP, POWER_MOVE_DRAIN, POWER_MINE_DRAIN,
  PASSIVE_DECAY, HOSTILE_DECAY, DEPLETION_RATE, ICE_MASS_FRACTION,
} from "../sim/index.js";

const PARAMS = [
  { key: "BASE_MINE_RATE",    label: "Mine rate (kg/day)",   def: BASE_MINE_RATE,    min: 0.01, max: 10,    step: 0.01   },
  { key: "ROVER_STEP",        label: "Rover step (px/turn)", def: ROVER_STEP,        min: 10,   max: 400,   step: 5      },
  { key: "POWER_MOVE_DRAIN",  label: "Move power drain",     def: POWER_MOVE_DRAIN,  min: 1,    max: 60,    step: 1      },
  { key: "POWER_MINE_DRAIN",  label: "Mine power drain",     def: POWER_MINE_DRAIN,  min: 0.5,  max: 15,    step: 0.1    },
  { key: "PASSIVE_DECAY",     label: "Passive decay / turn", def: PASSIVE_DECAY,     min: 0,    max: 0.1,   step: 0.001  },
  { key: "HOSTILE_DECAY",     label: "Hostile decay / turn", def: HOSTILE_DECAY,     min: 0,    max: 0.2,   step: 0.005  },
  { key: "DEPLETION_RATE",    label: "Crater depletion",     def: DEPLETION_RATE,    min: 0,    max: 0.05,  step: 0.0005 },
  { key: "ICE_MASS_FRACTION", label: "Ice mass fraction",    def: ICE_MASS_FRACTION, min: 0.01, max: 0.3,   step: 0.001  },
];

function decimalsForStep(step) {
  if (step < 0.01) return 4;
  if (step < 0.1)  return 3;
  if (step < 1)    return 1;
  return 0;
}

export function PhysicsParametersPanel({ open, physOverrides, setPhysOverrides }) {
  if (!open) return null;

  return (
    <div style={{
      width: "100%", maxWidth: 1400, marginTop: 8,
      background: "rgba(20,18,32,0.92)",
      border: "1px solid rgba(232,201,152,0.15)",
      borderRadius: 7, padding: "16px 18px",
      animation: "fadeIn 0.2s ease",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: 14,
      }}>
        <span style={{
          fontSize: 9, letterSpacing: "0.22em", color: "#E8C998",
          paddingLeft: 10, borderLeft: "2px solid #E8C998",
          textTransform: "uppercase",
          fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 500,
        }}>Physics Parameters</span>
        <button
          onClick={() => setPhysOverrides({})}
          style={{
            background: "rgba(232,201,152,0.08)",
            border: "1px solid rgba(232,201,152,0.28)",
            color: "#E8C998", borderRadius: 4, padding: "4px 10px", cursor: "pointer",
            fontSize: 10, fontFamily: "'Spectral',Georgia,serif",
            fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.005em",
          }}
        >Reset all</button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {PARAMS.map((param) => {
          const current = physOverrides[param.key] ?? param.def;
          const isOverridden = physOverrides[param.key] != null;
          return (
            <div key={param.key} style={{ flex: "1 1 150px", minWidth: 140 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{
                  fontSize: 10, color: isOverridden ? "#E8C998" : "#8B86B0",
                  letterSpacing: "-0.005em",
                  fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
                }}>{param.label}</span>
                {isOverridden && (
                  <button
                    onClick={() => setPhysOverrides((p) => {
                      const n = { ...p };
                      delete n[param.key];
                      return n;
                    })}
                    title="Reset this parameter"
                    style={{
                      background: "none", border: "none", color: "#E8C998",
                      cursor: "pointer", fontSize: 11, padding: 0,
                      fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
                    }}
                  >↺</button>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="range"
                  min={param.min} max={param.max} step={param.step}
                  value={current}
                  onChange={(e) => setPhysOverrides((p) => ({ ...p, [param.key]: +e.target.value }))}
                  style={{ flex: 1, accentColor: isOverridden ? "#E8C998" : "#8B86B0" }}
                />
                <span style={{
                  fontSize: 11, color: isOverridden ? "#E8C998" : "#C0B8E8",
                  fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
                  letterSpacing: "-0.005em", minWidth: 40, textAlign: "right",
                }}>
                  {current.toFixed(decimalsForStep(param.step))}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 14, fontSize: 10, color: "#8B86B0", lineHeight: 1.7,
        background: "rgba(232,201,152,0.05)",
        border: "1px solid rgba(232,201,152,0.14)",
        borderRadius: 4, padding: "8px 12px",
        fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
        letterSpacing: "-0.002em",
      }}>
        Parameter overrides apply to the running simulation immediately. Overridden values shown in amber.
        Changes do not persist across sessions; use JSON export to save scenario configurations.
      </div>
    </div>
  );
}
