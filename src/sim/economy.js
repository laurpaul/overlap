// ── Economy + player factory ────────────────────────────────────────────────
//
// All formulas in one place so they can be edited and unit-tested
// independently of the simulation loop or UI.
//
//   Budget    = α * E
//   ΔE        = I_E * √C * (1 + log(1 + R))
//   ΔR        = I_R * √C - α_R * (1 - C)²
//   ΔM        = I_M - α_M * M
//   C         = w1*√(E/E_max) + w2*√(T/T_max) + w3*√(M/M_max)
//   mineBonus = 1 + (R / 200) * RD_MINE_BONUS
//   milScore  = max(0.1, M / 20)

import {
  ALPHA, ALPHA_R, ALPHA_M, E_INIT,
  RD_MINE_BONUS, C_W1, C_W2, C_W3,
  BASE_ASSET_COSTS, BASE_MAINT_COSTS, ASSET_POINTS,
  POWER_CAP, STARTING_BUDGET,
  PAD_COST_DISCOUNT_PER, PAD_COST_DISCOUNT_CAP,
  UNPOWERED_HAB_DECAY, UNPOWERED_HAB_PENALTY, UNPOWERED_HAB_THRESHOLD,
  HABITAT_POWER_INIT,
  TIER_KEYS, TIER_OVERREACH_WEIGHT, DEFAULT_TIER_SCALE,
} from "./constants.js";
import { getStakeholderDef } from "./stakeholders.js";
import { treatyFloorEffects, treatyStage } from "./treatyErosion.js";

export function calcBudget(econ) {
  return Math.round(ALPHA * (econ ?? E_INIT));
}

// ── Allocation presets ───────────────────────────────────────────────────────
// These replace the manual sliders. Each preset is a named policy stance with
// fixed mil/rd/econ/budget percentages. Players select a stance in response to
// facilitator events rather than adjusting sliders directly.
//
// Semantics of each slice:
//   econ   → I_E: fraction invested in growing the national economy (E).
//            E drives the lunar budget each round (Budget = α*E), so this
//            compounds: more ECO now → higher budgets permanently.
//   budget → I_B: fraction diverted from investment into immediate bonus
//            lunar credits (bonusCredits = budget * I_B). A short-term
//            cash-for-growth trade, you sacrifice E compounding for
//            spending power this round.
//   rd     → I_R: accumulates R&D stock → mining efficiency bonus.
//   mil    → I_M: grows military stock → deterrence and incident response.
//
// "Austerity" does NOT mean hoarding credits (high BUD), that is
// speculative extraction. True austerity means cutting all investment
// categories and accepting slow/no growth across the board.
export const ALLOC_PRESETS = {
  balanced: {
    key:     "balanced",
    label:   "Balanced",
    icon:    "◈",
    desc:    "Steady-state. Modest growth across all sectors.",
    color:   "#C0B8E8",
    alloc:   { mil: 15, rd: 15, econ: 50, budget: 20 },
  },
  austerity: {
    key:     "austerity",
    label:   "Surge Spending",
    icon:    "◫",
    desc:    "Divert investment into immediate lunar credits. Trade long-run economic growth for near-term spending power.",
    color:   "#E8C998",
    alloc:   { mil: 5, rd: 5, econ: 55, budget: 35 },
  },
  economic: {
    key:     "economic",
    label:   "Economic Growth",
    icon:    "◆",
    desc:    "Invest heavily in the national economy, which compounds into higher budgets every round. Thin security.",
    color:   "#9BD4B5",
    alloc:   { mil: 5, rd: 10, econ: 75, budget: 10 },
  },
  military: {
    key:     "military",
    label:   "Security Posture",
    icon:    "◧",
    desc:    "Heavy military investment for deterrence and incident response. Economy takes a back seat.",
    color:   "#E89BB5",
    alloc:   { mil: 60, rd: 5, econ: 25, budget: 10 },
  },
};

export const DEFAULT_PRESET_KEY = "balanced";

