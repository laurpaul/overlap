// ── Facilitator inject deck (pure data + delta logic) ────────────────────────
//
// Extracted from FacilitatorPanel.jsx so the deck and applyInjectDeltas can be
// unit-tested in Node without a JSX build step (tests/injects.test.js), the
// same pattern the rest of the sim core follows. FacilitatorPanel.jsx now
// re-exports these for backward compatibility.
//
// Each inject has 3 choices. Each choice carries a `deltas` object applied to
// the receiving actor(s)' player state:
//
//   econ            -> p.econ           (national economy stock)
//   rdAccum         -> p.rdAccum        (R&D accumulation)
//   milStock        -> p.milStock       (military stock)
//   credits         -> p.budget         (immediate lunar credits)
//   contentnessMod  -> p.contentnessMod (temporary C offset)
//   contentnessDecay-> p.contentnessDecay
//   scoreAdj        -> p.scoreAdjustments (DIRECT composite-score effect; v90)
//   treatyErosion   -> p.treatyFloor      (v153: round pressure on the OST
//                      non-appropriation floor; >0 walks it back, <0 recovers it,
//                      via the capped erodeTreatyFloor, no single-event cliff)
//
// `targets`: "both" | "p1" | "p2", selected in the facilitator UI before push.

import { erodeTreatyFloor } from "./treatyErosion.js";

