// ── Bilateral deals / negotiation engine (pure) ─────────────────────────────
//
// Actors can propose deals to each other: each side puts up "consideration" and
// asks for something in return. A deal has two term bundles , 
//
//   give  : what the proposer hands over to the recipient
//   want  : what the proposer asks the recipient to hand over
//
// Each bundle can mix transferable resources and access grants:
//
//   budget   (credits)            transferable
//   ice      (deposited kg)        transferable
//   score    (scoreAdjustments)    transferable
//   power    (open the power grid between the two actors)        access grant
//   comms    (open the comms grid between the two actors)        access grant
//   easement (waive your safety-zone violations against them)    access grant
//   stance   (commit to adopt an allocation preset key)          policy
//
// On acceptance the resources move, the access grants flip on, and any stance
// commitments are applied. Everything here is pure and returns NEW objects so it
// stays unit-testable and host-authoritative-safe.

let _seq = 1;
export function makeDeal(from, to, give = {}, want = {}, meta = {}) {
  const norm = (t) => ({
    budget: Math.max(0, Math.round(t.budget || 0)),
    ice: Math.max(0, Math.round(t.ice || 0)),
    score: Math.max(0, Math.round(t.score || 0)),
    power: !!t.power,
    comms: !!t.comms,
    easement: !!t.easement,
    stance: t.stance || null,
  });
  return {
    id: meta.id || `deal_${Date.now()}_${_seq++}`,
    from, to,
    give: norm(give),
    want: norm(want),
    status: "pending",
    ts: meta.ts || Date.now(),
    round: meta.round ?? null,
  };
}

// True if `bundle` asks nothing at all (used to reject empty proposals).
export function isEmptyBundle(b) {
  return !b || (!b.budget && !b.ice && !b.score && !b.power && !b.comms && !b.easement && !b.stance);
}

// A deal must move *something* in at least one direction.
export function isEmptyDeal(deal) {
  return isEmptyBundle(deal.give) && isEmptyBundle(deal.want);
}

// Can `player` actually hand over the transferable resources in `bundle`?
// Access grants and stance commitments are always "affordable".
export function canFulfill(player, bundle) {
  if (!player || !bundle) return false;
  if ((bundle.budget || 0) > (player.budget ?? 0)) return false;
  if ((bundle.ice || 0) > (player.iceDeposited ?? 0)) return false;
  if ((bundle.score || 0) > Math.max(0, player.scoreAdjustments ?? 0)) return false;
  return true;
}

// Both sides must be able to honor their half of an accepted deal.
//   proposer fulfills `give`; recipient fulfills `want`.
export function dealIsHonorable(fromP, toP, deal) {
  return canFulfill(fromP, deal.give) && canFulfill(toP, deal.want);
}

const otherActorId = (pi) => (pi === 0 ? 2 : 1);
const ACTOR_ID = (pi) => pi + 1;

// Human-readable one-liner for a term bundle.
export function summarizeBundle(b, presetLabel = (k) => k) {
  if (isEmptyBundle(b)) return "nothing";
  const parts = [];
  if (b.budget) parts.push(`${b.budget}cr`);
  if (b.ice) parts.push(`${b.ice}kg ice`);
  if (b.score) parts.push(`${b.score} score`);
  if (b.power) parts.push("power-grid access");
  if (b.comms) parts.push("comms access");
  if (b.easement) parts.push("safety easement");
  if (b.stance) parts.push(`adopt ${presetLabel(b.stance)}`);
  return parts.join(" + ");
}

