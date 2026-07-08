// ─────────────────────────────────────────────────────────────────────────────
// Facilitator inject deck, choice-based scenario perturbations.
//
// Each inject has 3 choices. Each choice carries a `deltas` object that is
// applied directly to the receiving actor(s)' player state:
//
//   econ            → p.econ          (national economy stock)
//   rdAccum         → p.rdAccum       (R&D accumulation)
//   milStock        → p.milStock      (military stock)
//   credits         → p.budget        (immediate lunar credits, 50-200 range)
//   contentnessMod  → p.contentnessMod (temporary C offset)
//   contentnessDecay→ p.contentnessDecay (per-round decay rate for the mod)
//
// `targets`: "both" | "p1" | "p2"
// The facilitator selects targets in the UI before pushing.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

import { INJECT_DECK, applyInjectDeltas } from "./sim/injects.js";
import { spoilerComparison } from "./sim/blocNegotiation.js";
export { INJECT_DECK, applyInjectDeltas };

// ── Facilitator panel component ──────────────────────────────────────────────
export function FacilitatorPanel({
  isOpen, onClose, onPushInject, onPushCustom,
  members, currentRound, currentDay,
  p1Label, p2Label,
  onPushRound, roundDuration, onSetRoundDuration,
  onConveneDiplomacy, diplomacyActive, diplomacyDurationMs, onSetDiplomacyDuration,
  diplomacyAutoEvery, onSetDiplomacyAutoEvery, diplomacySessionsHeld,
  totalRounds, onSetTotalRounds, missionEndMode, phasePlaying,
  lateArrivalPending, onDeployLateActor,
  onPushView, multiplayer,
  onGodBudget, onGodScore, onGodAddAsset, onGodRemoveAsset, onAnnounce, godState,
  onGodMaintain,
  onSetGrid, onSetStance, onSetZoneScale, onSetTierScale, onAdjustIce, onSetTreatyFloor, worldState,
  layerVis, onToggleLayer,
}) {
  const [expandedId, setExpandedId]   = useState(null);
  const [targetMap,  setTargetMap]    = useState({});   // injectId → "both"|"p1"|"p2"
  const [godOpen, setGodOpen]         = useState(false);

  if (!isOpen) return null;

  const actorCount = members.filter(m => m.seat !== 0).length;

  return (
    <div style={S.drawer}>
      <div style={S.drawerHeader}>
        <div>
          <div style={S.eyebrow}>FACILITATOR · WORKSHOP CONTROLS</div>
          <div style={S.title}>Inject deck</div>
        </div>
        <button onClick={onClose} style={S.closeBtn}>×</button>
      </div>

      <div style={S.contextBar}>
        Round {currentRound} · Day {currentDay} · {actorCount} actor{actorCount !== 1 ? "s" : ""} connected
      </div>

      {/* Facilitator round control: push the next round, set a wall-clock round
          duration (auto-advance), and change the total round count mid-game. */}
      <div style={S.roundControl}>
        <div style={S.sectionLabelLite}>ROUND CONTROL</div>
        <button
          onClick={() => { if (phasePlaying && onPushRound) onPushRound(); }}
          disabled={!phasePlaying}
          style={{ ...S.pushRoundBtn, opacity: phasePlaying ? 1 : 0.4,
            cursor: phasePlaying ? "pointer" : "default" }}
        >
          Push next round →
        </button>

        <div style={S.rcRowLabel}>Round duration · auto-advance</div>
        <div style={S.rcRow}>
          {[["Manual", 0], ["2 min", 120000], ["5 min", 300000], ["10 min", 600000]].map(([lbl, ms]) => {
            const active = (roundDuration || 0) === ms;
            return (
              <button key={lbl} onClick={() => onSetRoundDuration && onSetRoundDuration(ms)}
                style={{ ...S.rcChip,
                  background: active ? "rgba(168,168,240,0.20)" : "rgba(200,196,220,0.05)",
                  border: `1px solid ${active ? "#A8A8F0aa" : "rgba(200,196,220,0.12)"}`,
                  color: active ? "#ECEAF8" : "#8B86B0" }}>
                {lbl}
              </button>
            );
          })}
        </div>

        {missionEndMode === "fixed" && (
          <>
            <div style={S.rcRowLabel}>Total rounds</div>
            <div style={S.rcStepper}>
              <button onClick={() => onSetTotalRounds && onSetTotalRounds((totalRounds || 1) - 1)} style={S.rcStepBtn}>−</button>
              <span style={S.rcStepVal}>{totalRounds}</span>
              <button onClick={() => onSetTotalRounds && onSetTotalRounds((totalRounds || 1) + 1)} style={S.rcStepBtn}>+</button>
              <span style={S.rcStepHint}>min {currentRound} · max 40</span>
            </div>
          </>
        )}

        {lateArrivalPending && (
          <>
            <div style={{ ...S.rcRowLabel, marginTop: 12 }}>Late arriver</div>
            <button onClick={() => onDeployLateActor && onDeployLateActor()} style={S.deployBtn}>
              Deploy late actor now →
            </button>
            <div style={S.rcStepHint}>The second board actor is still off the board, bring it in immediately.</div>
          </>
        )}

        {/* v176: Diplomacy, convene a talk-only Conference of Parties (freezes
            the clock), set its length, and optionally auto-convene on a cadence
            to FORCE interaction. */}
        <div style={{ ...S.rcRowLabel, marginTop: 14 }}>Diplomacy · Conference of Parties</div>
        <button
          onClick={() => { if (phasePlaying && onConveneDiplomacy) onConveneDiplomacy(); }}
          disabled={!phasePlaying}
          style={{ ...S.pushRoundBtn,
            background: diplomacyActive ? "rgba(168,168,240,0.22)" : S.pushRoundBtn.background,
            opacity: phasePlaying ? 1 : 0.4, cursor: phasePlaying ? "pointer" : "default" }}
        >
          {diplomacyActive ? "Adjourn session ↺" : "Convene session ⚖"}
        </button>

        <div style={S.rcRowLabel}>Session length</div>
        <div style={S.rcRow}>
          {[["2 min", 120000], ["3 min", 180000], ["5 min", 300000], ["10 min", 600000]].map(([lbl, ms]) => {
            const active = (diplomacyDurationMs || 0) === ms;
            return (
              <button key={lbl} onClick={() => onSetDiplomacyDuration && onSetDiplomacyDuration(ms)}
                style={{ ...S.rcChip,
                  background: active ? "rgba(168,168,240,0.20)" : "rgba(200,196,220,0.05)",
                  border: `1px solid ${active ? "#A8A8F0aa" : "rgba(200,196,220,0.12)"}`,
                  color: active ? "#ECEAF8" : "#8B86B0" }}>
                {lbl}
              </button>
            );
          })}
        </div>

        <div style={S.rcRowLabel}>Auto-convene · force interaction</div>
        <div style={S.rcRow}>
          {[["Off", 0], ["Every rd", 1], ["Every 2", 2], ["Every 3", 3]].map(([lbl, n]) => {
            const active = (diplomacyAutoEvery || 0) === n;
            return (
              <button key={lbl} onClick={() => onSetDiplomacyAutoEvery && onSetDiplomacyAutoEvery(n)}
                style={{ ...S.rcChip,
                  background: active ? "rgba(168,168,240,0.20)" : "rgba(200,196,220,0.05)",
                  border: `1px solid ${active ? "#A8A8F0aa" : "rgba(200,196,220,0.12)"}`,
                  color: active ? "#ECEAF8" : "#8B86B0" }}>
                {lbl}
              </button>
            );
          })}
        </div>
        <div style={S.rcStepHint}>
          {(diplomacySessionsHeld || 0) === 0
            ? "No sessions held yet, actors can still win without ever talking."
            : `${diplomacySessionsHeld} session${diplomacySessionsHeld === 1 ? "" : "s"} held this game.`}
        </div>

        {/* v160: push the facilitator's current map view (basemap, overlays,
            camera) onto every participant's screen. Each actor normally steers
            their own map; this forces a shared view for "everyone look here." */}
        <div style={{ ...S.rcRowLabel, marginTop: 12 }}>Shared view</div>
        <button onClick={() => onPushView && onPushView()} style={S.pushViewBtn}>
          Push my view to all screens →
        </button>
        <div style={S.rcStepHint}>
          {multiplayer
            ? "Sends your basemap, overlays, and camera to every actor and screen."
            : "In a live room this snaps every actor's map to match yours."}
        </div>
      </div>

      {/* v161: GOD MODE, direct overrides (budget, score, assets, broadcast). */}
      <div style={S.godBlock}>
        <button onClick={() => setGodOpen(v => !v)} style={S.godToggle}>
          <span style={S.sectionLabelLite}>⚡ GOD MODE · DIRECT OVERRIDES</span>
          <span style={{ color: "#5A567A", fontSize: 12 }}>{godOpen ? "▲" : "▼"}</span>
        </button>
        {godOpen && (
          <GodModeControls
            godState={godState}
            p1Label={p1Label} p2Label={p2Label}
            onGodBudget={onGodBudget} onGodScore={onGodScore}
            onGodAddAsset={onGodAddAsset} onGodRemoveAsset={onGodRemoveAsset}
            onAnnounce={onAnnounce}
            onGodMaintain={onGodMaintain}
            onSetGrid={onSetGrid} onSetStance={onSetStance} onSetZoneScale={onSetZoneScale} onSetTierScale={onSetTierScale}
            onAdjustIce={onAdjustIce} onSetTreatyFloor={onSetTreatyFloor} worldState={worldState}
            layerVis={layerVis} onToggleLayer={onToggleLayer}
          />
        )}
      </div>

      {(() => {
        const s = spoilerComparison();
        const harderLabel = s.harder === "concordium" ? s.concordium.label : s.lrc.label;
        return (
          <div style={S.coordRead}>
            <div style={S.sectionLabelLite}>COORDINATION READ</div>
            <div style={S.coordLine}>
              Harder to trust to hold a coordinated line:{" "}
              <span style={{ color: "#E89BB5", fontWeight: 800 }}>{harderLabel}</span>
            </div>
            <div style={S.coordSub}>
              Concordium spoiler risk {(s.concordium.risk * 100).toFixed(0)}% (cohesion {(s.concordium.cohesion * 100).toFixed(0)}%) ·
              LRC {(s.lrc.risk * 100).toFixed(0)}% (cohesion {(s.lrc.cohesion * 100).toFixed(0)}%)
            </div>
            <div style={S.coordSub}>
              The US-led bloc carries the act-ahead commercial member and a principal who can override the agency, the counter-coalition is the more predictable partner.
            </div>
          </div>
        );
      })()}

      <div style={S.cardGrid}>
        {INJECT_DECK.map((inj) => {
          const isExpanded = expandedId === inj.id;
          const target     = targetMap[inj.id] ?? inj.defaultTargets;

          return (
            <div key={inj.id} style={{ ...S.injectCard, borderLeft: `3px solid ${inj.color}` }}>
              {/* Card header, click to expand */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : inj.id)}
                style={S.cardToggle}
              >
                <span style={{ ...S.injectIcon, color: inj.color, background: `${inj.color}18`, border: `1px solid ${inj.color}55` }}>
                  {inj.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={{ ...S.injectLabel, color: inj.color }}>{inj.label}</div>
                  <div style={S.injectSummary}>{inj.summary}</div>
                </div>
                <span style={{ color: "#5A567A", fontSize: 12, flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</span>
              </button>

              {isExpanded && (
                <div style={{ marginTop: 10 }}>
                  <div style={S.injectBlurb}>{inj.blurb}</div>

                  {/* Response options preview, actors will choose, not the facilitator */}
                  <div style={S.sectionLabel}>ACTOR RESPONSE OPTIONS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                    {inj.choices.map((choice, ci) => (
                      <div key={ci} style={{
                        padding: "6px 10px", borderRadius: 4,
                        background: "rgba(200,196,220,0.04)",
                        border: "1px solid rgba(200,196,220,0.10)",
                      }}>
                        <div style={{ fontSize: 11.5, color: "#C8C4DC",
                          fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
                          fontWeight: 400, letterSpacing: "-0.005em",
                          marginBottom: 2 }}>{choice.label}</div>
                        <div style={{ fontSize: 9.5, color: "#8B86B0",
                          fontFamily: "'Bricolage Grotesque',sans-serif",
                          lineHeight: 1.4 }}>{choice.desc}</div>
                        {choice.deltas?.scoreAdj ? (
                          <div style={{
                            fontSize: 9.5, marginTop: 3, fontVariantNumeric: "tabular-nums",
                            fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 600,
                            color: choice.deltas.scoreAdj > 0 ? "#9BD4B5" : "#E89BB5",
                          }}>{choice.deltas.scoreAdj > 0 ? "+" : ""}{choice.deltas.scoreAdj} score</div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {/* Target selector */}
                  <div style={S.sectionLabel}>TARGETS</div>
                  <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
                    {[
                      ["both", `Both actors`],
                      ["p1",   p1Label || "Actor I"],
                      ["p2",   p2Label || "Actor II"],
                    ].map(([val, lbl]) => (
                      <button key={val}
                        onClick={() => setTargetMap(m => ({ ...m, [inj.id]: val }))}
                        style={{
                          flex: 1, padding: "5px 4px", borderRadius: 4, cursor: "pointer",
                          fontSize: 9, fontFamily: "'Bricolage Grotesque',sans-serif",
                          fontWeight: target === val ? 600 : 400, letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          background: target === val ? `${inj.color}22` : "rgba(200,196,220,0.05)",
                          border: `1px solid ${target === val ? inj.color + "66" : "rgba(200,196,220,0.12)"}`,
                          color: target === val ? inj.color : "#8B86B0",
                        }}>{lbl}</button>
                    ))}
                  </div>

                  {/* Push button */}
                  <button
                    onClick={() => {
                      onPushInject(inj, target);
                      setExpandedId(null);
                    }}
                    style={{
                      ...S.pushBtn,
                      color: inj.color,
                      borderColor: `${inj.color}88`,
                      background: `linear-gradient(135deg, ${inj.color}22, ${inj.color}06)`,
                      cursor: "pointer",
                    }}>
                    Push event to workshop →
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <CustomInjectComposer onPush={onPushCustom} />
    </div>
  );
}

function GodModeControls({ godState, p1Label, p2Label, onGodBudget, onGodScore, onGodAddAsset, onGodRemoveAsset, onAnnounce, onGodMaintain, onSetGrid, onSetStance, onSetZoneScale, onSetTierScale, onAdjustIce, onSetTreatyFloor, worldState, layerVis, onToggleLayer }) {
  const STANCE_KEYS = [["balanced", "Balanced"], ["economic", "Economic"], ["austerity", "Surge"], ["military", "Security"]];
  const [target, setTarget] = useState("both"); // 0 | 1 | "both" for budget/score
  const [budgetSet, setBudgetSet] = useState("");
  const [scoreSet, setScoreSet] = useState("");
  const [annText, setAnnText] = useState("");
  const [annTarget, setAnnTarget] = useState("both");

  const p1 = godState?.p1, p2 = godState?.p2;
  const ASSET_TYPES = [
    ["solar", "Solar"], ["reactor", "Reactor"], ["habitat", "Habitat"],
    ["pad", "Pad"], ["rover", "Rover"],
  ];
  const ARRAY_OF = { solar: "panels", reactor: "reactors", habitat: "habitats", pad: "landingPads", rover: "extraRovers" };

  const TargetPicker = ({ value, onChange }) => (
    <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
      {[["both", "Both"], [0, p1Label || "Actor I"], [1, p2Label || "Actor II"]].map(([val, lbl]) => (
        <button key={String(val)} onClick={() => onChange(val)}
          style={{
            flex: 1, padding: "5px 4px", borderRadius: 4, cursor: "pointer",
            fontSize: 9, fontFamily: "'Bricolage Grotesque',sans-serif",
            fontWeight: value === val ? 700 : 400, letterSpacing: "0.04em", textTransform: "uppercase",
            background: value === val ? "rgba(168,168,240,0.20)" : "rgba(200,196,220,0.05)",
            border: `1px solid ${value === val ? "#A8A8F066" : "rgba(200,196,220,0.12)"}`,
            color: value === val ? "#ECEAF8" : "#8B86B0",
          }}>{lbl}</button>
      ))}
    </div>
  );

  const Stepper = ({ values, onStep }) => (
    <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
      {values.map((v) => (
        <button key={v} onClick={() => onStep(v)} style={S.godChip}>
          {v > 0 ? `+${v}` : v}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ marginTop: 10 }}>
      <div style={S.godNote}>
        Direct, no-cost overrides. Applied immediately on the host and pushed to
        every screen. Each action is recorded in the mission log.
      </div>

      {/* Current readout */}
      <div style={S.godReadout}>
        {p1 && <div><span style={{ color: "#A8A8F0" }}>{p1Label || "Actor I"}</span> · {p1.budget}cr · score {p1.score} (adj {p1.scoreAdj >= 0 ? "+" : ""}{p1.scoreAdj})</div>}
        {p2 && <div><span style={{ color: "#80B0D8" }}>{p2Label || "Actor II"}</span> · {p2.budget}cr · score {p2.score} (adj {p2.scoreAdj >= 0 ? "+" : ""}{p2.scoreAdj})</div>}
      </div>

      <div style={S.godSectionLabel}>TARGET (budget &amp; score)</div>
      <TargetPicker value={target} onChange={setTarget} />

      <div style={S.godSectionLabel}>BUDGET (credits)</div>
      <Stepper values={[-100, -50, 50, 100]} onStep={(d) => onGodBudget && onGodBudget(target, { delta: d })} />
      <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
        <input type="number" value={budgetSet} onChange={e => setBudgetSet(e.target.value)}
          placeholder="set to…" style={S.godInput} />
        <button onClick={() => { if (budgetSet !== "") { onGodBudget && onGodBudget(target, { set: Number(budgetSet) }); setBudgetSet(""); } }}
          style={S.godSetBtn}>Set</button>
      </div>

      <div style={S.godSectionLabel}>SCORE (direct adjustment)</div>
      <Stepper values={[-25, -10, 10, 25]} onStep={(d) => onGodScore && onGodScore(target, { delta: d })} />
      <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
        <input type="number" value={scoreSet} onChange={e => setScoreSet(e.target.value)}
          placeholder="set adj…" style={S.godInput} />
        <button onClick={() => { if (scoreSet !== "") { onGodScore && onGodScore(target, { set: Number(scoreSet) }); setScoreSet(""); } }}
          style={S.godSetBtn}>Set</button>
      </div>

      {/* Assets, per actor */}
      <div style={S.godSectionLabel}>ASSETS (add / remove, free)</div>
      {[[0, p1, p1Label || "Actor I"], [1, p2, p2Label || "Actor II"]].filter(([, p]) => p).map(([pi, p, lbl]) => (
        <div key={pi} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9.5, color: pi === 0 ? "#A8A8F0" : "#80B0D8", fontWeight: 600, marginBottom: 4 }}>{lbl}</div>
          {ASSET_TYPES.map(([type, tlabel]) => (
            <div key={type} style={S.godAssetRow}>
              <span style={{ flex: 1, fontSize: 10, color: "#C8C4DC" }}>{tlabel}</span>
              <button onClick={() => onGodRemoveAsset && onGodRemoveAsset(pi, ARRAY_OF[type])} style={S.godMini}>−</button>
              <span style={{ minWidth: 18, textAlign: "center", fontSize: 11, color: "#ECEAF8", fontVariantNumeric: "tabular-nums" }}>
                {p.counts?.[type] ?? 0}
              </span>
              <button onClick={() => onGodAddAsset && onGodAddAsset(pi, type)} style={S.godMini}>+</button>
            </div>
          ))}
        </div>
      ))}

      {/* Maintenance, reset state between scenarios / after a rough round */}
      <div style={S.godSectionLabel}>MAINTENANCE (uses target above)</div>
      <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
        {[["clearViolations", "Clear violations"], ["repair", "Repair assets"], ["recharge", "Recharge"]].map(([op, lbl]) => (
          <button key={op} onClick={() => onGodMaintain && onGodMaintain(target, op)} style={S.godChip}>
            {lbl}
          </button>
        ))}
      </div>

      {/* World & diplomacy, facilitator can manipulate anything */}
      <div style={S.godSectionLabel}>WORLD &amp; DIPLOMACY (uses target above)</div>
      <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
        <span style={{ fontSize: 9.5, color: "#8B86B0", alignSelf: "center", width: 46, flexShrink: 0 }}>Power</span>
        {["independent", "shared"].map(m => (
          <button key={m} onClick={() => onSetGrid && onSetGrid("power", m)}
            style={{ ...S.godChip, fontSize: 9.5, fontWeight: (worldState?.powerGrid === m) ? 700 : 400,
              background: worldState?.powerGrid === m ? "rgba(155,212,181,0.16)" : "rgba(200,196,220,0.06)",
              border: `1px solid ${worldState?.powerGrid === m ? "rgba(155,212,181,0.4)" : "rgba(200,196,220,0.16)"}` }}>{m}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
        <span style={{ fontSize: 9.5, color: "#8B86B0", alignSelf: "center", width: 46, flexShrink: 0 }}>Comms</span>
        {["independent", "shared"].map(m => (
          <button key={m} onClick={() => onSetGrid && onSetGrid("comms", m)}
            style={{ ...S.godChip, fontSize: 9.5, fontWeight: (worldState?.commsGrid === m) ? 700 : 400,
              background: worldState?.commsGrid === m ? "rgba(128,176,216,0.16)" : "rgba(200,196,220,0.06)",
              border: `1px solid ${worldState?.commsGrid === m ? "rgba(128,176,216,0.4)" : "rgba(200,196,220,0.16)"}` }}>{m}</button>
        ))}
      </div>

      <div style={S.godSectionLabel}>POLICY STANCE</div>
      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {STANCE_KEYS.map(([k, lbl]) => (
          <button key={k} onClick={() => onSetStance && onSetStance(target, k)} style={{ ...S.godChip, flex: "1 1 44%", fontSize: 9.5 }}>{lbl}</button>
        ))}
      </div>

      <div style={S.godSectionLabel}>SAFETY-ZONE SIZE · 3-RING</div>
      {(() => {
        const setTier = onSetTierScale || (() => {});
        const TIERS = [
          ["core", "Core", "#FF7A52"],
          ["harmonization", "Harmon.", "#39C0C8"],
          ["coordination", "Coord.", "#9AA0AE"],
        ];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
            {TIERS.map(([key, label, accent]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: accent, width: 48, flexShrink: 0 }}>{label}</span>
                <div style={{ display: "flex", gap: 4, flex: 1 }}>
                  {[["60%", 0.6], ["100%", 1.0], ["140%", 1.4], ["180%", 1.8]].map(([lbl, v]) => (
                    <button key={lbl} onClick={() => setTier(target, key, v)}
                      style={{ ...S.godChip, flex: 1, color: v > 1.001 ? "#F0A030" : undefined }}>{lbl}</button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ fontSize: 8, color: "#8B86B0", fontStyle: "italic", lineHeight: 1.3 }}>
              Expanding a ring past 100% is overreach (penalized; inner rings hardest).
            </div>
          </div>
        );
      })()}

      <div style={S.godSectionLabel}>BANKED ICE (kg)</div>
      <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
        {[-50, -10, 10, 50].map(d => (
          <button key={d} onClick={() => onAdjustIce && onAdjustIce(target, { delta: d })} style={S.godChip}>{d > 0 ? `+${d}` : d}</button>
        ))}
      </div>

      {/* Graphics toggles, turn the busier overlays off on this screen */}
      <div style={S.godSectionLabel}>GRAPHICS (this screen)</div>
      <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
        {[["safety", "Safety zones"], ["violations", "Violations"], ["power", "Battery"]].map(([key, lbl]) => {
          const on = layerVis ? layerVis[key] !== false : true;
          return (
            <button key={key} onClick={() => onToggleLayer && onToggleLayer(key)}
              style={{
                flex: 1, padding: "7px 4px", borderRadius: 4, cursor: "pointer",
                fontSize: 9.5, fontFamily: "'Bricolage Grotesque',sans-serif",
                fontWeight: on ? 700 : 400, letterSpacing: "0.02em",
                background: on ? "rgba(155,212,181,0.16)" : "rgba(200,196,220,0.04)",
                border: `1px solid ${on ? "rgba(155,212,181,0.4)" : "rgba(200,196,220,0.12)"}`,
                color: on ? "#9BD4B5" : "#8B86B0",
              }}>
              {on ? "● " : "○ "}{lbl}
            </button>
          );
        })}
      </div>

      {/* Announcement */}
      <div style={S.godSectionLabel}>BROADCAST EVENT TO SCREENS</div>
      <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
        {[["both", "Both"], ["p1", p1Label || "Actor I"], ["p2", p2Label || "Actor II"]].map(([val, lbl]) => (
          <button key={val} onClick={() => setAnnTarget(val)}
            style={{
              flex: 1, padding: "4px 3px", borderRadius: 4, cursor: "pointer",
              fontSize: 8.5, fontFamily: "'Bricolage Grotesque',sans-serif",
              fontWeight: annTarget === val ? 700 : 400, textTransform: "uppercase", letterSpacing: "0.04em",
              background: annTarget === val ? "rgba(192,184,232,0.20)" : "rgba(200,196,220,0.05)",
              border: `1px solid ${annTarget === val ? "#C0B8E866" : "rgba(200,196,220,0.12)"}`,
              color: annTarget === val ? "#ECEAF8" : "#8B86B0",
            }}>{lbl}</button>
        ))}
      </div>
      <textarea value={annText} onChange={e => setAnnText(e.target.value)}
        placeholder="A message that pops up on the targeted actors' screens (they must acknowledge it)."
        style={{ ...S.composerArea, minHeight: 60 }} />
      <button
        onClick={() => { if (annText.trim()) { onAnnounce && onAnnounce(annText.trim(), annTarget, "Facilitator announcement"); setAnnText(""); } }}
        disabled={!annText.trim()}
        style={{
          ...S.pushBtn, opacity: annText.trim() ? 1 : 0.4,
          cursor: annText.trim() ? "pointer" : "not-allowed",
          color: "#C0B8E8", borderColor: "#C0B8E8aa",
          background: "linear-gradient(135deg, rgba(192,184,232,0.18), rgba(192,184,232,0.04))",
        }}>
        Pop up on screens →
      </button>
    </div>
  );
}

function CustomInjectComposer({ onPush }) {
  const [text, setText] = useState("");
  return (
    <div style={S.composerBlock}>
      <div style={S.composerLabel}>FREE-TEXT INJECT</div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Describe a scenario perturbation. It will be broadcast to all participants and added to the mission log."
        style={S.composerArea}
      />
      <div style={S.composerActions}>
        <button
          onClick={() => { if (text.trim()) { onPush(text.trim()); setText(""); } }}
          disabled={!text.trim()}
          style={{
            ...S.pushBtn,
            opacity: text.trim() ? 1 : 0.4,
            cursor: text.trim() ? "pointer" : "not-allowed",
            color: "#A8A8F0", borderColor: "#A8A8F0aa",
            background: "linear-gradient(135deg, rgba(168,168,240,0.18), rgba(168,168,240,0.04))",
          }}>
          Broadcast custom inject →
        </button>
      </div>
    </div>
  );
}

const S = {
  drawer: {
    position: "fixed", top: 54, right: 14, width: 460,
    maxHeight: "calc(100vh - 110px)", overflowY: "auto", zIndex: 998,
    background: "rgba(20,18,32,0.97)",
    border: "1px solid rgba(192,184,232,0.32)",
    borderLeft: "3px solid rgba(192,184,232,0.7)",
    borderRadius: 6, padding: "18px 22px 20px",
    backdropFilter: "blur(14px)",
    boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
    fontFamily: "'Bricolage Grotesque',sans-serif",
    color: "#ECEAF8",
  },
  drawerHeader: {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
    marginBottom: 14, paddingBottom: 12,
    borderBottom: "1px solid rgba(200,196,220,0.1)",
  },
  eyebrow: {
    fontSize: 9, letterSpacing: "0.26em", color: "#C0B8E8",
    fontWeight: 600, marginBottom: 6,
  },
  title: {
    fontFamily: "'Spectral',Georgia,serif", fontSize: 22, fontWeight: 300,
    fontStyle: "italic", color: "#ECEAF8", letterSpacing: "-0.01em",
  },
  closeBtn: {
    background: "transparent", border: "none", color: "#8B86B0",
    cursor: "pointer", fontSize: 24, lineHeight: 1, padding: "0 4px",
  },
  contextBar: {
    fontSize: 10.5, color: "#8B86B0",
    fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
    marginBottom: 14,
  },
  cardGrid: {
    display: "flex", flexDirection: "column", gap: 8, marginBottom: 18,
  },
  injectCard: {
    background: "rgba(27,25,52,0.85)",
    border: "1px solid rgba(200,196,220,0.1)",
    borderRadius: 4, padding: "10px 12px",
  },
  cardToggle: {
    display: "flex", alignItems: "center", gap: 10, width: "100%",
    background: "transparent", border: "none", cursor: "pointer", padding: 0,
  },
  injectIcon: {
    width: 28, height: 28, borderRadius: 4,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontSize: 15, flexShrink: 0,
  },
  injectLabel: {
    fontFamily: "'Spectral',Georgia,serif", fontSize: 13.5, fontStyle: "italic",
    fontWeight: 500, letterSpacing: "-0.005em",
  },
  injectSummary: {
    fontSize: 10, color: "#8B86B0", marginTop: 1,
  },
  injectBlurb: {
    fontFamily: "'Spectral',Georgia,serif", fontSize: 12, fontWeight: 300,
    color: "#C0B8E8", lineHeight: 1.5, marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 8, letterSpacing: "0.22em", color: "#5A567A",
    fontWeight: 600, marginBottom: 5,
  },
  pushBtn: {
    width: "100%", padding: "8px 12px",
    border: "1px solid", borderRadius: 4,
    fontFamily: "'Spectral',Georgia,serif", fontSize: 12, fontStyle: "italic",
    fontWeight: 500, letterSpacing: "-0.005em",
    transition: "all 0.15s",
  },
  composerBlock: {
    paddingTop: 14, borderTop: "1px solid rgba(200,196,220,0.1)",
  },
  composerLabel: {
    fontSize: 9, letterSpacing: "0.26em", color: "#8B86B0",
    fontWeight: 500, marginBottom: 6,
  },
  composerArea: {
    width: "100%", boxSizing: "border-box",
    background: "rgba(27,25,52,0.85)",
    border: "1px solid rgba(200,196,220,0.14)",
    borderRadius: 4, padding: "10px 12px",
    color: "#ECEAF8", fontSize: 12, fontFamily: "'Spectral',Georgia,serif",
    fontWeight: 300, lineHeight: 1.5, outline: "none",
    minHeight: 78, resize: "vertical", marginBottom: 8,
  },
  composerActions: {
    display: "flex", justifyContent: "flex-end",
  },
  roundControl: {
    background: "rgba(27,25,52,0.6)",
    border: "1px solid rgba(168,168,240,0.18)",
    borderLeft: "2px solid rgba(168,168,240,0.5)",
    borderRadius: 5, padding: "12px 14px", marginBottom: 16,
  },
  sectionLabelLite: {
    fontSize: 8, letterSpacing: "0.24em", color: "#C0B8E8",
    fontWeight: 600, marginBottom: 9,
  },
  pushRoundBtn: {
    width: "100%", padding: "9px 12px", marginBottom: 12,
    background: "linear-gradient(135deg, rgba(168,168,240,0.22), rgba(168,168,240,0.06))",
    border: "1px solid #A8A8F066", borderRadius: 4, color: "#ECEAF8",
    fontFamily: "'Spectral',Georgia,serif", fontSize: 13, fontStyle: "italic",
    fontWeight: 500, letterSpacing: "-0.005em",
  },
  rcRowLabel: {
    fontSize: 9, letterSpacing: "0.04em", color: "#8B86B0",
    fontWeight: 500, marginBottom: 6, marginTop: 4,
  },
  rcRow: { display: "flex", gap: 6, marginBottom: 6 },
  rcChip: {
    flex: 1, padding: "6px 4px", borderRadius: 4, cursor: "pointer",
    fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 10.5, fontWeight: 500,
  },
  rcStepper: { display: "flex", alignItems: "center", gap: 8 },
  rcStepBtn: {
    width: 28, height: 26, borderRadius: 4, cursor: "pointer",
    background: "rgba(200,196,220,0.06)", border: "1px solid rgba(200,196,220,0.16)",
    color: "#ECEAF8", fontSize: 16, lineHeight: 1, fontFamily: "'Bricolage Grotesque',sans-serif",
  },
  rcStepVal: {
    minWidth: 28, textAlign: "center", fontSize: 14, color: "#ECEAF8",
    fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
  },
  rcStepHint: { fontSize: 8.5, color: "#5A567A", marginLeft: 4 },
  coordRead: {
    background: "rgba(27,25,52,0.6)",
    border: "1px solid rgba(232,155,181,0.22)",
    borderLeft: "2px solid rgba(232,155,181,0.55)",
    borderRadius: 5, padding: "11px 14px", marginBottom: 16,
  },
  coordLine: {
    fontFamily: "'Spectral',Georgia,serif", fontSize: 13, fontStyle: "italic",
    color: "#ECEAF8", marginBottom: 5,
  },
  coordSub: { fontSize: 9.5, color: "#8B86B0", lineHeight: 1.5, marginTop: 3 },
  deployBtn: {
    width: "100%", padding: "8px 12px", marginBottom: 4, cursor: "pointer",
    background: "linear-gradient(135deg, rgba(128,176,216,0.22), rgba(128,176,216,0.06))",
    border: "1px solid #80B0D866", borderRadius: 4, color: "#ECEAF8",
    fontFamily: "'Spectral',Georgia,serif", fontSize: 12.5, fontStyle: "italic",
    fontWeight: 500, letterSpacing: "-0.005em",
  },
  pushViewBtn: {
    width: "100%", padding: "8px 12px", marginBottom: 4, cursor: "pointer",
    background: "linear-gradient(135deg, rgba(192,184,232,0.22), rgba(192,184,232,0.06))",
    border: "1px solid #C0B8E866", borderRadius: 4, color: "#ECEAF8",
    fontFamily: "'Spectral',Georgia,serif", fontSize: 12.5, fontStyle: "italic",
    fontWeight: 500, letterSpacing: "-0.005em",
  },
  godBlock: {
    background: "rgba(40,26,60,0.55)",
    border: "1px solid rgba(192,184,232,0.22)",
    borderLeft: "2px solid rgba(192,184,232,0.6)",
    borderRadius: 5, padding: "12px 14px", marginBottom: 16,
  },
  godToggle: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: 0,
  },
  godNote: {
    fontSize: 9.5, color: "#8B86B0", lineHeight: 1.5, marginBottom: 10,
    fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
  },
  godReadout: {
    fontSize: 10, color: "#C8C4DC", lineHeight: 1.6, marginBottom: 12,
    padding: "8px 10px", borderRadius: 4,
    background: "rgba(20,18,32,0.6)", border: "1px solid rgba(200,196,220,0.1)",
    fontVariantNumeric: "tabular-nums",
  },
  godSectionLabel: {
    fontSize: 8, letterSpacing: "0.2em", color: "#C0B8E8",
    fontWeight: 600, marginBottom: 6, marginTop: 4,
  },
  godChip: {
    flex: 1, padding: "6px 4px", borderRadius: 4, cursor: "pointer",
    background: "rgba(200,196,220,0.06)", border: "1px solid rgba(200,196,220,0.16)",
    color: "#ECEAF8", fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums",
    fontFamily: "'Bricolage Grotesque',sans-serif",
  },
  godInput: {
    flex: 1, minWidth: 0, boxSizing: "border-box",
    background: "rgba(20,18,32,0.7)", border: "1px solid rgba(200,196,220,0.16)",
    borderRadius: 4, padding: "6px 8px", color: "#ECEAF8", fontSize: 11,
    fontFamily: "'Bricolage Grotesque',sans-serif", outline: "none",
  },
  godSetBtn: {
    padding: "6px 12px", borderRadius: 4, cursor: "pointer",
    background: "rgba(168,168,240,0.16)", border: "1px solid #A8A8F066",
    color: "#ECEAF8", fontSize: 11, fontWeight: 600,
    fontFamily: "'Bricolage Grotesque',sans-serif",
  },
  godAssetRow: {
    display: "flex", alignItems: "center", gap: 6, marginBottom: 3,
  },
  godMini: {
    width: 24, height: 22, borderRadius: 4, cursor: "pointer",
    background: "rgba(200,196,220,0.06)", border: "1px solid rgba(200,196,220,0.16)",
    color: "#ECEAF8", fontSize: 14, lineHeight: 1,
    fontFamily: "'Bricolage Grotesque',sans-serif",
  },
};