export const INJECT_DECK = [
  {
    id: "solar_flare",
    icon: "☀",
    color: "#FFB347",
    label: "Solar flare event",
    summary: "Inbound CME · 36 hr advance warning",
    blurb: "A geomagnetic storm classified G4 (severe) is inbound. Crews must shelter; surface operations suspended for 1-3 days. Solar arrays lose output for the duration.",
    defaultTargets: "both",
    choices: [
      {
        label: "Shelter & wait",
        desc: "Protect crew, accept the economic standstill.",
        deltas: { econ: -1.5, contentnessMod: -0.15, contentnessDecay: 0.05, scoreAdj: +8 },
      },
      {
        label: "Push through with shielding",
        desc: "Use downtime for R&D, but crew morale suffers.",
        deltas: { rdAccum: +8, contentnessMod: -0.25, contentnessDecay: 0.08, scoreAdj: +4 },
      },
      {
        label: "Maintain operations, accept risk",
        desc: "Keep output up. Serious morale hit if anything goes wrong.",
        deltas: { econ: -0.8, contentnessMod: -0.35, contentnessDecay: 0.12, scoreAdj: -12 },
      },
    ],
  },
  {
    id: "dust_storm",
    icon: "🌫",
    color: "#D69B57",
    label: "Levitating dust event",
    summary: "Terminator dust loft from polar passage",
    blurb: "Electrostatically charged regolith is lofting at the terminator and accumulating on hardware. Solar panel efficiency degraded pending cleaning.",
    defaultTargets: "both",
    choices: [
      {
        label: "Deploy cleaning crews immediately",
        desc: "Spend now, protect long-run output.",
        deltas: { credits: -80, econ: -0.5, scoreAdj: +6 },
      },
      {
        label: "Invest in dust mitigation R&D",
        desc: "Long-run fix, short-run degradation continues.",
        deltas: { rdAccum: +8, econ: -1.2, scoreAdj: +4 },
      },
      {
        label: "Accept degradation, do nothing",
        desc: "Save resources. Morale and output both suffer.",
        deltas: { contentnessMod: -0.2, econ: -1.5, contentnessDecay: 0.07, scoreAdj: -8 },
      },
    ],
  },
  {
    id: "comms_blackout",
    icon: "📡",
    color: "#8B6FB8",
    label: "Deep Space Network outage",
    summary: "DSN slot lost to Mars mission priority",
    blurb: "Earth-side comms downgraded to 1 hr/day windows for the next two rounds. Autonomous operations only; real-time teleops not possible.",
    defaultTargets: "both",
    choices: [
      {
        label: "Autonomous operations mode",
        desc: "Lean on R&D to compensate; economic tempo drops.",
        deltas: { rdAccum: -8, econ: -0.5, scoreAdj: +5 },
      },
      {
        label: "Reduce tempo, conserve",
        desc: "Wait it out. Cash cushion, modest morale dip.",
        deltas: { credits: +75, econ: -1.5, contentnessMod: -0.15, contentnessDecay: 0.05, scoreAdj: -4 },
      },
      {
        label: "Reroute through partner comms",
        desc: "Maintain output but expose a security dependency.",
        deltas: { econ: -0.8, milStock: -2, scoreAdj: 0 },
      },
    ],
  },
  {
    id: "itar_review",
    icon: "⚖",
    color: "#E97AC7",
    label: "Export-control review",
    summary: "Bilateral tech-transfer audit triggered",
    blurb: "A regulatory review flags potential ITAR / dual-use concerns in proposed shared infrastructure. Grid-sharing agreements suspended pending state-department clearance.",
    defaultTargets: "both",
    choices: [
      {
        label: "Comply fully, suspend sharing",
        desc: "Strong legal posture. Economic cost.",
        deltas: { milStock: +3, econ: -1.5, scoreAdj: +6 },
      },
      {
        label: "Contest the ruling",
        desc: "Protect economics. Domestic unease about confrontation.",
        deltas: { econ: -0.5, contentnessMod: -0.3, contentnessDecay: 0.1, scoreAdj: -10 },
      },
      {
        label: "Negotiate a carve-out",
        desc: "Spend political capital on a narrow exception.",
        deltas: { rdAccum: -8, credits: -100, econ: -0.5, scoreAdj: +2 },
      },
    ],
  },
  {
    id: "crew_incident",
    icon: "✚",
    color: "#FF7A6A",
    label: "Crew medical incident",
    summary: "EVA decompression scare",
    blurb: "A crew member experienced rapid decompression during a routine EVA, non-fatal, but operations paused while incident review completes. Habitat ops constrained.",
    defaultTargets: "p1",
    choices: [
      {
        label: "Full stand-down, safety review",
        desc: "Crew morale improves. Operations halt.",
        deltas: { econ: -1.5, contentnessMod: +0.15, contentnessDecay: 0.05, scoreAdj: +10 },
      },
      {
        label: "Partial stand-down, maintain critical ops",
        desc: "Compromise that satisfies nobody fully.",
        deltas: { econ: -0.8, contentnessMod: -0.1, contentnessDecay: 0.04, scoreAdj: 0 },
      },
      {
        label: "Maintain schedule, internal review only",
        desc: "Protect output. Serious morale risk if it recurs.",
        deltas: { econ: -0.3, contentnessMod: -0.35, contentnessDecay: 0.12, scoreAdj: -14 },
      },
    ],
  },
  {
    id: "equipment_fail",
    icon: "⚠",
    color: "#E89BB5",
    label: "Critical equipment failure",
    summary: "Reactor cooling loop anomaly",
    blurb: "A fission surface power reactor reports cooling-loop temperatures outside spec. Output throttled to 40% pending diagnosis. Repair parts on the next resupply.",
    defaultTargets: "p1",
    choices: [
      {
        label: "Emergency resupply order",
        desc: "Buy the fix now. Protect long-run output.",
        deltas: { credits: -150, econ: -0.3, scoreAdj: +6 },
      },
      {
        label: "Throttle and engineer around it",
        desc: "Smart adaptation. Slower output in the interim.",
        deltas: { rdAccum: +8, econ: -1.2, scoreAdj: +4 },
      },
      {
        label: "Run hot, monitor closely",
        desc: "Maintain output. Crew knows the risk and doesn't like it.",
        deltas: { econ: -0.5, contentnessMod: -0.3, contentnessDecay: 0.1, scoreAdj: -12 },
      },
    ],
  },
  {
    id: "geopolitical",
    icon: "🜨",
    color: "#80B0D8",
    label: "Geopolitical inject",
    summary: "Third-party state announces intent",
    blurb: "A non-participant spacefaring nation announces intent to land near the contested PSR within 8 months. Reframes the bilateral negotiation as trilateral.",
    defaultTargets: "both",
    choices: [
      {
        label: "Accelerate claims, assert position",
        desc: "Strong posture. Economic cost of rapid mobilisation.",
        deltas: { milStock: +6, econ: -1.5, scoreAdj: -6 },
      },
      {
        label: "Seek trilateral dialogue",
        desc: "Goodwill boost. Security position softens.",
        deltas: { contentnessMod: +0.2, milStock: -3, contentnessDecay: 0.07, scoreAdj: +12 },
      },
      {
        label: "Ignore and focus on extraction",
        desc: "Stay the course economically. Domestically unpopular.",
        deltas: { econ: +1.0, milStock: -4, contentnessMod: -0.2, contentnessDecay: 0.07, scoreAdj: -4 },
      },
    ],
  },
  {
    id: "discovery",
    icon: "✦",
    color: "#7DD87A",
    label: "Surprise discovery",
    summary: "Crater volatiles richer than expected",
    blurb: "A targeted-prospecting traverse returns assays showing 2.5× the expected ice concentration in a previously-classified secondary crater. Reset the economics.",
    defaultTargets: "both",
    choices: [
      {
        label: "Race to extract immediately",
        desc: "Cash in now. Sacrifice the science value.",
        deltas: { econ: +1.5, rdAccum: -8, scoreAdj: +6 },
      },
      {
        label: "Cooperative joint survey",
        desc: "Maximise knowledge and goodwill.",
        deltas: { rdAccum: +15, contentnessMod: +0.1, contentnessDecay: 0.04, scoreAdj: +14 },
      },
      {
        label: "Secure the site, survey later",
        desc: "Assert control. Spend on logistics.",
        deltas: { milStock: +5, credits: -100, contentnessMod: +0.1, contentnessDecay: 0.04, scoreAdj: +2 },
      },
    ],
  },
  {
    id: "embargo",
    icon: "⛔",
    color: "#C19470",
    label: "Resupply embargo",
    summary: "Launch service contract dispute",
    blurb: "Both actors' planned resupply launches are delayed 2 rounds due to a launch-vehicle contractual dispute. Operate on current consumables.",
    defaultTargets: "both",
    choices: [
      {
        label: "Ration strictly, halt new builds",
        desc: "Preserve cash. Crew morale suffers under rationing.",
        deltas: { credits: +100, econ: -1.2, contentnessMod: -0.2, contentnessDecay: 0.07, scoreAdj: -6 },
      },
      {
        label: "Accelerate local production R&D",
        desc: "Invest in self-sufficiency. Short-run hit.",
        deltas: { rdAccum: +8, econ: -1.0, contentnessMod: -0.1, contentnessDecay: 0.04, scoreAdj: +6 },
      },
      {
        label: "Seek emergency alternative supplier",
        desc: "Spend reserves. Crew relieved the supply chain is secured.",
        deltas: { credits: -150, econ: -0.3, contentnessMod: -0.1, contentnessDecay: 0.04, scoreAdj: +4 },
      },
    ],
  },
  {
    // v127 (roadmap): national-security inject. A NatSec designation lets an
    // actor claim oversized safety buffers around its assets. Mechanically the
    // safetyMult inflates the actor's keep-out zones (buildEnemyZones honors
    // safetyMult), so the rival is crowded out and bleeds violations it cannot
    // avoid: de facto exclusive zoning. The teaching point is the
    // first-mover-advantage-by-safety dynamic -- safety rules, applied
    // asymmetrically, become a land grab. The choices trade the land advantage
    // against the legitimacy / cooperation cost of invoking it.
    id: "natsec_designation",
    icon: "🛡",
    color: "#C0506A",
    label: "National-security designation",
    summary: "An actor's home government classifies its lunar assets as strategic",
    blurb: "A national-security label is invoked over one actor's surface assets. The stated justification is asset protection, but an enlarged safety buffer around those assets functions as exclusive zoning: the rival is pushed out of nearby terrain and accrues safety violations it cannot easily avoid. How the designated actor wields this is the question.",
    defaultTargets: "one",
    choices: [
      {
        label: "Invoke the full buffer (claim the ground)",
        desc: "Enlarge your safety zones ~2.2x. You lock down nearby terrain, but the move is read as a land grab and your legitimacy and cooperation standing take a hit.",
        deltas: { safetyMult: 2.2, scoreAdj: -10, contentnessMod: -0.08, contentnessDecay: 0.04 },
      },
      {
        label: "Accept a modest protective buffer",
        desc: "A restrained ~1.4x buffer: some genuine protection, limited zoning effect, little reputational cost.",
        deltas: { safetyMult: 1.4, scoreAdj: +2 },
      },
      {
        label: "Decline the designation",
        desc: "Refuse to securitize. No buffer change; you keep the moral high ground and the cooperative posture.",
        deltas: { safetyMult: 1.0, scoreAdj: +8 },
      },
    ],
  },
  {
    // v128 (roadmap): first-mover-gets-it-wrong. New prospecting data relocates
    // the prize to mid-latitudes, stranding polar infrastructure. The
    // strandedScale write-down scales with each actor's sunk polar asset points,
    // so whoever over-committed to the pole loses the most -- a direct
    // stress-test of the polar-ice-as-prize assumption the whole map encodes.
    id: "resource_relocation",
    icon: "🧭",
    color: "#7FA8C9",
    label: "Resource reassessment",
    summary: "New prospecting data relocates the prize to mid-latitudes",
    blurb: "A fresh orbital and ground survey indicates the economically viable resource concentration is not at the pole after all but in a mid-latitude deposit. Polar infrastructure built on the old assumption is suddenly stranded, and the more an actor sank into the pole, the larger the write-down. The polar-ice-as-prize premise just took a hit.",
    defaultTargets: "both",
    choices: [
      {
        label: "Write down the polar position, pivot",
        desc: "Accept the stranded-asset loss now (scaled to your polar build-out) and reorient. Cuts further exposure.",
        deltas: { strandedScale: 3, scoreAdj: +4, contentnessMod: -0.1, contentnessDecay: 0.05 },
      },
      {
        label: "Hold and hedge",
        desc: "Keep the polar assets, divert some effort to the new deposit. Smaller immediate write-down, ongoing uncertainty.",
        deltas: { strandedScale: 1.5, rdAccum: +6, econ: -0.6, scoreAdj: 0 },
      },
      {
        label: "Double down on the pole",
        desc: "Bet the reassessment is wrong and the pole still wins. No write-down now, but morale frays under the uncertainty and nothing is hedged.",
        deltas: { contentnessMod: -0.28, contentnessDecay: 0.1, scoreAdj: -6 },
      },
    ],
  },
  {
    // v129 (roadmap): intertemporal disposal. An end-of-life comms-sat must be
    // disposed of. Cheap crash-disposal saves the owner money now but the debris
    // fouls a FUTURE user's exploration zone -- a temporal externality, today's
    // disposal becoming tomorrow's keep-out. The counterpartDelta routes the
    // cost onto the other actor (the future user), so the actor who saved money
    // is not the one who pays. The responsible options keep the cost with the
    // owner where it belongs.
    id: "satellite_disposal",
    icon: "🛰",
    color: "#9A8FC0",
    label: "End-of-life satellite disposal",
    summary: "A comms-sat has reached end of life and must be de-orbited",
    blurb: "One actor's relay satellite is out of fuel and must be disposed of. A controlled de-orbit to a designated graveyard is clean but costs money and propellant. A cheap uncontrolled crash-disposal saves all of that, but the debris field lands in terrain a future user will want, leaving them a keep-out zone they did nothing to create. The cost can be kept with the owner or pushed onto whoever comes next.",
    defaultTargets: "one",
    choices: [
      {
        label: "Controlled de-orbit to a graveyard",
        desc: "Spend the propellant and money to dispose responsibly. No debris, no externality. The cost stays with you.",
        deltas: { credits: -120, scoreAdj: +8 },
      },
      {
        label: "Targeted disposal in your own spent area",
        desc: "Crash it, but on ground you have already worked out. Cheaper; the keep-out lands on you, not a future user.",
        deltas: { credits: -30, scoreAdj: -2 },
      },
      {
        label: "Cheap crash-disposal (externalize it)",
        desc: "Save the cost entirely. The debris fouls a future user's exploration zone -- they inherit the keep-out and the score hit, not you.",
        deltas: { credits: +40, scoreAdj: +2, counterpartDelta: { scoreAdj: -16 }, dropsDebris: { massT: 6, target: "counterpart" } },
      },
    ],
  },
  {
    // Reviewer's failure mode: the OST non-appropriation floor is walked back
    // GRADUALLY, not redrafted in one event. Each unprotested over-reach lowers
    // the floor a notch and makes the next grab look ordinary. Push this inject
    // across several rounds to enact the slow erosion; the treatyErosion
    // magnitude on each choice feeds the treatyErosion.js floor model (a
    // cooperative choice nudges the floor back up). No single choice breaks the
    // regime -- that absence of a break is the teaching point.
    id: "ost_walkback",
    icon: "⚖",
    color: "#8A84B8",
    label: "Treaty floor slips",
    summary: "The non-appropriation norm is quietly bent, not broken",
    blurb: "No redraft, no summit -- just one more over-reach that no one formally protests. The Founding Treaty's non-appropriation floor drops a notch, and a lower floor makes the next actor's grab look ordinary. Push this across rounds and the regime is walked back step by step, with no single moment anyone can point to as the break.",
    defaultTargets: "both",
    choices: [
      {
        label: "Reinforce the floor (publicly recommit)",
        desc: "Spend standing to recommit to non-appropriation and protest the over-reach. A small cost now; the floor recovers a notch.",
        deltas: { scoreAdj: +6, contentnessMod: +0.04, treatyErosion: -1 },
      },
      {
        label: "Let it slide (say nothing)",
        desc: "Don't protest, don't recommit. No cost today; the floor drops a notch and the next grab is cheaper.",
        deltas: { scoreAdj: 0, treatyErosion: +1 },
      },
      {
        label: "Exploit the opening (take the ground)",
        desc: "Use the weakened floor to take the appropriative advantage it now permits. Points now; the floor drops further and your cooperation standing frays.",
        deltas: { scoreAdj: +10, contentnessMod: -0.1, contentnessDecay: 0.05, treatyErosion: +2 },
      },
    ],
  },
];

