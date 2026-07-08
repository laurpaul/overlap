// ── Bloc disaggregation + internal negotiation (roadmap) ────────────────────
//
// The core actors (Artemis, ILRS) currently present as monolithic blocs. In
// reality each is a coalition: Artemis blends a science constituency and a
// commercial constituency that want different things, and only after an internal
// negotiation does the bloc present one position. This module models that step
// purely so it can be tested and, later, surfaced as a pre-game / per-round
// internal-negotiation panel.
//
// Each sub-actor carries an `influence` (its weight inside the bloc) and a
// `priorities` vector over a few axes. negotiateBlocPosition blends them into a
// single bloc position and reports COHESION (how unified the bloc is) plus the
// DISSENTER (the faction furthest from the agreed line). A low-cohesion bloc is
// a fragile compromise, which is exactly the dynamic a workshop wants to see.
//
// Pure: no DOM, no module state. Weights/priorities are tunable defaults, not
// sourced figures.

const AXES = ["ice", "throughput", "safety", "speed"];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Default sub-actor make-up of each bloc. influence sums to 1 within a bloc.
// priorities are what each faction pushes for, 0..1 per axis.
export const BLOC_SUBACTORS = {
  artemis: [
    {
      id: "artemis_science",
      label: "Science wing, Vanguard + Aurelian Union",
      influence: 0.5,
      // Wants ice/volatiles access and careful, safe operations; not in a hurry.
      priorities: { ice: 0.9, throughput: 0.3, safety: 0.85, speed: 0.25 },
    },
    {
      id: "artemis_commercial",
      label: "Commercial, Halcyon Aerospace",
      influence: 0.5,
      // Wants throughput and speed to market; tolerates more risk, less patient.
      priorities: { ice: 0.4, throughput: 0.95, safety: 0.4, speed: 0.9 },
    },
  ],
  // "Consider ILRS too" -- modeled as a state-led science wing plus a strategic
  // wing. Included so both core actors can disaggregate symmetrically.
  ilrs: [
    {
      id: "ilrs_science",
      label: "State science programme",
      influence: 0.55,
      priorities: { ice: 0.8, throughput: 0.4, safety: 0.8, speed: 0.45 },
    },
    {
      id: "ilrs_strategic",
      label: "Strategic / prestige wing",
      influence: 0.45,
      priorities: { ice: 0.55, throughput: 0.7, safety: 0.5, speed: 0.85 },
    },
  ],
};

// Display names for the blocs (the obscured brief vocabulary). Used by
// describeBlocPosition; ids stay artemis/ilrs for state and mechanics.
export const BLOC_LABELS = { artemis: "Concordium", concordium: "Concordium", ilrs: "LRC" };

// The whole-consortium board actor (id "concordium") shares Concordium's internal
// factions, so the disaggregation panel shows the same Vanguard + Aurelian Union /
// Halcyon split and the same ~44% cohesion as the coalition-lead board actor.
BLOC_SUBACTORS.concordium = BLOC_SUBACTORS.artemis;

// Normalize a sub-actor list so influence sums to 1 (defensive; defaults already do).
function normalizeInfluence(subActors) {
  const total = subActors.reduce((s, a) => s + (a.influence || 0), 0) || 1;
  return subActors.map((a) => ({ ...a, influence: (a.influence || 0) / total }));
}

// Influence-weighted blend of two priority vectors -> the bloc position.
function blendPriorities(subActors) {
  const pos = {};
  for (const axis of AXES) {
    pos[axis] = clamp01(subActors.reduce((s, a) => s + a.influence * (a.priorities?.[axis] ?? 0), 0));
  }
  return pos;
}

// Distance between two priority vectors (mean absolute difference across axes),
// in [0,1]. 0 = identical wants, 1 = maximally opposed.
function priorityDistance(a, b) {
  let sum = 0;
  for (const axis of AXES) sum += Math.abs((a[axis] ?? 0) - (b[axis] ?? 0));
  return sum / AXES.length;
}

