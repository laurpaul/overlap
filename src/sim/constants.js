// ── Sim constants ────────────────────────────────────────────────────────────
//
// Pure data: physics, economy, asset costs, geographic frame, safety radii.
// No DOM, no React, no map data. Anything that doesn't change at runtime and
// isn't a function lives here.
//
// Anything tagged "// override:" can be live-patched in the Physics Parameters
// panel via the physOverrides state. See `phys(key, defaultVal)` in GameApp.

// ── Geographic frame ────────────────────────────────────────────────────────
// 1212 px / 606 km = 0.5 km/px after upscale.
export const MAP_KM_PER_PX = 0.5;
export const W = 1212;
export const H = 1212;
// Pole at centre of the 1212×1212 raster.
export const POLE_PX = { x: 606, y: 606 };
export const MAP_KM = W * MAP_KM_PER_PX;     // 606 km across -- the 80°S polar circle
export const PIXELS_PER_KM = 1 / MAP_KM_PER_PX;  // 2 px/km at this scale

// ── Rover motion + slope physics ────────────────────────────────────────────
// Real-world rover ground-truth: VIPER cruise ~0.2 km/h, ~5-10 km/day; LRV
// manned at 8-13 km/h; RACER LTV spec 15 km/h. For a robotic prospector
// under sustained ops we target 15 km/day at zero slope. At 0.5 km/px that's
// 30 px/day. Was 8 km/day in v16 -- bumped because rovers were running out
// of battery before reaching anything useful.
// override: ROVER_STEP
export const ROVER_SPEED = 15 * (1 / MAP_KM_PER_PX);  // 30 px/day flat
export const ROVER_STEP  = ROVER_SPEED;
// "At target" tolerance: 4 km radius. Larger than ROVER_STEP so a rover
// never quivers past its waypoint.
export const ROVER_REACH = 4 / MAP_KM_PER_PX;  // 8 px at 0.5 km/px

// ── Rover power model ───────────────────────────────────────────────────────
export const ROVER_BATTERY_CAP   = 1.0;
export const ROVER_POWER_DRAW_KM = 0.04;
export const ROVER_POWER_DRAW_IDLE = 0.02;

// Recharge thresholds with HYSTERESIS. The rover STARTS recharging when
// power drops below LOW, and STAYS recharging until power rises above HIGH.
// With 0.40 / 0.85, a rover that auto-returns at 48% power keeps charging
// until 102/120, then resumes PSR-seek. Prevents the 49<->51% bounce.
export const ROVER_RECHARGE_LOW  = 0.40;
export const ROVER_RECHARGE_HIGH = 0.85;
// Legacy alias -- mid-point of the band.
export const ROVER_RECHARGE_FRACTION = (ROVER_RECHARGE_LOW + ROVER_RECHARGE_HIGH) / 2;

// override: POWER_BASE_DRAIN, POWER_MOVE_DRAIN, POWER_MINE_DRAIN
export const POWER_BASE_DRAIN = 0.8;
export const POWER_MOVE_DRAIN = 8;
export const POWER_MINE_DRAIN = 2.2;

// Generators
export const PANEL_FLAT     = 7;
export const PANEL_RIDGE    = 22;
export const REACTOR_OUTPUT = PANEL_RIDGE * 1.5;

// ── Mining ──────────────────────────────────────────────────────────────────
// Derived from published lunar ISRU figures:
//   • 4.8 L/day regolith excavation (Biomimetics 2024, 9(11):680)
//   • 1.5 g/cm³ regolith density
//   • 5.6% water-ice mass fraction in mined regolith
// 4.8 L × 1.5 g/cm³ × 5.6% = 0.4032 kg ice/day at quality 1.0.
// PROJECTED_ADVANCES_FACTOR: industrial-scale extraction in near-future
// rovers, plus gameplay-pacing so a round feels meaningful.
//
// v174 (ice-flow fix): bumped 80 → 480. At the old factor BASE_MINE_RATE was
// ~0.8 kg/day, but a rover's hopper (ICE_CAP) holds 80 kg, so a rover needed
// ~100 mining-days just to fill ONE load before it would auto-return and
// deposit. In a workshop game (a handful of 7-day rounds) that threshold was
// never reached, so iceDeposited stayed 0 for every player. 480 gives
// BASE_MINE_RATE ≈ 4.84 kg/day at quality 1.0 (~2.4/day at the median quality
// 0.5), so a hopper fills in roughly one to two rounds and ice actually banks.
// The partial-deposit auto-return (autoTarget.js, now 50% not 95%) means ice
// flows steadily rather than in rare all-or-nothing lumps.
export const REGOLITH_VOLUME_PER_DAY_L = 4.8;
export const REGOLITH_DENSITY_G_PER_CM3 = 1.5;
export const ICE_MASS_FRACTION          = 0.056;
export const PROJECTED_ADVANCES_FACTOR  = 480;
// override: BASE_MINE_RATE
export const BASE_MINE_RATE =
  REGOLITH_VOLUME_PER_DAY_L * 1000 *           // L → cm³
  REGOLITH_DENSITY_G_PER_CM3 / 1000 *          // g → kg
  ICE_MASS_FRACTION *
  PROJECTED_ADVANCES_FACTOR;                   // ≈ 0.8064 kg/day

