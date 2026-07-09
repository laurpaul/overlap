# Lunar Policy Sandbox · LAN Multiplayer Edition · v45

A browser-based governance simulation for exploring Designated Lunar Area (DLA) policy regimes in the lunar south pole permanently shadowed regions. Branded in The Both: Spectral + Bricolage Grotesque, periwinkle / mist / blue-lavender / deep violet.

## What's new in v45

### Workshop-prep pass (text + readouts)

**Temperatures in Kelvin, not normalized percentages.** The hover terrain readout used to say `temp 53%`, which meant nothing to a workshop participant. Now reads `145K` with descriptive color (blue for <110K cold-trap regime, white for shadowed terrain 110-180K, gold for sunlit terrain >180K), plus a `cold trap` annotation when the pixel sits below the 110K water-ice trapping threshold. Scale calibrated to Paige et al. 2010 south polar Diviner maps (~25K to 300K linear from the normalized texture). Same fix applied in `ExploreSidebar` so the click-to-analyze popout shows `108K (cold trap, water-ice stable)` instead of `very cold (32%)`.

**Hydrogen labeled correctly.** The hover readout previously labeled the LEND/LCROSS hydrogen distribution as `H₂O`, implying water composition. It's hydrogen abundance, relabeled to `H`. Added a small `LOLA · LEND · Diviner` data-source attribution line so workshop participants and researchers know what they're looking at.

**Asset detail panel shows lat/lon, not raw pixels.** Clicking on Shackleton's habitat used to show `Position (622, 619)`, debug coordinates. Now shows `89.66°S, 129.2°E` via `pxToLatLon`. Applied to all five asset kinds (rover, habitat, solar, reactor, pad).

**Mission log uses named craters.** `crater #14` replaced with `Shackleton` (etc.) wherever the mission log displays a crater reference. New resolver `craterName(craterIdx)` in `src/sim/labels.js` matches the simulation's PSR-extracted crater id to the closest IAU-named crater from `CRATER_LABELS` by centroid (30 px / ~15 km tolerance, returns null for unnamed PSRs). Surfaces in the live event log AND the `Ice mined: ... from Shackleton` event labels. 4 new unit tests cover the resolver.

**Mission log shows "latest 60 of 240" when truncated.** Previously displayed `240 events` while only showing the last 60, leading workshop facilitators to wonder where the rest went. The CSV export still includes everything; the panel now makes the truncation explicit.

**Layer-toggle definitions consolidated.** Settings screen and HUD strip each had separate literal arrays with mismatched labels (settings: "Mine Heat" / "Night Cycle" / "PSR Tint"; HUD: "Heat" / "Night" / "Grid") and *different* sets of toggles. Extracted to a module-level `LAYER_TOGGLES` constant with `short` and `long` labels. Both views now consume the same definitions in the same order. Bug fix as a side effect: the `grid` toggle was missing from settings, `psr_depletion` was missing from the HUD, both now show in both places.

**ErrorBoundary made workshop-safe.** The previous error UI was a wall of salmon-pink stack trace at the top of the page, would panic a participant mid-session. Now: calm message ("Something glitched · the simulation hit an unexpected state · your session and mission log are still intact"), prominent "Resume session" button, and the technical stack hidden behind a "Show technical details" disclosure for the facilitator or Tommy.

**Round-summary export pluralizes counts.** "3 panel · 1 reactor · 2 habitat" → "3 panels · 1 reactor · 2 habitats". Small but visible in every workshop printout.

### Map interactions

**Legend ↔ map cross-highlight, both directions.** Hovering a legend row dims the rest of the map and re-strokes the matched feature with a pulsing halo (post-blit pass in display coords, ~one fillRect + a few arcs per frame). Hovering a region on the map now also lightly emphasizes the corresponding legend row -- a softer cue (subtle background tint, brighter text, no row dim) that doesn't compete with the user's exploration. The map-side hint covers the broad terrain categories (PSR fresh/depleted, ridge, claim regions, comms blackout) and derives them from the same `PSR_MASK`/`RIDGE_MASK`/`EARTH_VIS_MAP` samples already computed for the hover terrain readout, so no extra per-frame cost.

### Multiplayer + facilitator panels

**Chat drawer shows timestamps and autoscrolls.** Server was already stamping `ts: Date.now()` on every message but the UI ignored it. Each message now shows `HH:MM` next to the sender name so facilitators can cross-reference chat moments with mission-log rounds during debrief. New messages autoscroll into view when the drawer is open.

**Facilitator inject deck has visible bullets.** Each scenario inject (solar flare, dust storm, ITAR review, etc.) lists 2-3 effects that were rendering as flat indented text without bullet markers. Effects now show with proper bullet points. Stale comment about `onPush` signature also corrected.

## TODO for v46

- **NASA Phase 1 scenario preset.** A pre-built initial-asset layout matching the published NASA Moon Base Phase 1 graphic (CLPS landers → pads, VIPER/LTV/robotic mobility → rovers, central base site → habitat). Distinct from the existing governance presets which only vary time/economy. Open question: orbital infrastructure (Capstone-2, comm relay constellation) is currently abstracted into the surface `comsat` -- needs either a new orbital-asset layer or an explicit caveat in the scenario blurb.
- **Reverse hover for safety zones.** Current reverse-hover handles terrain categories (PSR, ridge, claims, blackout) but not asset safety zones -- those need a per-frame hit-test against every placed asset, may need debouncing.
- **First-time-participant tutorial overlay.** The help overlay currently lists keyboard shortcuts only; first-time participants pressing `?` learn how to use the keyboard, not how to play. Needs a separate guided-tour overlay distinct from the shortcuts panel.

## What's new in v44

**Architecture refactor.** The 11,917-line `App.jsx` monolith is now broken into focused modules. The simulation core lives in `src/sim/` as framework-free pure JS, and the React UI lives in `src/ui/` with one panel per file. `App.jsx` is down to ~9,150 lines (-23.2% so far) and continues to shrink as more panels move out. Behavior is unchanged. Next-round work enabled by this: tests against the sim core, hot-reload that only rebuilds the file you're editing, and parallelizable feature work that doesn't fight a 12k-line merge target.

`src/sim/` contains:
- `constants.js` -- all physics / economy / time / safety constants
- `stakeholders.js` -- the five archetypes (two core coalitions / Large Co / Small Co / Observer)
- `mapData.js` -- LRO map buffers, loaders, projections, comms + comsat sampling
- `physics.js` -- rover slope and power factors, per-pixel terrain analysis
- `economy.js` -- ΔE / ΔR / ΔM formulas, player factory
- `power.js` -- daily power allocation across panels, reactors, rovers, habitats
- `autoTarget.js` -- `pickRoverTarget` (rover route selection with hysteresis)
- `viewport.js` -- `computeAutoFitViewport` (cinematic camera framing)
- `simDay.js` -- the per-day simulation step + claim map
- `utils.js` -- geometry, downloadBlob, isNight, etc.
- `index.js` -- barrel re-exports

`src/ui/` contains: `RoleBanner`, `ChatDrawer`, `HelpOverlay`, `MissionLogPanel`, `AnalyticsPanel`, `PhysicsParametersPanel`, `GifReadyModal`, `AssetDetailSidebar`, `ExploreSidebar`.

**Tests.** `npm test` runs 164 unit and integration tests against the sim core, using Node 22's built-in test runner (zero dependencies). Tests cover:
- Slope physics curves (rover speed / power factors)
- Economy formulas (ΔE, ΔR, ΔM, competitiveness, R&D mine bonus, mil score)
- Player factory + stakeholder cost modifiers
- Geometry (stepToward, isNight, hasPlacementGrace, lat/lon projection)
- Comms blackout + comsat relay sampling
- `simDay` against a synthetic 5×5 PSR fixture: mining on arrival, recharge dwell trapping, recharge dwell actually charging, pixel-hop on depletion, hysteresis band sanity, slope-stall, deposit, pickup, BASE_MINE_RATE override scaling, mineMap respect on input, mineMap accumulation across chained calls
- `computeClaims` Voronoi correctness inside PSR pixels
- `pickRoverTarget` (17 tests): hysteresis at all four state corners, nearest-home selection, destroyed-pad skipping, solar/reactor as recharge homes, ice-full return, aim-snap to PSR along bearing, idle autoseek, mineX/mineY vs centroid for C-shaped craters, null safety
- `computeAutoFitViewport` (12 tests): focus-pulse override, setup-phase focus on just the placing player, weighted centroid, zoom clamping at both ends, pan centering math, every asset-array shape, non-finite coordinate skipping
- `scorePlayerState` (10 tests): null safety, deposited-ice weight, primary/extra rover carry-bonus, volatiles, asset points, score adjustments, safety violations, full composite formula
- `allocateDailyPower` (2 tests): destroyed extra rovers receive no power; happy-path charging
- `analyzePixel` (15 tests): out-of-bounds null; solar / habitat / reactor / pad / rover verdicts at each threshold; mining (PSR-only) branch; output schema (6 asset types + lat/lon + raw fields)
- `buildEnemyZones` + `pointInAnyZone` (13 tests): null safety; destroyed-structure exclusion at all 5 types; legacy single `landingPad` field support; radius math at each safety-radius constant; point-in-zone detection with strict `<` boundary; insertion-order tie-break
- `pickMergedGridState` (7 tests): neither-changed identity short-circuit, only-P1 / only-P2 / both-changed cases, more-active-mode tie-break, both-decouple-from-shared agreement, offered-role-swap detection
- `buildPlotDefinitions` (10 tests): empty input → empty array, schema validation, canonical plot ids present, per-day collapse (multiple frames at same globalDay), x-label format, score series tracks iceDeposited, two-player series, log-driven mining accumulation