// Asset costs -- fixed base values modulated by per-archetype multipliers
// from STAKEHOLDER_DEFS. Each work package's logistics economics differ.
// `_alloc` is unused (legacy signature kept for compatibility).
// v164: equipment gets cheaper to place when the actor already operates landing
// pads, a prepared apron makes follow-on logistics easier. The discount applies
// to equipment (solar/habitat/rover/reactor/comsat) but NOT to pads themselves,
// and is capped. Returns the surviving cost fraction (1 = full price).
export function padCostMultiplier(padCount = 0) {
  const n = Math.max(0, Math.floor(padCount || 0));
  const discount = Math.min(PAD_COST_DISCOUNT_CAP, n * PAD_COST_DISCOUNT_PER);
  return 1 - discount;
}

export function calcAssetCosts(_alloc, stakeholderId = null, opts = {}) {
  const costs = {};
  const maint = {};
  const stake = stakeholderId ? getStakeholderDef(stakeholderId) : null;
  const mods = stake?.assetCostMod || {};
  const padMul = padCostMultiplier(opts.padCount ?? 0);
  for (const k of Object.keys(BASE_ASSET_COSTS)) {
    const mult = mods[k] ?? 1.0;
    // Pads don't discount themselves; everything else gets the pad logistics break.
    const padDisc = k === "pad" ? 1 : padMul;
    costs[k] = Math.round(BASE_ASSET_COSTS[k] * mult * padDisc);
    maint[k] = BASE_MAINT_COSTS[k];
  }
  return { costs, maint };
}

// Competitiveness: w1+w2+w3 = 1, so C ∈ [0, 1].
//   T   = asset points
//   T_max = max asset points across players
export function calcCompetitiveness(E, T, M, E_max, T_max, M_max, contentnessMod = 0) {
  const base = (
    C_W1 * Math.sqrt(E / Math.max(1, E_max)) +
    C_W2 * Math.sqrt(T / Math.max(1, T_max)) +
    C_W3 * Math.sqrt(M / Math.max(1, M_max))
  );
  // contentnessMod is a temporary event-driven offset on C, decays each round.
  return Math.max(0, Math.min(1, base + contentnessMod));
}

export function calcDeltaE(I_E, C, R) {
  return I_E * Math.sqrt(Math.max(0, C)) * (1 + Math.log1p(Math.max(0, R)));
}

export function calcDeltaR(I_R, C) {
  return I_R * Math.sqrt(Math.max(0, C)) - ALPHA_R * Math.pow(1 - Math.max(0, C), 2);
}

export function calcDeltaM(I_M, M) {
  return I_M - ALPHA_M * Math.max(0, M);
}

export function calcRdMineBonus(rdAccum) {
  return 1 + (rdAccum / 200) * RD_MINE_BONUS;
}

export function calcMilScore(milStock) {
  return Math.max(0.1, milStock / 20);
}

// ── Hidden-score proxy (v175) ───────────────────────────────────────────────
// Workshops reported players gaming the exact visible score. This returns a
// qualitative standing instead of a number, so the facilitator can run with the
// score hidden and still give the room a read on who's ahead. Pure: two scores
// and a name-resolver in, one label out. `nameFor(idx)` takes 0|1 and returns
// the actor's display name. The margin is judged RELATIVE to the leader's
// magnitude so it reads sensibly whether scores are in the tens or thousands.
export function scoreProxyLabel(score1, score2, nameFor = (i) => `Actor ${i === 0 ? "I" : "II"}`) {
  const s1 = Number.isFinite(score1) ? score1 : 0;
  const s2 = Number.isFinite(score2) ? score2 : 0;
  const lead = Math.max(s1, s2);
  // Nothing meaningful banked yet.
  if (lead <= 0.5) return { text: "Too early to tell", leader: null, tier: "even" };
  const margin = Math.abs(s1 - s2);
  const rel = margin / lead;
  const leader = s1 === s2 ? null : (s1 > s2 ? 0 : 1);
  if (rel < 0.03) return { text: "Neck and neck", leader: null, tier: "even" };
  const who = nameFor(leader);
  if (rel < 0.12) return { text: `${who} slightly ahead`, leader, tier: "slight" };
  if (rel < 0.30) return { text: `${who} clearly ahead`, leader, tier: "clear" };
  return { text: `${who} dominating`, leader, tier: "dominating" };
}