// Per-pixel cap. At full local ice fraction, ~150 kg can be extracted from
// 1 m² of regolith down to ~1 m depth. Scaled per pixel by ICE_DEPTH_MAP.
export const PX_ICE_CAP_BASE = 150;
export const PX_ICE_CAP_FLOOR = 0.20;  // floor fraction at zero ice signature

// ── Asset costs + points ────────────────────────────────────────────────────
export const BASE_ASSET_COSTS = { solar: 40, habitat: 90, rover: 60, pad: 150, reactor: 280, comsat: 110 };
export const ASSET_POINTS     = { solar: 2,  habitat: 10, rover: 3,  pad: 5,   reactor: 15,  comsat: 6  };
// Deprecated -- replaced by resupply.
export const BASE_MAINT_COSTS = { solar: 0,  habitat: 0,  rover: 0,  pad: 0,   reactor: 0,   comsat: 0  };

// ── Comsat relay (v22) ──────────────────────────────────────────────────────
// A deployed comsat lifts any asset within COMSAT_RELAY_RADIUS out of
// DTE-blackout, additively up to 1.0. Sized at 60 px ≈ 60 km, matching a
// near-pole frozen-orbit footprint of an Artemis-era relay smallsat.
export const COMSAT_RELAY_RADIUS    = 60;
export const COMSAT_COVERAGE_BOOST  = 0.40;
export const COMMS_BLACKOUT_THRESHOLD = 0.30;

// ── Resupply ────────────────────────────────────────────────────────────────
// Each step, if a player owns ≥1 functional pad, this much HP is distributed
// across damaged assets, lowest-health first.
export const RESUPPLY_CHUNK = 0.005;
export const RESUPPLY_COST  = 35;
export const RESUPPLY_POOL  = 2.0;

// ── Budgets & caps ──────────────────────────────────────────────────────────
// Enough for turn 1 to buy habitat + solar + pad (90 + 40 + 150 = 280)
// with margin for a second build.
export const STARTING_BUDGET = 380;
// Asset limits removed (Infinity disables the gate). Old caps kept as
// comments for reference.
export const MAX_PANELS   = Infinity;  // was 6
export const MAX_HABITATS = Infinity;  // was 3
export const MAX_ROVERS   = Infinity;  // was 2
export const MAX_PADS     = Infinity;  // was 1
export const MAX_REACTORS = 1;

export const POWER_CAP         = 120;
export const HABITAT_POWER_CAP = 80;
export const HABITAT_POWER_DRAIN = 2.0;
export const HABITAT_POWER_INIT  = HABITAT_POWER_CAP * 0.65;
export const POWER_LOW = 20;

// ── Unpowered-habitat penalty (v174) ────────────────────────────────────────
// A habitat with no power can't accept ice deposits (simDay already gates
// deposits on habitatPower > 0) but previously had no other consequence, a
// player could run a powerless hab indefinitely with zero cost, which the
// workshop flagged ("Artemis ran a powerless hab with no consequence"). Now an
// unpowered hab is an active liability each day:
//   • UNPOWERED_HAB_DECAY   , structural health it loses per day (thermal /
//                              life-support failure). At 0.06 a full-health hab
//                              degrades to destroyed in ~15 days if never
//                              powered, at which point it also stops projecting
//                              a safety zone and stops being a deposit site.
//   • UNPOWERED_HAB_PENALTY , a direct per-day scoreboard ding per unpowered
//                              hab, so the cost is immediate and legible rather
//                              than only showing up as slow decay.
//   • UNPOWERED_HAB_THRESHOLD, power at/below which a hab counts as unpowered.
export const UNPOWERED_HAB_DECAY     = 0.06;
export const UNPOWERED_HAB_PENALTY   = 3;
export const UNPOWERED_HAB_THRESHOLD = 0.5;