// Apply an ACCEPTED deal. `state` = { p1, p2, powerGrid, commsGrid }. Returns a
// new state with resources moved, access grants flipped on, easements granted,
// and stance commitments applied. Does NOT validate affordability, call
// dealIsHonorable first. Grid arguments are the gridNegotiation state shapes.
export function applyAcceptedDeal(state, deal, { sharedGridFor } = {}) {
  const fromIdx = deal.from, toIdx = deal.to;
  let from = { ...(fromIdx === 0 ? state.p1 : state.p2) };
  let to   = { ...(toIdx === 0 ? state.p1 : state.p2) };

  const moveBudget = (giverRef, takerRef, amt) => {
    if (!amt) return;
    giverRef.v.budget = Math.max(0, (giverRef.v.budget ?? 0) - amt);
    takerRef.v.budget = (takerRef.v.budget ?? 0) + amt;
  };
  const moveIce = (giverRef, takerRef, amt) => {
    if (!amt) return;
    giverRef.v.iceDeposited = Math.max(0, (giverRef.v.iceDeposited ?? 0) - amt);
    takerRef.v.iceDeposited = (takerRef.v.iceDeposited ?? 0) + amt;
  };
  const moveScore = (giverRef, takerRef, amt) => {
    if (!amt) return;
    giverRef.v.scoreAdjustments = (giverRef.v.scoreAdjustments ?? 0) - amt;
    takerRef.v.scoreAdjustments = (takerRef.v.scoreAdjustments ?? 0) + amt;
  };

  const fromRef = { v: from }, toRef = { v: to };
  // proposer gives -> recipient
  moveBudget(fromRef, toRef, deal.give.budget);
  moveIce(fromRef, toRef, deal.give.ice);
  moveScore(fromRef, toRef, deal.give.score);
  // recipient gives (proposer's "want") -> proposer
  moveBudget(toRef, fromRef, deal.want.budget);
  moveIce(toRef, fromRef, deal.want.ice);
  moveScore(toRef, fromRef, deal.want.score);

  // Safety easements: granting waives YOUR zones against the other actor.
  const grantEasement = (granter, granteeIdx) => {
    const id = ACTOR_ID(granteeIdx);
    const list = new Set(granter.easements || []);
    list.add(id);
    granter.easements = [...list];
  };
  if (deal.give.easement) grantEasement(from, toIdx);   // proposer waives vs recipient
  if (deal.want.easement) grantEasement(to, fromIdx);   // recipient waives vs proposer

  // Stance commitments.
  if (deal.give.stance) { from.allocPreset = deal.give.stance; from._stanceCommit = deal.give.stance; }
  if (deal.want.stance) { to.allocPreset = deal.want.stance;   to._stanceCommit = deal.want.stance; }

  const p1 = fromIdx === 0 ? from : (toIdx === 0 ? to : state.p1);
  const p2 = fromIdx === 1 ? from : (toIdx === 1 ? to : state.p2);

  // Grid access: either side offering power/comms opens that grid as SHARED
  // between the two actors (uses the caller-provided shared-state factory so we
  // don't import the grid module here).
  const wantsPower = deal.give.power || deal.want.power;
  const wantsComms = deal.give.comms || deal.want.comms;
  const sharedState = (offeredBy) =>
    sharedGridFor ? sharedGridFor(offeredBy) : { mode: "shared", offeredBy: ACTOR_ID(offeredBy), offeredTo: ACTOR_ID(offeredBy === 0 ? 1 : 0) };

  return {
    p1, p2,
    powerGrid: wantsPower ? sharedState(deal.give.power ? fromIdx : toIdx) : state.powerGrid,
    commsGrid: wantsComms ? sharedState(deal.give.comms ? fromIdx : toIdx) : state.commsGrid,
    applied: {
      power: wantsPower, comms: wantsComms,
      easements: { from: !!deal.give.easement, to: !!deal.want.easement },
      stances: { from: deal.give.stance || null, to: deal.want.stance || null },
    },
  };
}

// Has the owner waived their safety zones against `breacherActorId` (1|2)?
export function hasEasement(owner, breacherActorId) {
  return !!owner && (owner.easements || []).includes(breacherActorId);
}

// ── Deal hygiene (v168) ─────────────────────────────────────────────────────
// Pending offers shouldn't linger forever or stay live after the proposer has
// spent what they offered. Deals expire after a couple of rounds, and any offer
// whose proposer can no longer cover its `give` side is dropped as unaffordable.

export const DEAL_MAX_AGE_ROUNDS = 2;

// Can the PROPOSER still honor their half? (The recipient's side is only forced
// at accept-time; here we just garbage-collect offers the proposer broke.)
export function dealStillHonorable(deal, p1, p2) {
  const fromP = deal.from === 0 ? p1 : p2;
  return canFulfill(fromP, deal.give);
}

// Returns { kept, dropped } where dropped carries a reason ("expired" |
// "unaffordable"). Resolved (non-pending) deals are also pruned out.
export function pruneDeals(deals, { round = null, p1 = null, p2 = null } = {}) {
  const kept = [], dropped = [];
  for (const d of (deals || [])) {
    if (d.status && d.status !== "pending") continue;
    const tooOld = round != null && d.round != null && (round - d.round) >= DEAL_MAX_AGE_ROUNDS;
    const broke = (p1 || p2) ? !dealStillHonorable(d, p1, p2) : false;
    if (tooOld) dropped.push({ deal: d, reason: "expired" });
    else if (broke) dropped.push({ deal: d, reason: "unaffordable" });
    else kept.push(d);
  }
  return { kept, dropped };
}