// Run the internal negotiation: blend to a bloc position, measure cohesion, and
// name the dissenting faction.
//
// Returns:
//   position   bloc priority vector (influence-weighted blend)
//   cohesion   [0,1]; 1 = unanimous, lower = more internal tension
//   dissenter  the sub-actor furthest from the agreed position (or null if unanimous)
//   spread     the max pairwise priority distance (the raw disagreement)
//   factions   the normalized sub-actors (for display)
export function negotiateBlocPosition(subActorsInput) {
  const subActors = normalizeInfluence(subActorsInput || []);
  if (subActors.length === 0) {
    return { position: Object.fromEntries(AXES.map((a) => [a, 0])), cohesion: 1, dissenter: null, spread: 0, factions: [] };
  }
  if (subActors.length === 1) {
    return { position: { ...subActors[0].priorities }, cohesion: 1, dissenter: null, spread: 0, factions: subActors };
  }
  const position = blendPriorities(subActors);
  // Spread = the largest pairwise disagreement among factions.
  let spread = 0;
  for (let i = 0; i < subActors.length; i++) {
    for (let j = i + 1; j < subActors.length; j++) {
      spread = Math.max(spread, priorityDistance(subActors[i].priorities, subActors[j].priorities));
    }
  }
  const cohesion = clamp01(1 - spread);
  // Dissenter = faction whose wants are furthest from the agreed bloc position,
  // but only when the bloc is not already unanimous.
  let dissenter = null;
  if (spread > 1e-9) {
    let maxD = -1;
    for (const a of subActors) {
      const d = priorityDistance(a.priorities, position);
      if (d > maxD) { maxD = d; dissenter = a; }
    }
  }
  return { position, cohesion, dissenter, spread, factions: subActors };
}

// Convenience: negotiate a named bloc from the defaults.
export function negotiateBloc(blocId) {
  return negotiateBlocPosition(BLOC_SUBACTORS[blocId] ? BLOC_SUBACTORS[blocId].map((a) => ({ ...a })) : []);
}

// One-line workshop framing of a negotiation result.
export function describeBlocPosition(blocId, result) {
  const name = BLOC_LABELS[blocId] || blocId;
  const pct = Math.round((result.cohesion ?? 0) * 100);
  if (!result.dissenter || result.cohesion >= 0.999) {
    return `${name}: unified position (cohesion ${pct}%).`;
  }
  return `${name}: ${pct}% cohesion; the ${result.dissenter.label.toLowerCase()} is the swing faction pulling against the agreed line.`;
}

// ── US-as-spoiler: which bloc is harder to trust to hold a coordinated line ──
//
// Reviewer's inversion: the harder actor to trust right now is not the
// counter-coalition but the US-led bloc. The sandbox should reflect that. A
// bloc's "spoiler risk", the chance it cannot be relied on to hold a
// commitment its own negotiators made, is driven by three things this model
// makes explicit:
//   (1) low internal cohesion (a fragile compromise can crack),
//   (2) an act-ahead member that can defect unilaterally regardless of the
//       agreed line (Concordium's commercial actor with head-of-state access),
//   (3) a principal who can override the agency that signed (Concordium's
//       contracting structure, where the founder can route around the process).
// The counter-coalition, more unified and centrally commanded, has little of
// (2) or (3), so it comes out as the MORE predictable partner.
export const BLOC_TRUST_TRAITS = {
  concordium: { unboundActor: 0.30, principalOverride: 0.18, label: "Concordium (US-led)" },
  artemis:    { unboundActor: 0.30, principalOverride: 0.18, label: "Concordium (US-led)" },
  ilrs:       { unboundActor: 0.05, principalOverride: 0.04, label: "LRC" },
};

// Spoiler risk in [0,1]: higher = harder to trust to hold a coordinated commitment.
export function blocSpoilerRisk(blocId) {
  const neg = negotiateBloc(blocId);
  const cohesion = neg.cohesion ?? 1;
  const cohesionGap = 1 - cohesion;
  const t = BLOC_TRUST_TRAITS[blocId] || { unboundActor: 0, principalOverride: 0, label: BLOC_LABELS[blocId] || blocId };
  const risk = clamp01(0.5 * cohesionGap + t.unboundActor + t.principalOverride);
  return {
    blocId,
    label: t.label,
    cohesion,
    risk,
    drivers: {
      lowCohesion: 0.5 * cohesionGap,
      unboundActor: t.unboundActor,
      principalOverride: t.principalOverride,
    },
    harderToTrust: risk > 0.5,
  };
}

// Head-to-head: is the US-led bloc or the counter-coalition the harder actor to
// trust right now? Returns the riskier bloc and a one-line workshop framing.
export function spoilerComparison() {
  const concordium = blocSpoilerRisk("concordium");
  const lrc = blocSpoilerRisk("ilrs");
  const harder = concordium.risk >= lrc.risk ? "concordium" : "ilrs";
  return {
    concordium,
    lrc,
    harder,
    note:
      harder === "concordium"
        ? "The US-led bloc is the harder actor to trust to hold a coordinated line: a fragile internal compromise, an act-ahead commercial member, and a principal who can override the agency that signed."
        : "The counter-coalition reads as the harder actor to trust this round.",
  };
}

export { AXES as BLOC_AXES };