// Rover ice hopper: the working load a rover carries between deposit runs.
// v174 (ice-flow fix): lowered 800 → 80. The old 800 kg was framed as a
// full Artemis-LTV cargo haul, but combined with the ~0.8 kg/day mine rate it
// meant a rover would mine for ~1000 days before a single hopper filled and it
// auto-returned to deposit, so nothing ever banked. Reframed as a per-trip
// hopper: at the new mine rate (~2.4-4.8 kg/day) an 80 kg hopper fills in
// roughly one to two rounds, and the 50% partial-deposit return (autoTarget.js)
// runs it home well before that. Bigger lifetime throughput now comes from
// MANY trips, not one impossible-to-fill load.
export const ICE_CAP = 80;

// ── Time ────────────────────────────────────────────────────────────────────
export const DAYS_PER_ROUND = 7;
export const NIGHT_CYCLE    = 14;  // days -- non-ridge panels produce 0 during night

// ── Depletion & crater ──────────────────────────────────────────────────────
// Fraction of crater remaining lost per kg mined, at the reference crater
// size. Larger craters deplete proportionally slower.
// override: DEPLETION_RATE
export const DEPLETION_RATE = 0.004;
export const CRATER_REFERENCE_SIZE = 150;  // median PSR blob size in pixels
export const DEPLETION_END_THRESHOLD = 0.005;

// ── Economy ─────────────────────────────────────────────────────────────────
export const ALPHA          = 15;    // Budget = α * E
export const E_INIT         = 8;
export const ALPHA_R        = 0.4;   // R&D decay rate multiplier
export const ALPHA_M        = 0.15;  // military decay fraction per round
// Mine-bonus formula: rdBonus = 1 + (R / 200) * RD_MINE_BONUS.
// At RD_MINE_BONUS = 0.5 the rate caps out at +25% per 100 R&D, +50% per 200.
// (The original v15 comment "+50% per 100 R&D" was off by a factor of 2; the
// formula has been the same since then and the balance is tuned around it.)
export const RD_MINE_BONUS  = 0.5;
export const MIL_DAMAGE_SCALE  = 2.0;
export const MIL_DEFENSE_SCALE = 0.5;
// Competitiveness weights -- sum to 1, so C ∈ [0, 1].
export const C_W1 = 0.4;  // economy
export const C_W2 = 0.3;  // ice mined
export const C_W3 = 0.3;  // military

// ── Safety zones ────────────────────────────────────────────────────────────
// ── Player identity colors ──────────────────────────────────────────────────
// Actor I = teal, Actor II = orange. Chosen to separate by BOTH hue and
// temperature so the two teams' assets, rings, and breach markers never read as
// the same color on the dark map. Kept distinct from the periwinkle UI accent
// (#A8A8F0), which is app chrome, not a team identity.
export const PLAYER1_COLOR = "#28B9AE"; // teal   (Actor I)
export const PLAYER2_COLOR = "#F0902E"; // orange (Actor II)
export const PLAYER3_COLOR = "#B45CE0"; // orchid (Actor III), v192, distinct in
                                        // both hue and temperature from teal/orange
                                        // and from the periwinkle UI accent (#A8A8F0).
// Index-addressable team palette. players[i].color should equal ACTOR_COLORS[i].
export const ACTOR_COLORS = [PLAYER1_COLOR, PLAYER2_COLOR, PLAYER3_COLOR];

// Real km, expressed in pixels using PIXELS_PER_KM.
export const SAFETY_RADIUS = {
  pad:     7.22  * PIXELS_PER_KM,
  solar:   2.89  * PIXELS_PER_KM,
  reactor: 5.78  * PIXELS_PER_KM,
  habitat: 14.43 * PIXELS_PER_KM,
  rover:   1.44  * PIXELS_PER_KM,
};