Run with `npm test`. Each test pins one of the historical bug classes from v15-v20 of the changelog so the next regression gets caught before it ships.

**Latent bug fix: ICE_MASS_FRACTION slider now actually does something.** The Physics Parameters panel surfaced a slider for `ICE_MASS_FRACTION`, but the simulation never read it. `BASE_MINE_RATE` was computed at module-load time from `ICE_MASS_FRACTION`, then the override path only consumed `BASE_MINE_RATE` directly. Facilitators dragging this slider during a workshop demo got no behavior change. Fixed: when `physOverrides.ICE_MASS_FRACTION` is set but `BASE_MINE_RATE` is not, `stepPlayer` scales `BASE_MINE_RATE` proportionally before passing to `simDay`. A new test confirms 2× BASE_MINE_RATE produces 2× ice (ratio = 2.000 exactly).

**Latent bug fix: dead generator-routing block in simDay.** Lines 1028-1083 of the old `simDay` built `const generators = []` and then iterated over the empty array. The entire per-panel routing block was unreachable. The real allocation lives in `allocateDailyPower`. Removed the dead code with a comment explaining why, so a future contributor doesn't "fix" it into a habitat-power double-drain.

**Latent bug fix: `applyReactorPlacementPenalty` was a no-op.** Both the live-sim and batch-sim paths had a function that counted `nearby` enemy structures around a new reactor and then discarded the count, returning `playerState` unchanged regardless. Renamed the live version to `onReactorPlacement` and simplified to an explicit noop with a comment explaining why reactors don't apply landing damage (their 3-ring zone is meant to be coordinated; ongoing damage is handled by `applyDecay`). Deleted the duplicate `applyPureReactorPlacementPenalty` in the batch path and its orphaned `countNearbyEnemyStructuresState` helper. Behavior unchanged; intent now legible.

**Diagnostic: primary rover health is dead state.** Discovered while auditing `applyDecay`: `structureHealth.primaryRover` is written every endTurn but never read by any rendering, status, or scoring path. The primary rover is effectively invincible to safety-zone decay. Extra rovers ARE damaged correctly. Could be intentional ("don't let passive decay kill the player's avatar") or a missed wire-up. Behavior preserved; flagged in code comment so a future maintainer can decide.

**Extracted: `PlotsPanel` UI component.** The 84-line inline plots panel (Analysis Plots collapsible with per-plot PNG export, separate-plots toggle, and PlotCanvas embedding) is now `src/ui/PlotsPanel.jsx`. Takes 11 props: visibility, close handler, plot definitions, plot canvas refs, separate-plots state + setter, downloadCanvasPng, exportAllPlots, buildSeparatePlot helper, PlotCanvas component, source label. The plot rendering uses passed-in `PlotCanvas` and `buildSeparatePlot` so the panel stays decoupled from canvas drawing internals.

**Extracted: `RoundTransitionBanner` UI component.** The 27-line inline end-of-round banner ("Round Concluded" → "Round N" overlay) is now `src/ui/RoundTransitionBanner.jsx`. Takes one prop (`roundTransition`). Renders nothing when null. Cleanest possible extraction.

**Extracted: `buildMissionLogCsv` + `buildMissionStateJson` pure helpers.** The CSV builder and the state-snapshot JSON builder moved to `src/sim/exports.js` alongside `buildRoundSummaryText`. App.jsx now has thin wrappers (5-10 lines each) that build the inputs and trigger the download. The extraction surfaced a latent bug: `cratersHeavilyDepleted` used `(craterHealth[ci] || 1) < 0.2`, which miscounted a fully-depleted crater (health = 0) as not depleted because `0 || 1` = 1. Now uses `?? 1` for a correct nullish check. **9 new tests** cover header format, kg formatting to 2 decimals, missing-fields handling, player asset count flattening, and the depletion threshold edge case (`0`, `0.05`, `0.19`, `0.2`, `0.21` boundary).

 The 39-line inline scorebar JSX (P1 score · round counter · P2 score) is now `src/ui/Scorebar.jsx`. Takes 11 props (label fn, scores, ice totals, share, both players, depleted count, workshopMode, totalCraters). No behavior change. The cells array building was kept inside the component since it's data-config close to the render.

**Extracted: `buildRoundSummaryText` pure helper.** The 90-line `exportRoundSummary` body had no React state -- it just read game state and built a text string. Moved to `src/sim/exports.js` as a pure function; the App.jsx wrapper is now a 12-line wrapper that calls it and triggers the download. 10 new tests pin the contract: header format, day/round indexing (1-based display vs 0-based state), conditional sections (skip ACTOR II if p2 is null, omit violations section if empty), single-vs-plural "breach" agreement, current-round event filtering, truncation notice at >20 events, footer attribution + version, infrastructure-row asset counting.

**Perf: `handleMouseMove` no longer re-renders on sub-pixel cursor movements.** Was creating a new `{x, y}` object on every mousemove event. Now uses a `prev` comparison and bails when pixel coordinates haven't changed. Same for consecutive out-of-bounds events.

 Was `setHover(x>=0&&x<W&&y>=0&&y<H ? {x,y} : null)` which created a NEW `{x, y}` object on every mousemove event. Even when the cursor stayed within the same source pixel (sub-pixel CSS-px movement), React saw a new reference and triggered the draw effect. Now the setter uses a `prev` comparison and bails out when the pixel coordinates haven't changed. Same applies to consecutive out-of-bounds events (stays `null` rather than allocating).

**Refactor: renamed `d2` → `dist` everywhere for accuracy.** The `d2` helper in `src/sim/utils.js` returned Euclidean distance (via `Math.sqrt`), not distance-squared as the name suggested. All 44 callsites across `src/`, `src/sim/`, `src/ui/`, and `tests/` were consistent (comparing against linear radii), so the misnaming was harmless but confusing. Now renamed to `dist`. The rename uncovered several latent issues caused by the symbol overlap with local variables that were already named `dist` (some held numbers, some held squared distances):

- `stepToward` (utils.js) had `const dist = d2(...)` -- the local shadowed the imported function and would TDZ-crash. Renamed local to `d`.
- Two more local `const dist = d2(...)` patterns in App.jsx (panel→habitat tether render, hover tooltip) -- same fix.
- `jitterToward` had `const dist = number; ... d2(clamped, crater)` -- after the rename, the function call would have hit the local number. Renamed local to `d`.
- `estimateTravelPowerCost(dist, ...)` had a parameter named `dist` that would shadow the imported function. Renamed parameter to `d`.
- `assetAt` had `const dist = dx*dx + dy*dy` -- semantically actually *squared distance* despite the inconsistent name. Renamed to `dSq` / `bestDSq` for accuracy.
- History record's `d2:` field was a P2-suffix (parallel to `d1`, `dep2`, `bud2`), not a distance -- restored to `d2:` and the matching `AnalyticsPanel.jsx` accessor.

All 145 tests still pass; build clean.

**Hardening: clamp health-bar width to [0, 1].** The `drawHealthBar` helper used `Math.max(0, health)` but no upper clamp. The structure-health data SHOULD already be bounded (applyDecay clamps, resupply caps at 1.0), but a future over-supply buff or stale-state edge case could plausibly exceed 1.0 and produce a bar wider than its background rect. Now clamps both ends; the color thresholds also use the clamped value so they stay stable.

 The `drawHealthBar` helper used `Math.max(0, health)` but no upper clamp. The structure-health data SHOULD already be bounded (applyDecay clamps, resupply caps at 1.0), but a future over-supply buff or stale-state edge case could plausibly exceed 1.0 and produce a bar wider than its background rect. Now clamps both ends; the color thresholds also use the clamped value so they stay stable.

**Perf: mission-log render now slices the tail instead of cloning the whole array.** `MissionLogPanel` was `[...missionLog].reverse().slice(0, 60)` -- with 500+ events in a long workshop, that's a 500-element spread copy + 500-element reverse on every render. Changed to `missionLog.slice(-60).reverse()` so the work is bounded to 60 elements regardless of log length. Same output, much less garbage.

**Dead-code removal: `setSelf` variable in `landingImpact`.** Declared at the top of the function but never used in the body. Likely a tombstone from an earlier design where landings credited the attacker with damage points; current scoring derives military assessment from milScore, not from attack-event credits, so the hook was orphaned.