// ── Apply deltas to a player object ─────────────────────────────────────────
export function applyInjectDeltas(player, deltas) {
  if (!player || !deltas) return player;
  const p = { ...player };
  if (deltas.econ       !== undefined) p.econ       = Math.max(0.5, (p.econ       ?? 8)   + deltas.econ);
  if (deltas.rdAccum    !== undefined) p.rdAccum    = Math.max(0,   (p.rdAccum    ?? 0)   + deltas.rdAccum);
  if (deltas.milStock   !== undefined) p.milStock   = Math.max(0.1, (p.milStock   ?? 1)   + deltas.milStock);
  if (deltas.credits    !== undefined) p.budget     = Math.max(0,   (p.budget     ?? 0)   + deltas.credits);
  // v90: scoreAdj feeds the composite score directly (via scoreAdjustments,
  // already a term in scorePlayerState). This is what makes a facilitator
  // inject, and the actor's choice of how to respond, actually move the
  // scoreboard rather than only nudging economy dials that score indirectly.
  if (deltas.scoreAdj   !== undefined) p.scoreAdjustments = (p.scoreAdjustments ?? 0) + deltas.scoreAdj;
  // v127 (national-security inject): set an oversized safety-buffer multiplier
  // on this actor. Its keep-out zones inflate by this factor, crowding the rival
  // out -- de facto exclusive zoning. Clamped to a sane range; 1 = normal.
  if (deltas.safetyMult !== undefined) p.safetyMult = Math.max(1, Math.min(4, deltas.safetyMult));
  // v153: the OST walk-back inject finally bites. Its choices carry a
  // treatyErosion "round pressure" (+1 let-slide, +2 exploit, -1 reinforce);
  // route it through the capped erodeTreatyFloor so the actor's treaty floor
  // walks back (or partially recovers) gradually, with no single-event cliff.
  // Previously this key was silently dropped, so the mechanic did nothing.
  if (deltas.treatyErosion !== undefined) {
    p.treatyFloor = erodeTreatyFloor(p.treatyFloor, deltas.treatyErosion);
  }
  // v128 (roadmap: first-mover-gets-it-wrong). The prize turns out to be
  // mid-latitude, so polar infrastructure is stranded. The write-down scales
  // with how much the actor committed to the pole (its asset points), so the
  // bloc that over-built at the pole takes the biggest hit -- the whole point
  // is to stress-test the polar-ice-as-prize assumption. Applied as a negative
  // scoreAdjustments proportional to assetPts.
  if (deltas.strandedScale !== undefined) {
    const sunk = Math.max(0, p.assetPts ?? 0);
    p.scoreAdjustments = (p.scoreAdjustments ?? 0) - deltas.strandedScale * sunk;
  }
  if (deltas.contentnessMod !== undefined) {
    // Additive, stacks with any existing mod, clamped to [-0.5, 0.5]
    p.contentnessMod  = Math.max(-0.5, Math.min(0.5, (p.contentnessMod ?? 0) + deltas.contentnessMod));
    p.contentnessDecay = deltas.contentnessDecay ?? 0.05;
  }
  // v101: a choice may impose a timed restriction (forced action state) on the
  // responding actor: a political directive that suspends negotiation, or a
  // frozen-cooperation order. Encoded as a countdown the turn engine ticks.
  // `with: "counterpart"` is resolved to a concrete actor index by the caller
  // (which knows who is responding) before this runs; if it is still the
  // placeholder string here, drop the target so it reads as a blanket freeze.
  if (deltas.restriction) {
    const r = { ...deltas.restriction };
    if (r.with === "counterpart") delete r.with;
    p.restrictions = addRestriction(p.restrictions, r);
  }
  return p;
}

