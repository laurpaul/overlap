// ── Public claims / propaganda (v181) ───────────────────────────────────────
//
// "Actors post true-or-false five-year plans / production claims that others
// can believe or not."
//
// A claim is a public statement an actor broadcasts to the room. Two kinds:
//   • production, a structured, auto-verifiable assertion about the actor's own
//     state ("I have deposited at least 200 kg of ice", "I field ≥ 3 reactors").
//     Posted truthfully it's a signal; posted false it's a bluff.
//   • pledge, a free-text intention ("We will not expand into the south PSR").
//     Not machine-verifiable; resolved by the room / the facilitator.
//
// The teeth: a claim can be VERIFIED against ground truth (immediately if you
// have the intel, which under fog of war means you've scouted the relevant
// assets, and always at the debrief). A claim caught false dents the author's
// CREDIBILITY, a tracked ratio that makes future bluffs less persuasive. That's
// the governance lesson: cheap talk is cheap until someone can check it.
//
// Pure module: claim construction, verification against a player snapshot, and
// credibility scoring. App.jsx owns the claims array + the posting/voting UI.

const DESTROYED = 0.1;

// Live count of a structure array, excluding destroyed entries.
function liveCount(arr, healthArr) {
  if (!arr) return 0;
  return arr.filter((s, i) => s && (healthArr?.[i] ?? 1.0) > DESTROYED).length;
}

// The set of metrics a production claim can assert about an actor, each with a
// human label and an extractor from a player-state snapshot.
export const CLAIM_METRICS = {
  ice:      { label: "ice deposited (kg)", unit: "kg", get: (p) => Math.round(p?.iceDeposited || 0) },
  reactors: { label: "reactors",  unit: "", get: (p) => liveCount(p?.reactors, p?.structureHealth?.reactors) },
  habitats: { label: "habitats",  unit: "", get: (p) => liveCount(p?.habitats, p?.structureHealth?.habitats) },
  pads:     { label: "landing pads", unit: "", get: (p) => liveCount(p?.landingPads, p?.structureHealth?.landingPads) },
  panels:   { label: "solar arrays", unit: "", get: (p) => liveCount(p?.panels, p?.structureHealth?.panels) },
  rovers:   { label: "rovers", unit: "", get: (p) => 1 + liveCount(p?.extraRovers, p?.structureHealth?.extraRovers) },
  assetPts: { label: "infrastructure points", unit: "pts", get: (p) => p?.assetPts || 0 },
};

export const CLAIM_OPS = {
  ">=": (a, b) => a >= b,
  "<=": (a, b) => a <= b,
  "==": (a, b) => a === b,
};

let _seq = 0;
export function resetClaimSeq() { _seq = 0; }

// Construct a claim. `author` is 0|1. For a production claim pass
// { metric, op, value }; for a pledge pass { text }.
export function makeClaim({ author, round, kind = "production", metric, op = ">=", value, text }) {
  const id = `c${Date.now().toString(36)}_${_seq++}`;
  if (kind === "pledge") {
    return { id, author, round, kind, text: text || "", status: "unverified", stances: {} };
  }
  const m = CLAIM_METRICS[metric];
  const opSym = CLAIM_OPS[op] ? op : ">=";
  const v = Number(value) || 0;
  const auto = m ? `I have ${opSym === ">=" ? "at least" : opSym === "<=" ? "at most" : "exactly"} ${v} ${m.label}` : (text || "");
  return { id, author, round, kind: "production", metric, op: opSym, value: v, text: text || auto, status: "unverified", stances: {} };
}

// Verify a production claim against the AUTHOR's current state snapshot.
// Returns "true" | "false". Pledges are "unverifiable".
export function verifyClaim(claim, authorPlayer) {
  if (!claim || claim.kind !== "production") return "unverifiable";
  const m = CLAIM_METRICS[claim.metric];
  const op = CLAIM_OPS[claim.op];
  if (!m || !op) return "unverifiable";
  const actual = m.get(authorPlayer);
  return op(actual, claim.value) ? "true" : "false";
}

// Apply a verification result to a claim (returns a new claim).
export function resolveClaim(claim, authorPlayer) {
  if (!claim) return claim;
  const status = verifyClaim(claim, authorPlayer);
  if (status === "unverifiable") return claim;
  return { ...claim, status, verifiedActual: CLAIM_METRICS[claim.metric]?.get(authorPlayer) };
}

// Record an actor's belief about a claim (believe | doubt | null to clear).
export function setClaimStance(claim, actorIdx, stance) {
  const stances = { ...(claim.stances || {}) };
  if (stance == null) delete stances[actorIdx];
  else stances[actorIdx] = stance;
  return { ...claim, stances };
}

// Credibility of an author: among their VERIFIED production claims, the fraction
// that were true. Returns { verified, trueCount, ratio }, ratio is null when
// nothing has been verified yet (unknown, not zero).
export function credibilityOf(claims, author) {
  const mine = (claims || []).filter(c => c.author === author && (c.status === "true" || c.status === "false"));
  const trueCount = mine.filter(c => c.status === "true").length;
  return {
    verified: mine.length,
    trueCount,
    ratio: mine.length === 0 ? null : trueCount / mine.length,
  };
}

// A short qualitative credibility label for a HUD chip.
export function credibilityLabel(claims, author) {
  const { verified, ratio } = credibilityOf(claims, author);
  if (verified === 0) return { text: "untested", tier: "unknown" };
  if (ratio >= 0.999) return { text: "reliable", tier: "good" };
  if (ratio >= 0.5)   return { text: "mixed", tier: "mixed" };
  return { text: "caught bluffing", tier: "bad" };
}

// Tally believe/doubt votes on a claim.
export function tallyStances(claim) {
  const vals = Object.values(claim?.stances || {});
  return {
    believe: vals.filter(s => s === "believe").length,
    doubt: vals.filter(s => s === "doubt").length,
  };
}