**Correctness fix: closed a whole class of "done player still acts" bugs.** A done player (one who has ended their turn but is waiting for the other player to commit before the day resolves) could still modify their state through several unguarded code paths. The toolbar UI greys out controls via `disabled={isDone}`, but the underlying state-mutation functions had no gate -- any peer-action handler, asset-detail action, or stale UI element could mutate state. Fixed all of these:

1. `commitAimDirection` (rover drag-to-aim)
2. `clearWaypoints` (sidebar button)
3. `buildStructure` (palette buy + resupply)
4. `buildAndPlaceAt` (drag-and-drop placement)
5. The `selectingFor` click branch (set-waypoint mode)
6. The `placingFor` click branch (legacy click-to-place)

Each entry point now refuses if the issuing player is done. Mission-log entries from purchases stay intact since they're appended at buy time (before the placement click commits).

 A done player (one who has ended their turn but is waiting for the other player to commit before the day resolves) could still modify their state through several unguarded code paths. The toolbar UI greys out controls via `disabled={isDone}`, but the underlying state-mutation functions had no gate -- any peer-action handler, asset-detail action, or stale UI element could mutate state. Fixed all of these:

1. `commitAimDirection` (rover drag-to-aim)
2. `clearWaypoints` (sidebar button)
3. `buildStructure` (palette buy + resupply)
4. `buildAndPlaceAt` (drag-and-drop placement)
5. The `selectingFor` click branch (set-waypoint mode)
6. The `placingFor` click branch (legacy click-to-place)

Each entry point now refuses if the issuing player is done. Mission-log entries from purchases stay intact since they're appended at buy time (before the placement click commits).

**Refactor: AssetDetailSidebar's "Clear waypoints" button now routes through `clearWaypoints`** instead of directly calling `setP1`/`setP2`. This automatically inherits the new `isDone` gate. The button itself also hides when the player is done. Same outcome via the cleaner route through the gated path.

**UX: ESC now cancels an in-progress placement.** Added `placingFor`/`placingType` clearing to the ESC priority chain (showHelp → assetDetail → roverDrag → exploreClick → exploreMode → placingFor). Previously, after buying a structure, the only way to cancel was to click somewhere on the map and commit the placement. Now ESC cleanly cancels. The mission log entry from the purchase stays, but no economic effect: payment is deducted at click-confirmation time, not at buy time, so a cancelled placement is free.

 Added `placingFor`/`placingType` clearing to the ESC priority chain (showHelp → assetDetail → roverDrag → exploreClick → exploreMode → placingFor). Previously, after buying a structure, the only way to cancel was to click somewhere on the map and commit the placement. Now ESC cleanly cancels. The mission log entry from the purchase stays, but no economic effect: payment is deducted at click-confirmation time, not at buy time, so a cancelled placement is free.

**Correctness fix: rover recharge now prefers actual generators over the co-location heuristic.** `pickRoverTarget`'s recharge-home list mixed pads, habitats, panels, and reactors and picked the nearest. But panels/reactors are the ONLY actual recharge sources -- power flows from them to in-range rovers/habitats via `allocateDailyPower`. Pads and habitats are themselves consumers; they only "recharge" a rover when they happen to be parked near a generator. The old code routed to the nearest pad/habitat in many layouts, gambling that it was close enough to a panel. Now: pass 1 picks the nearest functional panel or reactor; only if none exist does pass 2 fall back to pads/habitats so the rover heads home and dies visibly rather than wandering. 2 new tests pin the new ordering (generator wins over closer pad, fallback engages when no generators exist).

**Symmetry fix: batch sims now include `primaryRover` in safety-zone decay, matching live.** `applyDecayToOwner` (headless) only iterated over panels, reactors, habitats, extraRovers, landingPads -- but `applyDecay` (live) ALSO included `{ key: 'primaryRover', list: [{ x, y }], type: 'rover' }`. The primary rover projects a 1.44 km safety zone whose violations are added to the owner's `safetyViolations` count, which then docks score. Effect: bot Monte Carlo `safetyViolations` counts were systematically lower than equivalent live games, biasing win-rate analytics. Now matches live. `structureHealth.primaryRover` remains dead state (per the long-standing comment) so no other behavior changes.

**Polish: `stalled` rover status now has a STATUS_INFO entry.** `simDay` set `status = "stalled"` when a rover hit an impassable slope (≥25°, where `roverSlopeFactor` returns 0), but no `STATUS_INFO.stalled` entry existed. The 3 downstream renderers used `STATUS_INFO[s] || STATUS_INFO.idle` and silently displayed "Idle", leaving workshop users wondering why their rover stopped on a steep crater rim. Now surfaces as an explicit warning so the player knows to re-aim.

**Performance: extended the missionLog/annotations reference-share optimization to `history`, `lastEvents`, and the replay `applyFrameSnapshot` path.** All five arrays are append-only on the live side (entries pushed via `[...prev, newEntry]`, never mutated), so the snapshot can safely share references rather than deep-cloning each entry. With ~50 undo entries × ~500 events × 5 arrays, this eliminates another ~10k shallow clones per checkpoint cycle on top of the savings from the prior pass.

**Correctness fix: comsats applied landing damage on placement.** Both placement paths (click-to-place, drag-to-place) called `landingImpact(pi, x, y)` after creating any non-reactor structure, including comsats. But comsats are smallsat relays deployed from orbit -- they have no `SAFETY_RADIUS` entry in constants.js and no physical landing footprint. Effect: a player could "attack" enemy infrastructure by deploying comsats on top of enemy habitats/panels/reactors -- each placement dealt LANDING_DAMAGE to every enemy structure whose safety zone contained the comsat coordinates. With a 14 km habitat safety radius, this is a wide-reaching exploit. Fixed both paths to skip `landingImpact` for comsats, matching how reactors are handled (explicit branch with rationale comment).

 Both placement paths (click-to-place, drag-to-place) called `landingImpact(pi, x, y)` after creating any non-reactor structure, including comsats. But comsats are smallsat relays deployed from orbit -- they have no `SAFETY_RADIUS` entry in constants.js and no physical landing footprint. Effect: a player could "attack" enemy infrastructure by deploying comsats on top of enemy habitats/panels/reactors -- each placement dealt LANDING_DAMAGE to every enemy structure whose safety zone contained the comsat coordinates. With a 14 km habitat safety radius, this is a wide-reaching exploit. Fixed both paths to skip `landingImpact` for comsats, matching how reactors are handled (explicit branch with rationale comment).

**Polish: `stalled` rover status now has a STATUS_INFO entry.** `simDay` set `status = "stalled"` when a rover hit an impassable slope (≥25°, where `roverSlopeFactor` returns 0), but no `STATUS_INFO.stalled` entry existed. The 3 downstream renderers (sidebar rover panel, on-map status badge, HUD) used `STATUS_INFO[s] || STATUS_INFO.idle` and silently displayed "Idle", leaving the workshop user wondering why their rover stopped on a steep crater rim. Now surfaces as an explicit warning ("Stalled", warning icon, pink color) so the player knows to re-aim.

 `pickRoverTarget` rule 1 ("ice ≥ 95% → return") was returning the nearest landing pad. But pads are for PICKUP -- they're where deliveries land for the rover to ferry to a placement spot. Deposits happen at HABITATS (see simDay.js line ~124: `atHabitat && ice > 0 → ice = 0; status = depositing`). A full rover sent to a pad would arrive, sit, and never deposit -- its status stayed at "carrying" / "idle" until power ran out. Fixed: route to nearest functional habitat first, fall back to pad only if no functional habitats exist (so the rover at least parks somewhere visible rather than stranding on PSR ice). 2 new tests pin the routing fix; 1 existing test was renamed for the new semantics.

**Performance: removed deep-clone of `missionLog` and `annotations` from undo capture/apply.** Both arrays are append-only on the live side (entries are pushed via `[...prev, newEntry]`, never mutated). The old `missionLog.map(ev => ({ ...ev }))` did a shallow clone of every entry on every checkpoint -- with ~50 undo entries and 500 events in a long workshop session, that's ~25k clones per checkpoint cycle. Now zero. The snapshot stores the array reference directly; subsequent appends spread onto a new array so the old reference stays valid.

**Hardening: GIF blob URL now revoked on unmount as well as on dismiss.** The `dismiss` handler in `GifReadyModal` was the only path that called `URL.revokeObjectURL`. If the modal unmounted for any other reason (parent re-render that drops it, hot-reload during dev, future route change), the blob URL leaked. Added a `useEffect` cleanup that revokes on unmount or URL change. Double-revoke is a silent no-op, so the explicit dismiss path is unaffected.

**Dead-code cleanup: removed `p.extraPads`, `p.solarPanels`, `p.miners`, and the `WEIGHTS.miner` table entry.** None of these fields are ever set anywhere in the codebase. `extraPads` showed up in 3 places (hit-test, sidebar items, viewport collect-points). `solarPanels` was used as a fallback (`p.panels || p.solarPanels`) in 3 places. `miners` only existed in the viewport autofit weights table. All were tombstones from older designs.