// ── Forced action states (restrictions) ─────────────────────────────────────
//
// Some injects do not just nudge economy dials; they constrain what an actor is
// allowed to DO for a number of turns. These are encoded as a small list of
// active restrictions on the player, each with a `turns` countdown the turn
// engine decrements. Kept pure and data-only so the UI and the turn loop both
// read the same source of truth.
//
//   NO_NEGOTIATE  , a political master has issued a directive; the actor may
//                    not enter or accept power-grid / cooperation deals.
//   FROZEN_WITH   , an Earth-side crisis has frozen cooperation with a SPECIFIC
//                    counterpart (stored in `with`: actor index 0 or 1).
//
// A restriction record: { type, turns, with? , label }.
export const RESTRICTION = {
  NO_NEGOTIATE: "no_negotiate",
  FROZEN_WITH:  "frozen_with",
};

// Add a restriction, refreshing the countdown if the same type (and target) is
// already active rather than stacking duplicates.
export function addRestriction(list, r) {
  const cur = Array.isArray(list) ? list.slice() : [];
  const i = cur.findIndex(x => x.type === r.type && (x.with ?? null) === (r.with ?? null));
  if (i >= 0) cur[i] = { ...cur[i], turns: Math.max(cur[i].turns, r.turns) };
  else cur.push({ ...r });
  return cur;
}

