// ── Governance regime mechanics (v206) ──────────────────────────────────────
//
// The pilot Monte Carlo (July 5) proved that two of the governance scenario
// presets were BRIEFING-ONLY: "ITU Coordination" and the inspection half of
// "Antarctic Treaty (ATCM)" carried narrative metadata but changed no
// mechanics, so their batch trials ran byte-identical to Standard. This
// module gives regimes teeth in the one place violations are priced:
// attribution weight.
//
// Design notes (kept deliberately small and legible):
//
//  · itu, first-come registration priority. The existing attribution rule
//    already charges whichever party arrived SECOND at a contested zone
//    (enemyZones.attributeSafetyViolationsN). Under an ITU-style regime that
//    registration priority is the whole point of the institution, so the
//    late party's violation is weighted ×2.0: crowding a registered zone is
//    twice as expensive as it is under the norm-free Standard board.
//
//  · atcm, consensus + inspection regime. Combat is already zeroed by the
//    preset's physics overrides (HOSTILE_DECAY:0, MIL_DAMAGE_SCALE:0); the
//    inspection half means violations cannot be quietly absorbed, every
//    breach is observed and carries reputational cost, modeled as ×1.5 on
//    all attributed violations.
//
//  · strategic_reserve, patient-accumulation scenario; no violation-side
//    mechanics (its identity lives in the 20-round horizon), listed here
//    explicitly so the table is exhaustive rather than open-ended.
//
// Weights multiply the per-violation increment inside attribution, so they
// flow through every existing consumer unchanged: scorePlayerState's
// SCORE_PENALTY_VIO term, treaty-floor erosion multipliers, the CSV exports,
// and the batch summaries all see the weighted count.

export const GOVERNANCE_EFFECTS = {
  itu: {
    label: "ITU Coordination",
    violationWeight: 2.0,
    note: "first-come registration priority, late arriver pays double",
  },
  atcm: {
    label: "Antarctic Treaty (ATCM)",
    violationWeight: 1.5,
    note: "inspection regime, every breach observed, reputational cost",
  },
  strategic_reserve: {
    label: "Strategic Reserve",
    violationWeight: 1.0,
    note: "reserve escrow, 25% of deposits sequestered, scores \u00d71.5 (see scenarioPresets overrides + economy.RESERVE_END_MULT)",
  },
};

// Weight applied to each attributed safety violation under a regime.
// Unknown / null regime → 1.0 (Standard board).
export function governanceViolationWeight(governanceId) {
  return GOVERNANCE_EFFECTS[governanceId]?.violationWeight ?? 1.0;
}

// Resolve the mechanical governance id for a scenario preset object (the
// preset's `governance.id` where present, else presets whose own id names a
// regime). Null for presets with no governance mechanics.
export function governanceIdForPreset(preset) {
  if (!preset) return null;
  const gid = preset.governance?.id ?? preset.id;
  return GOVERNANCE_EFFECTS[gid] ? gid : null;
}