**Correctness fix: `simDay` was dropping `structureHealth.comsats` on every game day.** Same pattern that I fixed in three other places earlier (`clonePlayerState`, `applyDecay`, resupply). The local `structureHealth` working copy enumerated only the 5 array keys simDay actually mutates (panels, reactors, habitats, extraRovers, landingPads), and the return statement spread that working copy over `s`, clobbering the original `structureHealth.comsats` (and any future keys). Fixed by spreading `s.structureHealth` first so untouched keys survive the simDay round-trip. With this, all four players-mutate-structureHealth paths (clone, decay, resupply, simDay) now correctly preserve unenumerated fields.

 Same pattern that I fixed in three other places earlier (`clonePlayerState`, `applyDecay`, resupply). The local `structureHealth` working copy enumerated only the 5 array keys simDay actually mutates (panels, reactors, habitats, extraRovers, landingPads), and the return statement spread that working copy over `s`, clobbering the original `structureHealth.comsats` (and any future keys). Fixed by spreading `s.structureHealth` first so untouched keys survive the simDay round-trip. With this, all four players-mutate-structureHealth paths (clone, decay, resupply, simDay) now correctly preserve unenumerated fields.

**Hardening: `clonePlayerState` is now future-proof against new `structureHealth` keys.** Previously enumerated each key explicitly (which is how comsats slipped through before v27). Now spreads `player.structureHealth` first, then defensively re-clones the known arrays. New `structureHealth` keys added in the future will be carried through automatically without needing a clone-function update.

**Dead-reference cleanup: `src/sim/viewport.js` still referenced the removed `SETUP1_HAB / _SOL / _PAD / SETUP2_*` PHASE constants.** Those expressions evaluated to `undefined` after the earlier constants-cleanup session, so the comparisons silently no-op'd. The function still worked because the live `PHASE.SETUP1` and `PHASE.SETUP2` were also checked, but the dead alternatives were tombstones. Simplified `isSetupForP1` / `isSetupForP2` to single-equality checks.

**Correctness fix: parallel mining merge was discarding one player's depletion contribution.** When both players mine on the same day, `stepPlayer` is called twice (once per player) against the same pre-day craterHealth snapshot. Each call returns a fresh post-mining craterHealth. The old merge took `Math.min(_ch2[i], ch3[i])` -- i.e., the more-depleted value. Effect: if both players mined the same crater, only one player's contribution to crater depletion was recorded. The crater appeared half as depleted as it actually was. Both players still got their full ice in `iceDeposited` (those are independent counters), so co-mining was effectively a free crater-conservation bonus. Fixed by combining the two depletions: `ch3[i] = max(0, min(1, _ch2[i] + ch3[i] - ch[i]))` so each player's contribution counts toward the shared depletion. Applied to both live and headless paths. A related issue (each player's `mineMap` being independent, allowing co-mining a pixel beyond its per-day cap) is documented in code as a future refactor candidate.

 When both players mine on the same day, `stepPlayer` is called twice (once per player) against the same pre-day craterHealth snapshot. Each call returns a fresh post-mining craterHealth. The old merge took `Math.min(_ch2[i], ch3[i])` -- i.e., the more-depleted value. Effect: if both players mined the same crater, only one player's contribution to crater depletion was recorded. The crater appeared half as depleted as it actually was. Both players still got their full ice in `iceDeposited` (those are independent counters), so co-mining was effectively a free crater-conservation bonus. Fixed by combining the two depletions: `ch3[i] = max(0, min(1, _ch2[i] + ch3[i] - ch[i]))` so each player's contribution counts toward the shared depletion. Applied to both live and headless paths. A related issue (each player's `mineMap` being independent, allowing co-mining a pixel beyond its per-day cap) is documented in code as a future refactor candidate.

**Defense-in-depth: `computeClaims` could crash on null p2 (or p1).** The function used `p?.active !== false` which returns true for a null player (`null?.active` is `undefined`, `undefined !== false` is true), then tried `p.x` and crashed. The current call site guards on `p1 && p2`, so the bug is latent -- but the function should be self-protective. Now uses `!!p && p.active !== false`. Two new tests cover null-p1 and null-p2 cases.

**Correctness fix: destroyed structures still earned the owner safety-zone violations every turn.** `applyDecay` (and its headless twin `applyDecayToOwner`) was counting `inZone` violations for structures at health 0 -- owners kept getting penalized each turn for "wreckage" that no longer enforces a safety zone. The extracted `enemyZones.js` had already settled on `health <= 0.1` as the "destroyed" threshold; both decay paths were inconsistent and never filtered, so they earned penalties indefinitely. Effect: owners of damaged-to-zero infrastructure got compounding score penalties for enemies passing near the ruins. Worst case in late-game scoring: an Actor I who had three habitats destroyed early could keep accruing violations on those exact tiles all the way through round 12, dragging their final score below where it should have been by 75+ points. Fixed in both paths: structures at `health <= 0.1` skip the zone check entirely and only accumulate passive decay. The visual decay rendering, pickup logic, and bot AI are unchanged.



**Dead-code removal: six unused PHASE constants and their corresponding dead branches.** Discovered while auditing the click handler: `SETUP1_HAB`, `SETUP1_SOL`, `SETUP1_PAD`, `SETUP2_HAB`, `SETUP2_SOL`, `SETUP2_PAD` were defined in `src/sim/constants.js` and checked in several `phase===` chains, but nothing in the codebase ever SET them. They were tombstones from an earlier multi-step setup wizard that had been replaced by the current single-click `SETUP1 → SETUP2 → PLAYING` flow. Removed the 6 constants, 16 lines of dead branches in `handleClickAt`, 6 dead help-message lines in the phase prompt, 6 dead `phase===` chains across two peer-action handlers + one cursor expression. ~40 lines net deletion; bundle size drops ~1 KB.



1. `clonePlayerState` explicitly listed only 5 health-array keys (`panels`, `reactors`, `habitats`, `extraRovers`, `landingPads`, `primaryRover`), so `comsats` was silently dropped on every clone. Affects every undo, save/load, batch sim, replay frame.
2. `applyDecay` (live + headless) built a fresh `newSH` containing only the 6 keys it processed and then overwrote `structureHealth` with it. Every turn, comsat health was wiped.
3. `buildStructure` resupply branch had the same pattern: `newSH` had only the 5 resuppliable keys, then `structureHealth: newSH` overwrote the whole object.

Comsats currently aren't damaged by any combat path (no `SAFETY_RADIUS.comsat`), so this was mostly latent -- but the architecture had three independent places throwing away tracked state. Fixed all three sites: `clonePlayerState` now deep-clones `comsats` array and `structureHealth.comsats`; `applyDecay` and resupply both spread the original `sh` before assigning the changed keys. Same fix pattern protects any future `structureHealth` field added without updating all consumers.

**Extracted: 440-line `plotDefinitions` memo to `src/sim/plotData.js`.** This was the largest single extraction of v27. Pure data transformation: takes `{frames, log}` and returns an array of plot definitions ready for canvas rendering. The body had zero React, no closure refs to outer state -- only frame properties (`f.globalDay`, `frame.p1`, `frame.p2`). The dep array previously listed 7 closure-captured state values (`p1`, `p2`, `physOverrides`, `round`, `day`, `globalDay`, `history`) that were never actually read. Now the memo is a one-liner: `useMemo(() => buildPlotDefinitions(plotSource), [plotSource])`. 10 new tests pin the contract: empty-input handling, schema validation, canonical plot ids present, per-day collapse (multiple frames at same globalDay), x-label format (`D1`..`DN`), score-series tracks iceDeposited, two-player series, log-driven mining accumulation.

**Extracted: `structureLabel` to `src/sim/labels.js`.** Tiny 8-line lookup table used in 10+ places across App.jsx, mission logs, plot data builder, and asset placement code. Now lives in a tiny dedicated module so the extracted `plotData.js` can import it without dragging in any React state.

**Cleanup: removed a third inline copy of `buildEnemyZones`.** Found another 29-line duplicate inside the canvas click handler (waypoint placement: "snap click to perimeter if user clicked inside a no-go zone"). Replaced with the extracted `buildEnemyZones` + `pointInAnyZone` from `src/sim/enemyZones.js`. Same semantics, three fewer copies of the same loop.

**Correctness fix: bot batch sims gave P2 an information advantage.** `simulateBotGame` called `planBotTurn(sim, 0); planBotTurn(sim, 1)` sequentially -- P2's plan ran against P1's just-committed state, so P2 could see P1's freshly placed structures and chosen rover waypoints before deciding its own moves. The live game commits both players simultaneously via `resolveHeadlessDay`. Effect: Monte Carlo win-rate stats systematically favored Player 2. Fixed by snapshotting `presim`, running both bots against that same baseline, then merging each player's slot back. A new `pickMergedGridState` helper resolves the rare case where both bots changed the shared powerGridState in the same turn (prefers the more-active mode: shared > offered > independent). 7 new tests in `sim.test.js` pin the merge logic.



**Bug fix: `getPendingPickupTarget` could route a rover to a destroyed pad.** The bot helper that picks the nearest pad with a pending delivery didn't check `structureHealth.landingPads`. simDay correctly refuses pickup at a destroyed pad, so the rover would arrive and sit there. Now filters destroyed pads out of the candidate list before sorting by distance.

**Correctness fix: extra rovers' per-pixel mining tracking was lost between turns.** In `stepPlayer`, each extra rover ran simDay with the primary rover's post-step mineMap as input, but the per-extra mineMap output was discarded -- only `result.mineMap` (primary only) was saved back. Effect: extras would sometimes re-attempt a pixel they'd already mined on a previous day, getting a tiny yield (correctly scaled by depleted crater health, which IS tracked globally) before hopping to a fresh pixel. Inefficient, not catastrophic. Fixed by chaining the mineMap through each extra rover's simDay call in turn, then saving the final running mineMap to mergedResult. Now the second extra sees the first extra's depletions within the same day, and the saved state carries forward all pixels mined by any rover. Pinned by 3 new tests in `simDay.test.js`.

**Correctness fix: two extra rovers could double-pickup the same pad delivery.** Same root cause as the mineMap bug. In `stepPlayer`, each extra rover used to start its `simDay` call with `sForSim.pendingDeliveries` -- the original pre-step list, the same list every other extra also saw. If two extras were both within `ROVER_REACH` (8 px) of the same landing pad, they'd both pick up the same delivery (simDay's defensive array clone meant each rover got its own decremented copy, but both copies started from the same source). The post-loop merge tried to reconcile via per-extra diff against the *original* list, so it couldn't detect the duplicate either. Fixed by chaining `runningPending` through extras the same way the mineMap chain works. 3 new regression tests pin the fix.