// Decrement every active restriction by one turn; drop any that hit zero.
// Returns a new array (or [] ). Call once per actor at end of their turn.
export function tickRestrictions(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  return list
    .map(r => ({ ...r, turns: r.turns - 1 }))
    .filter(r => r.turns > 0);
}

// Is a given restriction type active? For FROZEN_WITH, optionally test a
// specific counterpart index.
export function hasRestriction(player, type, withIdx = null) {
  const list = player?.restrictions;
  if (!Array.isArray(list)) return false;
  return list.some(r =>
    r.type === type && (withIdx == null || (r.with ?? null) === withIdx));
}

// Can actor `p` (index pi) currently negotiate / cooperate with actor `otherIdx`?
// False if under a blanket NO_NEGOTIATE directive, or frozen specifically with
// that counterpart.
export function canNegotiateWith(p, otherIdx) {
  if (hasRestriction(p, RESTRICTION.NO_NEGOTIATE)) return false;
  if (hasRestriction(p, RESTRICTION.FROZEN_WITH, otherIdx)) return false;
  return true;
}

// A short human-readable status line for the HUD, or null if unrestricted.
export function restrictionStatus(player) {
  const list = player?.restrictions;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.map(r => {
    const t = `${r.turns} turn${r.turns === 1 ? "" : "s"}`;
    if (r.type === RESTRICTION.NO_NEGOTIATE) return `Directive: no negotiation (${t})`;
    if (r.type === RESTRICTION.FROZEN_WITH)  return `Cooperation frozen (${t})`;
    return `${r.label || r.type} (${t})`;
  }).join(" · ");
}