// ── Unpowered-habitat penalty (v174) ────────────────────────────────────────
// A habitat with no power already can't accept ice (simDay gates deposits on
// habitatPower > 0), but the workshop flagged that running a powerless hab was
// otherwise free, Artemis kept one with no consequence. This makes an
// unpowered hab an active daily liability:
//   • it loses UNPOWERED_HAB_DECAY structural health per day (thermal /
//     life-support failure); once it hits 0 it's destroyed, so it stops
//     projecting a safety zone and stops being a deposit site;
//   • the owner takes a direct UNPOWERED_HAB_PENALTY scoreboard ding per
//     unpowered hab per day, so the cost shows up immediately, not just as
//     slow erosion.
// Pure: returns { player, count, events }. `count` is how many habs were
// penalized; `events` carry one { type:"unpowered_hab", habIdx, destroyed }
// per penalized hab for the mission log. A hab that's already destroyed
// (health <= 0) is skipped. Call once per resolved day, AFTER allocateDailyPower
// has set today's habitatPower.
export function applyUnpoweredHabitatPenalty(player) {
  const none = { player, count: 0, events: [] };
  if (!player || player.active === false) return none;
  const habs = player.habitats || [];
  if (habs.length === 0) return none;
  const habPower  = player.habitatPower || habs.map(() => HABITAT_POWER_INIT);
  const habHealth = [...(player.structureHealth?.habitats || habs.map(() => 1.0))];
  let count = 0;
  const events = [];
  for (let i = 0; i < habs.length; i++) {
    const h = habHealth[i] ?? 1.0;
    if (h <= 0) continue;                            // already destroyed
    const pwr = habPower[i] ?? HABITAT_POWER_INIT;
    if (pwr > UNPOWERED_HAB_THRESHOLD) continue;     // powered, fine
    habHealth[i] = Math.max(0, h - UNPOWERED_HAB_DECAY);
    count++;
    events.push({ type: "unpowered_hab", habIdx: i, destroyed: habHealth[i] <= 0 });
  }
  if (count === 0) return none;
  return {
    player: {
      ...player,
      structureHealth: { ...(player.structureHealth || {}), habitats: habHealth },
      scoreAdjustments: (player.scoreAdjustments ?? 0) - UNPOWERED_HAB_PENALTY * count,
    },
    count,
    events,
  };
}

// ── v206: stranded-rover penalty ─────────────────────────────────────────────
// The June 13 debrief, verbatim: "we were not penalized enough for all the
// mistakes that we've made." A rover sitting at zero battery is a stranded
// national asset, under v205 it emitted a warning but cost nothing, so the
// scoreboard disagreed with the fiction. Now each dead rover (primary or
// extra) charges STRANDED_ROVER_PENALTY score per resolved day it stays flat,
// via the same scoreAdjustments channel the unpowered-habitat penalty uses.
// Sized at 2 pts/day: a rover stranded for a full 12-round session costs
// ~168 pts, painful, comparable to ~17 kg of undelivered ice, but never a
// score-flipping cliff on its own. Call once per resolved day, after simDay.
export const STRANDED_ROVER_PENALTY = 2;

export function applyStrandedRoverPenalty(player) {
  const none = { player, count: 0, events: [] };
  if (!player || player.active === false) return none;
  let count = 0;
  const events = [];
  if ((player.power ?? 1) <= 0) {
    count++;
    events.push({ type: "stranded_penalty", roverId: 1 });
  }
  (player.extraRovers || []).forEach((er, i) => {
    const h = player.structureHealth?.extraRovers?.[i] ?? 1.0;
    if (h <= 0) return; // destroyed, not stranded
    if ((er.power ?? 1) <= 0) {
      count++;
      events.push({ type: "stranded_penalty", roverId: i + 2 });
    }
  });
  if (count === 0) return none;
  return {
    player: {
      ...player,
      scoreAdjustments: (player.scoreAdjustments ?? 0) - STRANDED_ROVER_PENALTY * count,
    },
    count,
    events,
  };
}

