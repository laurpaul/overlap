// ── NegotiationPanel ────────────────────────────────────────────────────────
//
// The actor-facing diplomacy surface (v167). A collapsible drawer where a player
// can: change their policy stance, resize their own safety zones, grant/revoke a
// safety easement, and, the centerpiece, propose bilateral DEALS to the other
// actor (offer budget / ice / score / power-grid access / comms access / a safety
// easement, in exchange for the same) and accept or decline incoming offers.
//
// Pure presentation + callbacks; all mutation is host-authoritative via the
// dispatchers passed in from App.

import { useState } from "react";
import { ZONE_KM, TIER_OVERREACH_WEIGHT, TIER_SCALE_BOUNDS, SCORE_OVERREACH_PENALTY, effectiveTierScales, zoneAssetCount } from "../sim/index.js";

const COL = {
  bg: "rgba(18,16,34,0.97)", card: "rgba(40,30,64,0.6)",
  line: "rgba(192,184,232,0.22)", ink: "#ECEAF8", mute: "#8B86B0", faint: "#5A567A",
  peri: "#A8A8F0", mist: "#80B0D8", amber: "#F0A030", lav: "#C0B8E8", ice: "#9BD4B5", gold: "#E8C998", warn: "#E89BB5",
};
const SANS = "'Bricolage Grotesque',sans-serif";
const SERIF = "'Spectral',Georgia,serif";

const EMPTY = { budget: 0, ice: 0, score: 0, power: false, comms: false, easement: false };

function Bundle({ title, terms, setTerms, accent, maxBudget, maxIce, maxScore }) {
  const Toggle = ({ k, label }) => (
    <button onClick={() => setTerms({ ...terms, [k]: !terms[k] })}
      style={{ flex: 1, padding: "5px 4px", borderRadius: 4, cursor: "pointer", fontSize: 9.5,
        fontFamily: SANS, fontWeight: terms[k] ? 700 : 400,
        background: terms[k] ? `${accent}28` : "rgba(200,196,220,0.05)",
        border: `1px solid ${terms[k] ? accent + "88" : "rgba(200,196,220,0.12)"}`,
        color: terms[k] ? COL.ink : COL.mute }}>{label}</button>
  );
  const Num = ({ k, label, max }) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 8, color: COL.faint, marginBottom: 2, fontFamily: SANS, letterSpacing: "0.04em" }}>{label}{max != null ? ` ·${max}` : ""}</div>
      <input type="number" min={0} value={terms[k] || ""} placeholder="0"
        onChange={e => setTerms({ ...terms, [k]: Math.max(0, Number(e.target.value) || 0) })}
        style={{ width: "100%", boxSizing: "border-box", background: "rgba(20,18,32,0.8)",
          border: `1px solid rgba(200,196,220,0.16)`, borderRadius: 4, padding: "4px 6px",
          color: COL.ink, fontSize: 11, fontFamily: SANS, outline: "none" }} />
    </div>
  );
  return (
    <div style={{ flex: 1, background: COL.card, border: `1px solid ${COL.line}`, borderRadius: 6, padding: "8px 9px" }}>
      <div style={{ fontSize: 9, letterSpacing: "0.16em", color: accent, fontWeight: 700, textTransform: "uppercase", marginBottom: 7, fontFamily: SANS }}>{title}</div>
      <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
        <Num k="budget" label="cr" max={maxBudget} /><Num k="ice" label="ice" max={maxIce} /><Num k="score" label="score" max={maxScore} />
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <Toggle k="power" label="Power" /><Toggle k="comms" label="Comms" /><Toggle k="easement" label="Easement" />
      </div>
    </div>
  );
}

function summarize(b) {
  const p = [];
  if (b.budget) p.push(`${b.budget}cr`);
  if (b.ice) p.push(`${b.ice}kg ice`);
  if (b.score) p.push(`${b.score} score`);
  if (b.power) p.push("power access");
  if (b.comms) p.push("comms access");
  if (b.easement) p.push("safety easement");
  return p.length ? p.join(" + ") : "nothing";
}