// Christine Tiballi's nuclear FSP reference (Field Guide, 2025): Core Operations
// / Harmonization (EMI caution) / Coordination Buffer (plume reach) at
// 0.1 / 0.5 / 1 km. Shown here at 10x for visibility on the 606 km disk, keeping
// her 1 : 5 : 10 ratio.
// Christine's Field Guide FSP zones ("Nuclear Power in Action") give the
// 1 : 5 : 10 ratio (0.1 / 0.5 / 1 km). v203 adopts the ratio at GAME scale , 
// 1 / 5 / 10 km, so rings are readable at true size on the 606 km disk.
// These are the authoritative sizes reported in ring labels and the CSV export.
// v203: reactor FSP zones follow the upgraded 1 / 5 / 10 km canon. At these
// sizes no display magnification is needed to read on the 606 km disk, so the
// display scale drops 10 → 1; drawn/scored px are identical to before.
export const REACTOR_ZONES_KM = { core: 1, harmonization: 5, coordination: 10 };
// The play map spans 606 km, so Christine's sub-km zones would be sub-pixel and
// unplayable. Reactor zones are DRAWN and SCORED at a documented display
// magnification so they read on the map and can actually exclude a neighbour;
// the labels/CSV still report the true canonical km above. (10x → 1/5/10 km on
// the map, matching the other assets' km-scale footprints.)
export const REACTOR_ZONE_DISPLAY_SCALE = 1;
export const REACTOR_ZONES = {
  exclusion: REACTOR_ZONES_KM.core          * REACTOR_ZONE_DISPLAY_SCALE * PIXELS_PER_KM,  // Core Operations
  emi:       REACTOR_ZONES_KM.harmonization * REACTOR_ZONE_DISPLAY_SCALE * PIXELS_PER_KM,  // Harmonization
  plume:     REACTOR_ZONES_KM.coordination  * REACTOR_ZONE_DISPLAY_SCALE * PIXELS_PER_KM,  // Coordination Buffer
};

// ── Uniform DLA safety zone, every asset (v190) ────────────────────────────
// Previously each asset scaled its 3-ring off a per-type SAFETY_RADIUS, so a
// habitat's keep-out dwarfed a rover's. But a Designated Lunar Area safety zone
// is a property of the HAZARD TIER, not the sprite that sits at the centre, so
// every surface asset now projects the SAME canonical Christine Tiballi ring
// set: Core 0.1 km / Harmonization 0.5 km / Coordination 1 km (ratio 1 : 5 : 10).
//
// Sub-km zones are sub-pixel on the 606 km disk, so, exactly like the reactor
// pass, they are DRAWN and SCORED at a display magnification while the labels,
// legend, and CSV report the TRUE canonical km above. Tune ONE number,
// ZONE_DISPLAY_SCALE, to make every asset's rings bigger or smaller on the map
// without touching the canonical km the tool teaches.
//   ZONE_DISPLAY_SCALE = 30 → 6 / 30 / 60 px on-map for 0.1 / 0.5 / 1 km.
// SAFETY_RADIUS is now used ONLY for functional footprints (power-share reach,
// pad apron / dust mitigation, illumination search), never the keep-out ring.
// v203: canonical DLA zone sizes upgraded to 1 / 5 / 10 km (Christine's 1 : 5 : 10
// ratio at game scale). At the map's 2 px/km these are genuinely visible at TRUE
// scale (2 / 10 / 20 px), so the default ring display is now the real size, no
// magnification lie by default. Scored keep-outs are numerically UNCHANGED from
// v190-v202 (6 / 30 / 60 px): the display scale drops 30 → 3 to compensate, so
// every breach test, penalty, and saved balance carries over exactly.
export const ZONE_KM = { core: 1, harmonization: 5, coordination: 10 };
export const ZONE_DISPLAY_SCALE = 3;
export const ZONE_RADII_PX = {
  core:          ZONE_KM.core          * ZONE_DISPLAY_SCALE * PIXELS_PER_KM,  // 6 px  · Core Operations (scores)
  harmonization: ZONE_KM.harmonization * ZONE_DISPLAY_SCALE * PIXELS_PER_KM,  // 30 px · Harmonization (coordinate to enter)
  coordination:  ZONE_KM.coordination  * ZONE_DISPLAY_SCALE * PIXELS_PER_KM,  // 60 px · Coordination Buffer (awareness)
};
// v198: TRUE-scale ring radii, the real DLA sizes at the map's own scale, with
// NO display magnification. 0.1 / 0.5 / 1 km → 0.2 / 1 / 2 px at 2 px/km. The map
// draws the rings at ZONE_DRAW_RADII_PX × the user's magnification slider, so at
// magnification 1× the rings measure their true km against the scale bar (this is
// the fix for "rings look far bigger than their real size"). NOTE: scoring/keep-out
// still uses ZONE_RADII_PX above, a true-scale 0.2 px core is sub-pixel and could
// never be breached, so the gameplay keep-out is necessarily larger than the
// true-scale drawing. The red BREACH ring shows that keep-out when a zone is
// actually violated.
export const ZONE_DRAW_RADII_PX = {
  core:          ZONE_KM.core          * PIXELS_PER_KM,  // 0.2 px · true 0.1 km
  harmonization: ZONE_KM.harmonization * PIXELS_PER_KM,  // 1 px   · true 0.5 km
  coordination:  ZONE_KM.coordination  * PIXELS_PER_KM,  // 2 px   · true 1 km
};
// The magnification at which the drawn Core equals the scoring keep-out (so
// see == score). = ZONE_DISPLAY_SCALE. Used as a labelled slider preset.
export const ZONE_KEEPOUT_MAGNIFICATION = ZONE_DISPLAY_SCALE;
// v199: default per-player ring magnification. Each actor sizes their OWN
// equipment's rings (player.ringMag); this is the fallback when unset.
export const ZONE_DEFAULT_MAGNIFICATION = 1;   // v203: 1x IS the true 1/5/10 km, visible by default
export const ZONE_MAGNIFICATION_BOUNDS = { min: 1, max: 8 };  // v203: rings are 10x bigger at true scale; 8x is already huge