// ── v207: recovery convoy (stranded-rover rescue) ────────────────────────────
// July 1 call, verbatim: "make sure we can get our rover out of the PSR
// without being trapped … we're already trapped." Stranding was a warning
// (v205), then a daily score cost (v206), but still a permanent death
// sentence. Now it's a priced recovery: once a rover has sat at zero battery
// for RESCUE_DELAY_DAYS, its owner automatically mounts a recovery convoy IF
// the treasury can cover RESCUE_COST_CR. The rescue restores the rover to
// RESCUE_POWER_FRAC of capacity (enough to limp home, not to resume mining).
// A broke actor's rover stays stranded and the v206 daily penalty keeps
// ticking, rescue is an economic decision, not a free respawn.
// Call once per resolved day, after simDay and the stranded penalty.
export const RESCUE_DELAY_DAYS  = 3;
export const RESCUE_COST_CR     = 120;
export const RESCUE_POWER_FRAC  = 0.35;

export function applyRoverRescue(player, globalDay, powerCap) {
  const none = { player, events: [] };
  if (!player || player.active === false) return none;
  const events = [];
  let p = player;
  const ensure = () => { if (p === player) p = { ...player }; };

  const track = (rover, apply) => {
    const stranded = (rover.power ?? 1) <= 0;
    if (!stranded) {
      if (rover._strandedSince != null) apply({ ...rover, _strandedSince: null });
      return;
    }
    const since = rover._strandedSince ?? globalDay;
    if (rover._strandedSince == null) {
      apply({ ...rover, _strandedSince: since });
      return;
    }
    if (globalDay - since < RESCUE_DELAY_DAYS) return;
    if ((p.budget ?? 0) < RESCUE_COST_CR) return; // can't afford it, stays down
    ensure();
    p.budget = (p.budget ?? 0) - RESCUE_COST_CR;
    apply({ ...rover, power: powerCap * RESCUE_POWER_FRAC, _strandedSince: null, _recharging: true });
    events.push({ type: "rover_rescued", cost: RESCUE_COST_CR, x: rover.x, y: rover.y });
  };

  // Primary rover: its fields live directly on the player object.
  track(
    { x: p.x, y: p.y, power: p.power, _strandedSince: p._strandedSince, _recharging: p._recharging },
    (r) => { ensure(); p.power = r.power ?? p.power; p._strandedSince = r._strandedSince; if (r._recharging != null) p._recharging = r._recharging; }
  );
  // Extra rovers (skip destroyed hulls).
  const erHealth = p.structureHealth?.extraRovers || [];
  (p.extraRovers || []).forEach((er, i) => {
    if ((erHealth[i] ?? 1.0) <= 0) return;
    track(er, (r) => {
      ensure();
      const next = [...p.extraRovers];
      next[i] = r;
      p.extraRovers = next;
    });
  });

  if (p === player) return none;
  return { player: p, events };
}

