// ── Stakeholder archetypes ──────────────────────────────────────────────────
//
// The playable actors, using the obscured names from the actor-brief packet so
// the app and the briefs share one vocabulary. Each maps to a real-world
// archetype (kept in comments for facilitators):
//
//   Vanguard              → civil-exploration lead of the Concordium coalition (NASA)
//   The Aurelian Union    → multilateral science / rules actor in Concordium (ESA)
//   Halcyon Aerospace     → big-tonnage commercial emplacer in Concordium (SpaceX-class)
//   LRC                   → state-led counter-coalition
//   The Ascendant Initiative → light-footprint prospecting hedger (ISRO/JAXA, LUPEX-style)
//   Civil Observer        → independent oversight body (facilitator / no assets)
//
// IDs are deliberately UNCHANGED from earlier versions (artemis, ilrs,
// large_commercial, small_commercial, observer) so saved state, snapshots,
// scenario presets, and the bloc model keep working, only the display identity,
// flavour, and palette are aligned to the briefs. Each archetype's thematic
// identity is used in the lobby, on the actor panels, and in mission logs.
// Optional starting modifiers tilt early-game economy to reflect each actor's
// real-world starting position.
//
// DESIGN CONSTRAINT (v101): the two coalition leads, Concordium's civil lead
// (id "artemis" / Vanguard) and LRC (id "ilrs"), must both be present in every
// two-actor configuration. The exercise's core tension is the bloc-vs-bloc
// dynamic; substituting either for a commercial or hedging actor collapses that
// tension into a one-sided scenario. The commercial (Halcyon), hedging
// (Ascendant Initiative), and observer archetypes are designed as the THIRD+
// actor or as facilitator-introduced pressure, not as a replacement for the
// Concordium-lead / LRC pairing. Workshop presets should seed actor 0 = artemis
// and actor 1 = ilrs unless a facilitator deliberately overrides.
export const CORE_ACTORS = ["artemis", "ilrs"];