// ── 3-ring safety framework, Christine Tiballi ─────────────────────────────
// Source: Christine Tiballi, "Lunar Operations Field Guide: Lunar Designated
// Areas," Open Lunar Foundation (2025). Three concentric operational areas:
//   Core Operations     (ORANGE) inner exclusion, only the operator may enter;
//                                strictest safety limits; breaching it scores a
//                                violation.
//   Harmonization Area  (TEAL)   middle buffer, crossing allowed only with
//                                prior coordination / notification.
//   Coordination Buffer (GRAY)   outer, overlap possible if it doesn't affect
//                                core ops; awareness / routine monitoring.
// The guide's nuclear FSP reference sizes these at 0.1 / 0.5 / 1 km, i.e. a tier
// ratio of 1 : 5 : 10, adopted here. Only the inner Core Operations ring drives
// scoring; the outer two are governance buffers. Colors follow the guide legend.
// TUNING: the mult values ARE Christine's ratio. On large assets (e.g. habitat,
// core ~14 km) the ×10 coordination buffer is big by design; edit the two mults
// here if you want tighter buffers for the game map.
// NOTE (v186): on-map, each tier is drawn in the OWNING TEAM's color and told
// apart by LINE STYLE (core solid+filled, harmonization dashed, coordination
// dotted), so these `color` values are neutral tier indicators for the legend /
// exports only, deliberately NOT the team identity colors (teal / orange).
export const ZONE_TIERS = [
  { key: "core",          label: "Core Operations",     mult: 1,  color: "#D24B3E" }, // red, strict exclusion
  { key: "harmonization", label: "Harmonization",       mult: 5,  color: "#C9A227" }, // amber, coordinate first
  { key: "coordination",  label: "Coordination Buffer", mult: 10, color: "#7A7E88" }, // gray, awareness
];
// Legacy keys some call-sites still read (exclusion/coordination/notification),
// now carrying Christine's 1 : 5 : 10 ratio.
export const ZONE_TIER_MULT = { exclusion: 1.0, coordination: 5.0, notification: 10.0 };

