# Roadmap

A tracked backlog of design and research directions for the Lunar Policy
Sandbox, beyond the current shipped feature set. These are intentionally a mix of
concrete build items, open design questions, and external research threads; the
status marker reflects that, not just "coded / not coded."

Legend: `[ ]` open · `[~]` needs a design decision or external source before it
can be specced · `[coord]` a personal / coordination action, not a code change.

---

## Actor modeling

- [ ] **Upstream manifest-competition representation.**
  Model the conflict *to the left of the surface*: riders competing to get on a
  CLPS-type mission before anyone touches the regolith. A pre-deployment scarcity
  layer (limited manifest slots) that actors contend for, shaping who even
  arrives.

- [~] **Disaggregate the core blocs into science vs commercial
  sub-actors.** Add an internal negotiation step where the sub-actors reconcile
  before the bloc presents an aggregate position. Surfaces intra-bloc tension
  (a science payload vs a commercial ISRU venture wanting different sites) that
  the current single-actor bloc hides. Second-bloc disaggregation is a maybe; decide
  whether the symmetry is worth the added complexity.
  STATUS (v135-v136): foundation BUILT and tested (src/sim/blocNegotiation.js)
  AND surfaced in the UI (v136): the actor-setup screen now shows each core
  actor's internal negotiation -- factions, influence %, a cohesion bar, and the
  swing faction (the first coalition reads 44% cohesion by default). Verified live on the
  settings screen. Weights are tunable defaults, not sourced. OPTIONAL NEXT: let
  the negotiated bloc position modulate that actor's in-game behavior
  (site-preference / risk tolerance) -- a design choice, deferred.

- [~] **Re-spec the two commercial actors.** Differentiate them structurally,
  not just by budget: a big-tonnage *emplacer* (large fixed footprint, heavy
  regolith disturbance) vs a wide-roaming *prospector* (light footprint, broad
  area coverage, less disturbance). Tie the difference to footprint size and a
  regolith-disturbance value the sim can score or penalize.

- [~] **Infrastructure / PNT actor or bloc.** Consider an actor whose product is
  position-navigation-timing and comms rather than ice. Reference the ~$4B lunar
  comms/nav award as the real-world anchor (verify the figure and awardee before
  citing). Changes the game from a pure resource grab to a services layer others
  depend on.

- [~] **Revisit the emerging-space-state brief.** Gateway uncertainty means the
  assumed ride to the surface may not exist, so the brief's premise (a small
  state securing a foothold) needs a hedge. Update the Saudi Arabia framing
  accordingly, possibly reframe around uncertain access rather than assured
  participation.

## Injects

- [ ] **National-security inject.** A NatSec label triggers excessive safety
  buffering around an actor's assets, which yields *de facto* exclusive zoning.
  The teaching point is the first-mover-advantage-by-safety dynamic: safety
  rules, applied asymmetrically, become a land-grab tool. (Codeable against the
  existing safety-zone + inject systems.)

- [ ] **First-mover-gets-it-wrong path.** An inject where the resource turns out
  to be mid-latitude, stranding early polar infrastructure. Stress-tests the
  polar-ice-as-prize assumption the whole map encodes, punishes the bloc that
  over-committed to the pole early.

- [ ] **Intertemporal disposal inject.** A bloc's own comms-sat disposal (crash)
  lands on a *future* user's exploration zone. Surfaces the temporal externality:
  today's disposal decision is tomorrow's keep-out problem.

## Scenarios

- [ ] **Strategic-reserve scenario.** A scenario built around stockpiling ice or
  propellant as a strategic reserve, with an orbital dimension (reserve held in
  orbit, not just on the surface). Pairs with the orbit/disposal layer below.

## New systems / layers

- [~] **Lunar-orbit / disposal layer.** Prototype an orbital dimension:
  crash-disposal targeting, keep-out interaction between orbital and surface
  zones, and ejecta-to-orbit coupling (a surface event throwing material that
  matters in orbit). Cite Phil Metzger's dust/ejecta work as the physical basis
  (find and verify the specific papers before citing). This is the largest item
  here, effectively a second board coupled to the surface board.
  STATUS (v133): the pure foundation is BUILT and tested (src/sim/orbit.js):
  orbital objects + ground projection, graveyard-vs-crash disposal, mass-scaled
  surface debris keep-out (reusing the {x,y,r} zone shape), ejecta-to-orbit
  coupling, and transient-debris decay. Physical numbers are placeholders in
  ORBIT_TUNING pending ejecta-model calibration (no Metzger figures fabricated).
  NEXT INCREMENTS: (a) DONE v134 -- crash disposal wired into the
  satellite_disposal inject; the cheap-disposal choice now drops a real surface
  debris keep-out zone (renders + decays over rounds). (b) DONE v203 -- debris
  zones feed the violation tally: at round end, each asset operating inside a
  crash-debris keep-out is charged one safety violation (SCORE_PENALTY_VIO),
  logged to the mission record (orbit.debrisViolationCount, tested). REMAINING: (c) a
  fuller orbital overlay/render (orbital bands, not just surface debris);
  (d) connect the strategic-reserve scenario's orbital depot dimension.

## Research threads (read before speccing)

- [~] **Lunar Development Corporation / Cooperative.** Look into Michael
  Castle-Miller's work (Open Lunar link) on resource-sharing models. May inform a
  cooperative-institution actor or a new governance-analogue scenario template
  alongside the existing ATCM / ITU ones.

## Coordination (not code)

- [coord] **Send the tool when release-ready; offer a download.** Flag the
  **July 8 OLF fellowship showcase** as the target. He is open to a second
  conversation, line that up. (This is a personal action: the repo is
  clone-ready and the latest zip is a complete build; the actual send and the
  showcase scheduling are yours to own.)

---

### Notes on sequencing

The most self-contained, immediately codeable items (build against systems that
already exist) are the **national-security inject**, the **first-mover-gets-it-
wrong path**, and the **intertemporal disposal inject**, all extend the current
inject + safety-zone machinery. The **strategic-reserve scenario** and the
commercial-actor re-spec are medium lifts. The **orbit / disposal layer** and the
**actor disaggregation** are the big architectural pieces and deserve their own
design passes. The PNT actor, the Lunar Development Corporation thread, and the
emerging-state revisit need external sources or a design decision first, which is
why they are marked `[~]` rather than `[ ]`.