// ── Player factory ──────────────────────────────────────────────────────────
export function makePlayer(base, id, color, opts = {}) {
  const active = opts.active ?? true;
  const stake  = opts.stakeholderId ? getStakeholderDef(opts.stakeholderId) : null;
  const budgetMul = stake?.budgetMod ?? 1.0;

  return {
    id, color,
    stakeholderId:   stake?.id   ?? null,
    stakeholderName: stake?.name ?? null,
    active,
    arrivalDay: opts.arrivalDay ?? 0,
    base: { ...base },
    x: base.x, y: base.y,
    power: POWER_CAP * 0.65,
    ice: 0,
    iceDeposited: 0,
    panels: [],
    reactors: [],
    habitats: [],
    habitatPower: [],   // power per habitat (index-matched)
    extraRovers: [],
    landingPads: [],
    // v22: comsat relay smallsats. Lift assets inside COMSAT_RELAY_RADIUS
    // out of DTE blackout (see effectiveEarthVis).
    comsats: [],
    returning: false,
    pendingDeliveries: [],  // { id, type, padIdx } waiting at a pad
    carrying: null,         // { id, type } in transit by rover
    scoreAdjustments: 0,
    safetyViolations: 0,
    // v186: per-tier safety-ring scale (Core / Harmonization / Coordination),
    // each independently player-controllable. Baseline 1 = Christine's framework
    // radius. Expanding a tier past 1 is overreach (see overreachPenalty).
    tierScale: { core: 1, harmonization: 1, coordination: 1 },
    generatorRangeEntries: {},      // per-generator arrival timestamps
    generatorSupplyTotals: {},
    generatorSupplyByRecipient: { 1: 0, 2: 0 },
    structureHealth: {
      panels: [], reactors: [], habitats: [],
      extraRovers: [], landingPads: [], comsats: [],
    },
    waypoints: [],
    currentWaypoint: null,
    aimDirection: null,
    status: "idle",
    mineMap: {},        // px_idx → kg mined there
    assetPts: active ? ASSET_POINTS.rover : 0,
    depositLog: [],
    forecast: 0,
    // Economy
    budget: Math.round(STARTING_BUDGET * budgetMul),
    econ: E_INIT,
    rdAccum: 0,
    milScore: 1.0,
    milStock: 1.0,
    allocPreset: DEFAULT_PRESET_KEY,
    alloc: { ...ALLOC_PRESETS[DEFAULT_PRESET_KEY].alloc },
    contentnessMod: 0,        // temporary event-driven C offset; decays each round
    contentnessDecay: 0,      // per-round decay magnitude toward 0
    // v130 (roadmap: commercial-actor re-spec). footprintMod sets the actor's
    // baseline keep-out-zone size (an emplacer's large fixed installations
    // project bigger zones; a prospector's light mobile footprint projects
    // smaller ones), reusing the safetyMult the zone renderer + violation tally
    // already honor. disturbanceMod is a regolith-disturbance factor the sim can
    // express and score. Both default to 1 (no change) for non-commercial actors.
    safetyMult:     stake?.footprintMod ?? 1,
    disturbanceMod: stake?.disturbanceMod ?? 1,
  };
}

export function activatePlayer(player) {
  if (!player || player.active) return player;
  return {
    ...player,
    active: true,
    assetPts: Math.max(player.assetPts ?? 0, ASSET_POINTS.rover),
    status: "idle",
  };
}

// ── Composite mission score ────────────────────────────────────────────────
//
// Unified score formula used by the HUD, analytics charts, batch-sim
// ranking, and replay timeline. Returns 0 for null inputs.
//
//   score = iceDeposited
//         + (carriedIce + carriedVol) * 0.5    // v21: rover-carried ice
//                                              //   counts at 50% (real
//                                              //   progress, but not banked)
//         + assetPts * 15
//         + scoreAdjustments
//         - safetyViolations * 25
//
// `carriedVol` (non-ice volatiles) is a forward-compatibility hook for the
// LRO water + CO + CH₄ split -- currently zero on most builds.

export const SCORE_PTS_PER_KG    = 1;
// v212: strategic-reserve payoff. Escrowed reserve kilograms (player.reserveKg,
// accrued only under the Strategic Reserve regime via RESERVE_ESCROW_FRAC)
// score at this multiple of the market rate, the regime's whole identity:
// forgo 25% of every deposit's immediate value for a 1.5× payoff on the
// reserve. Zero for every other regime because reserveKg never accrues.
export const RESERVE_END_MULT    = 1.5;
export const SCORE_PTS_PER_AP    = 15;
export const SCORE_PENALTY_VIO   = 25;
export const SCORE_CARRY_FRACTION = 0.5;
// v183/v186: zone-expansion (overreach) penalty. Christine Tiballi's Field Guide
// lists "expand footprint without notice" among the things operators must NOT
// do. Declaring safety zones larger than the framework baseline costs score.
// v186: this is now PER-TIER and inner-weighted, inflating the Core exclusion
// (the ring that actually keeps others out) is punished far harder than padding
// the outer Coordination buffer. Shrinking a tier is free.
export const SCORE_OVERREACH_PENALTY = 8;