**Stale-closure fix: peer-action handlers were capturing fresh-per-render functions.** The `useEffect` that registers all peer-action handlers had a deliberately narrow dep array. The handlers themselves referenced many more functions and state values (`handleClickAt`, `commitWaypoint`, `commitAimDirection`, `buildAndPlaceAt`, `phase`, `placingFor`, `selectingFor`, all the `setSelected*` setters). None of those were in the dep array, so handlers captured stale snapshots -- `mapClick`, for example, could route to the wrong actor if the phase changed since the effect ran. Fixed with a single `latestRef.current` object synced on every render. Handlers now read via `latestRef.current.X(...)`, the useEffect dep array slimmed to `[isHost, mp, registerActionHandler]`, and handlers re-register only when the multiplayer connection actually changes.

**Correctness fix: headless batch-sim safety zone decay missed extra rovers.** The live `applyDecay` checks all enemy rovers (primary + extras) when deciding if an asset is "in zone". The headless equivalent `applyDecayToOwner` in `resolveHeadlessDay` was only checking the primary rover's position. Effect: batch sims under-counted safety-zone violations because an opponent's extra rover sitting in your safety zone caused no damage or violation. Bot Monte Carlo runs diverged from live game behavior. Fixed by passing `p1AllRovers` / `p2AllRovers` arrays into the headless decay function and using the same `.some()` check the live sim uses.

**Tests for `analyzePixel` (15 new tests).** The per-pixel terrain analysis function -- used by the Explore Terrain panel for asset placement recommendations -- had zero test coverage. Added tests covering out-of-bounds returns null, solar verdict by slope and illumination, habitat verdict by slope and Earth visibility, reactor verdict by slope, pad verdict, rover trafficability at slope thresholds, mining (PSR-only) branch, output structure with all six asset types, and lat/lon + raw field round-trip.

**Bug fix: `getBotHub` could return a destroyed habitat.** The bot-AI helper that picks a "hub" location for routing returned `habitats[0]` unconditionally. If that habitat got destroyed by safety-zone decay, the bot would still send rovers there to deposit ice -- and the deposit would silently fail (`simDay` correctly only deposits at functional habitats with `health > 0` and `power > 0`). The rover would waste a trip. Now picks the first functional habitat; only falls through to the planned hub-plan target or base when ALL habitats are destroyed.

**Defense-in-depth: `dispatchAction` local path now wraps the handler in try/catch.** The peer-action receiver at line ~537 already had a try/catch; the LOCAL (single-player or host) path didn't. A thrown action handler -- say, a botched mapClick -- would crash the calling event handler and break the UI. Now caught and logged.

**Bug fix: ESC key cascaded through state clears.** The keyboard handler for ESC was `if (a) setA(null); if (b) setB(null); ...` -- a single ESC press could clear three things at once. Now each branch returns, so each ESC clears exactly one thing in priority order: help overlay → asset detail → rover drag → explore click → explore mode. Matches standard desktop UI conventions.

**Defense-in-depth: `commitAimDirection` now guards on `replayRun`.** The function mutates player state. The UI drag-start path at line ~2452 already gates on replayRun, but the peer-action handler `setAimDirection` could reach this function during replay through the multiplayer wire. Added the guard for end-to-end freeze.

**Undo stack now capped at 50 entries.** Each undo snapshot deep-clones player state, includes craterHealth (a Float32Array) plus history and missionLog -- a few MB per snapshot. Workshop sessions can run 100+ turns; without a cap, memory grows unbounded. 50 is plenty for any realistic "I want to take that back" depth; older snapshots roll off.

**Zoom-cap consistency.** UI zoom buttons capped at 4.0, but the keyboard handler and the auto-fit code capped at 4.5. Unified at 4.5 (matches `MAX_ZOOM_AUTOFIT` from `src/sim/viewport.js`).

**Code-quality cleanups.** Replaced `physOverrides.X != null ? physOverrides.X : DEFAULT` (3 occurrences) with the shorter `physOverrides.X ?? DEFAULT`. Same semantics, less visual noise. Fixed a one-character leading-space typo in `selectOperationalCraters`.

**Correctness fix: HUD score and analytics score were different.** Two parallel scoring formulas had drifted. `scorePlayerState` (used by replay analytics, batch sim ranking, and the plot panel) included a v21 carry-ice bonus -- 50% credit for ice carried by rovers in transit. The HUD displayed score (a separate inline calculation at line 5904) omitted the carry bonus entirely. Workshop participants saw two different numbers for "their score". Unified: the HUD now uses `scorePlayerState` too. Both numbers match.

**Refactor: `scorePlayerState` extracted to `src/sim/economy.js`.** Was a closure inside GameApp; now a pure function with documented constants (`SCORE_PTS_PER_KG`, `SCORE_PTS_PER_AP`, `SCORE_PENALTY_VIO`, `SCORE_CARRY_FRACTION`). 10 new tests cover every component of the formula plus null/empty inputs.