export const STAKEHOLDER_DEFS = [
  {
    id: "artemis",
    name: "Vanguard",
    short: "VANGUARD",
    blurb: "Civil-exploration lead of the Concordium coalition. Crewed surface campaign, sustained presence, and the bloc's public face, legitimacy is its currency.",
    budgetMod: 1.25,
    rdMod: 1.1,
    // Heavy crewed program: habitats and reactors cheaper (institutional supply chain).
    assetCostMod: { habitat: 0.85, reactor: 0.85, solar: 1.0,  rover: 1.0,  pad: 0.9 },
    workPackage: "Crewed surface campaign · Pillar heavy-lift + Helios crew · Forerunner robotic precursors",
    palette: { main: "#3460A8", accent: "#80B0D8" },
  },
  {
    // The Concordium consortium as a single board actor: the briefs' coalition of
    // Vanguard + the Aurelian Union + Halcyon presenting one position. Selecting
    // this as a board actor surfaces the three members in the bloc-disaggregation
    // panel (BLOC_SUBACTORS.concordium) and labels the board actor "Concordium".
    // Mechanics approximate the pooled coalition (its civil lead's profile with a
    // larger pooled budget). IDs stay distinct so a session can run either the
    // whole consortium OR an individual member as the board actor.
    id: "concordium",
    name: "Concordium",
    short: "CONCORDIUM",
    blurb: "The accord-based coalition as one actor, Vanguard, the Aurelian Union, and Halcyon presenting a single position after an internal negotiation (~44% cohesion). Pooled budget, broad capability, but a genuine science-vs-commercial compromise.",
    budgetMod: 1.35,
    rdMod: 1.15,
    assetCostMod: { habitat: 0.85, reactor: 0.85, solar: 0.95, rover: 0.95, pad: 0.9 },
    workPackage: "Coalition surface campaign · pooled Pillar/Helios + Atlas + Leviathan lift · widest capability on the board",
    palette: { main: "#3460A8", accent: "#A8A8F0" },
  },
  {
    id: "aurelian",
    name: "The Aurelian Union",
    short: "AURELIAN",
    blurb: "Multilateral science-and-rules actor within Concordium. Consensus-bound, interoperability-first, and a genuine ice-prospecting contributor; modest footprint, low disturbance.",
    budgetMod: 1.1,
    rdMod: 1.15,
    // Science-led, proportionate operator: slightly smaller keep-out zones and
    // lower ground disturbance than the heavy actors; lean science payloads.
    footprintMod: 0.95,
    disturbanceMod: 0.85,
    assetCostMod: { solar: 0.9,  rover: 0.85, habitat: 1.0,  reactor: 1.0,  pad: 1.0 },
    workPackage: "Multilateral science campaign · Atlas logistics lander + Augur ice-prospecting payload",
    palette: { main: "#80B0D8", accent: "#C0B8E8" },
  },
  {
    id: "large_commercial",
    name: "Halcyon Aerospace",
    short: "HALCYON",
    blurb: "Concordium's big-tonnage commercial emplacer (Leviathan-class). Lands large fixed installations and heavy ISRU plant in a concentrated footprint; high throughput, high regolith disturbance.",
    budgetMod: 1.0,
    rdMod: 0.9,
    cargoMod: 1.5,
    // v130: the emplacer's signature is a LARGE fixed footprint and heavy
    // ground disturbance. Big keep-out zones (footprintMod) and high regolith
    // disturbance (disturbanceMod) are the tradeoff against its cheap heavy lift.
    footprintMod: 1.6,
    disturbanceMod: 1.5,
    // Heavy lift = bigger pads cheaper, all mass-up assets cheaper to deliver.
    assetCostMod: { pad: 0.7,  habitat: 0.85, solar: 0.85, reactor: 0.95, rover: 0.9 },
    workPackage: "Big-tonnage emplacement · Leviathan super-heavy lander · highest surface throughput on the board",
    palette: { main: "#A8A8F0", accent: "#C0B8E8" },
  },
  {
    id: "ilrs",
    name: "LRC",
    short: "LRC",
    blurb: "Lunar Research Consortium, the state-led counter-coalition. Robotic-first, long-duration station focus, more unified than Concordium; coordinates only as an equal.",
    budgetMod: 1.15,
    rdMod: 1.2,
    // Robotic-first: rovers cheaper, fewer habitats needed early.
    assetCostMod: { rover: 0.8,  solar: 0.9,  habitat: 1.1,  reactor: 0.9,  pad: 1.0 },
    workPackage: "Robotic station build-out · Steppe heavy-launch + Vesper prospecting landers · sample-return heritage",
    palette: { main: "#2E2068", accent: "#A8A8F0" },
  },
  {
    id: "small_commercial",
    name: "The Ascendant Initiative",
    short: "ASCENDANT",
    blurb: "Two-agency hedging partnership (Polaris-Ice prospector). Light, mobile, broad-coverage survey and sampling; small footprint, low disturbance, captured by no one, courted by both blocs.",
    budgetMod: 0.75,
    rdMod: 1.0,
    riskMod: 1.2,
    // v130: the prospector's signature is a LIGHT, mobile footprint that roams
    // widely. Small keep-out zones and low disturbance let it work near others
    // and across more ground, but it cannot emplace heavy plant.
    footprintMod: 0.6,
    disturbanceMod: 0.5,
    // Lean: small payloads cheap (solar, rover) but big things hard (reactor, big pad).
    assetCostMod: { solar: 0.85, rover: 0.8, habitat: 1.15, reactor: 1.4,  pad: 1.2 },
    workPackage: "Wide-area polar-ice prospecting · Polaris-Ice rover · light-lander cadence, deconflicts into seams",
    palette: { main: "#C0B8E8", accent: "#80B0D8" },
  },
  {
    id: "observer",
    name: "Civil Observer",
    short: "OBSERVER",
    blurb: "Independent oversight body. Tracks compliance, releases public reports, no operational assets.",
    budgetMod: 0.5,
    rdMod: 0.8,
    observerMode: true,
    assetCostMod: { solar: 1.5,  habitat: 2.0,  reactor: 3.0,  rover: 1.3,  pad: 1.5 },
    workPackage: "Treaty / governance monitoring · academic and NGO consortium funding",
    palette: { main: "#C8C4DC", accent: "#A8A0D0" },
  },
];

// Helper -- look up by id, default to first.
export function getStakeholderDef(id) {
  return STAKEHOLDER_DEFS.find((s) => s.id === id) || STAKEHOLDER_DEFS[0];
}