// How many zone-projecting assets an actor fields (panels, reactors, habitats,
// pads, and rovers incl. the primary). Destroyed structures aren't discounted
// here; the overreach is about DECLARED footprint, which persists.
export function zoneAssetCount(p) {
  if (!p) return 0;
  const n = (a) => (a || []).filter(Boolean).length;
  return n(p.panels) + n(p.reactors) + n(p.habitats) + n(p.landingPads)
       + (p.x != null ? 1 : 0) + n(p.extraRovers);
}

// Resolve an actor's effective per-tier scales, folding in the legacy global
// zoneScale/safetyMult (which multiply ALL tiers) for backward compatibility.
export function effectiveTierScales(p) {
  const ts = (p && p.tierScale) || DEFAULT_TIER_SCALE;
  const legacy = ((Number.isFinite(p?.safetyMult) && p.safetyMult > 0) ? p.safetyMult : 1)
               * ((Number.isFinite(p?.zoneScale)  && p.zoneScale  > 0) ? p.zoneScale  : 1);
  const out = {};
  for (const k of TIER_KEYS) {
    const t = (Number.isFinite(ts[k]) && ts[k] > 0) ? ts[k] : 1;
    out[k] = t * legacy;
  }
  return out;
}

// The declared-zone overreach amount above baseline, summed across tiers and
// weighted so inner rings dominate. 0 when every tier is at/below baseline.
export function zoneOverreach(p) {
  if (!p) return 0;
  const scales = effectiveTierScales(p);
  let weighted = 0;
  for (const k of TIER_KEYS) {
    const over = Math.max(0, scales[k] - 1);            // only expansion counts
    weighted += over * (TIER_OVERREACH_WEIGHT[k] ?? 1); // inner rings weigh more
  }
  return weighted;
}

// Total expansion penalty (<= 0) for an actor.
export function overreachPenalty(p) {
  const v = -zoneOverreach(p) * zoneAssetCount(p) * SCORE_OVERREACH_PENALTY;
  return v === 0 ? 0 : v; // normalize -0 → 0
}

export function scorePlayerState(player) {
  if (!player) return 0;
  let carriedIce = player.ice ?? 0;
  let carriedVol = player.volatiles ?? 0;
  for (const er of (player.extraRovers || [])) {
    carriedIce += er.ice ?? 0;
    carriedVol += er.volatiles ?? 0;
  }
  // v154: an eroded OST floor makes crowding cheaper. violationPenaltyMult is
  // exactly 1.0 at the intact floor (the default for any actor with no
  // treatyFloor), so this is a no-op until the norm is actually walked back.
  const vioMult = treatyFloorEffects(player.treatyFloor).violationPenaltyMult;
  return (player.iceDeposited ?? 0) * SCORE_PTS_PER_KG
       + (player.reserveKg ?? 0)    * SCORE_PTS_PER_KG * RESERVE_END_MULT
       + (carriedIce + carriedVol) * SCORE_CARRY_FRACTION
       + (player.assetPts ?? 0)    * SCORE_PTS_PER_AP
       + (player.scoreAdjustments ?? 0)
       - (player.safetyViolations ?? 0) * SCORE_PENALTY_VIO * vioMult
       + overreachPenalty(player); // v183: declared-zone expansion penalty
}