**Correctness fix: destroyed extra rovers were still receiving power.** In `allocateDailyPower`, the target-construction code added a `destroyed` flag for habitats (`health ≤ 0`) but not for extra rovers. Generators would still route to dead rovers, wasting daily output. Fixed by adding the same gate. (Primary rover health is unread -- see the `applyDecay` comment -- so it doesn't get a flag.) 2 new tests pin this.

**Stale-closure fix: peer-action `annotate` handler read `annotations.length` directly.** The handler is registered inside a useEffect with a dep array that doesn't include `annotations`. Each render captures a fresh `annotations` value but the handler stored in `handlersRef.current` keeps a stale closure. Pin numbering would skip or repeat. Fixed by reading the length via the setter's `prev` argument instead.

**DRY: `snapshotSimState` and `snapshotLiveFrame`.** Were nearly identical -- same fields, one read from `sim` object, the other from React state. Factored into a shared `buildSnapshot` helper.

**Stale version label.** `exportRoundSummary` printed `v2.2` in workshop summary exports. Bumped to `v2.7` to match `package.json`.

**Bug audit: 34 unused imports removed from App.jsx.** Earlier refactor work moved logic to `src/sim/` and `src/ui/`, but App.jsx kept importing 31 constants and 3 named imports that were no longer referenced. Removed unused: ALPHA, COMSAT_COVERAGE_BOOST, CRATER_REFERENCE_SIZE, C_W1/2/3, GIF_FPS, HABITAT_POWER_DRAIN, MAP_KM, MAP_LAT_PROJ, NIGHT_CYCLE, PANEL_FLAT, POWER_MINE_DRAIN, RD_MINE_BONUS, ROVER_BATTERY_CAP, ROVER_REACH, ROVER_RECHARGE_FRACTION, ROVER_SPEED, SLOPE_MAP, STARTING_BUDGET, TOTAL_PSR, activatePlayer, calcRdMineBonus, extractCratersFromPSR, getGeneratorOutput, isInCommsBlackout, loadImagePixels, pixLum, roverPowerFactor, roverSlopeFactor, stepToward, packSnapshot, BuildPalette, ASSET_BUILD_TYPES.

**Three more pieces of dead state removed:**
- `illumRef` + `illumLoaded` useState pair + the useEffect that loaded the illumination map into them. The Image was loaded over HTTP but the ref was never read. ILLUM_MAP from sim/mapData.js already loads the same data via loadMapData(). Eliminated one redundant HTTP request and image decode at boot.
- `mapRef` ref. The basemap renders via a sibling DOM `<img>` element gated on mapLoaded, not from a JS reference. Kept the prefetch useEffect (it's useful, and setMapLoaded gates rendering) but removed the dead ref assignment.
- `phys()` helper. A `physOverrides[key] ?? default` wrapper that was defined but never called -- code uses direct property access instead.
- `actorShort` useCallback. Defined but never invoked; presumably leftover from a UI iteration.

**Extracted: `computeAutoFitViewport` to `src/sim/viewport.js`.** The 90-line "cinematic camera" calculation inside the auto-fit useEffect was pure logic (no React state), gated only on inputs. Moved it to a testable pure function with helpful named constants (`TIGHT_ZOOM`, `MAX_ZOOM_AUTOFIT`, `MIN_ZOOM_AUTOFIT`, `PERCENTILE`, weight table). 12 new tests cover focus-pulse override, setup-phase focus on just the placing player, weighted centroid (rovers pull harder than panels), zoom clamping at both ends, pan centering math, all asset-array shapes, and non-finite coordinate skipping.

**Extracted: `buildEnemyZones` + `pointInAnyZone` to `src/sim/enemyZones.js`.** These were inline closures inside `stepPlayer` -- the rover physics injector uses them to detect "am I about to violate an opponent's safety zone" and route around. The closures had stable contracts but were buried where they couldn't be exercised in isolation. Extracted as a pure module with 13 new tests covering null safety, destroyed-structure exclusion, legacy `landingPad` singular form support, all five structure types at correct radii, point-inside detection, boundary case (strict `<`), and zone insertion order. Also includes a small perf improvement: `dx*dx + dy*dy < r*r` instead of `Math.hypot(...) < r` (avoids per-call sqrt).

**DRY: pushInject + pushCustomInject.** Were nearly identical (build entry, push to missionLog, push to lastEvents). Factored into a shared `pushInjectEntry` helper.

**Mission log fix: GIF export failures now have round/day.** The catch block in `exportMissionGif` was pushing raw entries to `setMissionLog`, bypassing the `appendMissionLog` helper that stamps `round, day, globalDay`. Failed exports rendered with empty "R · D" labels in the log panel. Now uses `appendMissionLog`.

**Documentation fix: RD_MINE_BONUS comment.** The constant's comment claimed "+50% mine rate per 100 R&D points" but the formula `1 + (R/200) * 0.5` actually gives +25% per 100 R&D (+50% per 200). The comment has been wrong since v15. Fixed the comment to match the formula. The game balance has been tuned to the formula, not the comment, so the math stays.

**Code-quality cleanups in simDay.** The next-fresh-pixel hop logic was inlined twice with near-identical code; factored into `findNextFreshPixel(craterIdx, x, y, mineMap)`. The per-pixel mining cap formula was duplicated three times; factored into `pxIceCap(iceFrac)` with `PX_ICE_CAP_BASE` and `PX_ICE_CAP_FLOOR` as constants.

**Code-quality cleanup: `pickRoverTarget` extracted.** Was a 140-line `useCallback` inside GameApp. Now lives in `src/sim/autoTarget.js` as a pure function with no React dependencies. The function is where most of the v15-v20 bug cluster lived (recharge fires, hysteresis, aim-snap), so moving it to a testable module is high-value. 17 new tests cover it. The `useCallback` reference is removed from one stale dep array; React behavior unchanged because module-level imports have stable identity.

**Performance: rAF-coalesced canvas draw.** Was: every state change rebuilt the `draw` callback, and the dep-list `useEffect` ran it synchronously. With `pulseTick` firing every 160ms plus simulation updates, the 1212x1212 work canvas redrew several times per frame. Now wrapped in `requestAnimationFrame` so multiple state changes inside one frame produce a single paint. Particularly noticeable on the projection laptop during a workshop demo when several state slices update on the same turn-end.

**Build: manual chunks.** Was: a single 536 KB bundle triggered Vite's chunk-size warning. Now split into:
- `vendor-react` (140 KB) -- cached across deploys
- `vendor-realtime` (41 KB, socket.io)
- `vendor-gif` (10 KB)
- app `index` (~345 KB)

First-load and HMR are both faster. The warning is gone.

**Workshop UX: keyboard shortcuts + Help overlay.** Press `?` to see a list of shortcuts. New bindings: `L` opens the mission log, `A` opens analytics, `P` opens physics parameters. The existing `+`/`-`/`0`/arrow-key zoom-and-pan bindings are documented in the overlay too. The toolbar grew a Help button next to Log / Data / Params so the shortcut is discoverable. Escape closes the overlay or dismisses any active mode (asset-detail panel, rover-drag, explore-mode click). Shortcuts ignore text fields.

## What's new in v20 (still in)

**Hysteresis fix for the 49<->51% bounce.** A single recharge threshold at 50% caused rovers to thrash: drop to 49% -> head home -> charge to 51% -> head out -> drop to 49% -> back home, forever. Replaced with a hysteresis pair:
- `ROVER_RECHARGE_LOW = 0.40` -- enter recharge below 48 of 120 power
- `ROVER_RECHARGE_HIGH = 0.85` -- stay recharging until above 102 of 120
The rover carries a `_recharging` state flag between simDay calls so the threshold is asymmetric. Verified with a trace: power trajectory 100 -> 47 -> 100 -> 105 -> 48 produces NO bouncing -- the rover enters recharge once at 47, charges all the way to 105, exits, and stays in PSR-seek until power drops below 48 again.

Solar panels and reactors are now also valid recharge destinations (not just pads and habitats). The rover routes to whichever charging source is closest.

**Next-level B&W mega-basemap.** The default basemap is a dramatic upgrade:
- 22 elevation bands (was 18) with a pure black -> off-white high-contrast ramp
- *Hillshade-modulated terrain* -- an embedded base64 hillshade PNG composites onto the basemap via SVG overlay blend mode, giving every crater rim and ridge real 3D depth
- *SVG glow filters* on every saturated physics polygon (cyan glow on PSRs, gold on peak solar, magenta on severe comms blackout, red on impassable slopes)
- Bright cyan PSRs (RGB 20,230,255) win z-order over solar/comms tints so they always read first
- Saturated gold solar potential at three intensity levels (>30% / >50% / >70%) with the brightest tier getting a glow halo
- Vivid magenta comms blackout at two intensities with dashed strokes on the severe band
- Vignette via radial gradient so the disk edge fades into deep black
- Premium legend card with rounded corners, double border, MISSION PLANNING header

**Upgraded 3-ring reactor visualization.** The Open Lunar 1/3/5 km zones around live reactors and the placement preview are now properly iconic:
- Each ring has a *radial gradient fill* so the rings read as nested zones rather than thin outlines
- The exclusion (innermost, red) ring *pulses* via `pulseTick` -- subtle breath cycle keyed off the same animation state as violation indicators
- Stroke widths bumped to 3.0-4.2 px from the 2.4-3.6 px range in v19
- *Leader lines* on the placement preview connect each ring perimeter to its label so the geometry reads cleanly even when rings overlap with other map features

## What's new in v19 (still in)

**Recharge actually adds power now.** The v18 dwell logic set status to "recharging" but did NOT add any charge -- it relied on `allocateDailyPower` to top up the rover externally, but that only routes power from solar panels and reactors, not from pads or habitats. A rover dwelling on its starting pad with no panel nearby was sitting at the same battery level forever. Fix: the dwell branch now actively aggregates charge from every in-range source:
- *Solar panels*: 13.2/day each (60% of panel output)
- *Reactors*: 19.8/day each (60% of reactor output)
- *Landing pads*: 6/day each (resupply trickle from a docked lander)
- *Habitats*: 4/day each (backup from crew systems)

Trace verifies: rover at 30 power, parked at pad → 86 power after 10 days. Same rover parked on a solar panel → 120 (full) in 5 days.

**50% recharge threshold + auto-PSR-seek above 50%.** Recharge fraction bumped from 0.25 to 0.50. So a rover with less than 50% power auto-returns to the nearest charging source. Above 50% it auto-seeks the nearest unmined PSR. Pairs with the recharge dwell so the rover always has a safety margin to make it home.

**Auto stay out of opposing safety zones.** `stepPlayer` now takes the opponent's state as a parameter and builds a list of enemy safety zones (pad, solar, reactor, habitat, rover, all sized at 1.1× their normal radius for jitter buffer). The auto-target logic adds three new priorities:
- *If currently inside an enemy zone* -- the rover routes to the closest perimeter exit before anything else (priority above even recharge)
- *If an auto-target lies inside an enemy zone* -- the rover aims at the zone perimeter instead of the target itself (dodge maneuver)
- User-set waypoints are still respected and can deliberately enter zones if the player chooses to violate

**Much more visible safety rings.** Ring stroke widths bumped from 2-2.4 px to 3.5-3.8 px, fill alphas almost doubled, inner bright accent ring added at 98.5% radius for sharper boundary definition. The rover ring stays thinner (2.4 px) since rovers move and shouldn't dominate the map.

**Active violation indicator.** When an enemy asset is inside one of your safety zones:
- The zone fills with pulsing red (cycles ~3× per second via a pulseTick state)
- A thick bright-red stroke replaces the normal color
- Dashed red lines draw FROM the zone's center TO each violating asset
- Each violator gets an X marker so the eye finds it quickly

## What's new in v18 (still in)

I ran a programmatic trace of simDay on a representative scenario. T1: rover moves 30 px. T2: rover arrives at PSR, mines 34.5 kg (the per-pixel cap). T3 through T20: status "depleted", ice stuck at 34.5, rover sitting on the same pixel forever. THAT is what was happening at runtime. Auto-recharge wasn't triggering because power was still high. Auto-seek wasn't firing because the crater overall still had health. The rover had simply tapped out its current pixel and had no idea to move.

**Fix 1: Hop to next-nearest fresh PSR pixel within the same crater.** When the mining branch detects the current pixel is depleted (or the cap was just reached this turn), it now searches the crater's pixel list for the next-nearest pixel that isn't tapped out and queues it as an auto-waypoint. Next simDay the rover hops there and continues mining. The rover walks the crater pixel by pixel, draining each one, until the whole crater depletes -- exactly what was supposed to happen.

**Fix 2: Bigger per-pixel mining cap.** Was 60 × (0.15 + 0.85 × iceFraction), max ~60 kg. Now 150 × (0.20 + 0.80 × iceFraction), max ~150 kg. At a typical PSR pixel with 0.5 ice fraction, the cap goes from ~34.5 kg to ~90 kg. The rover gets more yield per pixel before having to hop, so per-turn progress is visible.

## What's new in v17 (still in)

**Rovers move faster and stop dying before they accomplish anything.** Three tuned constants:
- `ROVER_SPEED`: 8 -> 15 km/day (30 px/day at 0.5 km/px). Same order of magnitude as a manned Apollo LRV cruise but slower than its peak.
- `POWER_MOVE_DRAIN`: 25 -> 8 per step. Was sized so rovers ran out of battery before reaching anything useful.
- `POWER_BASE_DRAIN`: 1.5 -> 0.8 per day. Light idle drain.

With these constants a fresh rover (78 power = 65% of cap) can drive about 5.5 days before recharge triggers -- enough range to reach any PSR from a polar pad and head back.

**Mid-round auto direction change.** Two changes:

*Auto-targets recompute each step.* Previously once an `_auto` waypoint was set, the rover kept chasing it for the whole turn. Now auto-targets recompute every simDay call, so the rover dynamically updates its target as it moves -- if the user adjusts aim, if a PSR depletes nearby, or if a recharge override should fire mid-trip.

*Aim direction snaps to nearest PSR along bearing.* If the user aims the rover at a bearing, the rover doesn't just drive off the map -- it picks the closest unmined PSR that lies forward of the rover along that bearing (scored by `forward + 1.5 * lateral`). Aim is now a "rough direction hint" rather than a literal point command. If no PSR lies in that direction, the rover follows the bearing as before.

User-placed (non-auto) waypoints are still respected and take priority over auto-targeting.

**Removed the dark blue PSR runtime overlay from the default basemap.** The simulation was painting a dark navy tint over every PSR pixel at runtime, on top of the basemap. This duplicated the PSR layer already in the B&W default basemap. Now gated behind `showLayers.psr_depletion`, off by default. Added a "PSR Tint" toggle to the Map Overlays panel so workshop facilitators can turn it back on if they want to see depletion progress at a glance.

## What's new in v16 (still in)

**Bug A (the big one -- rovers were crawling at 1/8 speed):** The constant `ROVER_STEP = ROVER_SPEED / 8` was written with the intent that simDay would internally loop 8 sub-steps per day for fine slope integration. But the sub-step loop was never actually wired up -- each call to simDay moved the rover only 1/8 of the documented distance. A rover heading from the pole to Shoemaker PSR (96 pixels away at 0.5 km/px) was taking around 48 game turns just to arrive. Fixed: `ROVER_STEP = ROVER_SPEED` so one simDay = one full day's travel. Rovers now actually traverse at the documented 8 km/day.

**Bug B (mining off-by-one):** `onPSR` and `craterIdx` were computed once at the start of simDay before any movement. So a rover that arrived at a PSR pixel didn't start mining until the next turn. Fixed: `onPSR` and `craterIdx` are now recomputed after movement so the rover mines the turn it arrives.

**Bug C (full-return home-filter index mismatch):** Same indexing bug the recharge filter had in v15, but in the priority-1 "ice full, return to pad" branch. The legacy `landingPad` singular was pushed first but the structureHealth array was indexed assuming only plurals. Rewrote with per-collection iteration.

## Also new in v16

**GIF download via explicit modal.** Stopped relying on the silent auto-anchor-click that some browsers block (Safari especially). After a GIF renders, a modal appears with a big visible DOWNLOAD GIF button the user clicks themselves. The auto-download is still attempted as a convenience but the modal is the authoritative path -- works in every browser, every time.

**B&W mega-basemap as the new default.** Monochrome grayscale terrain (black lowlands -> off-white highlands) with maximum-saturation physics overlays:
- Saturated cyan PSRs
- Saturated yellow/gold solar potential (3 intensity levels)
- Saturated magenta comms blackout (2 intensity levels)
- Saturated red impassable slopes (3 intensity levels)

The physics layers POP because there's no color competing for attention in the terrain layer. Vector SVG so it stays crisp at any zoom.

**Better z-order on physics overlays.** PSRs now paint on top of solar potential so they don't get buried in the central highland region.

## What's new in v15 (still in)

Found four real bugs causing the broken behaviour. Verified with a programmatic test that all five edge cases now produce the right target.

**Bug 1 (auto-recharge never triggered).** Power values in the simulation live in the 0..120 range (POWER_CAP = 120), but the recharge threshold was 0.25 -- a raw value. The condition `rover.power < 0.25` was only ever true when the rover had less than 0.2% charge -- effectively dead. Fixed by renaming the constant to `ROVER_RECHARGE_FRACTION` and using `power < POWER_CAP * ROVER_RECHARGE_FRACTION` everywhere it's checked, so recharge now fires at the intended 25% of capacity (30 power out of 120).

**Bug 2 (dwell logic trapped rovers at startup).** The v12 dwell engaged whenever a rover was inside any team-asset coordination zone with power below 90% of cap. Problem: new rovers start at 65% of cap and stand on their own pad, so the dwell condition was true on turn 1 and the rover never left to mine. Fixed by gating dwell on a `_recharge` flag carried by the waypoint -- the rover only dwells if it actively came home to recharge, not if it happens to be standing in a charging zone.

**Bug 3 (auto-mining targeted the wrong point).** Auto-seek aimed at the geometric centroid of each crater. For C-shaped or kidney-shaped PSRs (which most polar PSRs are), the centroid lies outside the actual PSR polygon. The rover would arrive at an empty point and never trigger the `PSR_MASK` mining check. Fixed by computing a `mineX, mineY` per crater at extraction time -- the PSR pixel closest to the centroid -- and using that as the auto-seek target. Rovers now arrive on a PSR pixel and immediately start mining.

**Bug 4 (recharge home-filter indexed wrong array).** The filter that picked functional pads/habitats for the recharge target was using a single index into separate health arrays, miscounting when a player had both legacy `landingPad` and plural `landingPads`. Rewrote with per-collection iteration so each home is health-checked against its own array.

## Verification

Unit test on the new pickRoverTarget logic:
```
Full power (120), no recharge: PASS
50% power (60), no recharge: PASS
20% power (24), recharge: PASS -> {x:605, y:595, reason:"recharge"}
30 power exact threshold: PASS (no recharge, boundary respected)
Dead pad + alive habitat: PASS -> routes to habitat correctly
```

## What's new in v14 (still in)

**Mega-basemap is now vector SVG.** The Site Planning default basemap no longer pixelates at zoom. It's rendered as a single layered SVG with every physics layer as actual vector paths (1453 elevation contour paths, 55 PSR polygons, 281 comms-blackout polygons, 259 solar-potential polygons, 307 slope hazard polygons -- 2349 paths total).

**Comms blackout and solar potential are now actually visible.** Both layers were nearly invisible in v13 because the raster compositing washed them out. The vector version uses:
- *Comms blackout* at two intensities: poor (Earth visibility < 40%) and severe (< 20%), drawn as saturated purple polygons with stroke outlines so the boundaries are crisp
- *Solar potential* at three intensities (annual sunlit > 30% / 50% / 70%) drawn as warm gold polygons, with the brightest variant getting heavier outline and higher alpha so peak-sunlight regions pop

**Impassable slopes pop harder.** Three intensity levels (>18° caution, >22° hazard, >26° impassable) each with their own visual treatment: caution as dashed orange outlines only, hazard as diagonal red hatch, impassable as dense red hatch. Patterns scale crisply since they're SVG `<pattern>` defs.

**Better z-order.** PSRs (the most workshop-critical layer) now sit ABOVE solar/comms so they're never obscured by tinting overlays. Slope hazards sit at the top of the stack as safety-critical information.

## What's new in v13 (still in)

**Visible safety rings around all asset types.** Every rover, solar panel, reactor, landing pad, and habitat now draws a clearly visible coordination ring at its real safety radius. Strokes are thick (1.6-2.4 px), color-coded by asset function (not by player):
- *Rovers* (1.4 km) -- mint green, traversal zone
- *Solar panels* (2.9 km) -- gold, power-share zone
- *Reactors* (5.8 km) -- red, coordination zone (plus the 3-ring 1/3/5 km exclusion/EMI/plume overlay on top)
- *Landing pads* (7.2 km) -- amber, landing footprint
- *Habitats* (14.4 km) -- blue, crew operations zone

Each ring has a subtle matching fill so overlapping zones visually mix. Damaged assets render their ring at reduced opacity. The whole layer toggles via `showLayers.safety` from the Layers panel.

**Reactor 3-ring overlay thickened.** The Open Lunar 1 km / 3 km / 5 km zones around live reactors and the placement preview during drag-to-place now stroke at 2.8-3.6 px (was 1.2-2.0 px) with brighter colors and larger inline labels. Both visible at polar-disk scale and not overwhelmed by the surrounding 5.8 km coordination ring.

## What's new in v12 (still in)

**Site Planning mega-basemap (new default).** A single composited view that shows: shaded periwinkle hillshade as the elevation base, mint-cyan PSRs with ice-intensity saturation, warm gold tint where solar potential exceeds 60%, purple haze where Earth visibility drops below 30% (comms blackout), and red diagonal hatching on slopes over 20° (impassable terrain). All physics layers in one beautiful workshop-ready cartographic image, with built-in multi-row legend, named craters, lat/lon graticule, and disk border.

**Periwinkle Topographic (USGS-style).** A second new basemap rendered as a vector SVG in the style of a standard USGS topographic sheet. Light-cream cartographic paper background, 22 contour lines in periwinkle on subtle elevation banding, every fifth contour drawn at major weight. Reads like a published topo map.

**Dramatic Relief basemap** added (high-z-exaggeration hillshade from the v7 candidate set).

**Bigger reactor safety rings.** Updated from 0.1 / 0.5 / 1 km to 1 / 3 / 5 km so the rings are visibly distinguishable at the polar disk's 606 km extent. The placement preview during drag-to-place now shows clearly readable distance labels.

**Auto-recharge actually works now.** Two-bug fix: (1) the recharge-priority logic now overrides existing waypoints and aim direction, so a rover with set direction will still return home when battery drops below 25%; previously it just followed its aim into the void and stranded. (2) Added a "recharge dwell" gate: when a rover is in range of any team-owned pad, habitat, solar panel, or reactor and power is below 90%, it clears its waypoint and stays put while `allocateDailyPower` tops it up. Prevents the "arrive, sip, leave" loop.

**Asset placement from Explore mode.** After clicking the map in EXPLORE mode and reading the terrain analysis, a "Place asset here" grid appears in the sidebar with five buildable types (solar / habitat / reactor / pad / rover). Each button shows the cost, is disabled if the verdict for that asset type was BAD or if the player can't afford it, and routes through the normal `buildAndPlaceAt` flow. Place asset → exits explore-click state and the sandbox returns to normal play.

**GIF download diagnostics.** Added full instrumented logging through the GIF render pipeline (frame counts, phase markers, blob sizes, progress percentages, encoder errors). When the user clicks EXPORT GIF, the browser console now shows what stage runs and what fails. If a failure happens, a user-visible mission log entry is appended with the error message. Frame wait bumped from 2 to 3 animation frames for canvas redraw reliability.

## Earlier v11 features still in

- Realistic rover speed (8 km/day at zero slope, matching VIPER cruise)
- Slope-dependent traversal physics (25° impassable, 15° doubles power draw)
- Pixel-by-pixel mining cap with finite per-pixel ice budgets
- 18-band periwinkle vector basemap with 1285 contour paths
- Three-ring reactor placement preview during drag

## Earlier v10 features still in

- Three vector physics overlays (slope, comms blackout, solar potential) toggleable from the Layers panel
- Explore Terrain mode with click-to-analyze + equipment recommendations
- Open Lunar 3-ring reactor safety zones (now sized for visibility)
- Stakeholder archetypes (two core coalitions / Large Co / Small Co / Observer) with work-package blurbs and per-asset cost modifiers
- Prominent EXPORT GIF button
- De-pixelated rover arrows (sharp-vector pass at full DPR)
- `downloadBlob` helper across all file downloads

## Running it

```
npm install
npm start          # dev server + multiplayer relay (vite + node concurrently)
npm test           # run the sim unit + integration tests
npm run build      # production build into dist/
```

Vite dev server on port 5173, multiplayer relay on 8787. Tests run on Node 22's built-in test runner (no extra dependency).

## Dusk Power² explanation

You asked what Dusk Power² is. It's the variant from v7 candidate #19. The math: every elevation value gets *squared* before being binned into contour levels. Effect: low-elevation areas (PSR crater floors) compress into a near-uniform deep band; mid-elevations stay close to original; the highest peaks burst into bright highlights with very tight contour spacing. That's why it has the "fingerprint" feel -- the bright cream peaks pop dramatically against the dark violet floors, with very few mid-tones. The color palette (deep slate → instrument blue → periwinkle → coral → cream) adds the warm peaks against the cool lowlands. It is included as one of the optional basemaps under that name in the v7 candidate bundle if you want me to wire it in.

## Architecture

`src/App.jsx` is the orchestrator: state, multiplayer wiring, canvas draw, HUD, settings screen. As of v27 it's down from 11.9k lines to ~9.7k and continues to shrink. The two sibling trees below it are where most of the code now lives.

**`src/sim/`** -- framework-free pure JS simulation core. Importable from Node without jsdom or a build step. Unit-testable.
- `constants.js` -- physics / economy / time / asset costs / safety radii
- `stakeholders.js` -- five archetypes (two core coalitions / Large Co / Small Co / Observer) and lookup
- `mapData.js` -- LRO typed-array buffers (PSR_MASK, ILLUM_MAP, etc.), `loadMapData()`, crater extraction, geographic projection, comms + comsat sampling
- `physics.js` -- `roverSlopeFactor`, `roverPowerFactor`, `analyzePixel`
- `economy.js` -- `calcBudget` / ΔE / ΔR / ΔM / `calcCompetitiveness` / `makePlayer`
- `power.js` -- `allocateDailyPower` (panel/reactor → rover/habitat routing)
- `autoTarget.js` -- `pickRoverTarget` (rover route selection: recharge, return-when-full, aim-snap, autoseek)
- `viewport.js` -- `computeAutoFitViewport` (focus-pulse / setup / playing camera framing)
- `enemyZones.js` -- `buildEnemyZones` + `pointInAnyZone` (opponent safety zone detection used by the rover physics injector and bot AI)
- `labels.js` -- `structureLabel` display-string lookup, used by both UI and the plot data builder
- `plotData.js` -- `buildPlotDefinitions` (pure data transformation: game state frames + mission log → array of plot definitions for canvas rendering)
- `exports.js` -- `buildRoundSummaryText` (pure text builder for the workshop facilitator round-summary export)
- `simDay.js` -- the per-day rover step + `computeClaims`
- `utils.js` -- `d2`, `stepToward`, `snapToPSR`, `isNight`, `downloadBlob`, etc.
- `index.js` -- barrel re-exports

**`src/ui/`** -- React components, one per file. Each is a pure render function of its props plus a few handlers; no shared closures.
- `RoleBanner.jsx` -- multiplayer top banner (Facilitator override / room code / leave)
- `ChatDrawer.jsx` -- bottom-right workshop chat
- `HelpOverlay.jsx` -- keyboard-shortcuts modal (press `?`)
- `MissionLogPanel.jsx` -- collapsible event log + CSV export
- `AnalyticsPanel.jsx` -- cumulative ice / budget bar charts + snapshot table
- `PhysicsParametersPanel.jsx` -- live-edit physics overrides
- `GifReadyModal.jsx` -- explicit GIF download path (Safari-safe)
- `AssetDetailSidebar.jsx` -- click an asset, see its stats + clear-waypoints / resupply
- `ExploreSidebar.jsx` -- terrain analysis + asset placement buttons

**Other top-level files in `src/`** (not yet refactored):
- `App.jsx` -- the GameApp component, settings screen, HUD, toolbar, build palette, render loop wiring
- `Lobby.jsx` -- role-aware pre-game lobby
- `FacilitatorPanel.jsx` -- inject deck and composer
- `AssetIcons.jsx` -- pictographic SVG icons + drag palette
- `multiplayer.js` -- multiplayer hook
- `main.jsx` -- React mount

**Other top-level dirs:**
- `server/server.js` -- Socket.io relay
- `public/maps/` -- 7 basemaps (mega-composite default + 2 vector SVGs + 4 raster) + 3 vector physics overlays + 11 raster data layers
- `tests/` -- Node 22 test runner; run via `npm test`

## Credits

- Lauren Victoria (Vic) Paulson -- Open Lunar Fellow, Georgia Tech ASDL
- LRO data products: NASA / Goddard / Arizona State University
- LEND hydrogen mapping: NASA / IKI Russia
- Open Lunar nuclear power siting framework: Open Lunar Foundation
- Original simulation codebase: O'Brien et al., LunarAreasESPL

## License

See LICENSE.