export function NegotiationPanel({
  myActor, myLabel, otherLabel, me, other,
  pendingDeals, stances, currentStance, currentZoneScale, currentTierScale, myAssetCount = 0, easementGranted, easementFromOther,
  powerShared, commsShared,
  onPropose, onRespond, onWithdraw, onSetStance, onSetZoneScale, onSetTierScale, onSetEasement,
}) {
  const [open, setOpen] = useState(true); // v194: open by default so the zone-size sliders are immediately reachable
  const [give, setGive] = useState({ ...EMPTY });
  const [want, setWant] = useState({ ...EMPTY });
  // Per-tier slider drag preview: { key, v } while dragging, committed on release.
  const [tierDrag, setTierDrag] = useState(null);

  if (myActor !== 0 && myActor !== 1) return null;
  const otherId = myActor === 0 ? 2 : 1;
  const inbox = (pendingDeals || []).filter(d => d.to === myActor && d.status === "pending");
  const mine = (pendingDeals || []).find(d => d.from === myActor && d.status === "pending");
  const accent = myActor === 0 ? COL.peri : COL.amber;

  const bundleEmpty = (b) => !b.budget && !b.ice && !b.score && !b.power && !b.comms && !b.easement;
  const canSend = !(bundleEmpty(give) && bundleEmpty(want))
    && (give.budget || 0) <= (me?.budget ?? 0)
    && (give.ice || 0) <= (me?.iceDeposited ?? 0)
    && (give.score || 0) <= Math.max(0, me?.scoreAdjustments ?? 0);

  return (
    <div style={{ position: "fixed", left: 12, bottom: 12, zIndex: 7000, width: open ? 380 : "auto", fontFamily: SANS }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 13px", borderRadius: open ? "8px 8px 0 0" : 8,
          background: COL.bg, border: `1px solid ${accent}55`, borderBottom: open ? "none" : `1px solid ${accent}55`,
          color: COL.ink, cursor: "pointer", fontSize: 12.5, fontWeight: 600, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
        <span style={{ color: accent }}>🤝</span> Deals &amp; <span style={{ color: accent }}>🛡</span> Zone sizes
        {inbox.length > 0 && <span style={{ background: COL.warn, color: "#2a0a16", borderRadius: 9, fontSize: 9, fontWeight: 800, padding: "1px 6px" }}>{inbox.length}</span>}
        <span style={{ color: COL.faint, fontSize: 11 }}>{open ? "▾" : "▴"}</span>
      </button>

      {open && (
        <div style={{ background: COL.bg, border: `1px solid ${accent}55`, borderTop: "none", borderRadius: "0 8px 8px 8px",
          padding: "12px 13px", maxHeight: "74vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>

          {/* Current standing with the other actor */}
          <div style={{ background: COL.card, border: `1px solid ${COL.line}`, borderRadius: 6, padding: "8px 10px", marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.16em", color: COL.lav, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Standing with {otherLabel}</div>
            {(() => {
              const Chip = ({ on, onLabel, offLabel, col }) => (
                <span style={{ display: "inline-block", fontSize: 9.5, padding: "2px 7px", borderRadius: 10, marginRight: 5, marginBottom: 4,
                  background: on ? `${col}22` : "rgba(200,196,220,0.05)", border: `1px solid ${on ? col + "77" : "rgba(200,196,220,0.12)"}`,
                  color: on ? col : COL.faint, fontWeight: on ? 600 : 400 }}>{on ? onLabel : offLabel}</span>
              );
              return (
                <div>
                  <Chip on={powerShared} onLabel="⚡ power shared" offLabel="power separate" col={COL.ice} />
                  <Chip on={commsShared} onLabel="📡 comms shared" offLabel="comms separate" col={COL.mist} />
                  <Chip on={easementGranted} onLabel={`🛡 you waived vs ${otherLabel}`} offLabel="your zones enforced" col={COL.gold} />
                  <Chip on={easementFromOther} onLabel={`🛡 ${otherLabel} waived for you`} offLabel={`${otherLabel}'s zones enforced`} col={COL.peri} />
                  {Math.abs((currentZoneScale ?? 1) - 1) > 0.001 && (
                    <Chip on={true} onLabel={`zones ${Math.round((currentZoneScale ?? 1) * 100)}%`} offLabel="" col={COL.lav} />
                  )}
                </div>
              );
            })()}
          </div>

          {/* Incoming offers */}
          {inbox.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, letterSpacing: "0.18em", color: COL.warn, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Incoming offers</div>
              {inbox.map(d => {
                const coverOk = (other?.budget ?? 0) >= (d.give.budget || 0)
                  && (other?.iceDeposited ?? 0) >= (d.give.ice || 0)
                  && Math.max(0, other?.scoreAdjustments ?? 0) >= (d.give.score || 0);
                return (
                <div key={d.id} style={{ background: COL.card, border: `1px solid ${COL.warn}44`, borderRadius: 6, padding: "8px 10px", marginBottom: 6 }}>
                  <div style={{ fontSize: 11.5, color: COL.ink, lineHeight: 1.5, fontFamily: SERIF, fontStyle: "italic" }}>
                    {otherLabel} offers you <b style={{ color: COL.ice, fontStyle: "normal" }}>{summarize(d.give)}</b><br />
                    in exchange for your <b style={{ color: COL.gold, fontStyle: "normal" }}>{summarize(d.want)}</b>
                  </div>
                  {!coverOk && (
                    <div style={{ fontSize: 9.5, color: COL.warn, marginTop: 4, fontFamily: SANS }}>
                      ⚠ {otherLabel} can no longer cover this, accepting will lapse it.
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                    <button onClick={() => onRespond(d.id, true)} style={{ flex: 1, padding: "6px", borderRadius: 4, cursor: "pointer", background: `${COL.ice}22`, border: `1px solid ${COL.ice}88`, color: COL.ink, fontSize: 11, fontWeight: 600 }}>Accept</button>
                    <button onClick={() => onRespond(d.id, false)} style={{ flex: 1, padding: "6px", borderRadius: 4, cursor: "pointer", background: "rgba(200,196,220,0.05)", border: "1px solid rgba(200,196,220,0.16)", color: COL.mute, fontSize: 11 }}>Decline</button>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Propose a deal */}
          <div style={{ fontSize: 9, letterSpacing: "0.18em", color: accent, fontWeight: 700, textTransform: "uppercase", marginBottom: 7 }}>Propose a deal to {otherLabel}</div>
          {mine && (
            <div style={{ fontSize: 10, color: COL.mute, marginBottom: 7, background: "rgba(232,201,152,0.08)", border: `1px solid ${COL.gold}33`, borderRadius: 5, padding: "6px 8px" }}>
              Offer pending: you give <b style={{ color: COL.ink }}>{summarize(mine.give)}</b> for <b style={{ color: COL.ink }}>{summarize(mine.want)}</b>.
              <button onClick={() => onWithdraw(mine.id)} style={{ marginLeft: 6, background: "none", border: "none", color: COL.warn, cursor: "pointer", fontSize: 10, textDecoration: "underline" }}>withdraw</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}>
            <Bundle title="You give" terms={give} setTerms={setGive} accent={COL.gold} maxBudget={Math.round(me?.budget ?? 0)} maxIce={Math.round(me?.iceDeposited ?? 0)} maxScore={Math.max(0, Math.round(me?.scoreAdjustments ?? 0))} />
            <Bundle title="You want" terms={want} setTerms={setWant} accent={COL.ice} />
          </div>
          <button onClick={() => { if (canSend) { onPropose(give, want); setGive({ ...EMPTY }); setWant({ ...EMPTY }); } }}
            disabled={!canSend}
            style={{ width: "100%", padding: "9px", borderRadius: 5, cursor: canSend ? "pointer" : "not-allowed", opacity: canSend ? 1 : 0.4,
              background: `${accent}1f`, border: `1px solid ${accent}88`, color: COL.ink, fontSize: 12.5, fontWeight: 600, fontFamily: SERIF, fontStyle: "italic", marginBottom: 14 }}>
            Send offer →
          </button>

          {/* Policy stance */}
          <div style={{ fontSize: 9, letterSpacing: "0.18em", color: COL.lav, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Your policy stance</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
            {(stances || []).map(([k, lbl]) => {
              const on = currentStance === k;
              return (
                <button key={k} onClick={() => onSetStance(k)} style={{ flex: "1 1 46%", padding: "6px 4px", borderRadius: 4, cursor: "pointer", fontSize: 10,
                  fontWeight: on ? 700 : 400, background: on ? `${COL.lav}22` : "rgba(200,196,220,0.05)",
                  border: `1px solid ${on ? COL.lav + "88" : "rgba(200,196,220,0.12)"}`, color: on ? COL.ink : COL.mute }}>{lbl}</button>
              );
            })}
          </div>

          {/* Safety zones, per-tier control (Christine Tiballi's 3-ring framework).
              Each ring scales independently. Expanding a ring past 100% is
              "overreach" and costs score, inner rings are penalized hardest. */}
          <div style={{ fontSize: 9, letterSpacing: "0.18em", color: COL.peri, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Your safety zones · 3-ring</div>
          <div style={{ fontSize: 8.5, color: COL.mute, marginBottom: 6, fontStyle: "italic", fontFamily: SERIF }}>
            Canonical DLA radii, Core {ZONE_KM.core} km · Harmon {ZONE_KM.harmonization} km · Coord {ZONE_KM.coordination} km.
            The wider you claim, the more it costs your score.
          </div>
          {/* v203: one-tap zone DOCTRINES, named postures that set all three
              rings in a single action, each showing its live overreach price.
              A workshop shorthand: pick a posture, argue about it, pay for it. */}
          {(() => {
            const setTier = onSetTierScale || (() => {});
            const ts = { core: 1, harmonization: 1, coordination: 1, ...(currentTierScale || {}) };
            const DOCTRINES = [
              { name: "Restrained",   scales: { core: 0.8, harmonization: 0.8, coordination: 0.8 }, hint: "shrink all, free" },
              { name: "Baseline",     scales: { core: 1.0, harmonization: 1.0, coordination: 1.0 }, hint: "the DLA canon" },
              { name: "Buffered",     scales: { core: 1.0, harmonization: 1.3, coordination: 1.6 }, hint: "pad the outers" },
              { name: "Fortress",     scales: { core: 1.5, harmonization: 1.2, coordination: 1.0 }, hint: "inflate the Core" },
            ];
            const costOfDoctrine = (sc) => Math.round(
              ["core", "harmonization", "coordination"].reduce((sum, k) =>
                sum + Math.max(0, sc[k] - 1) * (TIER_OVERREACH_WEIGHT[k] ?? 1), 0)
              * Math.max(1, myAssetCount) * SCORE_OVERREACH_PENALTY);
            const isActive = (sc) => ["core", "harmonization", "coordination"].every(k => Math.abs((ts[k] ?? 1) - sc[k]) < 0.001);
            return (
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                {DOCTRINES.map(({ name, scales, hint }) => {
                  const cost = costOfDoctrine(scales);
                  const on = isActive(scales);
                  const col = cost > 0 ? "#F0A030" : COL.ice;
                  return (
                    <button key={name} onClick={() => setTier(scales)} title={hint}
                      style={{ flex: 1, padding: "5px 2px", borderRadius: 4, cursor: "pointer",
                        background: on ? `${col}22` : "rgba(200,196,220,0.05)",
                        border: `1px solid ${on ? col + "99" : "rgba(200,196,220,0.12)"}`,
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <span style={{ fontSize: 9, fontWeight: on ? 700 : 600, color: on ? COL.ink : COL.lav, fontFamily: SANS }}>{name}</span>
                      <span style={{ fontSize: 8, fontWeight: 700, color: col }}>{cost > 0 ? `−${cost}` : "free"}</span>
                    </button>
                  );
                })}
              </div>
            );
          })()}
          {(() => {
            const ts = { core: 1, harmonization: 1, coordination: 1, ...(currentTierScale || {}) };
            const setTier = onSetTierScale || (() => {});
            const TIERS = [
              { key: "core",          label: "Core",     hint: "exclusion · scores", accent: "#FF7A52", km: ZONE_KM.core },
              { key: "harmonization", label: "Harmon.",  hint: "coordinate to enter", accent: "#39C0C8", km: ZONE_KM.harmonization },
              { key: "coordination",  label: "Coord.",   hint: "awareness buffer",    accent: "#9AA0AE", km: ZONE_KM.coordination },
            ];
            const STEPS = [["80", 0.8], ["100", 1.0], ["130", 1.3], ["160", 1.6], ["200", 2.0]];
            // Live overreach cost for one tier at a given scale, mirroring
            // economy.overreachPenalty: (scale−1) · tierWeight · #zones · penalty.
            const costOf = (key, scale) => {
              const over = Math.max(0, scale - 1);
              if (!over) return 0;
              return Math.round(over * (TIER_OVERREACH_WEIGHT[key] ?? 1) * Math.max(1, myAssetCount) * SCORE_OVERREACH_PENALTY);
            };
            // Effective values: while a slider is being dragged, preview the drag
            // value locally and only COMMIT (dispatch + mission-log) on release, so
            // a single drag doesn't spam the log / relay with dozens of updates.
            const eff = (key) => (tierDrag && tierDrag.key === key)
              ? tierDrag.v
              : (Number.isFinite(ts[key]) ? ts[key] : 1);
            const commit = (key) => {
              if (tierDrag && tierDrag.key === key) { setTier(key, tierDrag.v); setTierDrag(null); }
            };
            const totalCost = TIERS.reduce((s, { key }) => s + costOf(key, eff(key)), 0);
            const anyOver = TIERS.some(({ key }) => eff(key) > 1.001);
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 8 }}>
                {TIERS.map(({ key, label, hint, accent, km }) => {
                  const cur = eff(key);
                  const over = cur > 1.001;
                  const curKm = (km * cur);
                  const cost = costOf(key, cur);
                  return (
                    <div key={key}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: accent }}>{label}
                          <span style={{ fontSize: 8, color: COL.mute, fontWeight: 400, marginLeft: 5 }}>{hint}</span>
                          <span style={{ fontSize: 8, color: COL.lav, fontWeight: 600, marginLeft: 6, fontFamily: SANS }}>
                            {curKm.toFixed(2).replace(/\.?0+$/, "")} km · {Math.round(cur * 100)}%
                          </span>
                        </span>
                        {over
                          ? <span style={{ fontSize: 8, color: "#F0A030", fontWeight: 700 }}>⚠ overreach −{cost} score</span>
                          : <span style={{ fontSize: 8, color: COL.ice, fontWeight: 600 }}>no penalty</span>}
                      </div>
                      <input type="range"
                        min={TIER_SCALE_BOUNDS.min} max={TIER_SCALE_BOUNDS.max} step={0.05} value={cur}
                        onChange={(e) => setTierDrag({ key, v: parseFloat(e.target.value) })}
                        onPointerUp={() => commit(key)}
                        onKeyUp={() => commit(key)}
                        onBlur={() => commit(key)}
                        style={{ width: "100%", accentColor: over ? "#F0A030" : accent, cursor: "pointer", margin: "0 0 3px" }} />
                      <div style={{ display: "flex", gap: 3 }}>
                        {STEPS.map(([lbl, v]) => {
                          const on = Math.abs(cur - v) < 0.001;
                          const isOver = v > 1.001;
                          const activeCol = isOver ? "#F0A030" : accent;
                          return (
                            <button key={lbl} onClick={() => { setTierDrag(null); setTier(key, v); }} style={{
                              flex: 1, padding: "4px 2px", borderRadius: 4, cursor: "pointer", fontSize: 9,
                              fontWeight: on ? 700 : 400,
                              background: on ? `${activeCol}22` : "rgba(200,196,220,0.05)",
                              border: `1px solid ${on ? activeCol + "99" : "rgba(200,196,220,0.12)"}`,
                              color: on ? COL.ink : COL.mute,
                            }}>{lbl}%</button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {/* Running total of the declared-zone overreach cost, so the price
                    of oversizing is visible as ONE number, not three. */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                  borderTop: `1px solid ${COL.line}`, paddingTop: 5 }}>
                  <span style={{ fontSize: 8.5, color: COL.mute, fontStyle: "italic", fontFamily: SERIF }}>
                    Total overreach penalty (per {myAssetCount === 1 ? "zone" : `${Math.max(1, myAssetCount)} zones`})
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: SANS,
                    color: anyOver ? "#F0A030" : COL.ice }}>
                    {anyOver ? `−${totalCost} score` : "0 · compliant"}
                  </span>
                </div>
              </div>
            );
          })()}
          {/* v203: transparency, the OTHER actor's declared zones, read-only,
              so asymmetric claims are visible at the negotiating table. */}
          {(() => {
            const ots = effectiveTierScales(other);
            const oAssets = Math.max(1, zoneAssetCount(other));
            const rows = [
              { key: "core",          short: "Core",    km: ZONE_KM.core },
              { key: "harmonization", short: "Harmon.", km: ZONE_KM.harmonization },
              { key: "coordination",  short: "Coord.",  km: ZONE_KM.coordination },
            ];
            const anyOver = rows.some(({ key }) => (ots[key] ?? 1) > 1.001);
            return (
              <div style={{ marginBottom: 10, background: "rgba(40,30,64,0.35)", border: `1px solid ${COL.line}`,
                borderRadius: 5, padding: "6px 8px" }}>
                <div style={{ fontSize: 8, letterSpacing: "0.14em", color: COL.mute, fontWeight: 700,
                  textTransform: "uppercase", marginBottom: 4 }}>
                  {otherLabel}'s declared zones {anyOver && <span style={{ color: "#F0A030" }}>· ⚠ overreaching</span>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {rows.map(({ key, short, km }) => {
                    const sc = ots[key] ?? 1;
                    const over = sc > 1.001;
                    return (
                      <div key={key} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 8, color: COL.faint, fontFamily: SANS }}>{short}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, fontFamily: SANS,
                          color: over ? "#F0A030" : COL.ink }}>
                          {(km * sc).toFixed(1).replace(/\.0$/, "")} km{over ? " ⚠" : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {anyOver && (
                  <div style={{ fontSize: 8, color: "#F0A030", fontStyle: "italic", marginTop: 3, fontFamily: SERIF }}>
                    They are paying an overreach penalty across {oAssets} zone{oAssets === 1 ? "" : "s"}, leverage for your next deal.
                  </div>
                )}
              </div>
            );
          })()}
          <button onClick={() => onSetEasement(otherId, !easementGranted)}
            style={{ width: "100%", padding: "7px", borderRadius: 4, cursor: "pointer", fontSize: 10.5,
              background: easementGranted ? `${COL.ice}1c` : "rgba(200,196,220,0.05)",
              border: `1px solid ${easementGranted ? COL.ice + "88" : "rgba(200,196,220,0.14)"}`, color: easementGranted ? COL.ice : COL.mute, fontFamily: SANS }}>
            {easementGranted ? `● Easement granted to ${otherLabel}, they won't breach your zones` : `○ Grant ${otherLabel} a safety easement`}
          </button>
        </div>
      )}
    </div>
  );
}