// ── Score decomposition + debrief analysis ──────────────────────────────────
//
// scoreBreakdown decomposes a player's composite score into the same five
// terms scorePlayerState sums, so the debrief can show WHERE the score came
// from (banked ice, carried ice, asset points, inject/policy adjustments,
// safety-violation penalty) rather than only a single number.
export function scoreBreakdown(player) {
  if (!player) return { total: 0, terms: [] };
  let carriedIce = player.ice ?? 0;
  let carriedVol = player.volatiles ?? 0;
  for (const er of (player.extraRovers || [])) {
    carriedIce += er.ice ?? 0;
    carriedVol += er.volatiles ?? 0;
  }
  const banked   = (player.iceDeposited ?? 0) * SCORE_PTS_PER_KG;
  const reserve  = (player.reserveKg ?? 0) * SCORE_PTS_PER_KG * RESERVE_END_MULT; // v212
  const carried  = (carriedIce + carriedVol) * SCORE_CARRY_FRACTION;
  const assets   = (player.assetPts ?? 0) * SCORE_PTS_PER_AP;
  const policy   = (player.scoreAdjustments ?? 0);
  // v154: same treaty-floor scaling as scorePlayerState (1.0 at intact floor).
  const vioMult  = treatyFloorEffects(player.treatyFloor).violationPenaltyMult;
  const penalty  = -(player.safetyViolations ?? 0) * SCORE_PENALTY_VIO * vioMult;
  const overreach = overreachPenalty(player); // v183: expansion penalty
  const total = banked + reserve + carried + assets + policy + penalty + overreach;
  const violCount = Math.round(player.safetyViolations ?? 0);
  const orScales = effectiveTierScales(player);
  const expandedTiers = TIER_KEYS.filter(k => orScales[k] > 1.001);
  const orDetail = overreach < -0.5
    ? `expanded ${expandedTiers.join(", ") || "zones"} · ${zoneAssetCount(player)} zones`
    : "zones within baseline";
  const penaltyDetail = vioMult < 0.999
    ? `${violCount} violations · norm ${treatyStage(player.treatyFloor)} (\u00d7${vioMult.toFixed(2)})`
    : `${violCount} violations`;
  return {
    total,
    terms: [
      { key: "banked",  label: "Banked ice",       value: banked,  detail: `${(player.iceDeposited ?? 0).toFixed(0)} kg` },
      ...(reserve > 0 ? [{ key: "reserve", label: "Strategic reserve", value: reserve, detail: `${(player.reserveKg ?? 0).toFixed(0)} kg escrowed ×${RESERVE_END_MULT}` }] : []),
      { key: "carried", label: "Carried ice",       value: carried, detail: `${(carriedIce + carriedVol).toFixed(0)} kg in transit` },
      { key: "assets",  label: "Infrastructure",    value: assets,  detail: `${player.assetPts ?? 0} asset points` },
      { key: "policy",  label: "Policy / injects",  value: policy,  detail: policy === 0 ? "no net effect" : `${policy > 0 ? "+" : ""}${policy.toFixed(0)} from decisions` },
      { key: "penalty", label: "Safety violations", value: penalty, detail: penaltyDetail },
      { key: "overreach", label: "Zone overreach", value: overreach, detail: orDetail },
    ],
  };
}