// ── Per-tier player control + Christine's overreach limits (v186) ────────────
// Each actor may resize each of the three rings INDEPENDENTLY (a slider per
// tier), rather than one global zoneScale. Christine Tiballi's Field Guide lists
// "expand your footprint without notice" among the operator MUST-NOTs, so a tier
// declared LARGER than her framework baseline (scale > 1) is overreach and costs
// score. Crucially, the penalty is weighted by how INNER the ring is: inflating
// the Core (the exclusion that actually keeps others out) is the most anti-social
// act and is penalized hardest; padding the outer Coordination buffer is mildly
// discouraged. Shrinking a ring (scale < 1) is always free.
//
//   TIER_SCALE_BOUNDS  min/max a player may set each tier to (relative to baseline)
//   TIER_OVERREACH_WEIGHT  inner-weighted penalty multiplier per tier; higher =
//                          more punished per unit of over-expansion. Core ≫ outer.
export const TIER_KEYS = ["core", "harmonization", "coordination"];
export const TIER_LABELS = {
  core: "Core Operations",
  harmonization: "Harmonization",
  coordination: "Coordination Buffer",
};
export const TIER_SCALE_BOUNDS = { min: 0.4, max: 2.0 };
export const DEFAULT_TIER_SCALE = { core: 1, harmonization: 1, coordination: 1 };
// Inner rings punished far harder for over-expansion (Christine: the inner
// exclusion is the one that actually excludes others).
export const TIER_OVERREACH_WEIGHT = { core: 6, harmonization: 2, coordination: 0.5 };

// ── Combat / decay ──────────────────────────────────────────────────────────
export const PASSIVE_DECAY  = 0.01;  // 1% per turn
export const HOSTILE_DECAY  = 0.05;  // 5% per turn if enemy in safety zone (not pads)
export const LANDING_DAMAGE = 0.18;  // hit to enemy structure during friendly landing

// ── Landing-pad benefits (v164) ─────────────────────────────────────────────
// A prepared pad is dust-mitigation infrastructure: it contains the plume on
// landing (less dust damage to nearby assets), makes follow-on logistics easier
// (cheaper equipment), and reads as responsible stewardship (a soft-power /
// geopolitical bump). All three reward building pads beyond their delivery role.
//
//   PAD_COST_DISCOUNT_PER  fraction off equipment cost per functional pad
//   PAD_COST_DISCOUNT_CAP  maximum total equipment discount
//   PAD_DUST_MITIGATION    fraction of landing dust damage removed when the
//                          landing happens within a functional pad's apron
//   PAD_GEO_BONUS          one-time soft-power score granted when a pad is built
export const PAD_COST_DISCOUNT_PER = 0.10;
export const PAD_COST_DISCOUNT_CAP = 0.35;
export const PAD_DUST_MITIGATION   = 0.6;
export const PAD_GEO_BONUS         = 6;

// ── GIF export ──────────────────────────────────────────────────────────────
export const GIF_FPS = 2;
export const GIF_FRAME_DELAY = Math.round(1000 / GIF_FPS);
export const GIF_OVERLAY_HEIGHT = 78;

// ── Phase & status enums ────────────────────────────────────────────────────
export const PHASE = {
  SETTINGS: "settings",
  BATCH: "batch",
  SETUP1: "s1",
  SETUP2: "s2",
  PLAYING: "play",
  DONE: "done",
};
// v27: removed unused phase ids SETUP1_HAB / SETUP1_SOL / SETUP1_PAD /
// SETUP2_HAB / SETUP2_SOL / SETUP2_PAD. These were defined for a
// multi-step setup wizard that was replaced with the current single-click
// setup flow before v25, but the constants stuck around. Confirmed via
// grep that no code path SETS these phases anywhere; the few sites that
// CHECKED for them in `phase===` expressions have been simplified too.

export const STATUS_INFO = {
  moving:     { icon: "🚗", label: "Moving",     col: "#E8C998" },
  mining:     { icon: "⛏",  label: "Mining",     col: "#80B0D8" },
  returning:  { icon: "↩",  label: "Returning",  col: "#E8C998" },
  depositing: { icon: "📦", label: "Depositing", col: "#9BD4B5" },
  carrying:   { icon: "🚚", label: "Carrying",   col: "#E8C998" },
  depleted:   { icon: "⚠",  label: "Depleted",   col: "#E89BB5" },
  // v27: was unmapped -- simDay sets status="stalled" on impassable slope
  // (>=25°, where roverSlopeFactor returns 0), but no STATUS_INFO entry
  // existed for it. Downstream renderers used `STATUS_INFO[s] || idle`
  // and silently displayed "Idle" instead -- leaving the workshop user
  // wondering why their rover stopped on a steep crater rim. Now it
  // surfaces as an explicit warning so the player knows to re-aim.
  stalled:    { icon: "⚠",  label: "Stalled",    col: "#E89BB5" },
  idle:       { icon: "·",  label: "Idle",       col: "#5A567A" },
  idle_nopsr: { icon: "⚠",  label: "Off-PSR",    col: "#E89BB5" },
};