// ── v101 injects: forced-state + restraint-teaching scenarios ───────────────
// Appended to the deck below so existing indices/tests are unaffected.
INJECT_DECK.push(
  {
    id: "political_directive",
    icon: "⌖",
    color: "#C88CE8",
    label: "Geopolitical override",
    summary: "Directive from the political master",
    blurb: "Your capital has issued a binding directive. For the next three turns you may not enter or accept any cooperation or power-sharing arrangement, regardless of operational merit. The decision has been taken above your level.",
    defaultTargets: "p1",
    choices: [
      {
        label: "Comply with the directive",
        desc: "No negotiation for 3 turns. Lost coordination, but you keep political backing.",
        deltas: { scoreAdj: -6, restriction: { type: "no_negotiate", turns: 3, label: "Political directive" } },
      },
      {
        label: "Comply, but signal dissent",
        desc: "Follow orders while documenting the operational cost. Smaller hit, same lockout.",
        deltas: { scoreAdj: -3, contentnessMod: -0.1, contentnessDecay: 0.05, restriction: { type: "no_negotiate", turns: 3, label: "Political directive" } },
      },
      {
        label: "Quietly defy the directive",
        desc: "Keep your options open. Operationally free, but a serious political gamble.",
        deltas: { scoreAdj: -14, milStock: -2 },
      },
    ],
  },
  {
    id: "dual_use_surveillance",
    icon: "👁",
    color: "#80B0D8",
    label: "Dual-use surveillance flag",
    summary: "Ambiguous asset detected near your perimeter",
    blurb: "Sensors flag a counterpart's asset with an ambiguous signature: it could be a science package, or a surveillance/dual-use payload. Intent is genuinely unclear. How you respond will be reviewed in the debrief.",
    defaultTargets: "both",
    choices: [
      {
        label: "Hold and observe",
        desc: "Gather more information before reacting. Restraint under uncertainty.",
        deltas: { scoreAdj: +10 },
      },
      {
        label: "Issue a formal diplomatic query",
        desc: "Ask through channels. Mild friction, but proportionate.",
        deltas: { scoreAdj: +4, contentnessMod: -0.05, contentnessDecay: 0.04 },
      },
      {
        label: "Reposition assets defensively",
        desc: "Treat it as a threat and harden your posture. Costly escalation over what may be nothing.",
        deltas: { scoreAdj: -10, econ: -0.8, milStock: +2, contentnessMod: -0.15, contentnessDecay: 0.07 },
      },
    ],
    // Surfaced verbatim in the debrief: the flagged asset was benign.
    debriefReveal: "The flagged asset was a benign science package. Actors who repositioned defensively paid an escalation cost over nothing; restraint under ambiguity was the correct read.",
  },
  {
    id: "earthside_crisis",
    icon: "🌍",
    color: "#E89BB5",
    label: "Earth-side crisis",
    summary: "Terrestrial dispute freezes a specific relationship",
    blurb: "An unrelated dispute between two governments back on Earth has frozen their lunar cooperation. For the next three turns, the affected actors may not enter power-sharing or joint arrangements with each other, even where it would obviously help both.",
    defaultTargets: "both",
    choices: [
      {
        label: "Accept the freeze, operate independently",
        desc: "Cooperation with the counterpart suspended for 3 turns. Run solo.",
        deltas: { scoreAdj: -4, restriction: { type: "frozen_with", turns: 3, with: "counterpart", label: "Earth-side freeze" } },
      },
      {
        label: "Preserve technical contacts quietly",
        desc: "Keep working-level lines open within the rules. Softer hit, same formal freeze.",
        deltas: { scoreAdj: +2, restriction: { type: "frozen_with", turns: 3, with: "counterpart", label: "Earth-side freeze" } },
      },
      {
        label: "Exploit the rift for advantage",
        desc: "Use the breakdown to grab unilateral position. Short-term gain, lasting distrust.",
        deltas: { scoreAdj: -8, econ: +1.0, contentnessMod: -0.2, contentnessDecay: 0.08, restriction: { type: "frozen_with", turns: 3, with: "counterpart", label: "Earth-side freeze" } },
      },
    ],
  },
);