// debriefAnalysis turns the two players' breakdowns into a short set of
// governance findings: the margin, what drove the lead, and the safety/
// cooperation story the sim is built to teach. Pure: numbers in, findings out.
// Each finding is { tone: "good"|"bad"|"neutral", text }.
export function debriefAnalysis(p1, p2) {
  const b1 = scoreBreakdown(p1), b2 = scoreBreakdown(p2);
  const winner = b1.total > b2.total ? 1 : b2.total > b1.total ? 2 : 0;
  const margin = Math.abs(b1.total - b2.total);
  const name = (i) => `Actor ${i === 1 ? "I" : "II"}`;
  const findings = [];

  // 1) Outcome + margin character.
  if (winner === 0) {
    findings.push({ tone: "neutral", text: "The exercise ended in a dead heat. Neither operator opened a decisive advantage." });
  } else {
    const lead = winner === 1 ? b1 : b2;
    const tight = margin < 0.12 * Math.max(1, lead.total);
    findings.push({
      tone: "neutral",
      text: `${name(winner)} finished ahead by ${margin.toFixed(0)} points, ${tight ? "a narrow margin that a single different decision could have flipped" : "a clear margin"}.`,
    });
  }

  // 2) What drove the lead (largest positive term for the winner).
  if (winner !== 0) {
    const lead = winner === 1 ? b1 : b2;
    const driver = lead.terms.filter(t => t.value > 0).sort((a, b) => b.value - a.value)[0];
    if (driver) {
      const why = {
        banked:  "consistent ice delivery, the safest path to a high score",
        carried: "ice still in transit at the buzzer, value that was not yet secured",
        assets:  "a heavy infrastructure footprint",
        policy:  "the way they responded to facilitator injects",
      }[driver.key] || driver.label.toLowerCase();
      findings.push({ tone: "good", text: `Their lead came mostly from ${why} (${driver.value.toFixed(0)} pts).` });
    }
  }

  // 3) Safety story, the governance core of the sim.
  const v1 = Math.round(p1?.safetyViolations ?? 0), v2 = Math.round(p2?.safetyViolations ?? 0);
  if (v1 === 0 && v2 === 0) {
    findings.push({ tone: "good", text: "Neither operator violated a safety zone. This is the cooperative-deconfliction outcome the sandbox is designed to reward." });
  } else {
    const worst = v1 > v2 ? 1 : v2 > v1 ? 2 : 0;
    const worstV = Math.max(v1, v2);
    const cost = worstV * SCORE_PENALTY_VIO;
    if (worst === 0) {
      findings.push({ tone: "bad", text: `Both operators incurred safety violations (${v1} and ${v2}), each costing ${SCORE_PENALTY_VIO} points. Crowded siting hurt both.` });
    } else {
      findings.push({ tone: "bad", text: `${name(worst)} ran up ${worstV} safety violations, a self-inflicted ${cost}-point loss. Giving neighbors more room would have changed the result.` });
      if (worst === winner) {
        findings.push({ tone: "neutral", text: "They won despite that penalty; a cleaner safety record would have widened the margin." });
      } else if (winner !== 0) {
        findings.push({ tone: "neutral", text: `Those violations are part of why they lost: the ${cost}-point penalty exceeds the ${margin.toFixed(0)}-point final margin.` });
      }
    }
  }

  // 4) Policy / inject engagement.
  const pol1 = p1?.scoreAdjustments ?? 0, pol2 = p2?.scoreAdjustments ?? 0;
  if (pol1 !== 0 || pol2 !== 0) {
    if (pol1 > 0 && pol2 > 0) {
      findings.push({ tone: "good", text: "Both operators' inject choices were net-positive, leaning toward cooperative and safety-first responses." });
    } else if (pol1 < 0 || pol2 < 0) {
      const who = pol1 < pol2 ? 1 : 2;
      findings.push({ tone: "bad", text: `${name(who)}'s inject responses cost them on net, the price of riskier or more escalatory choices.` });
    }
  }

  return { winner, margin, b1, b2, findings };
}

/**
 * Merge two "after-planning" grid states back onto their pre-planning
 * baseline. Used by the symmetric batch-sim planning loop in simulateBotGame:
 * both bots plan against the same `presim` snapshot, and this function
 * decides what the merged grid state should be afterward.
 *
 * Logic:
 *   - If neither bot changed the grid → return presim (no change).
 *   - If only one bot changed → take that bot's after-state.
 *   - If both changed (rare -- they'd have to act on the same shared mode in
 *     the same turn) → prefer the more-active mode where active means
 *     shared > offered > independent. So a "join" beats a "decouple".
 */
export function pickMergedGridState(presim, after1, after2) {
  const eq = (a, b) =>
    a?.mode === b?.mode &&
    (a?.offeredBy ?? null) === (b?.offeredBy ?? null) &&
    (a?.offeredTo ?? null) === (b?.offeredTo ?? null);
  const c1 = !eq(presim, after1);
  const c2 = !eq(presim, after2);
  if (!c1 && !c2) return presim;
  if (c1 && !c2) return after1;
  if (!c1 && c2) return after2;
  // Both changed -- prefer the more-active mode.
  const rank = { independent: 0, offered: 1, shared: 2 };
  return (rank[after1.mode] ?? 0) >= (rank[after2.mode] ?? 0) ? after1 : after2;
}
