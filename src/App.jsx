import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import GIF from "gif.js";
import gifWorkerUrl from "gif.js/dist/gif.worker.js?url";
import { useMultiplayer } from "./multiplayer";
import { LobbyScreen } from "./Lobby.jsx";
import { FacilitatorPanel, applyInjectDeltas } from "./FacilitatorPanel.jsx";
import { canNegotiateWith, tickRestrictions, restrictionStatus } from "./sim/injects.js";
import { GRID_DEFS, gridOptions, applyGridAction } from "./sim/gridNegotiation.js";
import { makeDeal, isEmptyDeal, dealIsHonorable, applyAcceptedDeal, summarizeBundle, pruneDeals } from "./sim/deals.js";
import { scaleBarFor } from "./sim/scaleBar.js";
import { erodeTreatyFloor, treatyStage } from "./sim/treatyErosion.js";
import { makeSeededRng, isMapDepleted, clonePlayerState, structureCounts, grantAssetToPlayer, removeLastAsset, clearViolations, repairAllAssets, rechargeAll, functionalPadCount } from "./sim/playerState.js";
import { buildSnapshot, getUndoSegmentKey as getUndoSegmentKeyPure } from "./sim/snapshot.js";
import { AssetIcon } from "./AssetIcons.jsx";
import { RoleBanner } from "./ui/RoleBanner.jsx";
import { ChatDrawer } from "./ui/ChatDrawer.jsx";
import { HelpOverlay } from "./ui/HelpOverlay.jsx";
import { TutorialOverlay, TUTORIAL_STORAGE_KEY } from "./ui/TutorialOverlay.jsx";
import { HazardFrameworkPanel } from "./ui/HazardFrameworkPanel.jsx";
import { FiguresGallery } from "./ui/FiguresGallery.jsx";
import { applySafetyRadius, restoreSafetyRadius, parseBuffersJson, zonesToSafetyRadiusKm } from "./sim/hazardZones.js";
import { SCENARIO_PRESETS, seedPlayerLayout, getScenarioPreset } from "./sim/scenarioPresets.js";
import { MissionLogPanel } from "./ui/MissionLogPanel.jsx";
import { PhysicsParametersPanel } from "./ui/PhysicsParametersPanel.jsx";
import { InjectResponseModal } from "./ui/InjectResponseModal.jsx";
import { AnalyticsPanel } from "./ui/AnalyticsPanel.jsx";
import { GifReadyModal } from "./ui/GifReadyModal.jsx";
import { AssetDetailSidebar } from "./ui/AssetDetailSidebar.jsx";
import { ExploreSidebar } from "./ui/ExploreSidebar.jsx";
import { Scorebar } from "./ui/Scorebar.jsx";
import { NegotiationPanel } from "./ui/NegotiationPanel.jsx";
import { RoundTransitionBanner } from "./ui/RoundTransitionBanner.jsx";
import { DiplomacyBanner } from "./ui/DiplomacyBanner.jsx";
import { ClaimsPanel } from "./ui/ClaimsPanel.jsx";
import { PlotsPanel } from "./ui/PlotsPanel.jsx";



// ── v210: illumination-search memoization ───────────────────────────────────
// CPU profiling of the headless Monte Carlo showed ~48% of ALL cycles inside
// findBestIllumSiteNear / findTopIllumSitesNear, O(r²) scans over ILLUM_MAP,
// re-run every bot planning tick for coordinates that never move (crater
// centres, base sites). ILLUM_MAP is static map data (physOverrides never
// touch it), so results are pure in (x, y, radius[, limit]) and safe to cache
// for the lifetime of the module, including ACROSS Monte Carlo trials.
// Bounded so a pathological live session can't grow it without limit.
const _illumCacheBest = new Map();
const _illumCacheTop = new Map();
const _ILLUM_CACHE_MAX = 20000;
function _illumCacheGet(map, key) { return map.get(key); }
function _illumCacheSet(map, key, value) {
  if (map.size >= _ILLUM_CACHE_MAX) map.clear();
  map.set(key, value);
  return value;
}


import {
  // Constants -- physics, economy, time, asset costs
  W, H,
  MAP_KM_PER_PX, PIXELS_PER_KM, POLE_PX, MAP_KM,
  ROVER_STEP,
  ROVER_RECHARGE_LOW, ROVER_RECHARGE_HIGH,
  BASE_MINE_RATE, ICE_MASS_FRACTION,
  POWER_BASE_DRAIN, POWER_MOVE_DRAIN,
  PANEL_RIDGE, REACTOR_OUTPUT,
  BASE_ASSET_COSTS, ASSET_POINTS,
  COMSAT_RELAY_RADIUS, COMMS_BLACKOUT_THRESHOLD,
  RESUPPLY_CHUNK, RESUPPLY_COST, RESUPPLY_POOL,
  MAX_PANELS, MAX_HABITATS, MAX_ROVERS, MAX_PADS, MAX_REACTORS,
  POWER_CAP, HABITAT_POWER_CAP, HABITAT_POWER_INIT,
  POWER_LOW, ICE_CAP,
  DAYS_PER_ROUND,
  DEPLETION_RATE,
  E_INIT,
  SAFETY_RADIUS, ZONE_TIER_MULT, ZONE_TIERS,
  ZONE_KM, ZONE_RADII_PX, ZONE_DRAW_RADII_PX, ZONE_DISPLAY_SCALE, ZONE_KEEPOUT_MAGNIFICATION, ZONE_DEFAULT_MAGNIFICATION, ZONE_MAGNIFICATION_BOUNDS,
  PLAYER1_COLOR, PLAYER2_COLOR, TIER_KEYS, TIER_LABELS, TIER_SCALE_BOUNDS, DEFAULT_TIER_SCALE,
  PASSIVE_DECAY, HOSTILE_DECAY, LANDING_DAMAGE, PAD_DUST_MITIGATION, PAD_GEO_BONUS, MIL_DEFENSE_SCALE,
  GIF_FRAME_DELAY, GIF_OVERLAY_HEIGHT,
  PHASE, STATUS_INFO,
  // Stakeholders
  STAKEHOLDER_DEFS, getStakeholderDef,
  BLOC_SUBACTORS, negotiateBloc,
  // Map data -- layer manifest + live typed-array buffers + geographic helpers
  MAP_LAYERS, BASEMAP_OPTIONS, VECTOR_OVERLAYS, LAYER_INFO, LAYER_PRESETS,
  CRATER_LABELS, GRATICULE_LABELS,
  PSR_MASK, RIDGE_MASK,
  ILLUM_MAP, ICE_DEPTH_MAP, HYDROGEN_MAP, TEMPERATURE_MAP,
  EARTH_VIS_MAP, SLOPE_MAP,
  LFI_MAP, SOFI_MAP, IFI_MAP, INDEX_RANGES,
  FEASIBILITY_MAPS, FEASIBILITY_RANGES, FEASIBILITY_ASSETS, FEASIBILITY_CARDS,
  PIXEL_CRATER, CRATER_DATA, LAYER_IMAGES,
  pxToLatLon,
  earthVisAt, effectiveEarthVis, isInCommsBlackoutFor, pooledComsats,
  loadMapData,
  // Utilities
  dist, clamp, lerp, snapToPSR,
  isNight, hasPlacementGrace,
  getCraterIceCapacity, getTotalMapIce,
  downloadBlob,
  // Physics + analysis
  analyzePixel, siteIndices, roverSlopeFactor,
  // Economy + player factory
  calcBudget, calcAssetCosts, calcCompetitiveness,
  calcDeltaE, calcDeltaR, calcDeltaM,
  calcMilScore,
  makePlayer,
  scorePlayerState as scorePlayerStatePure,
  effectiveTierScales,
  zoneAssetCount,
  TIER_OVERREACH_WEIGHT, SCORE_OVERREACH_PENALTY,
  SCORE_PENALTY_VIO, SCORE_PTS_PER_AP,
  debriefAnalysis,
  pickMergedGridState,
  ALLOC_PRESETS, DEFAULT_PRESET_KEY,
  // Power allocation
  allocateDailyPower,
  // Unpowered-habitat penalty (v174)
  applyUnpoweredHabitatPenalty,
  applyStrandedRoverPenalty, applyRoverRescue,
  governanceViolationWeight, governanceIdForPreset,
  // Auto-targeting (rover route selection)
  pickRoverTarget, shouldRecharge,
  // Auto-fit viewport (cinematic camera framing)
  computeAutoFitViewport,
  // Enemy safety-zone helpers
  buildEnemyZones, pointInAnyZone, applySafetyDecay, isZoneExempt, attributeSafetyViolations, coordinationIntrusions,
  makeOrbitalObject, disposeOrbitalObject, tickOrbitalObjects, debrisViolationCount,
  // Display-string helpers
  structureLabel, craterName,
  // Plot data builder
  buildPlotDefinitions,
  // Round-summary export
  buildRoundSummaryText,
  buildMissionLogCsv,
  buildDetailedCsv,
  buildReconstructionCsv,
  actorMetricSnapshot,
  buildMissionStateJson,
  // Day step + claim map
  simDay, computeClaims,
  // Diplomacy session (v176)
  conveneSession, sessionActive, sessionTimeLeftMs, sessionProgress,
  formatSessionClock, sessionConvenerLabel, shouldAutoConvene,
  DIPLOMACY_DEFAULT_MS,
  // Fog of war (v177)
  sensorSources, pointRevealed,
  // Public claims / propaganda (v181)
  makeClaim, resolveClaim, setClaimStance,
} from "./sim/index.js";

// Kept in sync with package.json's version; stamped into exports.
const APP_VERSION = "2.7.189";
// v185: supersample factor for the overlay "work" canvas. Everything drawn on
// the work canvas (safety rings, the reactor FSP 3-ring, power/comms links,
// crater badges) is rendered at WORK_SS× source resolution and smooth-blit
// down to the display canvas, so those vectors stay crisp at zoom instead of
// being upscaled from the old 1:1 (1212²) source. Safe because draw() does no
// per-pixel getImageData on this canvas (all per-pixel tints are pre-baked on
// separate offscreen canvases).
// v197: device-aware. DESKTOP renders overlays at 4× (backing store 4848² ≈
// 94 MB) for maximum crispness; TOUCH/MOBILE caps at 3× (3636²) because iOS /
// mobile Safari limits a canvas to 4096 px per side, 4× (4848 px) would exceed
// that and blank the overlay. Coarse pointer ≈ touch ≈ exactly the devices with
// that cap (incl. iPad). Evaluated once at load; quality is fixed per device.
// v197: is this a touch / mobile device? Coarse pointer ≈ touch ≈ the devices
// (incl. iPad) that cap a canvas at 4096 px per side and are more memory-bound.
// Evaluated once at load and reused for both the overlay supersample factor and
// the display-canvas DPR so desktop can render sharper without risking mobile.
const IS_COARSE_POINTER = (() => {
  try {
    return typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(pointer: coarse)").matches;
  } catch { return false; }
})();
const WORK_SS = IS_COARSE_POINTER ? 3 : 4;

// v45: shared layer-toggle definitions. Previously the settings screen
// and the in-game HUD strip kept independent literal arrays with
// mismatched labels ("Mine Heat" vs "Heat", "Night Cycle" vs "Night")
// and different sets of toggles (settings had `psr_depletion`, the HUD
// had `grid`). One source of truth here -- the lists below feed both
// renderers. Order is the on-screen order; `short` is the HUD label,
// `long` is the settings-screen label.
const LAYER_TOGGLES = [
  { key: "psr",           short: "PSRs",       long: "PSR Overlay"    },
  { key: "comms_blackout",short: "Comms",      long: "Comms Blackout" },
  { key: "mine",          short: "Heat",       long: "Mine Heat"      },
  { key: "claims",        short: "Claims",     long: "Claims"         },
  { key: "craters",       short: "Depletion",  long: "Depletion"      },
  { key: "ridge",         short: "Ridge",      long: "Sunlit Ridge"   },
  { key: "night",         short: "Night",      long: "Night Cycle"    },
  { key: "grid",          short: "Grid",       long: "Grid Lines"     },
  { key: "safety",        short: "Zones",      long: "Safety Zones"   },
  { key: "violations",    short: "Breach",     long: "Violations"     },
  { key: "power",         short: "Battery",    long: "Battery / Charge" },
  { key: "psr_depletion", short: "PSR Tint",   long: "PSR Tint"       },
];

// v70: paint a computed favorability layer (LFI / SOFI / IFI, or the RGB
// composite) into an offscreen canvas from its index raster. Pure aside from
// canvas creation; cached by the caller since the rasters never change after
// load. NaN pixels (no map data) stay fully transparent so the background is
// never painted as a pristine site.
function buildIndexLayerCanvas(key) {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const cx = cv.getContext("2d");
  const img = cx.createImageData(W, H);
  const d = img.data;
  const norm = (v, range) => {
    const lo = range[0], hi = range[1];
    return hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 0;
  };
  // v72: improved per-channel rendering.
  // Single channels: gamma 0.65 (was 0.8) lifts mid-values more aggressively
  //   so faint favorability regions are visible, not just the hotspots.
  //   Alpha uses a two-stage curve: near-zero values drop to 0 (no noise),
  //   mid-range lifts, peak stays fully opaque.
  // Composite: per-channel gamma 0.72 + alpha from max-channel so the
  //   darkest pixels stay transparent rather than muddying the basemap.
  const GAMMA = 0.65;
  const single = {
    idx_lfi:  [LFI_MAP,  INDEX_RANGES.lfi,  [255, 90, 82]],
    idx_sofi: [SOFI_MAP, INDEX_RANGES.sofi, [84, 236, 106]],
    idx_ifi:  [IFI_MAP,  INDEX_RANGES.ifi,  [63, 182, 255]],
    // v125 (item 8): per-asset placement feasibility layers. Each renders the
    // FEASIBILITY_MAPS raster for one buildable asset in a distinct hue, so a
    // player toggling "feas_solar" sees where panels are viable, etc.
    feas_solar:   [FEASIBILITY_MAPS.solar,   FEASIBILITY_RANGES.solar,   [255, 196, 64]],
    feas_reactor: [FEASIBILITY_MAPS.reactor, FEASIBILITY_RANGES.reactor, [255, 110, 90]],
    feas_habitat: [FEASIBILITY_MAPS.habitat, FEASIBILITY_RANGES.habitat, [120, 220, 150]],
    feas_pad:     [FEASIBILITY_MAPS.pad,     FEASIBILITY_RANGES.pad,     [160, 200, 255]],
    feas_rover:   [FEASIBILITY_MAPS.rover,   FEASIBILITY_RANGES.rover,   [200, 170, 255]],
    feas_comsat:  [FEASIBILITY_MAPS.comsat,  FEASIBILITY_RANGES.comsat,  [128, 230, 232]],
  }[key];
  const N = W * H;
  if (key === "idx_composite") {
    // v90: tuned to read like the post's Figure 5 over a darkened relief.
    //   - Color gamma 0.85 keeps mid/high favorability vivid (not crushed).
    //   - Ice (blue) gets a dominance boost: where IFI is the strongest
    //     channel, we suppress the R/G so PSR floors read as saturated blue
    //     pools rather than blue-tinted yellow.
    //   - Alpha uses a steeper curve (gamma 1.35 with a higher cutoff) so
    //     low-favorability terrain fades to the near-black base instead of
    //     flooding the whole plateau a flat yellow-green.
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      const l = LFI_MAP[i];
      if (Number.isNaN(l)) { d[o + 3] = 0; continue; }
      let r = Math.pow(norm(l, INDEX_RANGES.lfi), 0.85);
      let g = Math.pow(norm(Math.max(0, SOFI_MAP[i]), INDEX_RANGES.sofi), 0.85);
      let b = Math.pow(norm(IFI_MAP[i], INDEX_RANGES.ifi), 0.85);
      // Warm gradient: where landing leads operations, ease green down so the
      // pixel reads yellow -> orange (the post's "landable but comms/ops
      // weaker" band) instead of flat yellow everywhere R and G are both high.
      if (r > g) g *= 0.78;
      // Ice dominance: when blue clearly leads, pull down the warm channels so
      // the pixel reads as ice-blue (the post's isolated PSR pools).
      if (b > 0.35 && b > r && b > g) {
        const k = Math.min(1, (b - Math.max(r, g)) * 2.2);
        r *= (1 - 0.75 * k);
        g *= (1 - 0.75 * k);
      }
      const mx = Math.max(r, g, b);
      d[o] = (r * 255) | 0; d[o + 1] = (g * 255) | 0; d[o + 2] = (b * 255) | 0;
      // Steeper alpha: nothing below 0.12 paints; the rest ramps with gamma
      // 1.35 so only strong favorability is fully opaque.
      d[o + 3] = mx < 0.12 ? 0 : (255 * Math.pow((mx - 0.12) / 0.88, 1.35)) | 0;
    }
  } else if (single) {
    const buf = single[0], range = single[1], col = single[2];
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      const v = buf[i];
      if (Number.isNaN(v)) { d[o + 3] = 0; continue; }
      const t = Math.pow(norm(v, range), GAMMA);
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2];
      // Two-stage alpha: below 0.08 raw → fully transparent (suppresses noise)
      //                  0.08-1.0       → smooth ramp from 0 to 255
      const raw = norm(v, range);
      d[o + 3] = raw < 0.08 ? 0 : (t * 255) | 0;
    }
  } else {
    return null;
  }
  cx.putImageData(img, 0, 0);
  return cv;
}

function GameApp({ mp, showMpChrome }) {
  const canvasRef = useRef(null);
  // v50: outer map container ref used to invert the zoom+pan display transform
  // in getXY so waypoint clicks land on the correct source-pixel coordinate
  // at any zoom level.
  const mapContainerRef = useRef(null);
  // v150: live map-container width (CSS px), tracked via ResizeObserver, so
  // the scale bar can convert km <-> on-screen pixels as the container is
  // resized (responsive layouts, window resize, sidebar toggles, etc).
  const [mapContainerWidth, setMapContainerWidth] = useState(0);
  useEffect(() => {
    let ro;
    let rafId;
    const tryAttach = () => {
      const el = mapContainerRef.current;
      if (!el) {
        rafId = requestAnimationFrame(tryAttach);
        return;
      }
      ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          setMapContainerWidth(entry.contentRect.width);
        }
      });
      ro.observe(el);
      setMapContainerWidth(el.offsetWidth);
    };
    tryAttach();
    return () => {
      if (ro) ro.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);
  // v27: dropped `mapRef` ref -- the basemap renders via a sibling DOM
  // `<img>` element (gated on `mapLoaded`), not from a JS reference. The
  // ref was set but never read.
  // v27: removed unused `illumRef` and its loader useEffect. The illum map
  // is already loaded by sim/mapData.js into the typed-array ILLUM_MAP
  // singleton; the separate Image() ref was leftover dead state, never
  // read by the renderer. Eliminated one redundant HTTP request and image
  // decode at boot.
  // Vector SVG overlay image refs (slope, earth-vis, sun). Toggled by
  // activeVectorOverlays state.
  const slopeOverlayRef = useRef(null);
  const earthOverlayRef = useRef(null);
  const sunOverlayRef   = useRef(null);
  // v92: raster-canvas versions of the slope and comms-contour vector overlays,
  // baked from SLOPE_MAP / EARTH_VIS_MAP after loadMapData(). Two bands for
  // slope (moderate >=10deg, steep >=25deg); single threshold for comms (< 0.30).
  // v93: solar potential canvas baked from ILLUM_MAP, three illumination bands.
  // All canvases disk-clipped to 80S.
  const slopeCanvasRef        = useRef(null);
  const commsContourCanvasRef = useRef(null);
  const solarCanvasRef        = useRef(null);
  const overlayScratchRef = useRef(null);
  // v70: cache for the computed favorability layers (LFI/SOFI/IFI/composite).
  // They never change after load, so each is painted into an offscreen canvas
  // once and reused, keyed by layer key.
  const indexLayerCacheRef = useRef({});
  const liveTimelineKeyRef = useRef("");
  const gifSavedSnapshotRef = useRef(null);
  const saveFileInputRef = useRef(null);
  const plotCanvasRefs = useRef({});
  // v21: tracks the signature of the previous frame's violations so the
  // canvas redraw doesn't kick the HUD into an infinite re-render loop.
  const lastViolationSigRef = useRef("");
  // Guard against the resolution effect firing twice in the same turn.
  // This can happen because (a) React StrictMode double-invokes effects in dev,
  // and (b) p1/p2 are in the dep array so setP1/setP2 inside the effect can
  // retrigger it before setP1Done(false)/setP2Done(false) have taken effect.
  const resolvingRef = useRef(false);
  // v160: monotonic placement-sequence counter. Every base / rover / structure
  // gets the next `seq` when it is placed, so the safety-violation attribution
  // can tell who put an asset down FIRST in a contested area (the earlier seq is
  // innocent; the later one is the violator). A ref, not state, it never needs
  // to trigger a render, just hand out strictly increasing integers.
  const assetSeqRef = useRef(1);
  const nextSeq = useCallback(() => assetSeqRef.current++, []);
  // v21: cached offscreen canvas for the comms-blackout map overlay.
  const commsBlackoutCanvasRef = useRef(null);
  // v73: pre-baked PSR overlay canvas (fuchsia tint over permanently-shadowed
  // regions). Built once from PSR_MASK after map load; blitted per frame when
  // the psr layer is active. Avoids per-pixel work in the draw loop.
  const psrCanvasRef = useRef(null);
  // v73: pre-baked ridge glow canvas. Built once from RIDGE_MASK; replaces the
  // per-frame shadowBlur loop that was killing frame rate (100k+ draws/frame).
  const ridgeCanvasRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  // Settings
  const [totalRounds, setTotalRounds] = useState(12);
  const [missionEndMode, setMissionEndMode] = useState("fixed");
  const [scenarioPreset, setScenarioPreset] = useState("standard");
  const [arrivalDelay, setArrivalDelay] = useState(5);
  const [gridSharingEnabled, setGridSharingEnabled] = useState(true);
  const [gridSharingPermanent, setGridSharingPermanent] = useState(false);
  // Stakeholder archetype per actor. null = generic; otherwise a stakeholder id
  // from STAKEHOLDER_DEFS. The default game is Artemis vs ILRS to seed the
  // classic governance tension the simulation is designed to explore.
  // Default matchup: the Concordium consortium (Vanguard + Aurelian Union +
  // Halcyon, shown in the bloc-disaggregation panel) vs LRC, four brief actors
  // represented across the two board slots. Either slot can be re-picked in the
  // lobby (e.g. an individual member, or the Ascendant Initiative as a late arriver).
  const [actorRoles, setActorRoles] = useState(["concordium", "ilrs"]);
  // Helper: display label for an actor. Falls back to generic if no role set.
  const actorLabel = useCallback((pi) => {
    const id = actorRoles[pi];
    if (!id) return pi === 0 ? "Actor I" : pi === 1 ? "Actor II" : "Actor III";
    return getStakeholderDef(id).name;
  }, [actorRoles]);
  // v27: removed unused `actorShort` -- defined but never invoked. If a
  // future UI needs the short stakeholder name (e.g. "ARTEMIS", "ILRS"),
  // call getStakeholderDef(actorRoles[pi])?.short inline.

  // ── Tool-mode features ────────────────────────────────────────────────────
  const [simMode, setSimMode]         = useState("competitive"); // "competitive" | "solo" | "analysis"
  const [autoAdvance, setAutoAdvance] = useState(false);         // auto-step turns
  // v21: bumped default from 800ms → 1800ms → 2400ms per turn. The old
  // pace blew through a full 7-day round in ~5.6s; 2400ms gives each day
  // ~2.4s and a round ~16.8s, which lets workshop facilitators narrate
  // each day's events without pausing the auto-loop.
  const [autoSpeed, setAutoSpeed]     = useState(2400);          // ms per turn
  // Facilitator-controlled wall-clock round duration. 0 = manual (rounds end
  // only when actors finish or the facilitator pushes). When > 0, the host
  // auto-advances to the next round this many ms after each round begins.
  const [roundDurationMs, setRoundDurationMs] = useState(0);
  // v160: the facilitator's round duration now MEANS something in-sim, not just
  // a wall-clock auto-advance timer. A longer round is "actually longer", its
  // rovers travel proportionally farther and its economy pays out proportionally
  // more. The multiplier is referenced to the 2-minute baseline and capped so a
  // 10-minute round can't run away: Manual/2min → 1×, 5min → 2.5×, 10min → 4×.
  const roundLenMul = useMemo(() => {
    const ms = roundDurationMs || 0;
    if (ms <= 0) return 1;
    return Math.min(4, Math.max(1, ms / 120000));
  }, [roundDurationMs]);
  const [missionLog, setMissionLog]   = useState([]);            // full structured event log
  const [annotations, setAnnotations] = useState([]);            // { x, y, label, color, ts }
  const [annotating, setAnnotating]   = useState(false);         // annotation placement mode
  // Explore-terrain mode: when true, clicks on the map open a detailed
  // terrain analysis pane with equipment recommendations for that pixel.
  const [exploreMode, setExploreMode] = useState(false);
  const [exploreClick, setExploreClick] = useState(null);
  // Vector physics overlays toggleable from the Layers panel. Each entry
  // is the key into MAP_LAYERS (overlay_slope / overlay_earth / overlay_sun).
  const [activeVectorOverlays, setActiveVectorOverlays] = useState(new Set()); // {x, y} of last analyzed click
  // v105: a crisp DOM-rendered favorability overlay. Unlike the canvas-drawn
  // idx_composite (which pixelates on zoom because it is rasterized at 1212px
  // then scaled), this layers a published true-vector plate as an <img> inside
  // the same zoom-transformed wrapper as the basemap, so it stays sharp at any
  // zoom. null = off; otherwise one of the basemap_fig_* favorability keys.
  // v114: the favorability view defaults to the CRISP VECTOR composite (the
  // published true-vector plate of the same index model), not the canvas
  // raster, so the default map stays sharp at any zoom. The raster composite
  // layer is still available from the Layers panel (it carries the live
  // per-pixel alpha falloff), but the vector plate is the better default look
  // and was the last pixelated thing in the startup view.
  const [vectorOverlay, setVectorOverlay] = useState("basemap_fig_composite");
  const [vectorOverlayOpacity, setVectorOverlayOpacity] = useState(0.85);
  const [annotNote, setAnnotNote]     = useState("");            // pending annotation text
  const [showLog, setShowLog]         = useState(false);         // mission log panel open
  const [showParams, setShowParams]   = useState(false);         // physics params panel open
  const [showAnalytics, setShowAnalytics] = useState(false);     // analytics panel open
  const [showHelp, setShowHelp] = useState(false);               // v27: keyboard shortcuts overlay
  const [showTutorial, setShowTutorial] = useState(false);       // v84: first-time "how to play" guided tour
  const [showHazard, setShowHazard] = useState(false);           // v85: OLF DLA hazard framework panel
  const [showFigures, setShowFigures] = useState(false);         // v98: published map figures gallery
  const [hazardSnapshot, setHazardSnapshot] = useState(null);    // prior SAFETY_RADIUS px, for revert
  const [hazardRev, setHazardRev] = useState(0);                 // bump to force a redraw after radii change
  // v121 (item 4): retain the active DLA hazard summary so the map can show a
  // persistent badge naming the source and zones. Without this the only sign a
  // hazard scenario was applied was the rings quietly changing radius, which
  // made Aaron's Lunar Radius Framework work invisible in the sim.
  const [activeHazard, setActiveHazard] = useState(null);        // { site, label, zones:{core,buffer,coord} } or null
  // v134 (roadmap: orbit layer integration). Surface debris keep-out zones left
  // by crash-disposed orbital objects. Each is { x, y, r, owner, decayRounds }
  // in the {x,y,r} zone shape; they decay each round and render on the map.
  const [orbitalDebris, setOrbitalDebris] = useState([]);
  const [lunarContextExpanded, setLunarContextExpanded] = useState(false); // lunar context pill
  const [abstractExpanded, setAbstractExpanded] = useState(true); // settings-screen abstract block open
  const [workshopMode, setWorkshopMode] = useState(false);       // facilitator-managed simplified UI
  // v175: score visibility. "shown" = exact numbers; "proxy" = qualitative
  // standing only ("Actor I clearly ahead") to stop players gaming the number;
  // "hidden" = no standing at all until the debrief. The final DONE screen
  // always reveals the real scores regardless of this setting.
  const [scoreVisibility, setScoreVisibility] = useState("hidden"); // "shown" | "proxy" | "hidden"
  // v176: diplomacy session ("Conference of Parties"). When set, a talk-only
  // pause is in effect: the day clock and the wall-clock round timer freeze and
  // actors negotiate. `diplomacy` is the session record (or null); the rest are
  // facilitator settings + a running count for the debrief.
  const [diplomacy, setDiplomacy] = useState(null);
  const [diplomacySessionsHeld, setDiplomacySessionsHeld] = useState(0);
  const [diplomacyDurationMs, setDiplomacyDurationMs] = useState(DIPLOMACY_DEFAULT_MS);
  const [diplomacyAutoEvery, setDiplomacyAutoEvery] = useState(0); // 0 = off; N = auto-convene every N rounds
  // v177: fog of war. When on, an actor sees the rival's asset POSITIONS only
  // where its own sensors (rovers + comsat surveillance + local awareness)
  // currently cover them. Force composition counts stay public. Default off so
  // existing sessions are unchanged.
  const [fogOfWar, setFogOfWar] = useState(false);
  // v180: expandable "what each budget lever does" explainer in the stance panel.
  const [allocHelpOpen, setAllocHelpOpen] = useState(false);
  // v181: public claims / propaganda board. `claims` is synced to all seats;
  // `showClaims` is a local UI toggle.
  const [claims, setClaims] = useState([]);
  const [showClaims, setShowClaims] = useState(false);
  // Live-editable physics overrides (null = use constant). Override consumers
  // read physOverrides[key] directly inline; an earlier `phys(key, default)`
  // helper was never wired up and has been removed.
  const [physOverrides, setPhysOverrides] = useState({});

  // Game state
  const [phase, setPhase]         = useState(PHASE.SETTINGS);
  const [p1, setP1]               = useState(null);
  const [p2, setP2]               = useState(null);
  const [craterHealth, setCraterHealth] = useState(() => new Float32Array(CRATER_DATA.length).fill(1.0));
  // v179: per-DAY reconstruction trace (host-local, NOT synced over MP so it
  // doesn't bloat snapshots). Keyed by globalDay so re-resolving a day after an
  // undo overwrites cleanly; the export reads entries up to the current day.
  // Each value: { round, day, globalDay, rovers1, rovers2, craterH } where the
  // rover strings are "x,y,ice,power,status;..." per rover.
  const tickTraceRef = useRef(new Map());
  const [round, setRound]         = useState(1);
  const [day, setDay]             = useState(0);       // 0..DAYS_PER_ROUND-1
  const [globalDay, setGlobalDay] = useState(0);
  const [history, setHistory]     = useState([]);
  const [claimR, setClaimR]       = useState([80, 80]);
  const [hover, setHover]         = useState(null);
  // v45: legend ↔ map cross-highlight. When the user hovers a legend row,
  // store its key here; the canvas renderer dims the rest of the basemap
  // and re-strokes the matched feature so workshop participants can find
  // "where is the rover exclusion zone on this map?" in one glance.
  // Keys match the `swatch` field on legend entries -- see the legend
  // block (~line 8580) for the full enumeration.
  const [hoveredLegendKey, setHoveredLegendKey] = useState(null);
  // v202: legend "declared zone size" sliders, drag preview committed on release
  // ({ key, v } while dragging), so a drag is one dispatch + one log line.
  const [legendTierDrag, setLegendTierDrag] = useState(null);
  // v73: psr and comms_blackout are now proper showLayers toggles, on by default.
  const [showLayers, setShowLayers] = useState({ mine:true, claims:true, craters:true, ridge:false, night:true, grid:false, safety:true, violations:true, power:true, psr_depletion: false, psr: true, comms_blackout: true });
  // v199: ring display size is now PER-PLAYER (player.ringMag), so each actor
  // sizes their own equipment's rings. See setRingMag / the zone-legend control.
  // Pulse counter for animated violation indicators. Ticks 6x per second.
  // Only ticks when violations might exist -- saves CPU when idle.
  const [pulseTick, setPulseTick] = useState(0);
  useEffect(() => {
    if (!showLayers.safety) return;
    const id = setInterval(() => setPulseTick(t => (t + 1) % 1000), 160);
    return () => clearInterval(id);
  }, [showLayers.safety]);

  // v84: first-time participants get the "how to play" tour automatically,
  // exactly once per browser. The flag is set on close (see closeTutorial),
  // so a returning facilitator projecting a session never gets surprised by
  // it mid-demo. localStorage may be unavailable (private mode / sandboxed
  // iframe); if so we just skip the auto-show rather than crash.
  useEffect(() => {
    try {
      if (!localStorage.getItem(TUTORIAL_STORAGE_KEY)) setShowTutorial(true);
    } catch { /* storage blocked -- no auto-show, manual H / toolbar still work */ }
  }, []);

  const closeTutorial = useCallback(() => {
    setShowTutorial(false);
    try { localStorage.setItem(TUTORIAL_STORAGE_KEY, "1"); } catch { /* ignore */ }
  }, []);

  // v87: if the active scenario carries a pre-built layout (NASA Phase 1),
  // seed the just-placed base with it. Pure helper from scenarioPresets.js;
  // the ridge predicate lets seeded solar arrays know if they sit on a peak.
  const seedForScenario = useCallback((player, base) => {
    const preset = getScenarioPreset(scenarioPreset);
    if (!preset?.seedLayout) return player;
    return seedPlayerLayout(player, preset.seedLayout, base, {
      ridgeAt: (x, y) => RIDGE_MASK?.[y * W + x] === 1,
    });
  }, [scenarioPreset]);

  // v85: apply DLA-framework-derived radii to the live SAFETY_RADIUS. We mutate
  // the shared constants object in place (every sim module imported the same
  // reference and reads SAFETY_RADIUS[key] live), snapshot the prior pixels for
  // an exact revert, bump hazardRev to redraw the rings now, and log it so the
  // change is visible in the debrief. Future sim steps pick up the new radii
  // automatically on the next day resolution.
  const applyHazard = useCallback((kmMap, summary) => {
    setHazardSnapshot(prev => {
      // First apply captures the true defaults; re-applies keep that baseline.
      const baseline = prev ?? { ...SAFETY_RADIUS };
      applySafetyRadius(SAFETY_RADIUS, kmMap, PIXELS_PER_KM);
      return baseline;
    });
    setHazardRev(r => r + 1);
    setActiveHazard({
      site: summary?.site || summary?.siteName || null,
      label: summary?.label || "custom",
      zones: summary?.zones || null,
    });
    const site = summary?.site ? ` at ${summary.site}` : "";
    const reactorNote = summary?.reactorZone ? ` · reactor→${summary.reactorZone}` : "";
    appendMissionLog({
      type: "policy",
      label: `DLA hazard zones applied${site}: ${summary?.label ?? "custom"} · core ${summary?.zones?.core?.toFixed?.(1)}km / buffer ${summary?.zones?.buffer?.toFixed?.(1)}km / coord ${summary?.zones?.coord?.toFixed?.(1)}km${reactorNote}`,
    });
  }, [round, day, globalDay]);

  const resetHazard = useCallback(() => {
    setHazardSnapshot(prev => {
      if (prev) restoreSafetyRadius(SAFETY_RADIUS, prev);
      return null;
    });
    setHazardRev(r => r + 1);
    setActiveHazard(null);
    appendMissionLog({ type: "policy", label: "DLA hazard zones reset to default safety radii" });
  }, [round, day, globalDay]);

  // v21: end-of-round transition banner. When a round wraps, we set this to
  // { round, until } and the auto-advance loop holds a beat so the
  // facilitator/player can read the scoring tick and any violations that
  // crystallized this round before the next round begins.
  const [roundTransition, setRoundTransition] = useState(null);

  // v21: persistent live-violation summary used by the HUD overlay. Computed
  // every render of the canvas (see safety-rings block) and surfaced as a
  // corner badge that's hard to miss even if the rings themselves get busy.
  const [activeViolations, setActiveViolations] = useState([]);

  // v21: when a new asset is placed, briefly camera-focus on it. Set to a
  // { x, y, until } object; the auto-fit effect respects it as an override
  // until `until` passes.
  const [focusPulse, setFocusPulse] = useState(null);

  // v21: clear focusPulse / roundTransition once their `until` passes, so
  // dependent effects (auto-fit, auto-advance) re-evaluate and resume
  // normal behavior. Without this they'd stay "active" until some other
  // state change happened to re-render.
  useEffect(() => {
    if (!focusPulse) return;
    const remaining = focusPulse.until - Date.now();
    if (remaining <= 0) { setFocusPulse(null); return; }
    const t = setTimeout(() => setFocusPulse(null), remaining + 30);
    return () => clearTimeout(t);
  }, [focusPulse]);
  useEffect(() => {
    if (!roundTransition) return;
    const remaining = roundTransition.until - Date.now();
    if (remaining <= 0) { setRoundTransition(null); return; }
    const t = setTimeout(() => setRoundTransition(null), remaining + 30);
    return () => clearTimeout(t);
  }, [roundTransition]);

  // Turn-based state
  // activeTurn: 0 = P1's turn to plan, 1 = P2's turn to plan
  // "planning" = player setting their waypoint/action
  // After both players have ended their turn for a day, we advance globalDay
  const [activeTurn, setActiveTurn]   = useState(0);   // whose turn it is to plan
  const [p1Done, setP1Done]           = useState(false); // P1 confirmed their action this step
  const [p2Done, setP2Done]           = useState(false); // P2 confirmed their action this step
  const [selectingFor, setSelectingFor] = useState(null); // null | 0 | 1
  const [placingFor, setPlacingFor]   = useState(null); // null | 0 | 1 -- turn-1 manual placement
  const [placingType, setPlacingType] = useState(null); // 'solar' | 'reactor' | 'habitat' | 'pad'
  const [selectedRover, setSelectedRover] = useState([0, 0]); // per-player: 0=primary, 1+=extra rover index
  const [addingWaypoint, setAddingWaypoint] = useState(false);
  const [lastEvents, setLastEvents]     = useState([]);   // events from last step for toast display
  const [selectedBuild, setSelectedBuild] = useState([null, null]); // per-player selected build type
  const [selectedDiplomacy, setSelectedDiplomacy] = useState([null, null]); // per-player power-grid action
  const [selectedComms, setSelectedComms] = useState([null, null]); // v103: per-player comms-grid action
  const [selectedPad, setSelectedPad]     = useState([0, 0]);       // per-player selected landing pad index
  const [baseMap, setBaseMap]             = useState("basemap_fig_topo"); // v104: published true-vector topo contours, crisp at any zoom, dark base for favorability overlays
  const RASTER_BASEMAPS = new Set(["basemap_quickmap","basemap_illum","annual_illum","basemap_lroc_relief"]);
  const [activeOverlays, setActiveOverlays] = useState(() => new Set()); // v114: favorability now defaults to the crisp VECTOR composite (vectorOverlay), not the raster idx_composite. The raster layer remains toggleable in the Layers panel.
  // v160: one-shot facilitator "push my view to all screens" payload. The map
  // view is per-client now, so this is the deliberate escape hatch for a
  // workshop facilitator who wants everyone looking at the same thing. Carries a
  // nonce so peers apply it exactly once (see the snapshot ingest below).
  const [viewPush, setViewPush] = useState(null);
  const lastViewPushNonceRef = useRef(0);
  const [viewPushToast, setViewPushToast] = useState(""); // brief peer confirmation when a view is pushed
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);
  const [injectsPanelOpen, setInjectsPanelOpen] = useState(false);
  // DEV BACKDOOR, remove before ship
  const [devFacilitator, setDevFacilitator] = useState(false);
  // Queue of inject missionLog entries waiting for this actor's response.
  const [pendingInjects, setPendingInjects] = useState([]);
  const seenInjectIds = useRef(new Set()); // tracks ts-keyed injects already queued
  // Autopilot: when on, the sim auto-allocates budget and auto-orders
  // resupply at the start of each actor's turn. The user is left with
  // critical decisions: where to send rovers, what to build, when to
  // engage in diplomacy. Default ON because that's the workshop posture.
  const [autoPilot, setAutoPilot] = useState(true);
  const [roverDrag, setRoverDrag] = useState(null);
  const [assetDetail, setAssetDetail] = useState(null);
  // Viewport state: zoom (1.0 = fits the polar circle, > 1 zoomed in)
  // and pan (in source-pixel coordinates, where (0,0) means centered on the canvas)
  const [viewport, setViewport] = useState({ zoom: 1.0, panX: 0, panY: 0, autoFit: true });
  const toggleOverlay = useCallback((key) => {
    setActiveOverlays(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  // v182: apply a curated layer preset, replace the active data overlays with
  // the preset's set, and flip any base showLayers flags it specifies.
  const applyLayerPreset = useCallback((preset) => {
    setActiveOverlays(new Set(preset.overlays));
    if (preset.showLayers) setShowLayers(prev => ({ ...prev, ...preset.showLayers }));
  }, []);
  // Which preset (if any) the current overlay set exactly matches, for highlight.
  const activePresetKey = useMemo(() => {
    const cur = activeOverlays;
    for (const p of LAYER_PRESETS) {
      if (p.overlays.length !== cur.size) continue;
      if (p.overlays.every(k => cur.has(k))) return p.key;
    }
    return activeOverlays.size === 0 ? "clear" : null;
  }, [activeOverlays]);
  const [powerGridState, setPowerGridState] = useState({ mode:"independent", offeredBy:null, offeredTo:null });
  // v103: comms grid negotiation, parallel to the power grid. Same lifecycle
  // (independent -> offered -> shared), separate state so actors can share one,
  // both, or neither. Drives relay/DTE coverage cooperation.
  const [commsGridState, setCommsGridState] = useState({ mode:"independent", offeredBy:null, offeredTo:null });
  // v167: bilateral deals proposed between actors (negotiation engine).
  const [pendingDeals, setPendingDeals] = useState([]);
  const [batchRunCount, setBatchRunCount] = useState(100);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ completed:0, total:100, currentSeed:null });
  const [batchResult, setBatchResult] = useState(null);
  const [replayRun, setReplayRun] = useState(null);
  const [replayFrameIndex, setReplayFrameIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [liveTimeline, setLiveTimeline] = useState([]);
  const [gifExporting, setGifExporting] = useState(false);
  // Set when a GIF has been rendered and is ready to download. The user
  // clicks the visible link in the modal (always works) rather than relying
  // on the browser's silent auto-download (which can be blocked).
  const [gifReady, setGifReady] = useState(null); // {url, filename, size} | null
  const [showPlots, setShowPlots] = useState(false);
  const [separatePlotsOpen, setSeparatePlotsOpen] = useState({});
  const [undoStack, setUndoStack] = useState([]);

  // ── Auto-fit viewport (v21: cinematic) ───────────────────────────────────
  // The calculation lives in src/sim/viewport.js as a pure function. This
  // hook just wires it up: read state, call the function, set viewport.
  //
  // Priorities (high → low): focusPulse → setup-player only → playing
  // (rovers/pads/habitats weighted). See viewport.js for the math.
  useEffect(() => {
    if (!viewport.autoFit) return;
    const next = computeAutoFitViewport({ phase, p1, p2, focusPulse });
    if (next) setViewport((v) => ({ ...v, ...next }));
  }, [p1, p2, viewport.autoFit, phase, focusPulse]);

  // ── Multiplayer wiring ────────────────────────────────────────────────────
  // Host: broadcast snapshots whenever key state changes.
  // Peer: ingest snapshots and mirror host state.
  const isPeer = !!mp && mp.status === "joined";
  const isHost = !!mp && mp.status === "hosting";

  // Build a "snapshot" memo of the keys we care about so we can broadcast
  // them when they change. We trigger on the JSON-ish hash so we don't
  // resend identical state on every render.
  const snapshotForBroadcast = useMemo(() => {
    if (!isHost) return null;
    // Don't broadcast the transient "both done, resolving" state -- the resolved
    // snapshot follows immediately and is the authoritative version peers need.
    if (p1Done && p2Done) return null;
    return {
      phase, p1, p2, round, day, globalDay, history, claimR,
      // v156: showLayers is intentionally NOT broadcast. Layer visibility is a
      // per-client VIEW preference; syncing it meant the host's layer state
      // overwrote every peer's local toggles on each snapshot, which read as
      // "layers turn themselves off". Each client now owns its own view.
      simMode, autoAdvance, autoSpeed, roundDurationMs,
      totalRounds, missionEndMode, scenarioPreset,
      arrivalDelay, gridSharingEnabled, gridSharingPermanent,
      missionLog, annotations,
      activeTurn, p1Done, p2Done,
      selectingFor, placingFor, placingType,
      selectedRover, selectedBuild, selectedDiplomacy, selectedComms, selectedPad,
      powerGridState, commsGridState, pendingDeals, lastEvents, physOverrides,
      craterHealth,
      // v160: the MAP VIEW (basemap, raster + vector overlays, opacity) is now a
      // per-client preference, like showLayers since v156, so each actor and
      // the host control their OWN individual map. Continuously broadcasting it
      // meant the host's view overwrote every peer's map on each snapshot, which
      // is exactly "I can't change my own map." It is intentionally NOT synced
      // here. The facilitator can still force everyone onto one view on demand
      // via `viewPush` below (request 7: "push the stuff to the other screens").
      viewPush,
      actorRoles,
      scoreVisibility,  // v175: facilitator-wide score-hiding state, synced to all peers
      // v176: diplomacy session + its facilitator settings, synced so every seat
      // sees the same countdown and freeze.
      diplomacy, diplomacySessionsHeld, diplomacyAutoEvery, diplomacyDurationMs,
      fogOfWar,  // v177: game-wide fog rule, synced to all peers
      claims,    // v181: public claims board, synced to all seats
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isHost,
    phase, p1, p2, round, day, globalDay, history, claimR,
    simMode, autoAdvance, autoSpeed, roundDurationMs,
    totalRounds, missionEndMode, scenarioPreset,
    arrivalDelay, gridSharingEnabled, gridSharingPermanent,
    missionLog, annotations,
    activeTurn, p1Done, p2Done,
    selectingFor, placingFor, placingType,
    selectedRover, selectedBuild, selectedDiplomacy, selectedComms, selectedPad,
    powerGridState, commsGridState, pendingDeals, lastEvents, physOverrides,
    craterHealth,
    viewPush,
    actorRoles,
    scoreVisibility,
    diplomacy, diplomacySessionsHeld, diplomacyAutoEvery, diplomacyDurationMs,
    fogOfWar,
    claims,
  ]);

  useEffect(() => {
    if (!isHost || !snapshotForBroadcast || !mp) return;
    mp.broadcastSnapshot(snapshotForBroadcast);
  }, [isHost, mp, snapshotForBroadcast]);

  // ESC closes the asset detail sidebar / cancels active modes.
  // v26: also bind +/- for zoom, arrow keys for pan, and 0 for reset.
  // These are no-ops when the user is typing in a text field.
  useEffect(() => {
    const onKey = (e) => {
      // Don't hijack typing in inputs / textareas / contenteditable elements.
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      if (e.key === "Escape") {
        // v27: was cascading -- a single ESC would clear assetDetail AND
        // roverDrag AND (exploreClick OR exploreMode). Now each ESC press
        // closes just one thing, in priority order, matching most desktop
        // UI conventions.
        if (showFigures)   { setShowFigures(false); return; }
        if (showTutorial)  { closeTutorial(); return; }
        if (showHazard)    { setShowHazard(false); return; }
        if (showHelp)      { setShowHelp(false); return; }
        if (assetDetail)   { setAssetDetail(null); return; }
        if (roverDrag)     { setRoverDrag(null); return; }
        if (exploreClick)  { setExploreClick(null); return; }
        if (exploreMode)   { setExploreMode(false); return; }
        // v27: cancel an in-progress placement (user bought a structure
        // and started the explore-and-place flow but changed their mind).
        // The mission log entry from the purchase stays -- payment isn't
        // actually deducted until the click commits placement, so this
        // is a clean cancel with no economic effect.
        if (placingFor !== null) { setPlacingFor(null); setPlacingType(null); return; }
        return;
      }
      // v27: workshop shortcuts. Bound so a facilitator can drive a demo
      // without touching the trackpad. All gated on no-input-focused.
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        setShowHelp(v => !v);
        e.preventDefault();
        return;
      }
      // v84: "H" opens the how-to-play guided tour (distinct from the `?`
      // keyboard-shortcuts overlay). Always restarts from the first step.
      if (e.key === "h" || e.key === "H") {
        if (showTutorial) closeTutorial(); else setShowTutorial(true);
        e.preventDefault();
        return;
      }
      // v85: "Z" toggles the DLA hazard framework (derive safety zones).
      if (e.key === "z" || e.key === "Z") {
        setShowHazard(v => !v);
        e.preventDefault();
        return;
      }
      // v98: "G" toggles the published map figures gallery.
      if (e.key === "g" || e.key === "G") {
        setShowFigures(v => !v);
        e.preventDefault();
        return;
      }
      if (e.key === "l" || e.key === "L") {
        setShowLog(v => !v);
        e.preventDefault();
        return;
      }
      if (e.key === "a" || e.key === "A") {
        setShowAnalytics(v => !v);
        e.preventDefault();
        return;
      }
      if (e.key === "p" || e.key === "P") {
        setShowParams(v => !v);
        e.preventDefault();
        return;
      }
      // Keyboard zoom/pan -- helpful for projection workflows where the
      // facilitator wants to drive without touching the trackpad.
      if (e.key === "+" || e.key === "=") {
        setViewport(v => ({ ...v, zoom: Math.min(4.5, v.zoom * 1.25), autoFit: false }));
        e.preventDefault();
      } else if (e.key === "-" || e.key === "_") {
        setViewport(v => ({ ...v, zoom: Math.max(0.5, v.zoom / 1.25), autoFit: false }));
        e.preventDefault();
      } else if (e.key === "0") {
        // Reset to auto-fit
        setViewport(v => ({ ...v, autoFit: true }));
        e.preventDefault();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        // Pan by 8% of the visible viewport (source-pixel units). Smaller
        // step at high zoom so pan feels right at any scale.
        const step = (W * 0.08) / Math.max(1, viewport.zoom || 1);
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp"   ? -step : e.key === "ArrowDown"  ? step : 0;
        setViewport(v => ({
          ...v,
          panX: (v.panX || 0) + dx,
          panY: (v.panY || 0) + dy,
          autoFit: false,
        }));
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assetDetail, roverDrag, exploreMode, exploreClick, viewport.zoom, showHelp, showTutorial, showHazard, showFigures, closeTutorial, placingFor]);

  // Peer: install snapshot handler exactly once.
  useEffect(() => {
    if (!isPeer || !mp) return;
    mp.onIncomingSnapshot((snap) => {
      if (!snap) return;
      // Apply each mirrored key. We're careful to only set when the value differs
      // to avoid unnecessary re-renders, but React's setX dedupes primitives.
      if (snap.phase !== undefined) setPhase(snap.phase);
      if (snap.p1 !== undefined) setP1(snap.p1);
      if (snap.p2 !== undefined) setP2(snap.p2);
      if (snap.round !== undefined) setRound(snap.round);
      if (snap.day !== undefined) setDay(snap.day);
      if (snap.globalDay !== undefined) setGlobalDay(snap.globalDay);
      if (snap.history !== undefined) setHistory(snap.history);
      if (snap.claimR !== undefined) setClaimR(snap.claimR);
      if (snap.simMode !== undefined) setSimMode(snap.simMode);
      if (snap.autoAdvance !== undefined) setAutoAdvance(snap.autoAdvance);
      if (snap.autoSpeed !== undefined) setAutoSpeed(snap.autoSpeed);
      if (snap.roundDurationMs !== undefined) setRoundDurationMs(snap.roundDurationMs);
      if (snap.totalRounds !== undefined) setTotalRounds(snap.totalRounds);
      if (snap.missionEndMode !== undefined) setMissionEndMode(snap.missionEndMode);
      if (snap.scenarioPreset !== undefined) setScenarioPreset(snap.scenarioPreset);
      if (snap.actorRoles !== undefined) setActorRoles(snap.actorRoles);
      if (snap.scoreVisibility !== undefined) setScoreVisibility(snap.scoreVisibility);
      if (snap.diplomacy !== undefined) setDiplomacy(snap.diplomacy);
      if (snap.diplomacySessionsHeld !== undefined) setDiplomacySessionsHeld(snap.diplomacySessionsHeld);
      if (snap.diplomacyAutoEvery !== undefined) setDiplomacyAutoEvery(snap.diplomacyAutoEvery);
      if (snap.diplomacyDurationMs !== undefined) setDiplomacyDurationMs(snap.diplomacyDurationMs);
      if (snap.fogOfWar !== undefined) setFogOfWar(snap.fogOfWar);
      if (snap.claims !== undefined) setClaims(snap.claims);
      if (snap.arrivalDelay !== undefined) setArrivalDelay(snap.arrivalDelay);
      if (snap.gridSharingEnabled !== undefined) setGridSharingEnabled(snap.gridSharingEnabled);
      if (snap.gridSharingPermanent !== undefined) setGridSharingPermanent(snap.gridSharingPermanent);
      if (snap.missionLog !== undefined) setMissionLog(snap.missionLog);
      if (snap.annotations !== undefined) setAnnotations(snap.annotations);
      if (snap.activeTurn !== undefined) setActiveTurn(snap.activeTurn);
      if (snap.p1Done !== undefined) setP1Done(snap.p1Done);
      if (snap.p2Done !== undefined) setP2Done(snap.p2Done);
      if (snap.selectingFor !== undefined) setSelectingFor(snap.selectingFor);
      if (snap.placingFor !== undefined) setPlacingFor(snap.placingFor);
      if (snap.placingType !== undefined) setPlacingType(snap.placingType);
      if (snap.selectedRover !== undefined) setSelectedRover(snap.selectedRover);
      if (snap.selectedBuild !== undefined) setSelectedBuild(snap.selectedBuild);
      if (snap.selectedDiplomacy !== undefined) setSelectedDiplomacy(snap.selectedDiplomacy);
      if (snap.selectedComms !== undefined) setSelectedComms(snap.selectedComms);
      if (snap.selectedPad !== undefined) setSelectedPad(snap.selectedPad);
      // v160: the map view (basemap, raster + vector overlays, opacity) is a
      // per-client preference and is NOT applied from the rolling snapshot, so
      // each actor keeps the map they set up for themselves. The ONLY time a peer
      // adopts someone else's view is when the facilitator explicitly pushes it:
      // `viewPush` carries a nonce, applied exactly once.
      if (snap.viewPush && snap.viewPush.nonce && snap.viewPush.nonce !== lastViewPushNonceRef.current) {
        lastViewPushNonceRef.current = snap.viewPush.nonce;
        const vp = snap.viewPush;
        if (vp.baseMap !== undefined) setBaseMap(vp.baseMap === "basemap_illum" ? "annual_illum" : vp.baseMap);
        if (vp.activeOverlaysArr !== undefined) setActiveOverlays(new Set(vp.activeOverlaysArr));
        if (vp.activeVectorOverlaysArr !== undefined) setActiveVectorOverlays(new Set(vp.activeVectorOverlaysArr));
        if (vp.vectorOverlay !== undefined) setVectorOverlay(vp.vectorOverlay);
        if (vp.vectorOverlayOpacity !== undefined) setVectorOverlayOpacity(vp.vectorOverlayOpacity);
        if (vp.viewport !== undefined && vp.viewport) setViewport(v => ({ ...v, ...vp.viewport }));
        setViewPushToast("Facilitator synced everyone to their view");
        setTimeout(() => setViewPushToast(""), 2600);
      }
      if (snap.powerGridState !== undefined) setPowerGridState(snap.powerGridState);
      if (snap.commsGridState !== undefined) setCommsGridState(snap.commsGridState);
      if (snap.pendingDeals !== undefined) setPendingDeals(snap.pendingDeals);
      if (snap.lastEvents !== undefined) setLastEvents(snap.lastEvents);
      if (snap.physOverrides !== undefined) setPhysOverrides(snap.physOverrides);
      if (snap.craterHealth !== undefined) setCraterHealth(snap.craterHealth);
    });
  }, [isPeer, mp]);

  // ── Role-aware permissions ────────────────────────────────────────────────
  // In multiplayer: mp.seat is 1 (Actor I), 2 (Actor II), or 0 (Facilitator).
  // The host's effective seat comes from the lobby selection too -- stored in
  // a small ref so the host can pick "I want to play as Actor II" and still
  // host the room.
  const [hostSeat, setHostSeat] = useState(1); // host's chosen role; default Actor I
  const [overrideAs, setOverrideAs] = useState(null); // facilitator only: temporarily impersonate an actor
  // Keep hostSeat synced with the server's view of the host's seat.
  // (The lobby's host() call sends the chosen seat, server echoes it in
  // ack.you.seat, which lands in mp.you.seat. If the host reassigns
  // themselves on the lobby, this should follow.)
  useEffect(() => {
    if (isHost && mp?.you?.seat !== undefined && mp.you.seat !== hostSeat) {
      setHostSeat(mp.you.seat);
    }
  }, [mp?.you?.seat, isHost]);
  const myRoleSeat = useMemo(() => {
    if (!mp) return null;          // solo: no role gating
    if (isPeer) return mp.seat;    // peer: server-assigned seat
    return hostSeat;               // host: their chosen seat
  }, [mp, isPeer, hostSeat]);

  // DEV BACKDOOR, remove before ship
  const isFacilitator = (import.meta.env.DEV && devFacilitator) || (mp && myRoleSeat === 0);
  const myActor = useMemo(() => {
    if (!mp) {
      // DEV BACKDOOR, remove before ship
      // When devFacilitator is on, treat hostSeat as the actor being previewed.
      if (devFacilitator) return hostSeat === 2 ? 1 : 0;
      return null;
    }
    if (isFacilitator) return overrideAs;  // facilitator only "controls" when impersonating
    if (myRoleSeat === 1) return 0;
    if (myRoleSeat === 2) return 1;
    return null;
  }, [mp, isFacilitator, myRoleSeat, overrideAs, devFacilitator, hostSeat]);

  // `canControlActor(pi)` → true if the current user is allowed to push
  // actor pi's buttons (0=Actor I, 1=Actor II). In solo, always true.
  const canControlActor = useCallback((pi) => {
    if (!mp) return true;                          // solo
    if (isFacilitator) return overrideAs === pi;   // facilitator only when impersonating
    return myActor === pi;
  }, [mp, isFacilitator, overrideAs, myActor]);

  // v188: heal stale team colors. The palette moved to teal/orange, but a game
  // resumed from a snapshot taken under the old periwinkle/mist palette keeps
  // the old value on p.color, which renders blue/purple rovers, panels, etc.
  // Force the current constants whenever they drift (runs once on load; no loop
  // because after the fix p.color === the constant).
  useEffect(() => {
    if (p1 && p1.color !== PLAYER1_COLOR) setP1((pp) => (pp ? { ...pp, color: PLAYER1_COLOR } : pp));
  }, [p1?.color]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (p2 && p2.color !== PLAYER2_COLOR) setP2((pp) => (pp ? { ...pp, color: PLAYER2_COLOR } : pp));
  }, [p2?.color]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fog of war (v177) ──────────────────────────────────────────────────────
  // The "viewer" is whoever is looking at this screen: the seated actor in MP,
  // or the actor whose turn it is in a local hotseat game. A facilitator sees
  // everything. `oppHidden(ownerPi, x, y)` is the single gate every
  // opponent-asset render site consults so fog can't leak position through a
  // layer (icon, safety ring, or waypoint) that forgot to check.
  const fogViewer = mp ? myActor : activeTurn;
  const fogActive = fogOfWar && !isFacilitator && (fogViewer === 0 || fogViewer === 1);
  const viewerSensors = useMemo(
    () => (fogActive ? sensorSources(fogViewer === 0 ? p1 : p2) : null),
    [fogActive, fogViewer, p1, p2]
  );
  const oppHidden = useCallback(
    (ownerPi, x, y) => fogActive && ownerPi !== fogViewer && !pointRevealed(viewerSensors, x, y),
    [fogActive, fogViewer, viewerSensors]
  );

  // `shouldHideOpponentDetails(pi)` → for an actor seat, the other actor's
  // detailed stats are hidden. Facilitator sees everything.
  const shouldHideOpponentDetails = useCallback((pi) => {
    if (!mp) return false;
    if (isFacilitator) return false;
    return pi !== myActor;
  }, [mp, isFacilitator, myActor]);

  // v156: concurrent setup -- once BOTH bases are placed, advance to PLAYING.
  // Done as an effect (not inline in the click handler) so it is robust to the
  // two actors placing in the same tick: it re-checks after render when both p1
  // and p2 exist. Host/solo only; peers follow the host's phase via snapshot.
  useEffect(() => {
    if (mp && !isHost) return;
    // v191: staggered (first-mover) arrival now works on any first-mover preset
    // via a facilitator-set delay, not just the legacy "unevenArrival" preset.
    const staggeredArrival = (scenarioPreset === "unevenArrival" || scenarioPreset === "sprint") && arrivalDelay > 0;
    if (phase === PHASE.SETUP1 && !staggeredArrival && p1 && p2) {
      setPhase(PHASE.PLAYING);
      setActiveTurn(0); setP1Done(false); setP2Done(false);
    }
  }, [mp, isHost, phase, p1, p2, scenarioPreset, arrivalDelay]);

  // Autopilot resupply advisor: for the actor whose turn it is, count
  // damaged assets (health below threshold) and surface a banner asking
  // them whether to authorise a resupply order.
  const resupplyAdvice = useMemo(() => {
    if (!autoPilot) return null;
    if (phase !== PHASE.PLAYING) return null;
    const pi = mp ? (myActor === 0 || myActor === 1 ? myActor : activeTurn) : activeTurn;
    if (pi !== 0 && pi !== 1) return null;
    if (!canControlActor(pi)) return null;
    const isDoneNow = (pi === 0 && p1Done) || (pi === 1 && p2Done);
    if (isDoneNow) return null;
    const p = pi === 0 ? p1 : p2;
    if (!p) return null;
    const sh = p.structureHealth || {};
    let damagedCount = 0;
    const threshold = 0.5;
    for (const key of ["panels", "reactors", "habitats", "extraRovers", "landingPads"]) {
      const arr = sh[key] || [];
      for (const h of arr) if (h < threshold && h > 0) damagedCount++;
    }
    if (damagedCount === 0) return null;
    const canAfford = (p.budget ?? 0) >= RESUPPLY_COST;
    return { pi, damagedCount, canAfford };
  }, [autoPilot, phase, mp, myActor, activeTurn, canControlActor, p1Done, p2Done, p1, p2]);

  // ── Peer action routing ───────────────────────────────────────────────────
  // The host receives peer actions and applies them. Each action carries the
  // peer's seat as `from.seat`; we verify they're allowed to act for that
  // actor before applying.
  const handlersRef = useRef({});
  // Populated below -- handlers register themselves via registerActionHandler.
  const registerActionHandler = useCallback((name, fn) => {
    handlersRef.current[name] = fn;
  }, []);

  useEffect(() => {
    if (!isHost || !mp) return;
    mp.onPeerAction((action) => {
      const fn = handlersRef.current[action.name];
      if (!fn) return;
      try { fn(action.payload || {}, action.from || {}); }
      catch (e) { console.error("Peer action error", action.name, e); }
    });
  }, [isHost, mp]);

  // dispatchAction: peer sends to host, host runs locally. v27: match the
  // peer-action try/catch (line ~537) so a thrown handler doesn't crash
  // the calling event handler (e.g. a botched mapClick taking down the UI).
  const dispatchAction = useCallback((name, payload) => {
    if (!mp || isHost) {
      const fn = handlersRef.current[name];
      if (fn) {
        try { fn(payload || {}, { seat: hostSeat, local: true }); }
        catch (e) { console.error("Local action error", name, e); }
      }
      return;
    }
    mp.sendAction(name, payload);
  }, [mp, isHost, hostSeat]);



  useEffect(() => {
    // Prefetch the basemap so the sibling <img> renders instantly when
    // the gating mapLoaded flag flips. We don't store the Image element
    // anywhere -- the DOM <img> handles compositing on its own.
    const src = MAP_LAYERS[baseMap] || MAP_LAYERS.basemap_lroc_relief;
    const img = new window.Image();
    img.onload = () => { setMapLoaded(true); };
    img.src = src;
  }, [baseMap]);

  // Load the three vector SVG physics overlays once. Each gets its own
  // image element so the canvas drawImage call can rasterize the SVG at
  // whatever DPR-scaled resolution the display canvas is currently at,
  // which keeps the overlays crisp at any zoom.
  useEffect(() => {
    const loadOverlay = (src, refSetter) => {
      const img = new window.Image();
      img.onload = () => { refSetter(img); };
      img.src = src;
    };
    loadOverlay(MAP_LAYERS.overlay_slope, (img) => { slopeOverlayRef.current = img; });
    loadOverlay(MAP_LAYERS.overlay_earth, (img) => { earthOverlayRef.current = img; });
    loadOverlay(MAP_LAYERS.overlay_sun,   (img) => { sunOverlayRef.current   = img; });
  }, []);

  useEffect(() => {
    loadMapData().then(() => {
      setCraterHealth(new Float32Array(CRATER_DATA.length).fill(1.0));
      setDataReady(true);
      // v116: auto-load public/buffers.json if present (OLF DLA Lunar Radius
      // Framework output). This is the collaborator tool's documented workflow:
      // drop the exported buffers.json into public/ and it applies on startup.
      // We route it through the SAME parseBuffersJson + applyHazard path the
      // Hazard panel uses, so the sim's correct pixel scale is applied (the
      // file's baked pixels are at the standalone tool's legacy scale and are
      // intentionally ignored; only the km zones are used). Absent or malformed
      // file: silent fallback to the default radii, no crash.
      fetch("/buffers.json")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          const { zones, meta } = parseBuffersJson(data);
          applyHazard(zonesToSafetyRadiusKm(zones), {
            site: meta.site || meta.siteName,
            label: "imported buffers.json (startup)",
            zones: { core: zones.core, buffer: zones.buffer, coord: zones.coord },
          });
        })
        .catch(() => { /* no buffers.json, or malformed: keep default radii */ });
      // v49: build the comms-blackout overlay canvas here, once, right after
      // map data loads -- instead of lazily inside the draw() loop on first
      // render. The lazy approach caused a one-frame flicker where the
      // blackout tint suddenly appeared mid-draw after EARTH_VIS_MAP was ready.
      if (EARTH_VIS_MAP && EARTH_VIS_MAP.length === W * H) {
        const off = document.createElement("canvas");
        off.width = W; off.height = H;
        const offCtx = off.getContext("2d");
        const od = offCtx.createImageData(W, H);
        const data = od.data;
        // Feather band: tint starts fading in at FEATHER_START and reaches
        // full depth at 0. This eliminates the hard seam that appeared at
        // exactly COMMS_BLACKOUT_THRESHOLD, JPEG compression of the source
        // image creates luminance quantization jumps there that were visible
        // as a crisp line on the map.
        const FEATHER_START = COMMS_BLACKOUT_THRESHOLD + 0.12; // fade-in begins here
        for (let i = 0; i < W * H; i++) {
          const ev = EARTH_VIS_MAP[i];
          if (ev >= FEATHER_START) continue;
          // t=0 at feather edge, t=1 at full blackout (ev=0)
          const t = Math.pow(1 - ev / FEATHER_START, 1.4);
          const a = Math.round(t * 72);
          if (a < 1) continue;
          const pi = i * 4;
          data[pi]     = Math.round(lerp(55, 18, t));
          data[pi + 1] = Math.round(lerp(55, 28, t));
          data[pi + 2] = Math.round(lerp(140, 88, t));
          data[pi + 3] = a;
        }
        offCtx.putImageData(od, 0, 0);
        commsBlackoutCanvasRef.current = off;
      }

      // v73: pre-bake PSR overlay canvas, fuchsia tint, soft edge glow.
      // Built once from PSR_MASK; blitted per frame when showLayers.psr is on.
      if (PSR_MASK && PSR_MASK.length === W * H) {
        const off = document.createElement("canvas");
        off.width = W; off.height = H;
        const offCtx = off.getContext("2d");
        const od = offCtx.createImageData(W, H);
        const data = od.data;
        for (let i = 0; i < W * H; i++) {
          if (!PSR_MASK[i]) continue;
          const pi = i * 4;
          // Core fuchsia fill
          data[pi]     = 200;
          data[pi + 1] = 50;
          data[pi + 2] = 180;
          data[pi + 3] = 130;
        }
        offCtx.putImageData(od, 0, 0);
        psrCanvasRef.current = off;
      }

      // v73: pre-bake ridge glow canvas, warm gold pixels at RIDGE_MASK,
      // replaces the per-frame shadowBlur loop (100k+ draws → 1 blit).
      if (RIDGE_MASK && RIDGE_MASK.length === W * H) {
        const off = document.createElement("canvas");
        off.width = W; off.height = H;
        const offCtx = off.getContext("2d");
        const od = offCtx.createImageData(W, H);
        const data = od.data;
        for (let i = 0; i < W * H; i++) {
          if (!RIDGE_MASK[i]) continue;
          const pi = i * 4;
          data[pi]     = 255;
          data[pi + 1] = 224;
          data[pi + 2] = 50;
          data[pi + 3] = 80; // soft gold at rest; CSS filter handles night brightening
        }
        offCtx.putImageData(od, 0, 0);
        ridgeCanvasRef.current = off;
      }

      // v92 (rev): pre-bake slope contour canvas, two bands driven by SLOPE_MAP.
      // Moderate slopes (>=10 and <25 deg): warm amber fill.
      // Steep slopes (>=25 deg): hot red fill.
      //
      // The slope.jpg source is a JPEG, so compression artifacts produce
      // thousands of 1-3px speckle "steep" pixels across real terrain.
      // Fix: two passes of a separable box-blur (radius 2) over SLOPE_MAP
      // before thresholding. Analysis shows this collapses 4,862 connected
      // steep regions to ~130 coherent ones while preserving crater rims.
      // Both overlays are also clipped to the 80 deg S polar disk so
      // out-of-disk JPEG corner noise is suppressed.
      if (SLOPE_MAP && SLOPE_MAP.length === W * H) {
        // Box-blur pass (radius 2, twice) to suppress JPEG speckle
        const blurred = new Float32Array(W * H);
        const tmp     = new Float32Array(W * H);
        const BLR = 2;
        for (let i = 0; i < W * H; i++) blurred[i] = SLOPE_MAP[i];
        for (let pass = 0; pass < 2; pass++) {
          // Horizontal pass
          for (let y = 0; y < H; y++) {
            let sum = 0, cnt = 0;
            for (let x = 0; x < Math.min(BLR, W); x++) { sum += blurred[y*W+x]; cnt++; }
            for (let x = 0; x < W; x++) {
              if (x + BLR < W) { sum += blurred[y*W + x + BLR]; cnt++; }
              if (x - BLR - 1 >= 0) { sum -= blurred[y*W + x - BLR - 1]; cnt--; }
              tmp[y*W+x] = sum / cnt;
            }
          }
          // Vertical pass
          for (let x = 0; x < W; x++) {
            let sum = 0, cnt = 0;
            for (let y = 0; y < Math.min(BLR, H); y++) { sum += tmp[y*W+x]; cnt++; }
            for (let y = 0; y < H; y++) {
              if (y + BLR < H) { sum += tmp[(y+BLR)*W+x]; cnt++; }
              if (y - BLR - 1 >= 0) { sum -= tmp[(y-BLR-1)*W+x]; cnt--; }
              blurred[y*W+x] = sum / cnt;
            }
          }
        }

        const off = document.createElement("canvas");
        off.width = W; off.height = H;
        const offCtx = off.getContext("2d");
        const od = offCtx.createImageData(W, H);
        const data = od.data;
        const MODERATE_LO = 10, STEEP_LO = 25, FEATHER = 2;
        const dCX = POLE_PX.x, dCY = POLE_PX.y, dRSq = (POLE_PX.x - 1) * (POLE_PX.x - 1);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const ddx = x - dCX, ddy = y - dCY;
            if (ddx*ddx + ddy*ddy > dRSq) continue; // outside 80 deg S disk
            const i = y * W + x;
            const s = blurred[i];
            let r = 0, g = 0, b = 0, a = 0;
            if (s >= STEEP_LO) {
              const t = Math.min(1, (s - STEEP_LO) / FEATHER);
              r = 240; g = 60; b = 40;
              a = Math.round(lerp(0, 160, t));
            } else if (s >= MODERATE_LO) {
              const tIn  = Math.min(1, (s - MODERATE_LO) / FEATHER);
              const tOut = Math.min(1, (STEEP_LO - s) / FEATHER);
              r = 255; g = 170; b = 0;
              a = Math.round(lerp(0, 120, Math.min(tIn, tOut)));
            }
            if (a < 1) continue;
            const pi = i * 4;
            data[pi] = r; data[pi + 1] = g; data[pi + 2] = b; data[pi + 3] = a;
          }
        }
        offCtx.putImageData(od, 0, 0);
        slopeCanvasRef.current = off;
      }

      // v92 (rev): pre-bake comms contour canvas, single threshold at 0.30
      // (COMMS_BLACKOUT_THRESHOLD). Clipped to the 80 deg S polar disk.
      if (EARTH_VIS_MAP && EARTH_VIS_MAP.length === W * H) {
        const off = document.createElement("canvas");
        off.width = W; off.height = H;
        const offCtx = off.getContext("2d");
        const od = offCtx.createImageData(W, H);
        const data = od.data;
        const THRESH = COMMS_BLACKOUT_THRESHOLD; // 0.30
        const FEATHER_BAND = 0.05;
        const dCX = POLE_PX.x, dCY = POLE_PX.y, dRSq = (POLE_PX.x - 1) * (POLE_PX.x - 1);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const ddx = x - dCX, ddy = y - dCY;
            if (ddx*ddx + ddy*ddy > dRSq) continue; // outside 80 deg S disk
            const i = y * W + x;
            const ev = EARTH_VIS_MAP[i];
            if (ev >= THRESH + FEATHER_BAND) continue;
            const t = Math.min(1, Math.max(0, 1 - (ev - (THRESH - FEATHER_BAND)) / (2 * FEATHER_BAND)));
            const a = Math.round(lerp(0, 140, t));
            if (a < 1) continue;
            const pi = i * 4;
            data[pi]     = 40;
            data[pi + 1] = 80;
            data[pi + 2] = 200;
            data[pi + 3] = a;
          }
        }
        offCtx.putImageData(od, 0, 0);
        commsContourCanvasRef.current = off;
      }

      // v93: pre-bake solar potential canvas, three illumination bands from
      // ILLUM_MAP (0..1 fraction of year in sunlight, LROC-derived).
      //   >50%: soft gold , broadly sunlit, roughly equivalent to the ridge mask
      //   >70%: gold      , well-illuminated, viable solar siting
      //   >85%: bright gold, near-continuous sun, prime solar locations
      // Illumination data is smooth (no JPEG speckle), so no blur is needed.
      // Disk-clipped to 80 deg S like the other contour overlays.
      if (ILLUM_MAP && ILLUM_MAP.length === W * H) {
        const off = document.createElement("canvas");
        off.width = W; off.height = H;
        const offCtx = off.getContext("2d");
        const od = offCtx.createImageData(W, H);
        const data = od.data;
        const dCX = POLE_PX.x, dCY = POLE_PX.y, dRSq = (POLE_PX.x - 1) * (POLE_PX.x - 1);
        const FEATHER = 0.03; // feather width in illumination fraction units
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const ddx = x - dCX, ddy = y - dCY;
            if (ddx*ddx + ddy*ddy > dRSq) continue;
            const i = y * W + x;
            const il = ILLUM_MAP[i]; // 0..1
            let r = 0, g = 0, b = 0, a = 0;
            if (il >= 0.85) {
              // Bright lime, prime solar (>85%)
              const t = Math.min(1, (il - 0.85) / FEATHER);
              r = 200; g = 255; b = 60;
              a = Math.round(lerp(0, 200, t));
            } else if (il >= 0.70) {
              // Lime, good solar (>70%)
              const tIn  = Math.min(1, (il - 0.70) / FEATHER);
              const tOut = Math.min(1, (0.85 - il) / FEATHER);
              r = 168; g = 224; b = 40;
              a = Math.round(lerp(0, 155, Math.min(tIn, tOut)));
            } else if (il >= 0.50) {
              // Muted olive-lime, broadly sunlit (>50%)
              const tIn  = Math.min(1, (il - 0.50) / FEATHER);
              const tOut = Math.min(1, (0.70 - il) / FEATHER);
              r = 140; g = 190; b = 40;
              a = Math.round(lerp(0, 90, Math.min(tIn, tOut)));
            }
            if (a < 1) continue;
            const pi = i * 4;
            data[pi] = r; data[pi + 1] = g; data[pi + 2] = b; data[pi + 3] = a;
          }
        }
        offCtx.putImageData(od, 0, 0);
        solarCanvasRef.current = off;
      }
    });
  }, []);

  // ── Auto-advance: when enabled, automatically end both players' turns ────
  useEffect(() => {
    if (mp && !isHost) return; // peers never auto-advance; host drives simulation
    if (!autoAdvance || phase !== PHASE.PLAYING) return;
    if (sessionActive(diplomacy)) return; // v176: talk-only pause, clock frozen
    if (p1Done && p2Done) return; // resolution in progress

    // v21: if we just finished a round, hold a beat so scoring + final
    // violations of that round are legible before the next one starts.
    let delay = autoSpeed;
    if (roundTransition && roundTransition.until > Date.now()) {
      delay = Math.max(delay, roundTransition.until - Date.now());
    }
    const timer = setTimeout(() => {
      // Guard: only bail if the round-transition pause is STILL in progress
      // (its `until` hasn't passed yet). v174: this used to bail on any truthy
      // roundTransition and relied on a separate cleanup effect to null it out
      // first, but that cleanup races this timer, and whenever the cleanup
      // lost the race the turn never ended and auto-advance silently stalled
      // for the rest of the game. Checking `until` here makes the timer
      // self-sufficient: once the pause window elapses it advances regardless
      // of whether the state object has been cleared yet.
      if (roundTransition && roundTransition.until > Date.now()) return;
      if (!p1Done) endTurn(0);
      if (!p2Done) endTurn(1);
    }, delay);
    return () => clearTimeout(timer);
  }, [autoAdvance, phase, p1Done, p2Done, simMode, autoSpeed, roundTransition, diplomacy]);

  // When workshop mode turns on, force-close any open analysis panels
  // and reset to the participant-friendly map view.
  useEffect(() => {
    if (!workshopMode) return;
    setShowAnalytics(false);
    setShowParams(false);
    setShowPlots(false);
    // In workshop mode, restrict to a curated subset of "headline" layers.
    const workshopAllowed = new Set([
      "base", "basemap_visible", "sofi",
      "illumination", "polar_summer", "sunlit_max", "shadows_min",
      "psr", "ice_depth", "water_hydrogen",
      "temperature", "earth_visibility",
    ]);
  }, [workshopMode]);

  // In solo mode: auto-end P2's turn immediately after P1 confirms
  useEffect(() => {
    if (mp && !isHost) return; // peers never auto-advance; host drives simulation
    if (simMode !== "solo" || !p1Done || p2Done || phase !== PHASE.PLAYING) return;
    // Auto-commit P2 with no waypoint change (stay and mine)
    const timer = setTimeout(() => endTurn(1), 120);
    return () => clearTimeout(timer);
  }, [simMode, p1Done, p2Done, phase]);

  useEffect(() => {
    // v191: fire the late Actor II deployment for any staggered first-mover run
    // (facilitator-set arrival delay > 0), not only the "unevenArrival" preset.
    const staggeredArrival = (scenarioPreset === "unevenArrival" || scenarioPreset === "sprint") && arrivalDelay > 0;
    if (!staggeredArrival || phase !== PHASE.PLAYING || p2 || globalDay < arrivalDelay) return;
    setPhase(PHASE.SETUP2);
    setP1Done(false);
    setP2Done(false);
    setActiveTurn(1);
  }, [scenarioPreset, phase, p2, globalDay, arrivalDelay]);

  // ── Mission log: append structured log entries on each day resolution ────
  useEffect(() => {
    if (phase !== PHASE.PLAYING || lastEvents.length === 0) return;
    const ts = `R${round}D${day}`;
    const entries = lastEvents.map(ev => ({
      ts, round, day, globalDay,
      type: ev.type,
      actor: ev.actor,
      roverId: ev.roverId,
      kg: ev.kg,
      craterIdx: ev.craterIdx,
      itemType: ev.itemType,
      x: ev.x,
      y: ev.y,
      label:
        ev.type === "mine" ? `Ice mined: ${Number(ev.kg || 0).toFixed(1)} kg from ${craterName(ev.craterIdx) || `crater #${ev.craterIdx ?? "?"}`}` :
        ev.type === "deposit" ? `Ice deposited: ${Number(ev.kg || 0).toFixed(1)} kg scored at a powered habitat` :
        ev.type === "pickup" ? `${structureLabel(ev.itemType)} picked up from a landing pad` :
        ev.type === "place" ? `${structureLabel(ev.itemType)} placed at (${Math.round(ev.x ?? 0)}, ${Math.round(ev.y ?? 0)})` :
        ev.type === "unpowered_hab" ? `⚠ Habitat H${(ev.habIdx ?? 0) + 1} ran unpowered, life support degrading${ev.destroyed ? " · habitat lost" : ""}` :
        ev.type === "deposit_blocked" ? `⚠ Deposit blocked: ${Number(ev.kg || 0).toFixed(1)} kg waiting, nearest habitat is unpowered or destroyed` :
        ev.type === "strand_risk" ? `⚠ Stranding risk: rover at ${Math.round(ev.power ?? 0)}% battery inside a PSR` :
        ev.type === "stranded" ? `🛑 Rover battery empty${ev.onPSR ? " inside a PSR, stranded until rescued" : ", halted"}` :
        ev.type === "stranded_penalty" ? `⚠ Rover ${ev.roverId ?? "?"} stranded, score penalty applied` :
        ev.type === "rover_rescued" ? `🛟 Recovery convoy dispatched, rover recharged to 35% (−${ev.cost ?? 120}cr)` :
        undefined,
    }));
    setMissionLog(prev => [...prev, ...entries]);
  }, [lastEvents]);

  // ── Actor inject response queue ───────────────────────────────────────────
  // When the facilitator pushes an inject, the missionLog entry (type:"inject",
  // with choices + deltas) is broadcast to all peers via snapshot. Non-
  // facilitator users see it here as a modal and pick their response.
  //
  // In solo/dev mode both actors share one device, so a "both" inject expands
  // into two sequential queue entries (actor 0 first, then actor 1). Each
  // entry carries a `forActor` field so the modal shows the right label and
  // applies deltas to the right player. In real multiplayer each peer only
  // ever has one myActor so the expansion is skipped.
  useEffect(() => {
    // DEV BACKDOOR exception: devFacilitator acts as both roles, so always show modal.
    if (isFacilitator && !devFacilitator) return;

    const soloMode = !mp; // one device, both actors present

    const newInjects = missionLog.filter(
      ev => ((ev.type === "inject" && ev.choices?.length)
             || ev.type === "inject_announce" || ev.type === "inject_custom")
            && !seenInjectIds.current.has(ev.ts)
    );
    if (newInjects.length === 0) return;
    newInjects.forEach(ev => seenInjectIds.current.add(ev.ts));

    const entries = [];
    for (const ev of newInjects) {
      const t = ev.targets;
      const isAnnounce = ev.type === "inject_announce" || ev.type === "inject_custom" || !ev.choices?.length;
      if (isAnnounce) {
        // Acknowledge-only popup. Show once on this device for whichever local
        // actor (or actor 0 in solo) is targeted, no per-actor duplication.
        const actorIdx = (myActor !== null && myActor !== undefined) ? myActor : 0;
        const targeted = !t || t === "both"
          || (t === "p1" && actorIdx === 0)
          || (t === "p2" && actorIdx === 1)
          || soloMode;
        if (targeted) entries.push({ ...ev, forActor: actorIdx, announce: true });
      } else if (soloMode && (!t || t === "both")) {
        // Expand into one entry per actor, in order.
        entries.push({ ...ev, forActor: 0 });
        entries.push({ ...ev, forActor: 1 });
      } else {
        // Multiplayer: only queue for this device's actor.
        const actorIdx = (myActor !== null && myActor !== undefined) ? myActor : 0;
        const targeted = !t || t === "both"
          || (t === "p1" && actorIdx === 0)
          || (t === "p2" && actorIdx === 1);
        if (targeted) entries.push({ ...ev, forActor: actorIdx });
      }
    }
    if (entries.length === 0) return;
    setPendingInjects(prev => [...prev, ...entries]);
  }, [missionLog, isFacilitator, devFacilitator, myActor, mp]);

  useEffect(() => {
    if (!replayRun || !replayPlaying) return;
    if (replayFrameIndex >= (replayRun.frames?.length ?? 1) - 1) {
      setReplayPlaying(false);
      return;
    }
    const timer = setTimeout(() => loadReplayFrame(replayRun, replayFrameIndex + 1), 420);
    return () => clearTimeout(timer);
  }, [replayRun, replayPlaying, replayFrameIndex]);

  useEffect(() => {
    if (!mapLoaded || replayRun || batchRunning || gifExporting || !p1) return;
    if (phase !== PHASE.PLAYING && phase !== PHASE.DONE) return;
    const key = [
      phase, round, day, globalDay, missionLog.length,
      p1Done ? 1 : 0, p2Done ? 1 : 0, !!p2 ? 1 : 0,
      powerGridState.mode, powerGridState.offeredBy ?? "-", powerGridState.offeredTo ?? "-",
    ].join("|");
    if (liveTimelineKeyRef.current === key) return;
    liveTimelineKeyRef.current = key;
    setLiveTimeline(prev => {
      if (prev.length && prev[prev.length - 1]?.__key === key) return prev;
      const frame = { ...snapshotLiveFrame(), __key: key };
      // Cap at 500 frames to prevent unbounded memory growth in long sessions.
      // Oldest frames are trimmed first; plots and exports only need the recent timeline.
      const next = [...prev, frame];
      return next.length > 500 ? next.slice(-500) : next;
    });
  }, [
    mapLoaded, replayRun, batchRunning, gifExporting, p1, p2, phase,
    round, day, globalDay, missionLog.length, p1Done, p2Done, powerGridState,
  ]);

  // ── Canvas rendering ─────────────────────────────────────────────────────
  // Off-screen working canvas. We size it to match the display DPR so the
  // basemap stays crisp. All per-pixel ops happen here at this resolution,
  // then we blit 1:1 to the display canvas.
  const workCanvasRef = useRef(null);
  if (!workCanvasRef.current && typeof document !== "undefined") {
    workCanvasRef.current = document.createElement("canvas");
    workCanvasRef.current.width = W * WORK_SS;
    workCanvasRef.current.height = H * WORK_SS;
  }
  // Ref holding a function that redraws sharp vector content on top of the
  // composited basemap+overlay. Populated inside the draw() callback by
  // assigning a closure that captures all the local state. The display pass
  // calls this to draw rover arrows, action chips, etc. at full DPR.
  const redrawSharpOverlayRef = useRef(null);

  // ── v140: cached pixel layer ───────────────────────────────────────────
  // The PSR-depletion / claims / mine-trail / night pixel passes each iterate
  // the full W*H (~1.47M) source grid and run a getImageData→putImageData
  // round-trip. They depend ONLY on: showLayers (psr_depletion/claims/mine/
  // night flags), craterHealth, p1/p2 (claim + mineMap data), claimR, and the
  // night flag derived from globalDay. They do NOT depend on the animated
  // pulseTick (160ms), hover, viewport.zoom, asset selection, etc.
  //
  // Previously this whole block lived inside draw(), whose dep array includes
  // pulseTick, so the breathing pulse animation forced a full 1.47M-pixel
  // recompute 6+ times a second even when nothing minable changed. We now
  // render the pixel layer once into an offscreen canvas (pixelLayerRef) and
  // recompute it only when its real inputs change; draw() just blits it.
  const pixelLayerRef = useRef(null);
  if (!pixelLayerRef.current && typeof document !== "undefined") {
    pixelLayerRef.current = document.createElement("canvas");
    pixelLayerRef.current.width = W;
    pixelLayerRef.current.height = H;
  }

  // The night flag for the pixel layer. isNight() is quantized per globalDay,
  // so deriving a boolean here keeps the memo from invalidating sub-daily.
  const pixelNight = showLayers.night && isNight(globalDay);

  // Recompute the cached pixel layer only when its real inputs change. Builds
  // the ImageData with the same logic the inline block used, then stamps it
  // into pixelLayerRef so draw() can blit it cheaply every frame.
  useMemo(() => {
    const pcv = pixelLayerRef.current;
    if (!pcv || !mapLoaded) return;
    const pctx = pcv.getContext("2d", { willReadFrequently: true });
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, W, H);
    const imgData = pctx.createImageData(W, H);
    const d = imgData.data;
    const night = pixelNight;

    if (showLayers.psr_depletion) {
      for (let i = 0; i < W * H; i++) { if (!PSR_MASK[i]) continue;
        const pi = i * 4;
        const ci = PIXEL_CRATER[i];
        const health = ci >= 0 ? (craterHealth[ci] ?? 1.0) : 1.0;
        let proxBonus = 0;
        if (ci >= 0 && CRATER_DATA[ci]) {
          const c = CRATER_DATA[ci];
          const px = i % W, py = (i / W) | 0;
          const dd = Math.sqrt((px - c.mineX) ** 2 + (py - c.mineY) ** 2);
          proxBonus = Math.max(0, 1 - dd / 14);
        }
        const deplete = 1 - health;
        const r = Math.round(lerp(18,  160, Math.min(1, deplete * 1.2)));
        const g = Math.round(lerp(80,  20,  deplete));
        const b = Math.round(lerp(120, 30,  deplete));
        const baseAlpha = lerp(90, 210, deplete);
        const a = Math.round(Math.min(230, baseAlpha + proxBonus * 40));
        d[pi]   = r; d[pi+1] = g; d[pi+2] = b; d[pi+3] = a;
      }
    }

    if (showLayers.claims && p1 && p2) {
      const claims = computeClaims(p1, p2, claimR[0], claimR[1]);
      // v177: under fog of war, the opponent's claim shading would betray their
      // base location, so drop their claim pixels from this layer entirely.
      if (fogActive) {
        const oppVal = fogViewer === 0 ? 2 : 1;
        for (let i = 0; i < claims.length; i++) if (claims[i] === oppVal) claims[i] = 0;
      }
      for (let i = 0; i < W * H; i++) {
        if (!claims[i] || !PSR_MASK[i]) continue;
        const pi = i * 4;
        if (claims[i] === 1) {
          // Actor I, teal (#28B9AE)
          d[pi]   = Math.max(d[pi],    40);
          d[pi+1] = Math.max(d[pi+1], 185);
          d[pi+2] = Math.max(d[pi+2], 174);
          d[pi+3] = Math.max(d[pi+3],  90);
        } else {
          // Actor II, orange (#F0902E)
          d[pi]   = Math.max(d[pi],   240);
          d[pi+1] = Math.max(d[pi+1], 144);
          d[pi+2] = Math.max(d[pi+2],  46);
          d[pi+3] = Math.max(d[pi+3],  90);
        }
      }
      for (let i = 0; i < W * H; i++) {
        if (!claims[i] || !PSR_MASK[i]) continue;
        const x = i % W, y = (i / W) | 0;
        const isEdge = (
          (x > 0     && PSR_MASK[i-1] && claims[i-1] !== claims[i]) ||
          (x < W-1   && PSR_MASK[i+1] && claims[i+1] !== claims[i]) ||
          (y > 0     && PSR_MASK[i-W] && claims[i-W] !== claims[i]) ||
          (y < H-1   && PSR_MASK[i+W] && claims[i+W] !== claims[i]) ||
          (x > 0     && !PSR_MASK[i-1]) || (x < W-1 && !PSR_MASK[i+1]) ||
          (y > 0     && !PSR_MASK[i-W]) || (y < H-1 && !PSR_MASK[i+W])
        );
        if (!isEdge) continue;
        const pi = i * 4;
        if (claims[i] === 1) {
          d[pi]=64; d[pi+1]=210; d[pi+2]=198; d[pi+3]=200;   // teal edge
        } else {
          d[pi]=248; d[pi+1]=168; d[pi+2]=80; d[pi+3]=200;   // orange edge
        }
      }
    }

    if (showLayers.mine) {
      try {
        for (const p of [p1, p2]) {
          if (!p || p.active === false) continue;
          // v177: fog of war hides the opponent's extraction footprint too , 
          // their mine trail would otherwise reveal where they're operating.
          if (fogActive && (p.id - 1) !== fogViewer) continue;
          const [rLo, gLo, bLo] = p.id === 1 ? [ 24, 130, 122] : [180, 108, 34];
          const [rHi, gHi, bHi] = p.id === 1 ? [ 79, 206, 195] : [250, 190, 124];
          const entries = Object.entries(p.mineMap);
          if (!entries.length) continue;
          let maxVal = 0; for (const [,v] of entries) if (v > maxVal) maxVal = v; if (!maxVal) continue;
          for (const [idxStr, amt] of entries) {
            const idx = parseInt(idxStr);
            const rawFrac = clamp(amt / maxVal, 0, 1);
            const frac = Math.sqrt(rawFrac);
            const pi = idx * 4;
            if (pi < 0 || pi + 3 >= d.length) continue;
            const r = Math.round(lerp(rLo, rHi, frac));
            const g = Math.round(lerp(gLo, gHi, frac));
            const b = Math.round(lerp(bLo, bHi, frac));
            const a = Math.max(d[pi+3], Math.round(40 + frac * 140));
            if (a > d[pi+3]) { d[pi]=r; d[pi+1]=g; d[pi+2]=b; d[pi+3]=a; }
          }
        }
      } catch (mineErr) {
        console.error("[pixelLayer/mine] crash:", mineErr);
      }
    }

    if (night) {
      for (let i = 0; i < W * H; i++) {
        if (RIDGE_MASK[i]) continue;
        const pi = i * 4;
        if (d[pi+3] > 0) {
          d[pi]   = Math.round(d[pi]   * 0.55);
          d[pi+1] = Math.round(d[pi+1] * 0.55);
          d[pi+2] = Math.round(d[pi+2] * 0.60);
        }
      }
    }

    pctx.putImageData(imgData, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLayers.psr_depletion, showLayers.claims, showLayers.mine,
      pixelNight, craterHealth, p1, p2, claimR, mapLoaded, fogActive, fogViewer]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapLoaded) return;
    // v184: supersample the map canvas. A retina display's own devicePixelRatio
    // is only ~2, which is what was limiting crispness (v183's cap of 4 rarely
    // bound because devices seldom report >2). We render at a multiple of the
    // device ratio so vectors (rings, icons, labels, the sharp rover-arrow pass)
    // get supersampled anti-aliasing, bounded by the 8192 backing-store cap below.
    // v197: DESKTOP renders the display canvas at up to 5× device ratio (cap 5)
    // for a crisper full-resolution overlay pass; TOUCH/MOBILE keeps the prior
    // 1.5× / cap-4 budget to protect memory and fill-rate. Higher backing-store
    // resolution → less pixelization at zoom.
    const dpr = IS_COARSE_POINTER
      ? Math.max(2, Math.min(4, (window.devicePixelRatio || 1) * 1.5))
      : Math.max(3, Math.min(5, (window.devicePixelRatio || 1) * 2));
    // v25: scale the display canvas backing-store with zoom. The CSS
    // display size stays at the container size (driven by width:100% in
    // the wrapper), but the backing-store grows so that the sharp
    // overlay pass and work-canvas blit have enough target pixels to
    // stay crisp at high zoom. At zoom=1 this collapses to the previous
    // W×dpr behavior. Hard-capped at 8192px per side -- below the
    // browser canvas-size limit (most browsers cap at 16384, some at
    // 8192) and keeps texture memory bounded to ~256MB even at the
    // maximum 4.5× zoom ceiling.
    const zk = Math.max(1, Math.min(4.5, viewport.zoom || 1));
    const MAX_CANVAS_PX = 8192;
    let wantW = Math.round(W * dpr * zk);
    let wantH = Math.round(H * dpr * zk);
    if (wantW > MAX_CANVAS_PX || wantH > MAX_CANVAS_PX) {
      const cap = MAX_CANVAS_PX / Math.max(wantW, wantH);
      wantW = Math.round(wantW * cap);
      wantH = Math.round(wantH * cap);
    }
    if (canvas.width !== wantW || canvas.height !== wantH) {
      canvas.width = wantW;
      canvas.height = wantH;
    }
    // Work canvas: rendered in source-pixel (W×H) coordinates. We do not
    // resize this with DPR because the per-pixel arithmetic (PSR depletion
    // tint, claims, mine markers, night) operates on the source-pixel grid
    // and would need rework to scale. The cost is some loss of basemap
    // sharpness in the final blit; the basemap itself is now sourced at
    // 2× resolution to compensate.
    const work = workCanvasRef.current;
    if (!work) return;
    // v185: keep the work canvas at supersample resolution (defensive: an older
    // build's ref may have been created at 1:1).
    if (work.width !== W * WORK_SS || work.height !== H * WORK_SS) {
      work.width = W * WORK_SS;
      work.height = H * WORK_SS;
    }
    const ctx = work.getContext("2d", { willReadFrequently: true });
    // v185: base transform scales source coords (0..W, 0..H) up to the SS
    // backing store, so every overlay vector is rasterized at SS× and stays
    // crisp when the whole canvas is smooth-blit to the display below.
    ctx.setTransform(WORK_SS, 0, 0, WORK_SS, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // v24: clear to fully transparent. The basemap is now rendered as a
    // sibling SVG `<img>` element in the DOM (see map wrapper, around
    // line 10220), which the browser re-rasterizes crisply at every
    // zoom level. The canvas is now an overlay-only surface: it draws
    // dynamic effects (PSR depletion tint, claims, mine trails, night
    // dim, asset markers, safety rings) on top of the live SVG basemap.
    // Pixel-modulation code below that previously blended *with* basemap
    // pixels now writes its tint directly -- since the basemap is on a
    // layer beneath, the rendered result reads identically to a viewer.
    ctx.clearRect(0, 0, W, H);

    // v140: the PSR-depletion / claims / mine / night pixel passes formerly
    // lived here and ran on every draw(), including the 160ms pulseTick
    // animation frames, each iterating the full 1.47M-pixel grid. They are
    // now rendered into pixelLayerRef by the useMemo above and recomputed only
    // when their real inputs change (showLayers flags, craterHealth, p1/p2,
    // claimR, night). draw() just composites that cached layer here. The
    // `night` flag is still needed by the ridge-glow pass below.
    const night = pixelNight;
    if (pixelLayerRef.current) {
      ctx.drawImage(pixelLayerRef.current, 0, 0);
    }

    // v73: ridge glow, single blit of pre-baked canvas (replaces ~100k
    // per-frame shadowBlur fillRect calls that were tanking performance).
    // Night mode raises global alpha so ridges read as lit islands.
    // v140: now gated on showLayers.ridge so the sunlit-ridge layer can be
    // toggled off like the other overlays (previously always drawn).
    if (showLayers.ridge !== false && ridgeCanvasRef.current) {
      ctx.save();
      ctx.globalAlpha = night ? 0.55 : 0.28;
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(ridgeCanvasRef.current, 0, 0);
      ctx.restore();
    }

    // v23: zoom-counter-scale factor for all canvas-drawn UI overlays
    // (labels, badges, dots, small marks) so they stay constant size on
    // screen as the camera zooms. The basemap/zones/PSR scale with the
    // map normally; only UI annotations get _s applied.
    const _zk = Math.max(1, viewport.zoom || 1);
    const _s = 1 / _zk;

    // Crater badges, v72: pill-shaped badge with rounded health bar and
    // a soft glow that intensifies as health drops.
    if (showLayers.craters) {
      CRATER_DATA.forEach((c, ci) => {
        const h = craterHealth[ci] ?? 1.0;
        if (h > 0.95) return;
        const col = h > 0.6 ? "#9BD4B5" : h > 0.3 ? "#E8C998" : "#E89BB5";
        const glowColor = h > 0.6 ? "rgba(155,212,181,0.4)" : h > 0.3 ? "rgba(232,201,152,0.5)" : "rgba(232,155,181,0.6)";
        ctx.save();
        ctx.translate(c.cx, c.cy);
        ctx.scale(_s, _s);
        // Outer glow rings more intense as crater depletes
        if (h < 0.7) {
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = lerp(0, 12, (0.7 - h) / 0.7);
        }
        // Dot with player-matched fill
        ctx.beginPath();
        ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = col + "dd"; ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.shadowBlur = 0;
        // Rounded health bar below
        const bW = 18, bH = 3.5, bX = -9, bY = 9;
        // Track
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bX, bY, bW, bH, 2); ctx.fill(); }
        else ctx.fillRect(bX, bY, bW, bH);
        // Fill
        ctx.fillStyle = col;
        const fillW = Math.max(0, Math.round(bW * h));
        if (fillW > 0) {
          if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bX, bY, fillW, bH, 2); ctx.fill(); }
          else ctx.fillRect(bX, bY, fillW, bH);
        }
        ctx.restore();
      });
    }

    // Helper: draw health bar above a structure
    const drawHealthBar = (ctx, health, width=14) => {
      // v27: clamp health to [0, 1] for the bar width. The data SHOULD
      // already be bounded (applyDecay clamps, resupply caps at 1.0),
      // but a few code paths could plausibly exceed 1.0 in the future
      // (e.g. an over-supply buff). Clamping here makes the bar always
      // fit its background rect.
      const h = Math.max(0, Math.min(1, health));
      const col = h > 0.6 ? "#9BD4B5" : h > 0.3 ? "#E8C998" : "#E89BB5";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(-width/2, -12, width, 4);
      ctx.fillStyle = col;
      ctx.fillRect(-width/2, -12, width * h, 4);
    };

    // ── v73: PSR overlay, pre-baked canvas blit, gated on showLayers.psr ──
    if (showLayers.psr && psrCanvasRef.current) {
      ctx.save();
      ctx.globalAlpha = 0.62;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(psrCanvasRef.current, 0, 0);
      ctx.restore();
    }

    // ── Comms-blackout map overlay, gated on showLayers.comms_blackout ────
    if (showLayers.comms_blackout && commsBlackoutCanvasRef.current) {
      ctx.save();
      ctx.globalAlpha = 0.68;
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(commsBlackoutCanvasRef.current, 0, 0);
      ctx.restore();
    }

    // ── Safety zone rings (drawn first, behind everything) ───────────────
    // One ring per asset, using the existing SAFETY_RADIUS coordination
    // zones. Rings are stroked thickly in type-specific colors so they
    // read at a glance against the polar-disk extent:
    //   • Rovers   (1.4 km)  -- mint, traversal zone
    //   • Solar    (2.9 km)  -- gold,  power-share zone
    //   • Reactors (5.8 km)  -- red,   coordination zone (plus 3-ring overlay)
    //   • Pads     (7.2 km)  -- amber, landing footprint
    //   • Habitats (14.4 km) -- blue,  crew operations zone
    // Each ring also draws a stronger fill so overlapping zones visually mix.
    // v19: rings are noticeably thicker than v18 and strokes use full opacity
    // (was fading the player color through alpha hex). Active VIOLATIONS
    // (opposing player's asset inside this zone) get a pulsing red overlay.
    // v23: fill alphas cut ~2× and ring widths reduced; the v22 values
    // (fillAlpha 0.08-0.13, width 2.4-3.8) compounded with the 3-ring
    // reactor overlay and PSR magenta made the map a soup. Strokes
    // remain at full saturation; only the fills got quieter.
    // v160: safety zones made clearer. v23 had cut the fills so low (0.03-0.05)
    // and the strokes so thin that the keep-out zones were nearly invisible in a
    // live session, players couldn't see where a violation would happen. Fills
    // and stroke widths are bumped to read at a glance while the dashes keep
    // overlapping zones from turning back into "soup." Strokes stay fully
    // saturated and type-coded so each zone type is still distinguishable.
    const ASSET_RING_STYLE = {
      solar:   { stroke: "#FFD060", fillAlpha: 0.11, dash: [12, 8],  width: 2.8 },
      reactor: { stroke: "#E86850", fillAlpha: 0.11, dash: [8, 5],   width: 2.8 },
      habitat: { stroke: "#80B0D8", fillAlpha: 0.10, dash: [14, 10], width: 2.8 },
      pad:     { stroke: "#E8C998", fillAlpha: 0.11, dash: [],        width: 2.8 },
      rover:   { stroke: "#9BD4B5", fillAlpha: 0.09, dash: [5, 5],   width: 2.0 },
    };
    if (showLayers.safety !== false || showLayers.violations !== false) {
      // v162: safety rings and breach (violation) graphics are now independently
      // toggleable. `showSafetyRings` gates the base keep-out rings; `showViol`
      // gates everything that fires on an active breach (red wash, halo, breach
      // connector, the BREACH pill, and the HUD tally). Either being on is enough
      // to enter the loop.
      const showSafetyRings = showLayers.safety !== false;
      const showViol = showLayers.violations !== false;
      // Pre-collect every asset position (own + opponent) for violation detection.
      const collectAllAssets = (player) => {
        if (!player) return [];
        const out = [];
        const sh = player.structureHealth || {};
        const push = (point, type, idx, key) => {
          if (!point) return;
          const h = key ? (sh[key]?.[idx] ?? 1.0) : 1.0;
          if (h <= 0.1) return;
          out.push({ x: point.x, y: point.y, type });
        };
        if (player.landingPad) push(player.landingPad, "pad");
        (player.landingPads || []).forEach((p, i) => push(p, "pad", i, "landingPads"));
        (player.panels || []).forEach((p, i) => push(p, "solar", i, "panels"));
        (player.reactors || []).forEach((p, i) => push(p, "reactor", i, "reactors"));
        (player.habitats || []).forEach((p, i) => push(p, "habitat", i, "habitats"));
        if (player.x != null && player.y != null) push({ x: player.x, y: player.y }, "rover");
        (player.extraRovers || []).forEach((er, i) => push(er, "rover", i, "extraRovers"));
        return out;
      };
      const p1Assets = collectAllAssets(p1);
      const p2Assets = collectAllAssets(p2);
      // Pulse phase for violation indicator (cycles every ~1.4s)
      const pulse = 0.8; // v193: static ring emphasis (no throb, accessibility)
      // v21: marching-ants dash offset for violation rings
      const dashOffset = (Date.now() / 28) % 1000;
      // v21: tally violations for the HUD overlay
      const violationsThisFrame = [];
      const typeLabel = { solar: "Solar field", reactor: "Reactor", habitat: "Habitat", pad: "Landing pad", rover: "Rover" };

      // v99: mirror the scoring logic (enemyZones.applySafetyDecay). Under a
      // shared power grid, solar/reactor zones are NOT violations and must not
      // flash a red BREACH halo -- the old render tally ignored this, so the
      // HUD screamed "BREACH" on exempt generator zones that cost zero points,
      // visually punishing the cooperative grid-sharing the score rewards.
      const sharedGridActive = powerGridState.mode === "shared";
      for (const p of [p1, p2]) {
        if (!p || p.active === false) continue;
        const sh = p.structureHealth || {};
        const enemyAssets = (p === p1) ? p2Assets : p1Assets;
        const ownerLabel = p === p1 ? "P1" : "P2";
        const structList = [
          { list: p.panels      || [], type: "solar",   healthAt: (idx) => sh.panels?.[idx]      ?? 1.0 },
          { list: p.reactors    || [], type: "reactor", healthAt: (idx) => sh.reactors?.[idx]    ?? 1.0 },
          { list: p.habitats    || [], type: "habitat", healthAt: (idx) => sh.habitats?.[idx]    ?? 1.0 },
          { list: p.landingPads || [], type: "pad",     healthAt: (idx) => sh.landingPads?.[idx] ?? 1.0 },
        ];
        // v140: rover health was misindexed. The combined roverList puts the
        // primary rover at index 0 followed by extras, but health was looked up
        // as sh.extraRovers[combinedIdx], so the primary rover read the first
        // extra's health and every extra was off by one (the last extra read
        // undefined→1.0). Everywhere else in the code the convention is
        // extraRovers[i] ↔ structureHealth.extraRovers[i], with the primary
        // rover tracked separately. Build the list with a per-entry resolver:
        // the primary uses 1.0 (its health isn't in structureHealth), each
        // extra uses sh.extraRovers[its own extra index].
        const roverList = [];
        const roverIsPrimary = [];
        const roverExtraIdx = [];
        if (p.x != null && p.y != null) { roverList.push({ x: p.x, y: p.y }); roverIsPrimary.push(true); roverExtraIdx.push(-1); }
        (p.extraRovers || []).forEach((er, i) => { if (er) { roverList.push(er); roverIsPrimary.push(false); roverExtraIdx.push(i); } });
        structList.push({
          list: roverList,
          type: "rover",
          healthAt: (idx) => roverIsPrimary[idx] ? 1.0 : (sh.extraRovers?.[roverExtraIdx[idx]] ?? 1.0),
        });
        for (const { list, type, healthAt } of structList) {
          const style = ASSET_RING_STYLE[type];
          if (!style) continue;
          list.forEach((s, idx) => {
            if (!s) return;
            const health = healthAt(idx);
            // v99: match the scoring threshold (destroyed structures, health
            // <= 0.1, project no zone) rather than the old health <= 0 check.
            if (health <= 0.1) return;
            // v177: fog of war, don't draw a ring for an opponent asset the
            // viewer hasn't scouted (otherwise the ring leaks its position).
            if (oppHidden(p === p1 ? 0 : 1, s.x, s.y)) return;
            const tierSc = effectiveTierScales(p);   // v186: per-tier scales
            // v190: every asset uses the SAME uniform DLA Core (0.1 km) as its
            // keep-out/scoring boundary, matches enemyZones.js exactly, so the
            // ring you see is the ring that scores. SAFETY_RADIUS is no longer
            // the zone base (it now sizes only functional footprints).
            const rBase = ZONE_RADII_PX.core;        // uniform Core (0.1 km)
            const r = rBase * tierSc.core;           // core = scoring boundary
            // Shared grid exempts generator zones from counting as a violation.
            const generatorSharedSafe = isZoneExempt(type, sharedGridActive);
            // Check for active violations: any enemy asset inside this zone
            const violators = generatorSharedSafe ? [] : enemyAssets.filter(a => {
              const d = Math.sqrt((a.x - s.x) ** 2 + (a.y - s.y) ** 2);
              return d < r;
            });
            const hasViolation = violators.length > 0;
            // v140: rover base rings are drawn (crisply, in the sharp display
            // pass) by drawRoverSafetyZones below. The per-asset loop here also
            // drew them, so each rover zone was painted twice with mismatched
            // styling (solid vs dashed, and this path applied no safetyMult).
            // Skip the rover BASE ring/fill in this loop, but keep the rover
            // VIOLATION rendering (the breach halo, chevrons, BREACH label and
            // HUD tally), which drawRoverSafetyZones does not handle.
            // v185: rover uses the graduated 3-ring in this loop; the reactor
            // draws its bespoke physical 3-ring in its dedicated pass below. Both
            // therefore skip the single base keep-out ring here so every surface
            // asset reads as a clean 3-ring (no stray extra circle).
            const skipBaseRing = (type === "rover" || type === "reactor");
            ctx.save();

            // ── Open Lunar graduated 3-ring safety zone (v170) ───────────────
            // Solar / habitat / pad now project the full graduated framework:
            //   inner EXCLUSION (asset color, = violation boundary)
            //   middle COORDINATION buffer (teal)
            //   outer NOTIFICATION buffer (lavender-gray)
            // Reactors keep their bespoke physical 3-ring (drawn below); rovers
            // keep their single ring (drawRoverSafetyZones). The exclusion ring
            // is the only one that scores. Drawn when Zones is on and we're not
            // about to paint breach graphics over this zone.
            // v183: Christine Tiballi's 3-ring framework renders on every
            // zone-projecting asset. Solar/habitat/pad/rover use this graduated
            // path; the reactor keeps its dedicated high-fidelity 3-ring pass
            // below (also Christine's Core/Harmonization/Coordination, 1:5:10).
            const drawGraduated = (type === "solar" || type === "habitat" || type === "pad" || type === "rover");
            if (showSafetyRings && (!hasViolation || !showViol)) {
              if (drawGraduated) {
                // v190: every asset draws the SAME canonical DLA rings , 
                // Core 0.1 km / Harmonization 0.5 km / Coordination 1 km, from
                // ZONE_RADII_PX. Each tier still answers to its own slider, so a
                // player can independently shrink/expand any ring (expansion is
                // overreach and costs score; see economy.overreachPenalty).
                // v199: each actor sizes their OWN equipment's rings via
                // player.ringMag (magnification; 1× = true 0.1/0.5/1 km). Falls
                // back to the default when unset. One actor's choice never
                // resizes the other's rings.
                const ringMag = Math.min(ZONE_MAGNIFICATION_BOUNDS.max, Math.max(ZONE_MAGNIFICATION_BOUNDS.min, p.ringMag ?? ZONE_DEFAULT_MAGNIFICATION)); // clamp stale 1-40x saves
                const rCoord    = ZONE_DRAW_RADII_PX.harmonization * tierSc.harmonization * ringMag;
                const rNote     = ZONE_DRAW_RADII_PX.coordination  * tierSc.coordination  * ringMag;
                const rCoreDisp = ZONE_DRAW_RADII_PX.core          * tierSc.core          * ringMag;
                const gDash = (Date.now() / 42) % 1000;
                // v171: coordination advisory, an enemy asset in the middle band
                // (inside coordination, outside exclusion) trips the "coordinate
                // before entry" tier. Soft cue only; never scores.
                const coordAdvisory = enemyAssets.some(a => {
                  const d = Math.hypot(a.x - s.x, a.y - s.y);
                  return d >= r && d < rCoord;
                });
                // v184: rings are tinted by the OWNING TEAM's color so the two
                // actors' zones are instantly distinguishable. The three tiers
                // (Core / Harmonization / Coordination Buffer) are told apart by
                // style: inner solid+bright+filled, middle dashed+medium, outer
                // dotted+faint. Tier NAMES stay in the legend.
                const teamCol = p.color || PLAYER1_COLOR;
                // Outer, COORDINATION BUFFER (team color, dotted). v187: more
                // vivid, brighter dotted stroke + a touch more fill so the outer
                // extent reads clearly instead of washing out.
                {
                  const grad = ctx.createRadialGradient(s.x, s.y, rCoord, s.x, s.y, rNote);
                  grad.addColorStop(0, teamCol + "2E");
                  grad.addColorStop(1, teamCol + "0A");
                  ctx.fillStyle = grad;
                  ctx.beginPath(); ctx.arc(s.x, s.y, rNote, 0, Math.PI * 2); ctx.fill();
                  ctx.strokeStyle = teamCol + "AA";
                  ctx.lineWidth = Math.max(1.1, 1.6 * _s);
                  ctx.setLineDash([2 * _s, 4.5 * _s]);
                  ctx.beginPath(); ctx.arc(s.x, s.y, rNote, 0, Math.PI * 2); ctx.stroke();
                  ctx.setLineDash([]);
                }
                // Middle, HARMONIZATION AREA (team color, dashed). v187: brighter
                // base fill + stroke; still brightens/pulses on advisory.
                {
                  const pulse = coordAdvisory ? 0.6 : 0; // v193: static (no throb)
                  const baseA = coordAdvisory ? 0.34 + 0.16 * pulse : 0.22;
                  const aHex = Math.round(baseA * 255).toString(16).padStart(2, "0");
                  const grad = ctx.createRadialGradient(s.x, s.y, rCoreDisp, s.x, s.y, rCoord);
                  grad.addColorStop(0, teamCol + aHex);
                  grad.addColorStop(1, teamCol + "12");
                  ctx.fillStyle = grad;
                  ctx.beginPath(); ctx.arc(s.x, s.y, rCoord, 0, Math.PI * 2); ctx.fill();
                  if (coordAdvisory) {
                    // outer glow halo to flag the advisory at a glance
                    ctx.strokeStyle = teamCol + Math.round((0.45 + 0.3 * pulse) * 255).toString(16).padStart(2, "0");
                    ctx.lineWidth = Math.max(5, 7 * _s);
                    ctx.setLineDash([]);
                    ctx.beginPath(); ctx.arc(s.x, s.y, rCoord, 0, Math.PI * 2); ctx.stroke();
                  }
                  ctx.strokeStyle = coordAdvisory ? teamCol + "F0" : teamCol + "D8";
                  ctx.lineWidth = Math.max(1.2, (coordAdvisory ? 2.4 : 1.8) * _s);
                  ctx.setLineDash([9 * _s, 5 * _s]);
                  ctx.lineDashOffset = 0; // v193: no marching-ants rotation
                  ctx.beginPath(); ctx.arc(s.x, s.y, rCoord, 0, Math.PI * 2); ctx.stroke();
                  ctx.setLineDash([]); ctx.lineDashOffset = 0;
                }
                // Inner, CORE OPERATIONS (team color, solid + bright + filled) =
                // the keep-out boundary; the only ring that scores a violation.
                // v187: soft team-colored glow halo so the Core reads as the
                // hottest, most-vivid ring.
                {
                  const coreCol = teamCol;
                  const fillAlpha = Math.round(Math.min(1, style.fillAlpha * 1.25) * 255).toString(16).padStart(2, "0");
                  ctx.save();
                  ctx.shadowColor = coreCol + "AA";
                  ctx.shadowBlur = Math.max(4, 6 * _s);
                  ctx.fillStyle = coreCol + fillAlpha;
                  ctx.beginPath(); ctx.arc(s.x, s.y, rCoreDisp, 0, Math.PI * 2); ctx.fill();
                  ctx.restore();
                  ctx.strokeStyle = coreCol;
                  ctx.lineWidth = Math.max(style.width, 1.6 * _s);
                  ctx.setLineDash([]);
                  ctx.beginPath(); ctx.arc(s.x, s.y, rCoreDisp, 0, Math.PI * 2); ctx.stroke();
                  ctx.strokeStyle = "#FFFFFFCC";
                  ctx.lineWidth = 1.0;
                  ctx.beginPath(); ctx.arc(s.x, s.y, rCoreDisp * 0.985, 0, Math.PI * 2); ctx.stroke();
                }
                // v187: tier labels (CORE / HARMON / COORD) at 12 o'clock on each
                // ring, drawn at constant on-screen size. Gated on the coordination
                // ring being large enough on screen (rNote / _s px) so labels only
                // appear when you're zoomed in enough to read them, no clutter at
                // low zoom. Labels are team-tinted with a dark plate for contrast.
                {
                  const screenR = rNote / Math.max(_s, 1e-6); // outer radius in screen px
                  if (screenR > 46) {
                    ctx.save();
                    ctx.translate(s.x, s.y);
                    ctx.scale(_s, _s); // constant on-screen text size
                    ctx.font = "700 8px 'Bricolage Grotesque', monospace";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    const label = (txt, ry, col) => {
                      const y = -ry / _s; // ry is a source-space radius; place on the ring
                      const w = ctx.measureText(txt).width + 6;
                      ctx.fillStyle = "rgba(6,8,18,0.82)";
                      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(-w/2, y-6, w, 11, 2); ctx.fill(); }
                      else ctx.fillRect(-w/2, y-6, w, 11);
                      ctx.fillStyle = col;
                      ctx.fillText(txt, 0, y);
                    };
                    // semantic tier hues (Field Guide: orange core / teal harmon /
                    // gray coord) so the three rings are nameable at a glance even
                    // though the rings themselves are team-tinted.
                    label("COORD", rNote,     "#C6C2D8");
                    label("HARMON", rCoord,   "#7FE0D8");
                    label("CORE",   rCoreDisp,"#FFC08A");
                    ctx.restore();
                  }
                }
              } else if (!skipBaseRing) {
                // Reactor (and any other) keep the single keep-out ring here; the
                // reactor's physical 3-ring is drawn in its dedicated pass below.
                const fillHex = style.stroke;
                const fillAlpha = Math.round(style.fillAlpha * 255).toString(16).padStart(2, "0");
                ctx.fillStyle = fillHex + fillAlpha;
                ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = style.stroke;
                ctx.lineWidth = style.width;
                if (style.dash.length) ctx.setLineDash(style.dash);
                ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
                ctx.setLineDash([]);
                ctx.strokeStyle = style.stroke + "FF";
                ctx.lineWidth = 1.1;
                ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.985, 0, Math.PI * 2); ctx.stroke();
              }
            }

            // ── Breach graphics (gated on the Violations layer) ──────────────
            // v162: cleaned up. The old version stacked a 3-layer glow, a
            // marching-ants inner ring, full-thickness connector lines, rotated
            // hazard chevrons, AND a fixed-size label, which at zoom turned into
            // a red smear that buried the actual breach point. Now: one calm
            // pulsing red ring with a single soft glow, a thin connector to a
            // small dot at each intruder, and a counter-scaled BREACH pill that
            // stays a constant readable size at any zoom.
            if (hasViolation && showViol) {
              // Soft outer glow (one layer) + crisp main ring.
              ctx.strokeStyle = `rgba(255, 70, 60, ${0.18 + 0.12 * pulse})`;
              ctx.lineWidth = 6 + pulse * 3;
              ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
              ctx.strokeStyle = `rgba(255, 90, 70, ${0.85 + 0.15 * pulse})`;
              ctx.lineWidth = 2.2;
              ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
              // Faint red interior so the zone still reads as "hot" without a wash.
              ctx.fillStyle = `rgba(240, 60, 60, ${0.07 + 0.06 * pulse})`;
              ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();

              // Thin connector + small dot at each intruder (no heavy chevrons).
              ctx.strokeStyle = `rgba(255,150,110,${0.6 + 0.2 * pulse})`;
              ctx.lineWidth = Math.max(0.8, 1.4 * _s);
              ctx.setLineDash([6 * _s, 4 * _s]);
              ctx.lineDashOffset = 0; // v193: no marching-ants rotation
              for (const v of violators) {
                ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(v.x, v.y); ctx.stroke();
              }
              ctx.setLineDash([]);
              ctx.lineDashOffset = 0;
              for (const v of violators) {
                ctx.beginPath(); ctx.arc(v.x, v.y, 3.2 * _s, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 80, 60, ${0.9})`;
                ctx.fill();
                ctx.strokeStyle = "#FFE0B0"; ctx.lineWidth = 1 * _s; ctx.stroke();
              }

              // Counter-scaled "⚠ BREACH" pill above the zone. v190: report the
              // TRUE canonical Core km (0.1 km × the actor's core scale), not the
              // display-magnified px→km, so the readout matches the DLA framework.
              const km = (ZONE_KM.core * tierSc.core).toFixed(2);
              const labelText = `⚠ BREACH · ${typeLabel[type] || type}`;
              ctx.font = `bold ${10.5 * _s}px 'Bricolage Grotesque', system-ui, sans-serif`;
              const tw = ctx.measureText(labelText).width;
              const padX = 6 * _s, boxH = 15 * _s;
              const labelY = s.y - r - 9 * _s;
              const boxX = s.x - tw / 2 - padX;
              const boxY = labelY - boxH / 2;
              ctx.fillStyle = "rgba(60, 12, 12, 0.92)";
              ctx.strokeStyle = `rgba(255, 100, 80, ${0.85 + 0.15 * pulse})`;
              ctx.lineWidth = 1.2 * _s;
              ctx.beginPath();
              if (ctx.roundRect) ctx.roundRect(boxX, boxY, tw + padX * 2, boxH, 4 * _s);
              else ctx.rect(boxX, boxY, tw + padX * 2, boxH);
              ctx.fill(); ctx.stroke();
              ctx.fillStyle = "#FFE0B0";
              ctx.textAlign = "center"; ctx.textBaseline = "middle";
              ctx.fillText(labelText, s.x, labelY);
              ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";

              // Tally for HUD
              violationsThisFrame.push({
                owner: ownerLabel,
                type,
                x: s.x, y: s.y,
                radiusKm: km,
                violatorCount: violators.length,
              });
            }
            ctx.restore();
          });
        }
      }

      // v21: surface the violation tally to the HUD (only update when the
      // signature changes so we don't trigger an infinite render loop).
      const sig = violationsThisFrame.map(v => `${v.owner}:${v.type}:${v.x}:${v.y}:${v.violatorCount}`).join("|");
      if (sig !== lastViolationSigRef.current) {
        lastViolationSigRef.current = sig;
        setActiveViolations(violationsThisFrame);
      }
    }

    // v134 (roadmap: orbit layer integration). Surface crash-debris keep-out
    // zones left by crash-disposed orbital objects. Drawn as a hatched amber
    // exclusion so they read as hazard-derived, distinct from actor safety zones,
    // and fade as they decay over their remaining rounds.
    if (orbitalDebris.length) {
      for (const z of orbitalDebris) {
        const fade = z.decayRounds != null ? Math.max(0.25, Math.min(1, z.decayRounds / 8)) : 1;
        ctx.save();
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220, 150, 70, ${0.10 * fade})`;
        ctx.fill();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = `rgba(232, 170, 90, ${0.7 * fade})`;
        ctx.stroke();
        ctx.setLineDash([]);
        // small debris label
        ctx.fillStyle = `rgba(245, 200, 140, ${0.85 * fade})`;
        ctx.font = "italic 9px 'Spectral', Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText("orbital debris · keep out (scored)", z.x, z.y - z.r - 4);
        ctx.textAlign = "start";
        ctx.restore();
      }
    }

    // ── Landing-pad dust-suppression apron (v164) ────────────────────────────
    // A functional pad mitigates landing dust for assets inside its keep-out
    // (SAFETY_RADIUS.pad). Render that protective apron as a soft periwinkle wash
    // so the benefit is legible on the map, distinct from the dashed keep-out
    // boundary the safety loop already drew. Gated with the Zones layer.
    if (showLayers.safety !== false) {
      for (const p of [p1, p2]) {
        if (!p || p.active === false) continue;
        (p.landingPads || []).forEach((lp, i) => {
          const h = p.structureHealth?.landingPads?.[i] ?? 1.0;
          if (h <= 0.1) return; // only functional pads suppress dust
          const R = SAFETY_RADIUS.pad;
          const grad = ctx.createRadialGradient(lp.x, lp.y, R * 0.15, lp.x, lp.y, R);
          grad.addColorStop(0, "rgba(168,168,240,0.11)");
          grad.addColorStop(1, "rgba(168,168,240,0.015)");
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(lp.x, lp.y, R, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(192,184,232,0.30)";
          ctx.lineWidth = Math.max(0.8, 1.1 * _s);
          ctx.setLineDash([3 * _s, 4 * _s]);
          ctx.beginPath(); ctx.arc(lp.x, lp.y, R * 0.92, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        });
      }
    }

    // Solar panels
    // Draw faint lines from panels that are in a habitat's safety zone to that habitat
    for (const p of [p1, p2]) {
      if (!p || p.active === false) continue;
      p.panels.forEach((pn) => {
        let closestHab = null, closestDist = Infinity;
        for (const h of (p.habitats||[])) {
          const d = dist(pn, h);
          if (d <= SAFETY_RADIUS.habitat && d < closestDist) {
            closestDist = d; closestHab = h;
          }
        }
        if (!closestHab) return;
        const active = !night && (ILLUM_MAP[pn.y * W + pn.x] || 0) > 0.05;
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = active ? p.color + "55" : p.color + "22";
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(pn.x, pn.y); ctx.lineTo(closestHab.x, closestHab.y);
        ctx.stroke();
        ctx.restore();
      });
    }

    for (const p of [p1, p2]) {
      if (!p || p.active === false) continue;
      p.panels.forEach((pn, idx) => {
        const health = p.structureHealth?.panels?.[idx] ?? 1.0;
        const active = !night && (ILLUM_MAP[pn.y * W + pn.x] || 0) > 0.05;
        ctx.save();
        ctx.translate(pn.x, pn.y);
        // v23: scale entire marker by 1/zoom so panel boxes + labels stay
        // constant size on-screen.
        ctx.scale(_s, _s);
        // v187: solar panels are team-colored (teal / orange) like every other
        // asset, so all infrastructure reads by team. Illuminated = bright team
        // fill; in shadow/night = dim. Ridge panels sit a touch brighter and keep
        // the ★. A warm cross flags "generating" when the panel is in sunlight.
        ctx.fillStyle = p.color + (active ? (pn.onRidge ? "F0" : "D4") : (pn.onRidge ? "72" : "50"));
        ctx.fillRect(-5,-5,10,10);
        ctx.strokeStyle = active ? "#ECEAF8" : p.color+"88";
        ctx.lineWidth=1.5; ctx.strokeRect(-5,-5,10,10);
        ctx.strokeStyle = active ? "#FFE86A" : p.color + "55";
        ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(-4,0); ctx.lineTo(4,0); ctx.moveTo(0,-4); ctx.lineTo(0,4); ctx.stroke();
        if (pn.onRidge) {
          ctx.fillStyle = active ? "#ECEAF8" : "#5A567A";
          ctx.font="7px monospace"; ctx.textAlign="center"; ctx.textBaseline="bottom";
          ctx.fillText("★",0,-6);
        }
        if (health < 0.99) drawHealthBar(ctx, health);
        ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 2;
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 8px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(String(idx + 1), 0, pn.onRidge ? -22 : -17);
        ctx.shadowBlur = 0;
        ctx.restore();
      });
    }

    for (const p of [p1, p2]) {
      if (!p || p.active === false) continue;
      (p.reactors||[]).forEach((rx, idx) => {
        const health = p.structureHealth?.reactors?.[idx] ?? 1.0;
        const destroyed = health <= 0;
        // ── Open Lunar 3-ring safety zones (animated, glow-filtered) ──────
        // Plume reach (outer, gray) -- coordination buffer, dim
        // EMI caution (middle, cyan/teal) -- notification required
        // Exclusion (inner, red/orange) -- core operations, no unshielded access
        // v20: exclusion ring pulses every ~1.4s via pulseTick. Each ring
        // has a soft radial-gradient fill so the rings read as nested zones
        // rather than thin outlines. Labels with leader lines sit at NE
        // perimeter of each ring.
        if (!destroyed && showLayers.safety !== false) {
          ctx.save(); ctx.translate(rx.x, rx.y);
          const pulse = 0.5; // v193: static (no throb)
          // v21: marching-ants offset so the rings read as alive
          const dashOff = (Date.now() / 32) % 1000;
          // v186: reactor rings honor the owner's per-tier scales, and the inner
          // Core (exclusion) is floored so it clears the ☢ sprite (~8px×_s) , 
          // previously the 2px core hid entirely under the icon, so only two of
          // the three rings were ever visible. Detection uses REACTOR_ZONES.
          // v190: the reactor now draws the SAME uniform canonical rings as
          // every other asset (ZONE_RADII_PX: 0.1/0.5/1 km). The inner Core is
          // still floored to clear the ☢ sprite so all three rings stay visible;
          // detection uses the true uniform Core (ZONE_RADII_PX.core).
          const _rtier = effectiveTierScales(p);
          // v199: reactor rings sized by the OWNING actor's ringMag.
          const _ringMag = Math.min(ZONE_MAGNIFICATION_BOUNDS.max, Math.max(ZONE_MAGNIFICATION_BOUNDS.min, p.ringMag ?? ZONE_DEFAULT_MAGNIFICATION)); // clamp stale 1-40x saves
          const RZ = {
            exclusion: ZONE_DRAW_RADII_PX.core          * _rtier.core          * _ringMag,
            emi:       ZONE_DRAW_RADII_PX.harmonization * _rtier.harmonization * _ringMag,
            plume:     ZONE_DRAW_RADII_PX.coordination  * _rtier.coordination  * _ringMag,
          };
          // Plume reach (outermost) -- coordination buffer, soft gray
          {
            const grad = ctx.createRadialGradient(0, 0, RZ.emi, 0, 0, RZ.plume);
            grad.addColorStop(0, "rgba(180, 188, 208, 0.20)");
            grad.addColorStop(1, "rgba(180, 188, 208, 0.07)");
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(0, 0, RZ.plume, 0, Math.PI * 2); ctx.fill();
            // Outer glow
            ctx.strokeStyle = "rgba(200, 208, 220, 0.45)";
            ctx.lineWidth = 9.0;
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(0, 0, RZ.plume, 0, Math.PI * 2); ctx.stroke();
            // Main marching-ants ring
            ctx.strokeStyle = "rgba(235, 240, 250, 1.0)";
            ctx.lineWidth = 5.0;
            ctx.setLineDash([13, 7]);
            ctx.lineDashOffset = 0; // v193: no marching-ants rotation
            ctx.beginPath(); ctx.arc(0, 0, RZ.plume, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
          }
          // EMI caution (middle) -- teal fill
          {
            const grad = ctx.createRadialGradient(0, 0, RZ.exclusion, 0, 0, RZ.emi);
            grad.addColorStop(0, "rgba(80, 200, 232, 0.38)");
            grad.addColorStop(1, "rgba(80, 200, 232, 0.16)");
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(0, 0, RZ.emi, 0, Math.PI * 2); ctx.fill();
            // Outer glow
            ctx.strokeStyle = "rgba(120, 230, 255, 0.52)";
            ctx.lineWidth = 9.0;
            ctx.beginPath(); ctx.arc(0, 0, RZ.emi, 0, Math.PI * 2); ctx.stroke();
            // Main ring
            ctx.strokeStyle = "rgba(180, 245, 255, 1.0)";
            ctx.lineWidth = 5.5;
            ctx.setLineDash([15, 6]);
            ctx.lineDashOffset = 0; // v193: no marching-ants rotation
            ctx.beginPath(); ctx.arc(0, 0, RZ.emi, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
          }
          // Exclusion (innermost) -- pulsing red core, very prominent
          {
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, RZ.exclusion);
            grad.addColorStop(0, `rgba(255, 80, 60, ${0.58 + 0.24 * pulse})`);
            grad.addColorStop(0.7, `rgba(232, 100, 80, ${0.42 + 0.16 * pulse})`);
            grad.addColorStop(1, "rgba(232, 100, 80, 0.16)");
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(0, 0, RZ.exclusion, 0, Math.PI * 2); ctx.fill();
            // Halo
            ctx.strokeStyle = `rgba(255, 100, 80, ${0.62 + 0.22 * pulse})`;
            ctx.lineWidth = 11.0 + pulse * 4;
            ctx.beginPath(); ctx.arc(0, 0, RZ.exclusion, 0, Math.PI * 2); ctx.stroke();
            // Main ring
            ctx.strokeStyle = `rgba(255, ${90 - pulse * 30}, 60, 1.0)`;
            ctx.lineWidth = 6.0 + pulse * 2.0;
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(0, 0, RZ.exclusion, 0, Math.PI * 2); ctx.stroke();
          }
          // v23: zone labels -- counter-scaled by 1/zoom so they stay
          // readable at any camera distance. v22 sized them in source
          // pixels which made them billboard-huge at 4×+ zoom.
          const zk = Math.max(1, viewport.zoom || 1);
          const ks = 1 / zk;
          const labelInfo = [
            { r: RZ.exclusion, label: `CORE ${ZONE_KM.core}km`,          fg: "#FFE0B0", bg: "rgba(80, 16, 16, 0.95)", bd: "#FF6450" },
            { r: RZ.emi,       label: `HARMON ${ZONE_KM.harmonization}km`, fg: "#D8F8FF", bg: "rgba(12, 40, 60, 0.95)", bd: "#78D8F0" },
            { r: RZ.plume,     label: `COORD ${ZONE_KM.coordination}km`,   fg: "#ECEAF8", bg: "rgba(28, 26, 50, 0.94)", bd: "#C8D0E0" },
          ];
          ctx.save();
          for (const li of labelInfo) {
            const ang = -Math.PI / 4;  // NE direction
            const ex = Math.cos(ang) * li.r;
            const ey = Math.sin(ang) * li.r;
            const lx = Math.cos(ang) * (li.r + 14 * ks);
            const ly = Math.sin(ang) * (li.r + 14 * ks);
            // Leader line
            ctx.strokeStyle = li.bd;
            ctx.lineWidth = 1.4 * ks;
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(lx, ly); ctx.stroke();
            // Label box
            ctx.font = `600 ${10.5 * ks}px 'JetBrains Mono', monospace`;
            const tw = ctx.measureText(li.label).width;
            const pad = 5 * ks, bh = 15 * ks;
            const boxX = lx - 2 * ks;
            const boxY = ly - bh / 2;
            ctx.fillStyle = li.bg;
            ctx.strokeStyle = li.bd;
            ctx.lineWidth = 1.3 * ks;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(boxX, boxY, tw + pad * 2, bh, 3 * ks);
            else ctx.rect(boxX, boxY, tw + pad * 2, bh);
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = li.fg;
            ctx.textAlign = "left"; ctx.textBaseline = "middle";
            ctx.fillText(li.label, boxX + pad, ly);
          }
          ctx.restore();
          ctx.setLineDash([]);
          ctx.restore();
        }
        ctx.save(); ctx.translate(rx.x, rx.y);
        ctx.scale(_s, _s);
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2);
        ctx.fillStyle = destroyed ? "#3A3658cc" : p.color + "cc";
        ctx.fill();
        ctx.strokeStyle = destroyed ? "#5A567A" : "#000";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = destroyed ? "#888" : "#000";
        ctx.font = "bold 10px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("☢", 0, 0);
        if (health < 0.99) drawHealthBar(ctx, health, 18);
        ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 2;
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 8px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(String(idx + 1), 0, -17);
        ctx.shadowBlur = 0;
        ctx.restore();
      });
    }

    // ── v22: Comsat relays + coverage footprints ──────────────────────
    // Drawn after reactors so they read at the same "infrastructure" layer.
    // Each comsat renders as a small satellite icon with a soft phosphor-
    // green coverage circle at COMSAT_RELAY_RADIUS. The fill is more
    // intense when overlapping coverage (additive blending), which gives
    // a "umbrella of comms" visual.
    for (const p of [p1, p2]) {
      if (!p || p.active === false) continue;
      const cs = p.comsats || [];
      if (cs.length === 0) continue;
      const sh = p.structureHealth || {};
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      cs.forEach((c, ci) => {
        const h = sh.comsats?.[ci] ?? 1.0;
        if (h <= 0) return;
        // Coverage circle
        const grad = ctx.createRadialGradient(c.x, c.y, COMSAT_RELAY_RADIUS * 0.2, c.x, c.y, COMSAT_RELAY_RADIUS);
        grad.addColorStop(0, "rgba(125, 216, 176, 0.22)");
        grad.addColorStop(0.65, "rgba(125, 216, 176, 0.10)");
        grad.addColorStop(1, "rgba(125, 216, 176, 0.0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(c.x, c.y, COMSAT_RELAY_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      ctx.save();
      cs.forEach((c, ci) => {
        const h = sh.comsats?.[ci] ?? 1.0;
        if (h <= 0) return;
        // Phosphor outer ring (dashed)
        ctx.strokeStyle = "rgba(125, 216, 176, 0.50)";
        ctx.lineWidth = 1.3;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = 0; // v193: no marching-ants rotation
        ctx.beginPath();
        ctx.arc(c.x, c.y, COMSAT_RELAY_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;

        // Comsat satellite icon -- small diamond body with two antenna panels
        ctx.save();
        ctx.translate(c.x, c.y);
        // body
        ctx.fillStyle = p.color;
        ctx.strokeStyle = "#0B0918";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, -5); ctx.lineTo(4, 0); ctx.lineTo(0, 5); ctx.lineTo(-4, 0);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // antenna panels (rectangles either side)
        ctx.fillStyle = "rgba(125, 216, 176, 0.85)";
        ctx.fillRect(-9, -2, 4, 4);
        ctx.fillRect( 5, -2, 4, 4);
        // glint
        ctx.fillStyle = "#ECEAF8";
        ctx.fillRect(-1, -3, 2, 1);
        ctx.restore();

        // Pulse ping every ~2s
        const pingPhase = (Date.now() / 2000 + ci * 0.31) % 1;
        if (pingPhase < 0.35) {
          const t = pingPhase / 0.35;
          ctx.strokeStyle = `rgba(125, 216, 176, ${0.5 * (1 - t)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(c.x, c.y, 6 + t * 14, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Index label
        ctx.fillStyle = "#ECEAF8";
        ctx.font = "bold 8px 'JetBrains Mono', monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(`R${ci + 1}`, c.x, c.y - 9);
      });
      ctx.restore();
    }

    // ── v111: shared comms grid -- visualize the POOLED relay network ──────
    // When the comms grid is shared, the two actors' relays form one network
    // (v106 pools their coverage so each benefits from the other's comsats).
    // Make that legible: draw a soft phosphor link between the actors' comsats
    // and a faint coverage bloom, so a facilitator can point at the screen and
    // show that a rover is now covered by the partner's relay, not just its own.
    if (commsGridState.mode === "shared") {
      const a = (p1?.comsats || []).filter((c, i) => (p1.structureHealth?.comsats?.[i] ?? 1.0) > 0);
      const b = (p2?.comsats || []).filter((c, i) => (p2.structureHealth?.comsats?.[i] ?? 1.0) > 0);
      if (a.length && b.length) {
        ctx.save();
        // Connecting links between each cross-actor comsat pair: a pooled mesh.
        ctx.strokeStyle = "rgba(125, 216, 176, 0.28)";
        ctx.lineWidth = 1.1;
        ctx.setLineDash([3, 5]);
        ctx.lineDashOffset = 0; // v193: no marching-ants rotation
        for (const ca of a) {
          // link each p1 relay to its nearest p2 relay (keeps the mesh legible
          // rather than drawing every pair when there are many comsats)
          let nearest = b[0], best = Infinity;
          for (const cb of b) {
            const d = (ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2;
            if (d < best) { best = d; nearest = cb; }
          }
          ctx.beginPath();
          ctx.moveTo(ca.x, ca.y);
          ctx.lineTo(nearest.x, nearest.y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        // Midpoint "pooled" badge between the two nearest relays of each actor.
        let pa = a[0], pb = b[0], best = Infinity;
        for (const ca of a) for (const cb of b) {
          const d = (ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2;
          if (d < best) { best = d; pa = ca; pb = cb; }
        }
        const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
        ctx.globalCompositeOperation = "screen";
        const bloom = ctx.createRadialGradient(mx, my, 2, mx, my, 26);
        bloom.addColorStop(0, "rgba(125, 216, 176, 0.30)");
        bloom.addColorStop(1, "rgba(125, 216, 176, 0.0)");
        ctx.fillStyle = bloom;
        ctx.beginPath(); ctx.arc(mx, my, 26, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(220, 245, 232, 0.92)";
        ctx.font = "500 8px 'Bricolage Grotesque', system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("POOLED COMMS", mx, my);
        ctx.restore();
      }
    }

    // ── v112: shared power grid -- visualize CROSS-ACTOR power flow ─────────
    // When the power grid is shared, allocateDailyPower runs one combined
    // network: a generator (solar/reactor) can charge the OTHER actor's
    // consumers (rovers, habitats) if they fall within that generator's
    // SAFETY_RADIUS. That cross-actor charging is the real payoff of sharing,
    // and it was invisible. Draw a warm link from each generator to any
    // cross-actor consumer it is actually in range of, so the power crossing
    // the seam between the two footprints is legible (mirrors the v111 pooled
    // comms mesh, but reflects the genuine range-based power mechanic).
    if (powerGridState.mode === "shared" && p1 && p2) {
      const genList = (p, owner) => [
        ...(p.panels   || []).map((g, i) => ({ ...g, kind: "solar",   h: p.structureHealth?.panels?.[i]   ?? 1.0, owner })),
        ...(p.reactors || []).map((g, i) => ({ ...g, kind: "reactor", h: p.structureHealth?.reactors?.[i] ?? 1.0, owner })),
      ];
      const consumerList = (p, owner) => {
        const out = [];
        const rh = p.structureHealth || {};
        // primary rover
        if (p.x != null) out.push({ x: p.x, y: p.y, owner });
        (p.extraRovers || []).forEach((r, i) => { if ((rh.extraRovers?.[i] ?? 1.0) > 0) out.push({ x: r.x, y: r.y, owner }); });
        (p.habitats || []).forEach((hb, i) => { if ((rh.habitats?.[i] ?? 1.0) > 0) out.push({ x: hb.x, y: hb.y, owner }); });
        return out;
      };
      const gens = [...genList(p1, 1), ...genList(p2, 2)];
      const cons1 = consumerList(p1, 1), cons2 = consumerList(p2, 2);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      let anyFlow = false;
      for (const g of gens) {
        if (g.h <= 0) continue;
        const r = SAFETY_RADIUS[g.kind];
        // only CROSS-actor consumers (own-actor charging is the normal case
        // and already implied by the footprint; the shared-grid story is the
        // power that crosses between actors)
        const crossConsumers = g.owner === 1 ? cons2 : cons1;
        for (const c of crossConsumers) {
          const d = Math.hypot(g.x - c.x, g.y - c.y);
          if (d > r) continue;
          anyFlow = true;
          // warm amber flow line, brighter toward the consumer
          const grad = ctx.createLinearGradient(g.x, g.y, c.x, c.y);
          grad.addColorStop(0, "rgba(232, 180, 120, 0.10)");
          grad.addColorStop(1, "rgba(255, 210, 150, 0.55)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(g.x, g.y);
          ctx.lineTo(c.x, c.y);
          ctx.stroke();
          // a small moving "charge" dot along the link
          const t = (Date.now() / 900 + (g.x + c.y) * 0.01) % 1;
          const px = g.x + (c.x - g.x) * t, py = g.y + (c.y - g.y) * t;
          ctx.fillStyle = "rgba(255, 220, 170, 0.9)";
          ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
      // legend badge near the first crossing, so the warm links are explained
      if (anyFlow) {
        let bx = W / 2, by = 40;
        outer: for (const g of gens) {
          const cross = g.owner === 1 ? cons2 : cons1;
          for (const c of cross) {
            if (Math.hypot(g.x - c.x, g.y - c.y) <= SAFETY_RADIUS[g.kind]) {
              bx = (g.x + c.x) / 2; by = (g.y + c.y) / 2; break outer;
            }
          }
        }
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const bloom = ctx.createRadialGradient(bx, by, 2, bx, by, 24);
        bloom.addColorStop(0, "rgba(255, 210, 150, 0.30)");
        bloom.addColorStop(1, "rgba(255, 210, 150, 0.0)");
        ctx.fillStyle = bloom;
        ctx.beginPath(); ctx.arc(bx, by, 24, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(255, 235, 210, 0.94)";
        ctx.font = "500 8px 'Bricolage Grotesque', system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("SHARED POWER", bx, by);
        ctx.restore();
      }
    }

    // ── Reactor 3-ring placement preview ──────────────────────────────────
    // When the user is dragging a reactor onto the map (or in click-place
    // mode for a reactor), preview the three Open Lunar safety zones at
    // the cursor position so they can see what they're committing to BEFORE
    // they drop the asset.
    const reactorPreviewPos = (() => {
      if (placingFor !== null && placingType === "reactor" && hover) {
        return { x: hover.x, y: hover.y };
      }
      return null;
    })();
    if (reactorPreviewPos) {
      ctx.save();
      ctx.translate(reactorPreviewPos.x, reactorPreviewPos.y);
      const ppulse = 0.5; // v193: static (no throb)
      // Plume (outer)
      {
        const grad = ctx.createRadialGradient(0, 0, ZONE_RADII_PX.harmonization, 0, 0, ZONE_RADII_PX.coordination);
        grad.addColorStop(0, "rgba(180, 188, 208, 0.10)");
        grad.addColorStop(1, "rgba(180, 188, 208, 0.03)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, ZONE_RADII_PX.coordination, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(200, 208, 220, 0.95)";
        ctx.lineWidth = 3.4;
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.arc(0, 0, ZONE_RADII_PX.coordination, 0, Math.PI * 2); ctx.stroke();
      }
      // EMI (middle)
      {
        const grad = ctx.createRadialGradient(0, 0, ZONE_RADII_PX.core, 0, 0, ZONE_RADII_PX.harmonization);
        grad.addColorStop(0, "rgba(80, 200, 232, 0.22)");
        grad.addColorStop(1, "rgba(80, 200, 232, 0.08)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, ZONE_RADII_PX.harmonization, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(140, 240, 255, 1.0)";
        ctx.lineWidth = 3.8;
        ctx.setLineDash([10, 5]);
        ctx.beginPath(); ctx.arc(0, 0, ZONE_RADII_PX.harmonization, 0, Math.PI * 2); ctx.stroke();
      }
      // Exclusion (pulsing inner)
      {
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, ZONE_RADII_PX.core);
        grad.addColorStop(0, `rgba(255, 80, 60, ${0.32 + 0.22 * ppulse})`);
        grad.addColorStop(0.7, `rgba(232, 100, 80, ${0.22 + 0.14 * ppulse})`);
        grad.addColorStop(1, "rgba(232, 100, 80, 0.08)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, ZONE_RADII_PX.core, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255, ${90 - ppulse * 30}, 60, 1.0)`;
        ctx.lineWidth = 4.2 + ppulse * 1.5;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(0, 0, ZONE_RADII_PX.core, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.setLineDash([]);
      // Labels with leader lines from each ring edge
      ctx.font = "italic 13px 'Spectral', Georgia, serif";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      // Exclusion label
      ctx.strokeStyle = "rgba(255, 90, 60, 0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ZONE_RADII_PX.core, -2); ctx.lineTo(ZONE_RADII_PX.core + 4, -2); ctx.stroke();
      ctx.fillStyle = "rgba(255, 100, 80, 1.0)";
      ctx.fillText(`${ZONE_KM.core}km · Core`, ZONE_RADII_PX.core + 8, -2);
      // EMI label
      ctx.strokeStyle = "rgba(120, 230, 255, 0.7)";
      ctx.beginPath(); ctx.moveTo(ZONE_RADII_PX.harmonization, -2); ctx.lineTo(ZONE_RADII_PX.harmonization + 4, -2); ctx.stroke();
      ctx.fillStyle = "rgba(140, 240, 255, 1.0)";
      ctx.fillText(`${ZONE_KM.harmonization}km · Harmonization`, ZONE_RADII_PX.harmonization + 8, -2);
      // Plume label
      ctx.strokeStyle = "rgba(200, 208, 220, 0.7)";
      ctx.beginPath(); ctx.moveTo(ZONE_RADII_PX.coordination, -2); ctx.lineTo(ZONE_RADII_PX.coordination + 4, -2); ctx.stroke();
      ctx.fillStyle = "rgba(220, 228, 240, 1.0)";
      ctx.fillText(`${ZONE_KM.coordination}km · Coordination`, ZONE_RADII_PX.coordination + 8, -2);
      ctx.restore();
    }

    // ── v174: ghost footprint preview for every OTHER placeable asset ──────
    // "Preview asset footprint/radius BEFORE placing" was the most-requested
    // workshop change. The reactor already had its rich 3-ring preview above;
    // this gives solar / habitat / pad / comsat / rover a ghost ring at the
    // cursor so the player sees their keep-out zone (scaled by the placing
    // actor's self-declared zone size, with an overreach flag) and any working
    // reach BEFORE they commit the placement.
    const ghostPreviewPos =
      (placingFor !== null && placingType && placingType !== "reactor" && hover)
        ? { x: hover.x, y: hover.y } : null;
    if (ghostPreviewPos) {
      const pp = placingFor === 0 ? p1 : p2;
      // v190: the previewed keep-out is the uniform DLA Core (0.1 km), scaled by
      // the placing actor's declared core-ring size (folds legacy safetyMult/
      // zoneScale). This matches exactly what will score once the asset is down.
      const coreScale = effectiveTierScales(pp).core;
      const zoneR = ZONE_RADII_PX.core * coreScale;
      const ppulse = 0.5; // v193: static (no throb)
      // What the keep-out ring also does, per asset type.
      const ZONE_LABEL = {
        solar:   "Core keep-out",
        pad:     "Core keep-out",
        habitat: "Core keep-out",
        rover:   "Core keep-out",
      };
      ctx.save();
      ctx.translate(ghostPreviewPos.x, ghostPreviewPos.y);

      // Comsat: no keep-out zone, just a relay-reach footprint (cool blue).
      if (placingType === "comsat") {
        const R = COMSAT_RELAY_RADIUS;
        const grad = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
        grad.addColorStop(0, "rgba(128,176,216,0.12)");
        grad.addColorStop(1, "rgba(128,176,216,0.02)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(150,196,236,0.95)";
        ctx.lineWidth = 2.8; ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = "italic 13px 'Spectral', Georgia, serif";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.strokeStyle = "rgba(150,196,236,0.7)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(R, -2); ctx.lineTo(R + 4, -2); ctx.stroke();
        ctx.fillStyle = "rgba(170,206,240,1.0)";
        ctx.fillText(`${(R * MAP_KM_PER_PX).toFixed(1)} km · relay reach`, R + 8, -2);
      } else if (zoneR > 0) {
        // Keep-out / safety zone, pulsing periwinkle so it reads as "yours"
        // and stays visually distinct from enemy-breach red.
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, zoneR);
        grad.addColorStop(0, `rgba(168,168,240,${0.16 + 0.10 * ppulse})`);
        grad.addColorStop(1, "rgba(168,168,240,0.03)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, zoneR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(180,180,248,${0.85 + 0.15 * ppulse})`;
        ctx.lineWidth = 3.0; ctx.setLineDash([10, 6]);
        ctx.beginPath(); ctx.arc(0, 0, zoneR, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        // Label, with an overreach flag when the actor has inflated its zone.
        ctx.font = "italic 13px 'Spectral', Georgia, serif";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.strokeStyle = "rgba(180,180,248,0.7)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(zoneR, -2); ctx.lineTo(zoneR + 4, -2); ctx.stroke();
        ctx.fillStyle = "rgba(200,200,250,1.0)";
        const baseLabel = ZONE_LABEL[placingType] || "Core keep-out";
        const overreach = coreScale > 1.001 ? `  ⚠ ${Math.round(coreScale * 100)}% Core` : "";
        ctx.fillText(`${(ZONE_KM.core * coreScale).toFixed(2)} km · ${baseLabel}${overreach}`, zoneR + 8, -2);
      }
      ctx.restore();
    }

    // Habitats
    for (const p of [p1, p2]) {
      if (!p || p.active === false) continue;
      (p.habitats||[]).forEach((h, idx) => {
        const health = p.structureHealth?.habitats?.[idx] ?? 1.0;
        const hPwr   = (p.habitatPower ?? [])[idx] ?? HABITAT_POWER_INIT;
        const destroyed = health <= 0;
        const unpowered = !destroyed && hPwr <= 0;
        ctx.save(); ctx.translate(h.x, h.y);
        ctx.scale(_s, _s);
        ctx.fillStyle = destroyed ? "#3A3658cc" : unpowered ? "#5A567Acc" : p.color;
        ctx.beginPath();
        ctx.moveTo(-7, 5); ctx.lineTo(7, 5); ctx.lineTo(7, -1); ctx.lineTo(0, -7); ctx.lineTo(-7, -1); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = destroyed ? "#5A567A" : unpowered ? "#E8C998" : "#0009"; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = destroyed ? "#888" : "#0B0A16"; ctx.font = "6px monospace"; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(destroyed ? "X" : unpowered ? "!" : "H", 0, 0);
        if (!destroyed && health < 0.99) drawHealthBar(ctx, health);
        ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 2;
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 8px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(String(idx + 1), 0, -17);
        ctx.shadowBlur = 0;
        // Power bar below habitat
        if (!destroyed) {
          const barW = 14, barH = 2, barX = -7, barY = 7;
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillRect(barX, barY, barW, barH);
          const pwrFrac = Math.max(0, hPwr / HABITAT_POWER_CAP);
          ctx.fillStyle = pwrFrac > 0.4 ? "#9BD4B5" : pwrFrac > 0.15 ? "#E8C998" : "#E89BB5";
          ctx.fillRect(barX, barY, barW * pwrFrac, barH);
        }
        ctx.restore();
      });
    }

    // Extra rovers
    for (const p of [p1, p2]) {
      if (!p || p.active === false) continue;
      (p.extraRovers||[]).forEach((r, idx) => {
        const health = p.structureHealth?.extraRovers?.[idx] ?? 1.0;
        const erSi = STATUS_INFO[r.status] || STATUS_INFO.idle;
        // v152: counter-scale by _s (like the primary rover and habitats) so
        // extra rovers stay a constant size on screen instead of ballooning as
        // you zoom in, and shrink to match the primary rover so their small
        // safety rings are no longer swallowed by an oversized marker.
        ctx.save(); ctx.translate(r.x, r.y); ctx.scale(_s, _s);
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*2);
        ctx.fillStyle = p.color; ctx.fill();
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = "#000"; ctx.font = "bold 6.5px monospace"; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(`${idx+2}`, 0, 0);
        // Status icon
        ctx.font="8px monospace"; ctx.textAlign="center"; ctx.textBaseline="bottom";
        ctx.fillText(erSi.icon, 0, -7);
        // Ice bubble
        if ((r.ice??0) > 5) {
          ctx.fillStyle="rgba(3,8,20,0.85)"; ctx.fillRect(7,-15,31,9.5);
          ctx.fillStyle="#C0B8E8"; ctx.font="6.5px monospace"; ctx.textAlign="left"; ctx.textBaseline="top";
          ctx.fillText(`❄${(r.ice??0).toFixed(0)}`, 8.5, -14);
        }
        // Carrying bubble
        if (r.carrying) {
          const icons = { solar:"☀", reactor:"☢", habitat:"🏠", rover:"🚗", pad:"🛬" };
          ctx.fillStyle="rgba(3,8,20,0.85)"; ctx.fillRect(-10.5,-24,21,8.5);
          ctx.fillStyle="#E8C998"; ctx.font="5.5px monospace"; ctx.textAlign="center"; ctx.textBaseline="middle";
          ctx.fillText((icons[r.carrying.type]||"?")+" CARGO", 0, -19.5);
        }
        if (health < 0.99) drawHealthBar(ctx, health);
        ctx.restore();
      });
    }

    // Landing pads -- with pending delivery badges and health bar
    for (const p of [p1, p2]) {
      if (!p || p.active === false) continue;
      (p.landingPads||[]).forEach((lp, lpIdx) => {
        const health = p.structureHealth?.landingPads?.[lpIdx] ?? 1.0;
        const destroyed = health <= 0;
        // v152: counter-scale by _s so the pad marker stays constant size on
        // screen like every other asset marker (habitat/solar/reactor/rover),
        // instead of ballooning as the camera zooms in.
        ctx.save(); ctx.translate(lp.x, lp.y); ctx.scale(_s, _s);
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI*2);
        ctx.fillStyle = destroyed ? "rgba(30,30,30,0.6)" : p.color + "22"; ctx.fill();
        ctx.strokeStyle = destroyed ? "#444" : p.color + "cc"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.strokeStyle = destroyed ? "#333" : p.color + "88"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-9,0); ctx.lineTo(9,0); ctx.moveTo(0,-9); ctx.lineTo(0,9); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI*2);
        ctx.fillStyle = destroyed ? "#444" : p.color + "cc"; ctx.fill();
        if (destroyed) {
          ctx.strokeStyle = "#E89BB588"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-6,-6); ctx.lineTo(6,6); ctx.moveTo(6,-6); ctx.lineTo(-6,6); ctx.stroke();
        } else {
          const pending = (p.pendingDeliveries||[]).filter(d => d.padIdx === lpIdx);
          if (pending.length > 0) {
            const icons = { solar:"*", reactor:"☢", habitat:"H", rover:"R", pad:"P" };
            ctx.font = "8px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
            pending.forEach((d, i) => {
              ctx.fillStyle = "rgba(3,8,18,0.85)";
              ctx.fillRect(-7, -26 - i*11, 14, 10);
              ctx.fillStyle = "#E8C998";
              ctx.fillText(icons[d.type]||"?", 0, -17 - i*11);
            });
            ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI*2);
            ctx.strokeStyle = "#E8C99866"; ctx.lineWidth = 1.5;
            ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);
          }
          if (health < 0.99) drawHealthBar(ctx, health, 18);
        }
        ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 2;
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 8px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText(String(lpIdx + 1), 0, 13);
        ctx.shadowBlur = 0;
        ctx.restore();
      });
    }

    for (let pi2 = 0; pi2 < 2; pi2++) {
      const p = pi2 === 0 ? p1 : p2;
      if (!p || p.active === false) continue;
      // v177: fog of war, an opponent's planned routes are intent you can't
      // observe, so hide ALL of their waypoint lines while fog is on (even for
      // a rover whose current position you've scouted).
      if (fogActive && pi2 !== fogViewer) continue;

      // Primary rover waypoints
      const wps = [p.currentWaypoint, ...(p.waypoints||[])].filter(Boolean);
      if (wps.length) {
        ctx.save();
        ctx.strokeStyle = p.color + "55"; ctx.lineWidth=1.5; ctx.setLineDash([4,3]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        for (const wp of wps) ctx.lineTo(wp.x, wp.y);
        ctx.stroke(); ctx.setLineDash([]);
        wps.forEach((wp, wi) => {
          ctx.beginPath(); ctx.arc(wp.x, wp.y, wi===0?6:4, 0, Math.PI*2);
          ctx.strokeStyle = p.color + (wi===0?"cc":"77"); ctx.lineWidth=1.5; ctx.stroke();
          ctx.fillStyle = p.color + (wi===0?"44":"22"); ctx.fill();
          if (wi===0) {
            ctx.beginPath(); ctx.moveTo(wp.x-5,wp.y); ctx.lineTo(wp.x+5,wp.y);
            ctx.moveTo(wp.x,wp.y-5); ctx.lineTo(wp.x,wp.y+5);
            ctx.strokeStyle = p.color+"aa"; ctx.stroke();
          }
        });
        ctx.restore();
      }

      // Extra rover waypoints
      (p.extraRovers||[]).forEach(er => {
        const erWps = [er.currentWaypoint, ...(er.waypoints||[])].filter(Boolean);
        if (!erWps.length) return;
        ctx.save();
        ctx.strokeStyle = p.color + "44"; ctx.lineWidth=1.2; ctx.setLineDash([3,4]);
        ctx.beginPath(); ctx.moveTo(er.x, er.y);
        for (const wp of erWps) ctx.lineTo(wp.x, wp.y);
        ctx.stroke(); ctx.setLineDash([]);
        erWps.forEach((wp, wi) => {
          ctx.beginPath(); ctx.arc(wp.x, wp.y, wi===0?5:3, 0, Math.PI*2);
          ctx.strokeStyle = p.color + (wi===0?"bb":"66"); ctx.lineWidth=1.2; ctx.stroke();
          ctx.fillStyle = p.color + "22"; ctx.fill();
        });
        ctx.restore();
      });
    }

    // (no auto-return trails)

    // Hover tooltip
    if (hover && selectingFor !== null) {
      const sp = selectingFor===0 ? p1 : p2;
      if (sp) {
        const distLabel = dist(sp, hover).toFixed(0);
        const ci = PIXEL_CRATER[hover.y*W+hover.x];
        const onPSR = PSR_MASK[hover.y*W+hover.x];
        const onRidgeH = RIDGE_MASK[hover.y*W+hover.x];
        // v174: surface slope → rover-speed so players can reason about
        // trafficability instead of guessing why a rover crawls or stalls.
        const slopeH = SLOPE_MAP[hover.y*W+hover.x] || 0;
        const speedPct = Math.round(roverSlopeFactor(slopeH) * 100);
        ctx.save();
        ctx.fillStyle = "rgba(2,5,14,0.93)";
        const ttW = 92, ttH = 41;
        const ttX = hover.x+8, ttY = hover.y-ttH-4;
        ctx.fillRect(ttX, ttY, ttW, ttH);
        ctx.strokeStyle = sp.color+"55"; ctx.lineWidth = 0.8;
        ctx.strokeRect(ttX, ttY, ttW, ttH);
        ctx.fillStyle = "#8B86B0"; ctx.font="7px 'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,sans-serif";
        ctx.textAlign="left"; ctx.textBaseline="top";
        ctx.fillText(`dist: ${distLabel}px`, ttX+4, ttY+4);
        if (onPSR && ci>=0) {
          const h=(craterHealth[ci]??1.0);
          ctx.fillStyle = h>0.5?"#9BD4B5":h>0.2?"#E8C998":"#E89BB5";
          ctx.fillText(`crater: ${(h*100).toFixed(0)}%${onRidgeH?" ★":""}`, ttX+4, ttY+15);
        } else if (onPSR) {
          ctx.fillStyle="#8B86B0"; ctx.fillText(`PSR${onRidgeH?" ★":""}`,ttX+4,ttY+15);
        } else {
          ctx.fillStyle="#5A567A"; ctx.fillText("off-PSR",ttX+4,ttY+15);
        }
        // Slope row: green-trafficable / amber-slow / red-impassable, with the
        // exact rover-speed multiplier the physics model applies.
        ctx.fillStyle = speedPct >= 80 ? "#9BD4B5" : speedPct > 0 ? "#E8C998" : "#E89BB5";
        const slopeMsg = speedPct > 0
          ? `slope ${slopeH.toFixed(0)}° · rover ${speedPct}% speed`
          : `slope ${slopeH.toFixed(0)}° · impassable`;
        ctx.fillText(slopeMsg, ttX+4, ttY+26);
        ctx.restore();
      }
    }

    // ── Permanent rover-aim arrow ────────────────────────────────────────
    // Draw on the work canvas (this pass). The same code will be re-run on
    // the display canvas at full DPR by redrawSharpOverlayRef so the arrow
    // and chip stay crisp at any zoom.
    const drawRoverArrows = (targetCtx) => {
      if (phase !== PHASE.PLAYING) return;
      // v23: counter-scale all on-canvas overlays (arrows, chips, text) by
      // 1/zoom so they stay constant size on screen as the camera zooms in.
      // Without this, at 4.5× zoom a 110px arrow becomes a 500px monster
      // and a 15px chip font becomes 67px (the v22 bug visible in the
      // screenshot). The work canvas is in source-pixel coords; the CSS
      // transform on its wrapper applies the zoom, so we have to fight it
      // here.
      const zk = Math.max(1, viewport.zoom || 1);
      const s = 1 / zk;
      const activeActors = mp
        ? (myActor === 0 || myActor === 1 ? [myActor] : [])
        : [activeTurn];
      for (const pi of activeActors) {
        if (pi !== 0 && pi !== 1) continue;
        const ap = pi === 0 ? p1 : p2;
        if (!ap) continue;
        const isDoneNow = (pi === 0 && p1Done) || (pi === 1 && p2Done);
        if (isDoneNow) continue;
        if (!canControlActor(pi)) continue;
        const rIdx = selectedRover[pi] || 0;
        const rover = rIdx === 0 ? ap : (ap.extraRovers || [])[rIdx - 1];
        if (!rover) continue;
        const color = pi === 0 ? PLAYER1_COLOR : PLAYER2_COLOR;
        const ax = rover.x, ay = rover.y;
        const draggingThis = roverDrag && roverDrag.roverPi === pi && roverDrag.rIdx === rIdx;
        let angle = null;
        let isAuto = false;
        let autoReason = null;
        if (draggingThis) {
          angle = roverDrag.angle;
        } else if (rover.aimDirection != null && Number.isFinite(rover.aimDirection)) {
          angle = rover.aimDirection;
        } else {
          const t = pickRoverTarget(rover, ap, craterHealth);
          if (t) {
            angle = Math.atan2(t.y - ay, t.x - ax);
            isAuto = true;
            autoReason = t.reason;
          }
        }
        if (angle == null) continue;
        // Longer arrow + bigger grab handle for easier targeting on small screens.
        // v23: all dimensions scaled by `s` = 1/zoom.
        const arrLen = 110 * s;
        const bx = ax + Math.cos(angle) * arrLen;
        const by = ay + Math.sin(angle) * arrLen;
        targetCtx.save();
        // Wider shadow stroke
        targetCtx.strokeStyle = "rgba(0,0,0,0.55)";
        targetCtx.lineWidth = 14 * s;
        targetCtx.lineCap = "round";
        if (isAuto) targetCtx.setLineDash([12 * s, 7 * s]);
        targetCtx.beginPath();
        targetCtx.moveTo(ax, ay); targetCtx.lineTo(bx, by);
        targetCtx.stroke();
        targetCtx.setLineDash([]);
        // Thicker main shaft
        targetCtx.strokeStyle = isAuto ? color + "b0" : color;
        targetCtx.lineWidth = 8 * s;
        if (isAuto) targetCtx.setLineDash([12 * s, 7 * s]);
        targetCtx.beginPath();
        targetCtx.moveTo(ax, ay); targetCtx.lineTo(bx, by);
        targetCtx.stroke();
        targetCtx.setLineDash([]);
        // Bigger arrowhead
        const headLen = 40 * s;
        targetCtx.fillStyle = isAuto ? color + "d0" : color;
        targetCtx.beginPath();
        targetCtx.moveTo(bx, by);
        targetCtx.lineTo(bx - headLen * Math.cos(angle - 0.45), by - headLen * Math.sin(angle - 0.45));
        targetCtx.lineTo(bx - headLen * 0.55 * Math.cos(angle), by - headLen * 0.55 * Math.sin(angle));
        targetCtx.lineTo(bx - headLen * Math.cos(angle + 0.45), by - headLen * Math.sin(angle + 0.45));
        targetCtx.closePath();
        targetCtx.fill();
        targetCtx.strokeStyle = "rgba(15,12,28,0.8)";
        targetCtx.lineWidth = 2 * s;
        targetCtx.stroke();
        // Big bright grab handle ring at the arrowhead, pulsing for visibility
        if (!draggingThis) {
          targetCtx.strokeStyle = "rgba(236,234,248,0.95)";
          targetCtx.lineWidth = 3 * s;
          targetCtx.beginPath();
          targetCtx.arc(bx, by, 22 * s, 0, Math.PI * 2);
          targetCtx.stroke();
          // Inner subtle ring for hand-grab affordance
          targetCtx.strokeStyle = color + "aa";
          targetCtx.lineWidth = 1.5 * s;
          targetCtx.beginPath();
          targetCtx.arc(bx, by, 28 * s, 0, Math.PI * 2);
          targetCtx.stroke();
        }
        // Status chip -- v23: counter-scaled
        const degrees = ((angle * 180 / Math.PI) + 90 + 360) % 360;
        const chipX = bx + 28 * s, chipY = by + 14 * s;
        const chipW = 170 * s, chipH = 42 * s;
        targetCtx.fillStyle = "rgba(15,12,28,0.95)";
        targetCtx.fillRect(chipX, chipY, chipW, chipH);
        targetCtx.strokeStyle = color + "aa";
        targetCtx.lineWidth = 1.5 * s;
        targetCtx.strokeRect(chipX, chipY, chipW, chipH);
        targetCtx.fillStyle = "#ECEAF8";
        targetCtx.font = `600 ${15 * s}px 'Bricolage Grotesque', monospace`;
        targetCtx.textAlign = "left"; targetCtx.textBaseline = "top";
        targetCtx.fillText(`R${rIdx + 1} · ${degrees.toFixed(0)}°`, chipX + 9 * s, chipY + 6 * s);
        targetCtx.fillStyle = isAuto ? "#8B86B0" : color;
        targetCtx.font = `italic ${12 * s}px 'Spectral', Georgia, serif`;
        const label = isAuto
          ? (autoReason === "recharge" ? "auto · low battery"
              : autoReason === "return" ? "auto · ice full"
              : autoReason === "autoseek" ? "auto · seeking PSR"
              : "auto")
          : "aimed";
        targetCtx.fillText(label, chipX + 9 * s, chipY + 25 * s);
        targetCtx.restore();
      }
    };
    drawRoverArrows(ctx);
    // v26: sharp-pass list grows to include rover safety zones, the
    // turn indicator ring, primary rover circle/label, and rover
    // safety circles. These were previously drawn only on the work
    // canvas at W×H = 1212×1212, then upscaled with bilinear blur
    // to the display canvas. Lifting them into the sharp pass means
    // the display canvas redraws them at full backing-store fidelity
    // (W*DPR*zoom), so they stay crisp at any zoom level.
    const sharpDrawFns = [drawRoverArrows];
    redrawSharpOverlayRef.current = (targetCtx) => {
      for (const fn of sharpDrawFns) fn(targetCtx);
    };

    // Rovers
    // v23: rover canvas overlays use the _s/_zk factors hoisted above the
    // crater-badge block -- keeps the "1" labels, status icons, ice
    // bubbles, and carry badges readable at any zoom.
    for (const p of [p1, p2]) {
      if (!p || p.active === false) continue;
      const si = STATUS_INFO[p.status] || STATUS_INFO.idle;

      // Turn indicator ring -- drawn around the currently selected rover
      const isActive = (activeTurn===0 && p.id===1) || (activeTurn===1 && p.id===2);
      const isDone   = (p.id===1 && p1Done) || (p.id===2 && p2Done);
      if (phase===PHASE.PLAYING) {
        const selIdx = selectedRover[p.id - 1] ?? 0;
        const selRover = selIdx === 0 ? p : (p.extraRovers||[])[selIdx - 1];
        const rx = selRover?.x ?? p.x;
        const ry = selRover?.y ?? p.y;
        ctx.beginPath(); ctx.arc(rx, ry, 10 * _s, 0, Math.PI*2);
        ctx.strokeStyle = isDone ? "#9BD4B5cc" : p.color+"cc";
        ctx.lineWidth = (isDone ? 1.5 : isActive ? 2 : 1.5) * _s;
        ctx.stroke();
      }

      ctx.beginPath(); ctx.arc(p.x, p.y, 5 * _s, 0, Math.PI*2);
      ctx.fillStyle = p.color; ctx.fill();
      ctx.strokeStyle="#000"; ctx.lineWidth=1.2 * _s; ctx.stroke();
      ctx.fillStyle="#000"; ctx.font=`bold ${6.5 * _s}px monospace`;
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText("1", p.x, p.y);

      // Status icon above
      ctx.font=`${8 * _s}px monospace`; ctx.textAlign="center"; ctx.textBaseline="bottom";
      ctx.fillText(si.icon, p.x, p.y - 7 * _s);

      // Ice bubble
      if (p.ice > 5) {
        ctx.fillStyle="rgba(3,8,20,0.85)"; ctx.fillRect(p.x + 7 * _s, p.y - 15 * _s, 31 * _s, 9.5 * _s);
        ctx.fillStyle="#C0B8E8"; ctx.font=`${6.5 * _s}px monospace`; ctx.textAlign="left";
        ctx.fillText("❄"+p.ice.toFixed(0)+"kg", p.x + 8.5 * _s, p.y - 9.5 * _s);
      }

      // Carrying badge
      if (p.carrying) {
        const icons = { solar:"☀", reactor:"☢", habitat:"🏠", rover:"🚗", pad:"🛬" };
        ctx.fillStyle="rgba(255,170,40,0.92)"; ctx.fillRect(p.x - 10.5 * _s, p.y - 24 * _s, 21 * _s, 8.5 * _s);
        ctx.fillStyle="#000"; ctx.font=`bold ${5.5 * _s}px monospace`; ctx.textAlign="center"; ctx.textBaseline="top";
        ctx.fillText((icons[p.carrying.type]||"?")+" CARGO", p.x, p.y - 23.5 * _s);
      }

      // Power dot, gated on the Battery layer (v162).
      if (showLayers.power !== false) {
        const pwrFrac = p.power/POWER_CAP;
        const pwrCol = pwrFrac>0.4?"#88ff44":pwrFrac>0.18?"#ffdd00":"#E89BB5";
        ctx.beginPath(); ctx.arc(p.x + 7 * _s, p.y + 7 * _s, 3.2 * _s, 0, Math.PI*2);
        ctx.fillStyle=pwrCol; ctx.fill();
        ctx.strokeStyle="#000"; ctx.lineWidth=0.4 * _s; ctx.stroke();
      }
    }

    // Rover safety zones (drawn after sprites so they appear on top as visible rings)
    // v26: extracted as a function and registered for the sharp display pass
    // so the dashed ring + faint fill stay crisp at any zoom.
    // v140: now respects showLayers.safety (previously this path drew rover
    // zones unconditionally, so toggling the Zones layer off still left rover
    // rings on the map), and applies the per-player safetyMult so its radius
    // matches the radius the per-asset safety loop uses for every other asset
    // type (it was using the bare SAFETY_RADIUS.rover, ignoring the multiplier).
    // v185: the rover's single keep-out ring is fully retired. Rovers now render
    // Christine's graduated 3-ring (Core / Harmonization / Coordination) in the
    // per-asset loop above, identical to solar / habitat / pad, so every surface
    // asset reads as a clean 3-ring. (Previously a bold single ring was still
    // registered here and stacked on top of the graduated rings.)

    // ── Charge-in-range indicators (v162) ────────────────────────────────
    // Was: a fixed-size 🔋 / ⚡ emoji per rover and habitat, drawn at "bold 9px"
    // with no zoom counter-scale, so at any zoom they ballooned, drifted away
    // from their asset, and rendered inconsistently across platforms. Now a small
    // crisp vector pip that counter-scales (constant on-screen size) and only
    // appears when the asset is within a generator's range: a tidy charge bolt.
    // Gated on the Battery layer.
    if (showLayers.power !== false) {
      const physNight = isNight(globalDay);
      // Gather every functional generator across both players
      const generators = [];
      for (const gp of [p1, p2]) {
        if (!gp || gp.active === false) continue;
        (gp.panels || []).forEach((pn, idx) => {
          if ((gp.structureHealth?.panels?.[idx] ?? 1.0) <= 0) return;
          if (physNight && (ILLUM_MAP[pn.y * W + pn.x] || 0) < 0.05) return;
          generators.push({ x: pn.x, y: pn.y, range: SAFETY_RADIUS.solar });
        });
        (gp.reactors || []).forEach((rx, idx) => {
          if ((gp.structureHealth?.reactors?.[idx] ?? 1.0) <= 0) return;
          generators.push({ x: rx.x, y: rx.y, range: SAFETY_RADIUS.reactor });
        });
      }
      const inPowerRange = (cx, cy) =>
        generators.some(g => dist({ x: cx, y: cy }, g) <= g.range);

      // A small lightning bolt, counter-scaled, drawn just up-left of the asset.
      const drawChargePip = (cx, cy) => {
        if (!inPowerRange(cx, cy)) return;
        const px = cx - 8 * _s, py = cy - 8 * _s;
        const u = 3.4 * _s; // glyph half-height
        ctx.save();
        ctx.translate(px, py);
        // soft dark disc behind the bolt for contrast
        ctx.beginPath(); ctx.arc(0, 0, u * 1.25, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(8,10,20,0.7)"; ctx.fill();
        // bolt path
        ctx.beginPath();
        ctx.moveTo(0.25 * u, -u);
        ctx.lineTo(-0.55 * u, 0.15 * u);
        ctx.lineTo(-0.05 * u, 0.15 * u);
        ctx.lineTo(-0.25 * u, u);
        ctx.lineTo(0.6 * u, -0.25 * u);
        ctx.lineTo(0.1 * u, -0.25 * u);
        ctx.closePath();
        ctx.fillStyle = "#FFE36B";
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 0.6 * _s;
        ctx.fill(); ctx.stroke();
        ctx.restore();
      };

      for (const p of [p1, p2]) {
        if (!p || p.active === false) continue;
        drawChargePip(p.x, p.y);
        (p.extraRovers || []).forEach((er, idx) => {
          if ((p.structureHealth?.extraRovers?.[idx] ?? 1.0) <= 0) return;
          drawChargePip(er.x, er.y);
        });
        (p.habitats || []).forEach((h, idx) => {
          if ((p.structureHealth?.habitats?.[idx] ?? 1.0) <= 0) return;
          drawChargePip(h.x, h.y);
        });
      }
    }

    // Night overlay text
    if (night) {
      ctx.fillStyle="rgba(20,10,60,0.25)"; ctx.fillRect(0,0,W,H);
      ctx.fillStyle="rgba(180,160,255,0.7)"; ctx.font="bold 10px monospace";
      ctx.textAlign="right"; ctx.textBaseline="top";
      ctx.fillText("LUNAR NIGHT", W-8, 8);
    }

    // ── Map layer overlays, v72 ────────────────────────────────────────
    // Rendering pipeline per layer:
    //   1. Draw grayscale source into scratch canvas
    //   2. Multiply with the layer's assigned color → tinted luminance
    //   3. Composite onto main canvas:
    //      • PSR (binary mask)  → source-over at higher alpha so the pink
    //        pops against any basemap brightness
    //      • Intensity layers   → lighter (additive) with per-layer alpha
    //        tuning so bright spots bloom without washing out
    //      • Index layers       → source-over with gamma-lifted alpha curves
    // v72 improvements:
    //   - Per-layer alpha constants replace the flat 0.9 / 0.72 / 0.82 values
    //   - PSR gets a thin bright-edge pass on top so crater rims read crisply
    //   - Intensity layers get a subtle edge-softening vignette via a second
    //     pass at lower globalAlpha with screen blending
    //   - Legend badge redesigned: rounded, color-coded rows with swatch dots
    if (activeOverlays.size > 0) {
      if (!overlayScratchRef.current) {
        const sc = document.createElement("canvas");
        sc.width = W; sc.height = H;
        overlayScratchRef.current = sc;
      }
      const scratch = overlayScratchRef.current;
      const sctx = scratch.getContext("2d");

      // Per-layer composite alpha tuning. Values chosen so each layer reads
      // clearly on the default LROC relief basemap without blowing out.
      const LAYER_ALPHA = {
        psr:              0.72,
        ice_depth:        0.80,
        water_hydrogen:   0.78,
        sunlit_max:       0.70,
        sun_incidence:    0.68,
        shadows_min:      0.72,
        terrain_shadows:  0.65,
        temperature:      0.75,
        earth_visibility: 0.72,
        slope:            0.70,
        roughness:        0.68,
      };

      const drawn = [];
      for (const key of activeOverlays) {
        const info = LAYER_INFO.find(L => L.key === key);
        if (!info) continue;

        // Computed favorability layers (LFI / SOFI / IFI / composite)
        if (info.computed) {
          let cv = indexLayerCacheRef.current[key];
          if (!cv) {
            cv = buildIndexLayerCanvas(key);
            if (cv) indexLayerCacheRef.current[key] = cv;
          }
          if (cv) {
            // Primary pass: source-over at full alpha. The per-pixel alpha
            // baked into the composite canvas already does the falloff, so
            // low-favorability terrain shows the dark base through.
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = key === "idx_composite" ? 1.0 : 0.68;
            ctx.drawImage(cv, 0, 0);
            // Accent pass: screen blend adds luminance lift at high-value
            // pixels, making peaks feel emissive against the darkened base.
            ctx.globalCompositeOperation = "screen";
            ctx.globalAlpha = key === "idx_composite" ? 0.28 : 0.10;
            ctx.drawImage(cv, 0, 0);
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = "source-over";
            drawn.push(info);
          }
          continue;
        }

        const url = MAP_LAYERS[key];
        if (!url) continue;
        const img = LAYER_IMAGES[url];
        if (!img || !img.complete) continue;

        // Step 1: grayscale source into scratch
        sctx.globalCompositeOperation = "source-over";
        sctx.globalAlpha = 1.0;
        sctx.fillStyle = "#000";
        sctx.fillRect(0, 0, W, H);
        sctx.drawImage(img, 0, 0, W, H);

        // Step 2: multiply tint
        sctx.globalCompositeOperation = "multiply";
        sctx.fillStyle = info.color;
        sctx.fillRect(0, 0, W, H);

        const alpha = LAYER_ALPHA[key] ?? 0.75;

        if (key === "psr") {
          // PSR: source-over so color is independent of basemap brightness.
          // Higher alpha than before so crater floors read as clearly distinct.
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = alpha;
          ctx.drawImage(scratch, 0, 0);
          // Thin bright-edge pass: screen at low alpha lifts the PSR rim pixels
          // so the boundary between shadow and lit terrain glows slightly.
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = 0.18;
          ctx.drawImage(scratch, 0, 0);
        } else {
          // Intensity layers: lighter (additive) primary pass
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = alpha;
          ctx.drawImage(scratch, 0, 0);
          // Soft secondary pass at very low alpha with screen blending , 
          // adds a gentle luminance lift at peak pixels without blowing out
          // the surrounding terrain.
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = 0.08;
          ctx.drawImage(scratch, 0, 0);
        }
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = "source-over";
        drawn.push(info);
      }

      // ── Overlay legend badge, v78: gradient swatches + value ranges ────
      // The active overlays are continuous scales, not categories, so a flat
      // colour dot under-described them. Each row now shows a low→high
      // gradient bar (dark → the layer's tint, matching how the layer paints
      // on the map) plus the layer's real value range where one exists. The
      // RGB favorability composite gets a three-channel swatch + a key, since
      // a single dot was meaningless for a tri-channel layer. Box width is
      // measured from the content so long labels (e.g. "Operations
      // favorability (SOFI)") no longer clip against the old fixed 170px.
      if (drawn.length > 0) {
        ctx.save();

        // Real value ranges. Normalised [0,1] layers read as 0-100%; slope and
        // temperature carry physical units (see mapData.js loaders). The three
        // indices auto-scale per load, and the post's point is the cross-index
        // ORDERING not the magnitude, so they read "low → high".
        const RANGE_LABEL = {
          slope: "0-30°", temperature: "25-300 K",
          ice_depth: "0-100%", water_hydrogen: "0-100%", sunlit_max: "0-100%",
          shadows_min: "0-100%", terrain_shadows: "0-100%", earth_visibility: "0-100%",
          sun_incidence: "low → high", roughness: "low → high",
          idx_lfi: "low → high", idx_sofi: "low → high", idx_ifi: "low → high",
        };
        const COMPOSITE_CHANNELS = ["rgb(255,90,82)", "rgb(84,236,106)", "rgb(63,182,255)"];
        const COMPOSITE_KEY = "red landing · green ops · blue ice";

        const meta = drawn.map((info) => ({
          info,
          type: info.key === "idx_composite" ? "composite"
              : info.key === "psr"           ? "solid"
              : "gradient",
          range: info.key === "idx_composite" ? null : (RANGE_LABEL[info.key] || null),
        }));

        const pad = 8, headerH = 15, lineH = 16, subH = 12;
        const swatchW = 24, swatchH = 7, gap = 7;
        const labelFont = "500 9.5px 'Bricolage Grotesque', monospace";
        const headFont  = "700 8px 'Bricolage Grotesque', monospace";
        const rangeFont = "500 8px 'Bricolage Grotesque', monospace";
        const subFont   = "500 7.5px 'Bricolage Grotesque', monospace";

        // Measure content width so the badge fits the widest row.
        ctx.font = labelFont;
        let maxLabel = 0, maxRange = 0;
        for (const m of meta) {
          maxLabel = Math.max(maxLabel, ctx.measureText(m.info.label).width);
          if (m.type === "composite") maxLabel = Math.max(maxLabel, ctx.measureText(COMPOSITE_KEY).width);
        }
        ctx.font = rangeFont;
        for (const m of meta) if (m.range) maxRange = Math.max(maxRange, ctx.measureText(m.range).width);
        ctx.font = headFont;
        const headerW = ctx.measureText("OVERLAYS").width;

        const contentW = swatchW + gap + maxLabel + (maxRange > 0 ? gap + maxRange : 0);
        const headerRowW = swatchW + 5 + headerW;
        let boxW = pad * 2 + Math.max(contentW, headerRowW);
        boxW = Math.max(150, Math.min(248, Math.round(boxW)));

        const nSub = meta.filter((m) => m.type === "composite").length;
        const boxH = pad * 2 + headerH + 4 + lineH * meta.length + subH * nSub;
        const bx = 8, by = 8;

        // Background
        ctx.fillStyle = "rgba(14,12,28,0.88)";
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 5); ctx.fill(); }
        else ctx.fillRect(bx, by, boxW, boxH);

        // Top accent stripe
        ctx.fillStyle = drawn[0].color + "88";
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, boxW, 3, [5, 5, 0, 0]); ctx.fill(); }
        else ctx.fillRect(bx, by, boxW, 3);

        // Border
        ctx.strokeStyle = "rgba(168,168,240,0.28)";
        ctx.lineWidth = 1;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 5); ctx.stroke(); }
        else ctx.strokeRect(bx, by, boxW, boxH);

        // Header label
        ctx.font = headFont;
        ctx.fillStyle = "rgba(168,164,210,0.80)";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText("OVERLAYS", bx + pad + swatchW + 5, by + pad + headerH / 2);

        // Layer rows (running cursor, composite rows are taller)
        const sx = bx + pad;
        const labelX = sx + swatchW + gap;
        let cursorY = by + pad + headerH + 4;
        for (const m of meta) {
          const cy = cursorY + lineH / 2;
          if (m.type === "composite") {
            // v184: render the tri-channel composite as three stacked RGB BARS
            // (red = landing favorability, green = ops, blue = ice) rather than
            // squares, so the additive-color key reads at a glance.
            const bh = 2, bgap = 0.5;
            const stackH = bh * 3 + bgap * 2;
            COMPOSITE_CHANNELS.forEach((c, j) => {
              const y0 = cy - stackH / 2 + j * (bh + bgap);
              ctx.fillStyle = c;
              ctx.fillRect(sx, y0, swatchW, bh);
              ctx.strokeStyle = "rgba(90,86,120,0.5)";
              ctx.lineWidth = 0.5;
              ctx.strokeRect(sx + 0.25, y0 + 0.25, swatchW - 0.5, bh - 0.5);
            });
            ctx.font = labelFont; ctx.textAlign = "left";
            ctx.fillStyle = "rgba(236,234,248,0.90)";
            ctx.fillText(m.info.label, labelX, cy);
            ctx.font = subFont;
            ctx.fillStyle = "rgba(150,146,180,0.85)";
            ctx.fillText(COMPOSITE_KEY, labelX, cursorY + lineH + subH / 2);
            cursorY += lineH + subH;
            continue;
          }
          if (m.type === "solid") {
            ctx.fillStyle = m.info.color;
            ctx.fillRect(sx, cy - swatchH / 2, swatchW, swatchH);
          } else {
            const grad = ctx.createLinearGradient(sx, 0, sx + swatchW, 0);
            grad.addColorStop(0, "rgba(24,22,40,1)");
            grad.addColorStop(1, m.info.color);
            ctx.fillStyle = grad;
            ctx.fillRect(sx, cy - swatchH / 2, swatchW, swatchH);
          }
          ctx.strokeStyle = "rgba(90,86,120,0.7)";
          ctx.strokeRect(sx + 0.5, cy - swatchH / 2 + 0.5, swatchW - 1, swatchH - 1);
          ctx.font = labelFont; ctx.textAlign = "left";
          ctx.fillStyle = "rgba(236,234,248,0.90)";
          ctx.fillText(m.info.label, labelX, cy);
          if (m.range) {
            ctx.font = rangeFont; ctx.textAlign = "right";
            ctx.fillStyle = "rgba(150,146,180,0.85)";
            ctx.fillText(m.range, bx + boxW - pad, cy);
          }
          cursorY += lineH;
        }
        ctx.textAlign = "left";
        ctx.restore();
      }
    }


    // ── Polar grid overlay, v72 ──────────────────────────────────────────
    // Three latitude rings (80°S, 85°S, 87°S) + four longitude meridians.
    // Uses a layered approach: thick dim glow stroke under a thinner crisp
    // stroke so the rings read well on any basemap without dominating.
    if (showLayers.grid !== false) {
      const cx = POLE_PX.x, cy = POLE_PX.y;
      ctx.save();

      // Longitude meridians (very faint, just structural)
      ctx.strokeStyle = "rgba(232,201,152,0.10)";
      ctx.lineWidth = 1.0;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, cy); ctx.lineTo(W, cy);
      ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
      ctx.stroke();

      // Latitude rings, glow pass
      const rings = [
        { r: 606, lat: "80°S", dash: [8, 12], glowA: 0.12, strokeA: 0.28, lw: 1.2 },
        { r: 303, lat: "85°S", dash: [6, 9],  glowA: 0.10, strokeA: 0.24, lw: 1.0 },
        { r: 151, lat: "87°S", dash: [4, 7],  glowA: 0.07, strokeA: 0.18, lw: 0.8 },
      ];
      for (const ring of rings) {
        // Thick glow
        ctx.strokeStyle = `rgba(232,201,152,${ring.glowA})`;
        ctx.lineWidth = ring.lw * 4;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(cx, cy, ring.r, 0, Math.PI*2); ctx.stroke();
        // Crisp dashed ring on top
        ctx.strokeStyle = `rgba(232,201,152,${ring.strokeA})`;
        ctx.lineWidth = ring.lw;
        ctx.setLineDash(ring.dash);
        ctx.beginPath(); ctx.arc(cx, cy, ring.r, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Pole marker, crosshair + dot
      ctx.strokeStyle = "rgba(232,201,152,0.50)";
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
      ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
      ctx.stroke();
      ctx.fillStyle = "rgba(232,201,152,0.95)";
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill();

      // Lat / lon labels, draw in source-pixel coords, no scale tricks needed.
      // The canvas is in W×H space; the CSS zoom on the wrapper handles display scaling.
      ctx.font = "italic 11px 'Spectral', Georgia, serif";
      const drawLatLabel = (text, px, py) => {
        const tw = ctx.measureText(text).width;
        const lpad = 5, lh = 14;
        const lx = px - tw / 2 - lpad;
        const ly = py - lh / 2;
        ctx.fillStyle = "rgba(14,12,26,0.72)";
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(lx, ly, tw + lpad * 2, lh, 3); ctx.fill(); }
        else ctx.fillRect(lx, ly, tw + lpad * 2, lh);
        ctx.fillStyle = "rgba(232,201,152,0.70)";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, px, py);
      };
      drawLatLabel("80°S", cx, 12);
      drawLatLabel("85°S", cx, cy - 303 + 12);
      drawLatLabel("87°S", cx, cy - 151 + 11);
      ctx.fillStyle = "rgba(232,201,152,0.50)";
      ctx.font = "italic 10px 'Spectral', Georgia, serif";
      ctx.textAlign = "left";  ctx.textBaseline = "middle";
      ctx.fillText("90°E",  8, cy - 10);
      ctx.textAlign = "right";
      ctx.fillText("270°E", W - 8, cy - 10);

      ctx.restore();
    }


    // "DONE" checkmark on rover who finished their turn
    for (const p of [p1, p2]) {
      if (!p || p.active === false) continue;
      const isDone = (p.id===1&&p1Done)||(p.id===2&&p2Done);
      if (isDone && phase===PHASE.PLAYING) {
        ctx.fillStyle="#9BD4B5"; ctx.font="bold 11px monospace";
        ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText("✓", p.x, p.y-22);
      }
    }

    // ── Annotation pins, v72 ─────────────────────────────────────────────
    // Teardrop pin with a rounded label bubble. Glow matches pin color.
    annotations.forEach((ann, ai) => {
      ctx.save();
      ctx.translate(ann.x, ann.y);
      ctx.scale(_s, _s);
      const col = ann.color || "#E8C998";
      // Stem
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, -16);
      ctx.strokeStyle = col + "cc"; ctx.lineWidth = 1.8;
      ctx.shadowColor = col; ctx.shadowBlur = 4;
      ctx.stroke();
      // Pin head: filled circle with inner highlight
      ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(0, -21, 6, 0, Math.PI*2);
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 1; ctx.shadowBlur = 0; ctx.stroke();
      // Inner glint
      ctx.beginPath(); ctx.arc(-1.5, -23, 2, 0, Math.PI*2);
      ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fill();
      // Label bubble
      if (ann.label) {
        ctx.font = "600 7px 'Bricolage Grotesque', sans-serif";
        const lw = Math.min(ctx.measureText(ann.label.substring(0, 16)).width + 10, 94);
        const lh = 12, lx = 8, ly = -33;
        ctx.fillStyle = "rgba(2,5,14,0.90)";
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(lx, ly, lw, lh, 3); ctx.fill(); }
        else ctx.fillRect(lx, ly, lw, lh);
        ctx.strokeStyle = col + "55"; ctx.lineWidth = 0.8;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(lx, ly, lw, lh, 3); ctx.stroke(); }
        else ctx.strokeRect(lx, ly, lw, lh);
        ctx.fillStyle = col;
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillText(ann.label.substring(0, 16), lx + 4, ly + 2.5);
      }
      ctx.restore();
    });

    // Annotation placement crosshair when in annotation mode
    if (annotating && hover) {
      ctx.save();
      ctx.strokeStyle = "#E8C998aa"; ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(hover.x - 12, hover.y); ctx.lineTo(hover.x + 12, hover.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hover.x, hover.y - 12); ctx.lineTo(hover.x, hover.y + 12); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // Explore-mode hover crosshair (live cursor follow)
    if (exploreMode && hover) {
      ctx.save();
      ctx.strokeStyle = "rgba(168,168,240,0.5)"; ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(hover.x - 16, hover.y); ctx.lineTo(hover.x + 16, hover.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hover.x, hover.y - 16); ctx.lineTo(hover.x, hover.y + 16); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(168,168,240,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(hover.x, hover.y, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // Explore-click locked marker (after analyzing a point)
    if (exploreClick) {
      ctx.save();
      // Outer ring
      ctx.strokeStyle = "#A8A8F0"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(exploreClick.x, exploreClick.y, 16, 0, Math.PI * 2); ctx.stroke();
      // Inner dot
      ctx.fillStyle = "#A8A8F0";
      ctx.beginPath(); ctx.arc(exploreClick.x, exploreClick.y, 4, 0, Math.PI * 2); ctx.fill();
      // Crosshair lines
      ctx.strokeStyle = "rgba(168,168,240,0.7)"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(exploreClick.x - 24, exploreClick.y); ctx.lineTo(exploreClick.x - 8, exploreClick.y);
      ctx.moveTo(exploreClick.x + 8, exploreClick.y); ctx.lineTo(exploreClick.x + 24, exploreClick.y);
      ctx.moveTo(exploreClick.x, exploreClick.y - 24); ctx.lineTo(exploreClick.x, exploreClick.y - 8);
      ctx.moveTo(exploreClick.x, exploreClick.y + 8); ctx.lineTo(exploreClick.x, exploreClick.y + 24);
      ctx.stroke();
      ctx.restore();
    }
    // Compose the work canvas to the DPR-scaled display canvas. Three pass:
    //   1. Sharp basemap drawn directly to display canvas at full DPR.
    //   2. The work canvas (W×H) blit-scaled with mild alpha for the PSR
    //      pixel-modulation, mine-trail tint, night dimming, claim circles,
    //      annotations. These don't have to be pixel-sharp.
    //   3. Critical vector content (rover arrows, asset icons, action chips)
    //      is redrawn directly on the display canvas at full DPR via
    //      redrawSharpOverlay. This is what keeps the rover UI crisp.
    // v24: Compose the work canvas (transparent + dynamic effects) to the
    // display canvas. The basemap itself is NOT drawn here anymore -- it's
    // a sibling <img> element in the DOM (around line 10220) that the
    // browser re-rasterizes from SVG at any zoom level for vector
    // crispness. This canvas is purely the overlay layer.
    const displayCtx = canvas.getContext("2d");
    displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    displayCtx.clearRect(0, 0, canvas.width, canvas.height);
    // Vector physics overlays (slope, Earth visibility, sun). SVG sources --
    // smoothing enabled so the browser interpolates cleanly to display size.
    // v92: vector physics overlays now drawn from pre-baked raster canvases
    // (built from SLOPE_MAP / EARTH_VIS_MAP) instead of the legacy SVG files.
    // Canvas source is 1212×1212; draw scaled to display canvas size with
    // smoothing so the region edges interpolate softly.
    displayCtx.imageSmoothingEnabled = true;
    displayCtx.imageSmoothingQuality = "high";
    if (activeVectorOverlays.has("overlay_slope") && slopeCanvasRef.current) {
      displayCtx.globalAlpha = 0.88;
      displayCtx.drawImage(slopeCanvasRef.current, 0, 0, canvas.width, canvas.height);
      displayCtx.globalAlpha = 1.0;
    }
    if (activeVectorOverlays.has("overlay_earth") && commsContourCanvasRef.current) {
      displayCtx.globalAlpha = 0.80;
      displayCtx.drawImage(commsContourCanvasRef.current, 0, 0, canvas.width, canvas.height);
      displayCtx.globalAlpha = 1.0;
    }
    if (activeVectorOverlays.has("overlay_sun") && solarCanvasRef.current) {
      // v93: draw from pre-baked raster solar canvas (three illumination bands)
      displayCtx.globalAlpha = 0.90;
      displayCtx.drawImage(solarCanvasRef.current, 0, 0, canvas.width, canvas.height);
      displayCtx.globalAlpha = 1.0;
    }
    // v120 (item 1, anti-pixelation): the work canvas is 1212x1212 source
    // pixels and is upscaled to the DPR*zoom display backing store. The old
    // nearest-neighbour blit kept per-pixel PSR tints crisp but made the
    // vector-like overlays drawn on this canvas (safety rings, the 3-ring
    // reactor zones, pooled-comms / shared-power links) hard-edged and blocky
    // at zoom. Smoothing the upscale interpolates those cleanly. The slight
    // softening of per-pixel tints is an acceptable trade for rings/power that
    // no longer pixelate; the SVG basemap and favorability overlay are separate
    // DOM <img> layers and were always crisp regardless.
    displayCtx.imageSmoothingEnabled = true;
    displayCtx.imageSmoothingQuality = "high";
    displayCtx.globalAlpha = 0.92;
    displayCtx.drawImage(work, 0, 0, canvas.width, canvas.height);
    displayCtx.globalAlpha = 1.0;
    displayCtx.imageSmoothingEnabled = true; // restore for subsequent passes

    // ── v45: Legend ↔ map cross-highlight ──────────────────────────────────
    // When a legend row is hovered (hoveredLegendKey), dim the rest of the
    // map slightly and re-draw the matched feature with a bright halo.
    // Works in display-canvas coords (post-blit) so it's cheap: one fill
    // for the dim, plus a small number of strokes/fills for the highlight.
    // Coords here are in W×H source space; the displayCtx is scaled to
    // canvas.width/canvas.height, so we apply the same scale before drawing.
    if (hoveredLegendKey) {
      const key = hoveredLegendKey;
      displayCtx.save();
      // Soft dim across the whole map. 0.22 alpha is enough to push the
      // un-emphasized features back without making them illegible.
      displayCtx.fillStyle = "rgba(8,6,18,0.22)";
      displayCtx.fillRect(0, 0, canvas.width, canvas.height);
      // Scale into source coords so we can reuse asset positions and radii
      // directly without manual canvas-size math.
      displayCtx.scale(canvas.width / W, canvas.height / H);
      // Pulse for breathing highlight (cheap; reuses the existing pulseTick
      // cadence via Date.now so we don't need an extra rAF).
      const hlPulse = (Math.sin(Date.now() / 280) + 1) * 0.5; // 0..1
      const haloAlpha = 0.55 + 0.30 * hlPulse;

      // Helper: stroke a circle in source coords.
      const strokeCircle = (x, y, r, color, width) => {
        displayCtx.strokeStyle = color;
        displayCtx.lineWidth = width;
        displayCtx.beginPath();
        displayCtx.arc(x, y, r, 0, Math.PI * 2);
        displayCtx.stroke();
      };

      // ── Zone-radius features (rover/solar/pad/habitat/reactor zones) ──
      const ZONE_KEY_TO_TYPE = {
        "rover-zone":   "rover",
        "solar-zone":   "solar",
        "pad-zone":     "pad",
        "habitat-zone": "habitat",
        "reactor-zone": "reactor",
      };
      if (ZONE_KEY_TO_TYPE[key]) {
        const type = ZONE_KEY_TO_TYPE[key];
        const style = { solar:"#FFD060", reactor:"#E86850", habitat:"#80B0D8", pad:"#E8C998", rover:"#9BD4B5" }[type];
        const r = ZONE_RADII_PX.core;  // v190: uniform DLA Core for every asset
        for (const p of [p1, p2]) {
          if (!p || p.active === false) continue;
          const sh = p.structureHealth || {};
          const collect = [];
          const push = (pt, idx, healthKey) => {
            if (!pt) return;
            const h = healthKey ? (sh[healthKey]?.[idx] ?? 1.0) : 1.0;
            if (h <= 0.1) return;
            collect.push(pt);
          };
          if (type === "pad") {
            if (p.landingPad) push(p.landingPad);
            (p.landingPads || []).forEach((pt, i) => push(pt, i, "landingPads"));
          } else if (type === "solar")   (p.panels   || []).forEach((pt, i) => push(pt, i, "panels"));
          else if (type === "reactor")   (p.reactors || []).forEach((pt, i) => push(pt, i, "reactors"));
          else if (type === "habitat")   (p.habitats || []).forEach((pt, i) => push(pt, i, "habitats"));
          else if (type === "rover") {
            if (p.x != null && p.y != null) push({ x: p.x, y: p.y });
            (p.extraRovers || []).forEach((er, i) => push(er, i, "extraRovers"));
          }
          for (const pt of collect) {
            // Bright fill restoring the un-dimmed feel inside the zone.
            displayCtx.fillStyle = `rgba(${parseInt(style.slice(1,3),16)},${parseInt(style.slice(3,5),16)},${parseInt(style.slice(5,7),16)},0.18)`;
            displayCtx.beginPath();
            displayCtx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
            displayCtx.fill();
            // Pulsing halo ring.
            strokeCircle(pt.x, pt.y, r,       `${style}${Math.round(haloAlpha*255).toString(16).padStart(2,"0")}`, 2.4);
            strokeCircle(pt.x, pt.y, r + 5,   `${style}55`, 1.5);
            strokeCircle(pt.x, pt.y, r + 11,  `${style}22`, 1.0);
          }
        }
      }

      // ── Comsat relay range ──
      if (key === "comsat") {
        const color = "#7DD8B0";
        for (const p of [p1, p2]) {
          if (!p) continue;
          (p.comsats || []).forEach((cs) => {
            if (!cs) return;
            displayCtx.fillStyle = "rgba(125,216,176,0.10)";
            displayCtx.beginPath();
            displayCtx.arc(cs.x, cs.y, COMSAT_RELAY_RADIUS, 0, Math.PI * 2);
            displayCtx.fill();
            strokeCircle(cs.x, cs.y, COMSAT_RELAY_RADIUS,       `${color}${Math.round(haloAlpha*255).toString(16).padStart(2,"0")}`, 2.2);
            strokeCircle(cs.x, cs.y, COMSAT_RELAY_RADIUS + 5,   `${color}40`, 1.2);
          });
        }
      }

      // ── Violation rings (re-emphasize what's currently breached) ──
      if (key === "violation") {
        for (const v of activeViolations) {
          // activeViolations stores radiusKm string; the on-map keep-out is the
          // uniform DLA Core (v190).
          const r = ZONE_RADII_PX.core;
          strokeCircle(v.x, v.y, r,     `rgba(255,80,60,${haloAlpha})`, 3.0);
          strokeCircle(v.x, v.y, r + 6, "rgba(255,150,120,0.35)", 1.5);
        }
      }

      // ── PSR (fresh + depleted), ridge: pixel-mask features ──
      // We don't re-rasterize the 1212×1212 mask here -- that would cost a
      // full canvas pass. Instead, label the legend visually (the hover
      // background + text emphasis is already enough) and add a brief
      // top-of-canvas hint ribbon naming the feature being shown.
      const PIXEL_FEATURE_LABELS = {
        "psr-fresh":    "Permanently shadowed regions (fresh ice)",
        "psr-depleted": "Permanently shadowed regions (depleted)",
        "ridge":        "Sunlit ridge crests",
        "claim1":       "Actor I claim region",
        "claim2":       "Actor II claim region",
        "mine1":        "Actor I mined cells",
        "mine2":        "Actor II mined cells",
        "blackout":     "Comms blackout (Earth not visible)",
      };
      // We still draw an "available" callout for non-shape features so the
      // viewer knows the dim is intentional. Drawn back in display-pixel
      // coords (undo the source-space scale).
      if (PIXEL_FEATURE_LABELS[key]) {
        displayCtx.restore();
        displayCtx.save();
        const text = PIXEL_FEATURE_LABELS[key];
        displayCtx.font = "600 12px 'Bricolage Grotesque', system-ui, sans-serif";
        const tw = displayCtx.measureText(text).width;
        const padX = 12, padY = 7;
        const boxW = tw + padX * 2;
        const boxH = 24;
        const boxX = (canvas.width - boxW) / 2;
        const boxY = 14;
        displayCtx.fillStyle = "rgba(20,18,40,0.95)";
        displayCtx.strokeStyle = "rgba(168,168,240,0.55)";
        displayCtx.lineWidth = 1.4;
        displayCtx.beginPath();
        if (displayCtx.roundRect) displayCtx.roundRect(boxX, boxY, boxW, boxH, 5);
        else displayCtx.rect(boxX, boxY, boxW, boxH);
        displayCtx.fill();
        displayCtx.stroke();
        displayCtx.fillStyle = "#ECEAF8";
        displayCtx.textAlign = "center";
        displayCtx.textBaseline = "middle";
        displayCtx.fillText(text, canvas.width / 2, boxY + boxH / 2);
        displayCtx.textAlign = "start";
        displayCtx.textBaseline = "alphabetic";
      }
      displayCtx.restore();
    }
    // Sharp vector overlay pass (rover arrows, action chips). Scale so
    // source coords (0..W, 0..H) map to the DPR backing-store grid.
    if (typeof redrawSharpOverlayRef.current === "function") {
      displayCtx.save();
      displayCtx.scale(canvas.width / W, canvas.height / H);
      try { redrawSharpOverlayRef.current(displayCtx); }
      catch (e) { /* ignore -- non-fatal */ }
      displayCtx.restore();
    }
  }, [p1, p2, craterHealth, hover, selectingFor, claimR, globalDay, mapLoaded, showLayers, activeTurn, p1Done, p2Done, phase, baseMap, activeOverlays, activeVectorOverlays, annotations, annotating, selectedRover, myActor, canControlActor, placingFor, placingType, roverDrag, assetDetail, exploreMode, exploreClick, pulseTick, viewport.zoom, hoveredLegendKey, hazardRev, powerGridState, commsGridState, orbitalDebris, fogActive, fogViewer, viewerSensors, oppHidden]);

  // v27: rAF-coalesced draw scheduling. Multiple state changes in the same
  // tick (e.g. pulseTick + a rover movement + a violation update) used to
  // each fire their own synchronous draw() call inside the dep-list
  // useEffect, causing the full 1212×1212 work-canvas pass to run several
  // times per frame. Now we schedule one draw per animation frame and
  // skip any redundant requests that land in the same frame window.
  const drawRafRef = useRef(0);
  useEffect(() => {
    if (drawRafRef.current) cancelAnimationFrame(drawRafRef.current);
    drawRafRef.current = requestAnimationFrame(() => {
      drawRafRef.current = 0;
      draw();
    });
    return () => {
      if (drawRafRef.current) {
        cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = 0;
      }
    };
  }, [draw]);

  // ── Canvas input ─────────────────────────────────────────────────────────
  // v50: fixed zoom-aware coordinate inversion.
  //
  // Previously getXY used the canvas's own bounding rect, which scales with
  // zoom (the canvas is inside the zoom*100% inner wrapper), so at zoom=2 a
  // click at the center of a feature would be mapped to half the correct
  // source-pixel coordinate -- waypoints landed far from where you clicked.
  //
  // The display transform (from App.jsx ~line 8020) maps source pixel (sx,sy)
  // to container-relative fraction:
  //   fx = leftPct/100 + (sx / W) * zoom
  //   fy = topPct/100  + (sy / H) * zoom
  // where:
  //   leftPct = 50*(1 - zoom) - (panX / W)*100*zoom
  //   topPct  = 50*(1 - zoom) - (panY / H)*100*zoom
  //
  // Inverting for sx:
  //   fx = (e.clientX - containerLeft) / containerW
  //   sx = ((fx - leftPct/100) / zoom) * W
  //      = ((fx - 0.5*(1-zoom) + (panX/W)*zoom) / zoom) * W
  //      = (fx/zoom - 0.5*(1-zoom)/zoom + panX/W) * W
  const getXY = e => {
    const outer = mapContainerRef.current;
    if (!outer) {
      // Fallback (should not happen): raw canvas coords, zoom=1 only.
      const r = canvasRef.current.getBoundingClientRect();
      return { x: Math.round((e.clientX - r.left) * W / r.width),
               y: Math.round((e.clientY - r.top)  * H / r.height) };
    }
    const cr = outer.getBoundingClientRect();
    const zoom  = viewport.zoom  || 1;
    const panX  = viewport.panX  || 0;
    const panY  = viewport.panY  || 0;
    const leftPct = 50 * (1 - zoom) - (panX / W) * 100 * zoom;
    const topPct  = 50 * (1 - zoom) - (panY / H) * 100 * zoom;
    const fx = (e.clientX - cr.left) / cr.width;
    const fy = (e.clientY - cr.top)  / cr.height;
    const sx = Math.round(((fx - leftPct / 100) / zoom) * W);
    const sy = Math.round(((fy - topPct  / 100) / zoom) * H);
    return { x: sx, y: sy };
  };

  const handleClick = e => {
    if (replayRun) return;
    const { x, y } = getXY(e);
    if (x<0||x>=W||y<0||y>=H) return;

    // Explore terrain mode: clicks just open the analysis panel, no placement.
    if (exploreMode) {
      setExploreClick({ x, y });
      return;
    }

    // In multiplayer, route map clicks through the host if I'm a peer.
    if (mp && !isHost) {
      if (annotating) {
        dispatchAction("annotate", { x, y, note: annotNote });
        setAnnotNote("");
        return;
      }
      let targetActor = null;
      // v156: in concurrent setup a peer places their OWN actor's base, so the
      // permission check must use their actor, not a phase-fixed one.
      if (phase===PHASE.SETUP1 || phase===PHASE.SETUP2) targetActor = (myActor===0||myActor===1) ? myActor : 0;
      else if (placingFor !== null) targetActor = placingFor;
      else if (selectingFor !== null) targetActor = selectingFor;
      if (targetActor !== null && !canControlActor(targetActor)) return;
      dispatchAction("mapClick", { x, y, shiftKey: !!e.shiftKey });
      return;
    }

    handleClickAt(x, y, e);
  };

  const handleClickAt = (x, y, e, forActor = null) => {
    if (replayRun) return;
    if (x<0||x>=W||y<0||y>=H) return;

    // Annotation mode: place a pin
    if (annotating) {
      const label = annotNote.trim() || `Pin ${annotations.length + 1}`;
      const colors = ["#E8C998","#C0B8E8","#9BD4B5","#ff6644","#80B0D8"];
      setAnnotations(prev => [...prev, { x, y, label, color: colors[prev.length % colors.length], ts: Date.now() }]);
      setAnnotNote("");
      return;
    }

    if (phase===PHASE.SETUP1) {
      // v191: staggered first-mover arrival (any first-mover preset with a
      // facilitator-set delay > 0), only actor 0 sets up here, then we go
      // straight to PLAYING; actor 1 is deployed later as a late arrival.
      const staggeredArrival = (scenarioPreset === "unevenArrival" || scenarioPreset === "sprint") && arrivalDelay > 0;
      if (staggeredArrival) {
        if (p1 || forActor === 1) return; // base already down, or this is the late actor
        recordUndoCheckpoint();
        const s = snapToPSR(x,y);
        setP1({ ...seedForScenario(makePlayer(s,1,PLAYER1_COLOR, { stakeholderId: actorRoles[0] }), s), foundingSeq: nextSeq() });
        appendMissionLog({ type:"setup", actor:1, label:`${actorLabel(0)} placed base at (${s.x}, ${s.y}), first mover` });
        setPhase(PHASE.PLAYING); setActiveTurn(0); setP1Done(false); setP2Done(false);
        return;
      }
      // v156: CONCURRENT base placement -- both actors place their own base at
      // the same time. Which actor this click is for:
      //   - explicit forActor (a peer's click, routed by their seat) wins
      //   - else the local user's own actor (multiplayer)
      //   - else solo / facilitator-local: the next unplaced base
      let actorToPlace = (forActor === 0 || forActor === 1) ? forActor
                       : (mp && (myActor === 0 || myActor === 1)) ? myActor
                       : (!p1 ? 0 : !p2 ? 1 : null);
      if (actorToPlace === null) return;
      if (actorToPlace === 0 && p1) return; // that actor's base is already down
      if (actorToPlace === 1 && p2) return;
      recordUndoCheckpoint();
      const s = snapToPSR(x,y);
      if (actorToPlace === 0) {
        setP1({ ...seedForScenario(makePlayer(s,1,PLAYER1_COLOR, { stakeholderId: actorRoles[0] }), s), foundingSeq: nextSeq() });
        appendMissionLog({ type:"setup", actor:1, label:`${actorLabel(0)} placed base at (${s.x}, ${s.y})` });
      } else {
        setP2({ ...seedForScenario(makePlayer(s,2,PLAYER2_COLOR, { arrivalDay: 0, stakeholderId: actorRoles[1] }), s), foundingSeq: nextSeq() });
        appendMissionLog({ type:"setup", actor:2, label:`${actorLabel(1)} placed base at (${s.x}, ${s.y})` });
      }
      // Advancing to PLAYING is handled by a dedicated effect once BOTH bases
      // exist -- robust to both actors placing in the same tick (a stale inline
      // read of p1/p2 could otherwise leave the game stuck in setup).
      return;
    } else if (phase===PHASE.SETUP2) {
      recordUndoCheckpoint();
      const s = snapToPSR(x,y);
      setP2({ ...seedForScenario(makePlayer(s,2,PLAYER2_COLOR, {
        arrivalDay: ((scenarioPreset === "unevenArrival" || scenarioPreset === "sprint") && arrivalDelay > 0) ? globalDay : 0,
        stakeholderId: actorRoles[1],
      }), s), foundingSeq: nextSeq() });
      appendMissionLog({ type:"setup", actor:2, label:`${actorLabel(1)} placed base at (${s.x}, ${s.y})` });
      setPhase(PHASE.PLAYING);
      setActiveTurn(0); setP1Done(false); setP2Done(false);
      // v27: removed dead branches for SETUP1_HAB / SETUP1_SOL / SETUP1_PAD
      // / SETUP2_HAB / SETUP2_SOL / SETUP2_PAD. These phase constants are
      // defined in src/sim/constants.js but never SET by any code path --
      // the setup flow is just SETUP1 → SETUP2 → PLAYING (one click each).
      // The old branches were comments-as-tombstones from a previous design
      // iteration where setup was a multi-step wizard. Several sites still
      // check for these in `phase===` expressions (peer-action routing,
      // help-banner messages); those are harmless and can stay until a
      // future pass cleans them up alongside the unused PHASE constants.
    } else if (placingFor !== null && placingType) {
      // v27: gate on the placer's done flag. The placement palette UI is
      // disabled when the player is done, but `placingFor` can survive if
      // the user started a placement, ended turn, and then clicked the
      // map. Same rationale as commitAimDirection / buildStructure.
      const pi = placingFor;
      if (pi === 0 ? p1Done : p2Done) {
        setPlacingFor(null);
        setPlacingType(null);
        return;
      }
      recordUndoCheckpoint();
      const setFn = pi===0 ? setP1 : setP2;
      const type = placingType;
      // v123 (item 5): compute cost + score contribution up front so the
      // mission-log entry can state WHY the score moved (asset points score at
      // SCORE_PTS_PER_AP each), making the budget->score link explicit.
      const placingPlayer = pi === 0 ? p1 : p2;
      const _alloc = placingPlayer?.alloc || ALLOC_PRESETS[DEFAULT_PRESET_KEY].alloc;
      const _placeCost = (calcAssetCosts(_alloc, placingPlayer?.stakeholderId, { padCount: functionalPadCount(placingPlayer) }).costs[type]) ?? 0;
      const _placePts = ASSET_POINTS[type] ?? 0;
      const _placeScore = _placePts * SCORE_PTS_PER_AP;
      // v164: building a pad earns a one-time soft-power / geopolitical bump for
      // dust-mitigation stewardship, on top of its asset points.
      const _placeGeo = type === "pad" ? PAD_GEO_BONUS : 0;
      setFn(p => {
        if (!p) return p;
        const { costs } = calcAssetCosts(p.alloc || ALLOC_PRESETS[DEFAULT_PRESET_KEY].alloc, p?.stakeholderId, { padCount: functionalPadCount(p) });
        const cost = costs[type] ?? 999;
        if ((p.budget ?? 0) < cost) return p;
        const pts = ASSET_POINTS[type] ?? 0;
        const sh = { ...(p.structureHealth || {}) };
        const at = { x, y, seq: nextSeq() }; // v160: placement order for violation attribution
        if (type === "solar") {
          const onRidge = RIDGE_MASK[y * W + x] === 1;
          return { ...p, budget: (p.budget??0)-cost, assetPts: (p.assetPts??0)+pts,
                   panels: [...p.panels, { x, y, onRidge, seq: at.seq }],
                   structureHealth: { ...sh, panels: [...(sh.panels||[]), 1.0] } };
        } else if (type === "reactor") {
          return { ...p, budget: (p.budget??0)-cost, assetPts: (p.assetPts??0)+pts,
                   reactors: [...(p.reactors||[]), at],
                   structureHealth: { ...sh, reactors: [...(sh.reactors||[]), 1.0] } };
        } else if (type === "habitat") {
          return { ...p, budget: (p.budget??0)-cost, assetPts: (p.assetPts??0)+pts,
                   habitats: [...(p.habitats||[]), at],
                   habitatPower: [...(p.habitatPower||[]), HABITAT_POWER_INIT],
                   structureHealth: { ...sh, habitats: [...(sh.habitats||[]), 1.0] } };
        } else if (type === "pad") {
          return { ...p, budget: (p.budget??0)-cost, assetPts: (p.assetPts??0)+pts,
                   scoreAdjustments: (p.scoreAdjustments??0) + PAD_GEO_BONUS,
                   landingPads: [...(p.landingPads||[]), at],
                   structureHealth: { ...sh, landingPads: [...(sh.landingPads||[]), 1.0] } };
        } else if (type === "comsat") {
          // v22: comsat relay smallsat -- extends DTE coverage in a radius
          return { ...p, budget: (p.budget??0)-cost, assetPts: (p.assetPts??0)+pts,
                   comsats: [...(p.comsats||[]), at],
                   structureHealth: { ...sh, comsats: [...(sh.comsats||[]), 1.0] } };
        }
        return p;
      });
      if (type === "reactor") {
        // Reactor placement is intentionally non-damaging -- see onReactorPlacement.
        const enemyP = pi === 0 ? p2 : p1;
        setFn(prev => onReactorPlacement(prev, enemyP, x, y));
      } else if (type === "comsat") {
        // v27: comsats are smallsat relays deployed from orbit, not landed.
        // The placement position is a ground-projection coordinate, not a
        // physical landing site, so they shouldn't damage enemy structures
        // whose safety zone includes that point. Previously this path
        // applied landingImpact for everything-except-reactors and gave
        // players a free attack-via-comsat-deployment exploit: drop a
        // comsat on top of an enemy habitat → habitat takes damage.
      } else {
        landingImpact(pi, x, y);
      }
      appendMissionLog({ type:"placement", actor:pi + 1, itemType:type, x, y, cost:_placeCost, score:_placeScore, pts:_placePts, geo:_placeGeo || 0, label:`P${pi+1} placed ${structureLabel(type)} at (${x}, ${y}) · spent ${_placeCost} budget · +${_placeScore} score (+${_placePts} asset pts)${_placeGeo ? ` · +${_placeGeo} geopolitical (dust mitigation)` : ""}` });
      // v21: camera punch-in on placement
      setFocusPulse({ x, y, until: Date.now() + 1300 });
      setPlacingFor(null);
      setPlacingType(null);
    } else if (selectingFor !== null) {
      // v27: gate on the issuing player's done flag. Without this, a
      // player who ended their turn could still click on the map and
      // modify their rover's waypoints in the brief window before both
      // players commit and the day resolves. The Set-waypoint button is
      // already gated by `disabled={isDone}`, but selectingFor can still
      // be set when the player ended turn after starting waypoint mode,
      // so this is the canonical gate.
      const issuingDone = (selectingFor === 0 ? p1Done : p2Done);
      if (issuingDone) {
        setSelectingFor(null);
        return;
      }
      recordUndoCheckpoint();
      // v21: comms blackout -- if the rover being commanded is currently in
      // a DTE blackout window (sampled from LRO/LOLA earth_visibility),
      // the waypoint carries a `pendingSince` stamp and won't be consumed
      // by the rover until the next day tick. Matches the real-world
      // round-trip-relay constraint without hard-bricking the rover.
      const issuingP = selectingFor === 0 ? p1 : p2;
      const otherP   = selectingFor === 0 ? p2 : p1;
      const rIdx = selectedRover[selectingFor];
      const issuingRover = rIdx === 0 ? issuingP : (issuingP?.extraRovers || [])[rIdx - 1];
      const rx = issuingRover?.x ?? issuingP?.x ?? 0;
      const ry = issuingRover?.y ?? issuingP?.y ?? 0;
      // v106: a shared comms grid pools relay coverage. When comms are shared,
      // the issuing actor's DTE visibility also benefits from the counterpart's
      // comsats, so a rover in a blackout window may stay in contact via the
      // partner's relays. This is what makes sharing the comms grid actually
      // matter in the sim, not just on the scoreboard.
      const commsShared = commsGridState.mode === "shared";
      const relayComsats = pooledComsats(issuingP?.comsats, otherP?.comsats, commsShared);
      const blackout = isInCommsBlackoutFor(rx, ry, relayComsats);

      // v21: rovers auto-stay out of enemy safety violations. If the
      // user-clicked waypoint falls inside any enemy zone, snap it to a
      // point on the zone's perimeter (1.10× radius outward, in the
      // direction from the zone center toward the click). The rover then
      // routes to the perimeter instead of stepping into a violation.
      // Sized to match the buffer used by the existing auto-targeting
      // (3768) so manual and auto behavior stay consistent.
      let wpX = x, wpY = y, snappedOut = false;
      const foe = selectingFor === 0 ? p2 : p1;
      if (foe) {
        // v27: was a third inline copy of buildEnemyZones. Now uses the
        // extracted helper from src/sim/enemyZones.js. Same semantics
        // (1.10× safety-radius buffer, skip destroyed structures).
        const zones = buildEnemyZones(foe);
        // Find the zone (if any) that contains the click
        const containing = pointInAnyZone(zones, x, y);
        if (containing) {
          // Push out to the perimeter in the click's direction; if click is
          // at the center exactly, push in the direction from rover→zone.
          let dx = x - containing.x, dy = y - containing.y;
          let d = Math.sqrt(dx * dx + dy * dy);
          if (d < 1) {
            dx = containing.x - rx; dy = containing.y - ry;
            d = Math.sqrt(dx * dx + dy * dy) || 1;
            dx = -dx; dy = -dy;
          }
          const perim = containing.r * 1.05;
          wpX = Math.round(containing.x + (dx / d) * perim);
          wpY = Math.round(containing.y + (dy / d) * perim);
          snappedOut = true;
        }
      }

      const wp = blackout ? { x: wpX, y: wpY, pendingSince: globalDay } : { x: wpX, y: wpY };
      const setFn = selectingFor===0 ? setP1 : setP2;
      setFn(p => {
        if (!p) return p;
        if (rIdx === 0) {
          // Primary rover
          return { ...p, waypoints: addingWaypoint?[...(p.waypoints||[]),wp]:[wp], currentWaypoint: null };
        } else {
          // Extra rover
          const erIdx = rIdx - 1;
          const newER = [...(p.extraRovers||[])];
          if (!newER[erIdx]) return p;
          newER[erIdx] = { ...newER[erIdx], waypoints: addingWaypoint?[...(newER[erIdx].waypoints||[]),wp]:[wp], currentWaypoint: null };
          return { ...p, extraRovers: newER };
        }
      });
      const noteParts = [];
      if (snappedOut) noteParts.push("🚧 Redirected to perimeter: waypoint would breach enemy safety zone");
      if (blackout) noteParts.push("📡 comms blackout, delayed 1 day");
      const note = noteParts.length ? ` (${noteParts.join("; ")})` : "";
      appendMissionLog({
        type:"waypoint",
        actor: selectingFor + 1,
        rover: rIdx + 1,
        label: `P${selectingFor+1} set ${addingWaypoint ? "an additional" : "a"} waypoint for R${rIdx + 1} to (${wpX}, ${wpY})${note}`,
      });
      if (!addingWaypoint) setSelectingFor(null);
    }
    // Clicks on empty map outside of an active placement / annotation /
    // setup / explicit selecting mode are ignored. Rover routing is done by
    // dragging from the rover (handled in handleMouseDown/Up).
  };

  const handleRightClick = e => {
    if (replayRun) return;
    e.preventDefault();
    const { x, y } = getXY(e);
    if (selectingFor !== null) {
      recordUndoCheckpoint();
      const wp = { x, y };
      const rIdx2 = selectedRover[selectingFor];
      const setFn2 = selectingFor===0 ? setP1 : setP2;
      setFn2(p => {
        if (!p) return p;
        if (rIdx2 === 0) return { ...p, waypoints:[...(p.waypoints||[]),wp] };
        const erIdx2 = rIdx2 - 1;
        const newER2 = [...(p.extraRovers||[])];
        if (!newER2[erIdx2]) return p;
        newER2[erIdx2] = { ...newER2[erIdx2], waypoints:[...(newER2[erIdx2].waypoints||[]),wp] };
        return { ...p, extraRovers: newER2 };
      });
      appendMissionLog({
        type:"waypoint",
        actor: selectingFor + 1,
        rover: rIdx2 + 1,
        label:`P${selectingFor+1} queued an additional waypoint for R${rIdx2 + 1} to (${x}, ${y})`,
      });
    }
  };

  const handleMouseMove = e => {
    const { x, y } = getXY(e);
    // v27: skip the setHover call when the pixel position didn't change
    // (e.g. sub-pixel mouse movement, or cursor briefly leaving and
    // returning to the same source pixel). Without this, every mousemove
    // creates a new {x, y} object and triggers a re-render of the canvas
    // draw effect, even though the work-canvas pass produces the same
    // output. With this, mousemove updates only the canvas when the
    // source pixel actually changed.
    setHover(prev => {
      const inBounds = x>=0 && x<W && y>=0 && y<H;
      if (!inBounds) return prev === null ? prev : null;
      if (prev && prev.x === x && prev.y === y) return prev;
      return { x, y };
    });
    if (roverDrag) {
      // Compute the new angle from rover center to cursor.
      const dx = x - roverDrag.fromX;
      const dy = y - roverDrag.fromY;
      // Below a threshold we keep the prior angle (avoids snapping wildly
      // when the cursor crosses the rover center).
      // v51: deadzone scales with 1/zoom so it stays a constant on-screen
      // size. 10 source-px at zoom 1 = 10 CSS-px on-screen.
      const zk = Math.max(1, viewport.zoom || 1);
      const dead = 10 / zk;
      if (dx * dx + dy * dy > dead * dead) {
        const newAngle = Math.atan2(dy, dx);
        setRoverDrag(prev => prev ? { ...prev, angle: newAngle } : null);
      }
    }
  };

  // ── Asset hit-test ───────────────────────────────────────────────────────
  // Returns { pi, kind, idx, x, y } of the closest asset within hitRadius (in
  // source pixels), or null. Kinds: rover, pad, habitat, solar, reactor.
  const assetAt = useCallback((x, y, hitRadius = 35) => {
    let best = null, bestDSq = hitRadius * hitRadius;
    const consider = (pi, kind, idx, ax, ay) => {
      const dx = ax - x, dy = ay - y;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDSq) { bestDSq = dSq; best = { pi, kind, idx, x: ax, y: ay }; }
    };
    for (const pi of [0, 1]) {
      const p = pi === 0 ? p1 : p2;
      if (!p || p.active === false) continue;
      consider(pi, "rover", 0, p.x, p.y);
      (p.extraRovers || []).forEach((r, i) => consider(pi, "rover", i + 1, r.x, r.y));
      if (p.landingPad) consider(pi, "pad", 0, p.landingPad.x, p.landingPad.y);
      (p.landingPads || []).forEach((pd, i) => consider(pi, "pad", i, pd.x, pd.y));
      // v27: removed reference to nonexistent `p.extraPads` field. There's
      // only `landingPads` (modern, indexed) and the legacy `landingPad`
      // singleton. `extraPads` was a third reference that never got set
      // anywhere -- dead code surviving a long-ago refactor.
      if (p.habitat) consider(pi, "habitat", 0, p.habitat.x, p.habitat.y);
      (p.habitats || []).forEach((h, i) => consider(pi, "habitat", i, h.x, h.y));
      (p.panels || []).forEach((s, i) => consider(pi, "solar", i, s.x, s.y));
      (p.reactors || []).forEach((r, i) => consider(pi, "reactor", i, r.x, r.y));
    }
    return best;
  }, [p1, p2]);

  // ── Auto-targeting helper ────────────────────────────────────────────────
  // The rover-route picker lives in src/sim/autoTarget.js as a pure
  // function. Imported above. See the module docstring for the priority
  // rules and the hysteresis explanation.


  // Compute the current arrowhead position for an actor's selected rover.
  // The arrow shows the rover's effective direction: either the user-set
  // aimDirection, or the auto-target direction if no aim is set.
  // Returns the arrowhead anchor for grab-detection / drawing.
  //
  // v51: zoom-aware arrowhead position. The visible arrow in drawRoverArrows
  // is drawn at length `ARROW_LEN * (1/zk)` source-pixels (where `zk =
  // max(1, zoom)`), so the displayed arrow stays a constant size on screen
  // for zoom >= 1. The grab hit-test must use the SAME length, otherwise the
  // click target sits at the wrong place: at zoom 2, the visible arrowhead
  // is at rover+55 source-px but unscaled getArrowheadFor returned
  // rover+110 source-px -- the user clicks the visible arrow and misses.
  const ARROW_LEN = 110; // base source-pixel length at zoom <= 1
  const getArrowheadFor = useCallback((pi) => {
    if (pi !== 0 && pi !== 1) return null;
    const ap = pi === 0 ? p1 : p2;
    if (!ap) return null;
    const rIdx = selectedRover[pi] || 0;
    const rover = rIdx === 0 ? ap : (ap.extraRovers || [])[rIdx - 1];
    if (!rover) return null;
    let angle = rover.aimDirection;
    let auto = false;
    if (angle == null) {
      // Compute auto-target direction
      const t = pickRoverTarget(rover, ap, craterHealth);
      if (t) {
        angle = Math.atan2(t.y - rover.y, t.x - rover.x);
        auto = true;
      } else {
        angle = 0; // east by default if no target found
        auto = true;
      }
    }
    const zk = Math.max(1, viewport.zoom || 1);
    const arrLen = ARROW_LEN / zk;
    const bx = rover.x + Math.cos(angle) * arrLen;
    const by = rover.y + Math.sin(angle) * arrLen;
    return { rIdx, bx, by, fromX: rover.x, fromY: rover.y, angle, auto };
  }, [p1, p2, selectedRover, craterHealth, viewport.zoom]);

  const handleMouseDown = e => {
    if (replayRun) return;
    if (phase !== PHASE.PLAYING) return;
    const { x, y } = getXY(e);
    // First check if the user is grabbing an arrowhead (large hit radius)
    const activeActors = mp
      ? (myActor === 0 || myActor === 1 ? [myActor] : [])
      : [activeTurn];
    for (const pi of activeActors) {
      if (!canControlActor(pi)) continue;
      const isDoneNow = (pi === 0 && p1Done) || (pi === 1 && p2Done);
      if (isDoneNow) continue;
      const arr = getArrowheadFor(pi);
      if (!arr) continue;
      const dx = x - arr.bx, dy = y - arr.by;
      // v51: hit radius scales with 1/zoom so it stays constant on screen.
      // 50 source-px at zoom 1 = 50 CSS-px on screen. At zoom 2, the visible
      // grab ring is half the source-px size (counter-scaled in draw), so
      // we shrink the hit radius proportionally -- otherwise the hit area
      // sprawls way beyond the visible target at high zoom.
      const zk = Math.max(1, viewport.zoom || 1);
      const hitR = 50 / zk;
      if (dx * dx + dy * dy < hitR * hitR) {
        // Grabbed the arrowhead -- start drag-to-aim
        e.preventDefault();
        const newAngle = Math.atan2(y - arr.fromY, x - arr.fromX);
        setRoverDrag({
          roverPi: pi,
          rIdx: arr.rIdx,
          fromX: arr.fromX, fromY: arr.fromY,
          angle: newAngle,
        });
        return;
      }
    }
    // Otherwise check if user clicked on an asset (any asset, including
    // opponent's) -- opens the detail panel
    const hit = assetAt(x, y, 35);
    if (hit) {
      // If it's a rover the user controls, select it as the active rover
      if (hit.kind === "rover" && canControlActor(hit.pi)) {
        setSelectedRover(prev => { const n = [...prev]; n[hit.pi] = hit.idx; return n; });
      }
      setAssetDetail(hit);
    }
  };

  const handleMouseUp = e => {
    if (!roverDrag) return;
    const { x, y } = getXY(e);
    const dx = x - roverDrag.fromX, dy = y - roverDrag.fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // v51: cancel-distance scales with 1/zoom so it stays a constant on-
    // screen radius. 20 source-px at zoom 1 = 20 CSS-px on-screen.
    const zk = Math.max(1, viewport.zoom || 1);
    const cancelR = 20 / zk;
    if (dist < cancelR) {
      // Cancel: too close to the rover to determine an angle
      setRoverDrag(null);
      return;
    }
    const newAngle = Math.atan2(dy, dx);
    const pi = roverDrag.roverPi;
    const rIdx = roverDrag.rIdx;
    if (mp && !isHost) {
      dispatchAction("setAimDirection", { pi, rIdx, angle: newAngle });
    } else {
      commitAimDirection(pi, rIdx, newAngle);
    }
    setRoverDrag(null);
  };

  // Commit an aimDirection to the host's state. Replaces the older
  // commitWaypoint -- waypoints are now derived dynamically each step.
  const commitAimDirection = (pi, rIdx, angle) => {
    // v27: defense-in-depth replayRun guard. The drag-start handler at 2452
    // already gates this path, but peer actions can also reach here through
    // the setAimDirection peer handler -- and `replayRun` should freeze all
    // state mutations end-to-end.
    if (replayRun) return;
    // v27: also gate on the issuing player's done flag. The rover arrow
    // grab-handler renders for all rovers (visual indicator); if a player
    // has ended turn but the day hasn't resolved yet, they could still
    // drag-aim and mutate state. The arrow rendering is also gated on
    // canControlActor, but in solo mode all actors are controllable. So
    // this is the canonical gate.
    if (pi === 0 ? p1Done : p2Done) return;
    recordUndoCheckpoint();
    const setFn = pi === 0 ? setP1 : setP2;
    setFn(p => {
      if (!p) return p;
      if (rIdx === 0) {
        return { ...p, aimDirection: angle, waypoints: [], currentWaypoint: null };
      } else {
        const erIdx = rIdx - 1;
        const newER = [...(p.extraRovers || [])];
        if (!newER[erIdx]) return p;
        newER[erIdx] = { ...newER[erIdx], aimDirection: angle, waypoints: [], currentWaypoint: null };
        return { ...p, extraRovers: newER };
      }
    });
    const degrees = ((angle * 180 / Math.PI) + 360) % 360;
    appendMissionLog({
      type: "aim", actor: pi + 1, rover: rIdx + 1,
      label: `P${pi+1} aimed R${rIdx+1} at ${degrees.toFixed(0)}°`,
    });
  };

  // Legacy commitWaypoint shim -- used by multiplayer setWaypoint handler.
  // Convert an (x,y) target into an aimDirection from the rover's current
  // position. This keeps older clients compatible without re-introducing
  // user-set waypoints.
  const commitWaypoint = (pi, rIdx, x, y) => {
    const ap = pi === 0 ? p1 : p2;
    if (!ap) return;
    const rover = rIdx === 0 ? ap : (ap.extraRovers || [])[rIdx - 1];
    if (!rover) return;
    const angle = Math.atan2(y - rover.y, x - rover.x);
    commitAimDirection(pi, rIdx, angle);
  };

  // ── Auto-targeting helper ────────────────────────────────────────────────
  // ── Core: advance one day for a single player ────────────────────────────
  // Returns [newPlayerState, newCraterHealth, events]
  function stepPlayer(s, ch, gDay, opponent = null, stepMul = 1, poOverride = null) {
    const newHealth = new Float32Array(ch);
    // v27: derive `po` from physOverrides. If the facilitator dragged the
    // ICE_MASS_FRACTION slider but not BASE_MINE_RATE, scale BASE_MINE_RATE
    // by the ratio so the slider is no longer a no-op (was a latent bug:
    // the slider rendered, the user could move it, but the sim never read
    // ICE_MASS_FRACTION at runtime).
    // v205: headless callers (the Monte Carlo sweep) pass their per-config
    // overrides explicitly so batch physics no longer silently reads the
    // live UI slider state.
    let po = poOverride ?? physOverrides;
    if (po.ICE_MASS_FRACTION != null && po.BASE_MINE_RATE == null) {
      const scaled = BASE_MINE_RATE * (po.ICE_MASS_FRACTION / ICE_MASS_FRACTION);
      po = { ...po, BASE_MINE_RATE: scaled };
    }
    // v160: a longer facilitator round lets rovers cover more ground per day.
    // `stepMul` scales the per-day rover step (passed >1 only from the live
    // resolution path; the headless Monte Carlo always passes 1). The per-day
    // power cost is unchanged because moveCost is computed as distMoved/ROVER_STEP
    //, both numerator and denominator scale together, so a long round means
    // "more operational range on the same daily power budget," not free energy.
    if (stepMul && stepMul !== 1) {
      const baseStep = po.ROVER_STEP ?? ROVER_STEP;
      po = { ...po, ROVER_STEP: baseStep * stepMul };
    }
    // Build a list of opponent safety zones the rover should avoid. The
    // helper lives in src/sim/enemyZones.js. Each zone has a center and a
    // buffer radius (10% larger than the strict safety radius) so we don't
    // hover right on the edge and trigger violations from jitter.
    const enemyZones = buildEnemyZones(opponent);
    const inEnemyZone = (px, py) => pointInAnyZone(enemyZones, px, py);

    // Inject a synthetic waypoint based on aim / auto-targeting before
    // running the simulation. The physics code already knows how to chase
    // waypoints; we just feed it the right target each step.
    const injectAutoTarget = (rover) => {
      // First: if currently INSIDE an enemy zone, exit it. This is the
      // highest priority -- a rover sitting in a violation needs to get
      // out before doing anything else.
      const insideZone = inEnemyZone(rover.x, rover.y);
      if (insideZone) {
        // Pick a point on the zone perimeter, in the direction AWAY from
        // the zone center.
        const dx = rover.x - insideZone.x;
        const dy = rover.y - insideZone.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0) {
          const escape = insideZone.r * 1.15;
          const ex = insideZone.x + (dx / d) * escape;
          const ey = insideZone.y + (dy / d) * escape;
          return { ...rover, waypoints: [{ x: Math.round(ex), y: Math.round(ey), _auto: true, _escape: true }], currentWaypoint: null };
        }
      }
      // CRITICAL: low-power recharge override happens FIRST, regardless of
      // existing waypoints or aim direction. A rover dying of power loss
      // should abandon its current task and head home. Without this short-
      // circuit the rover follows its aim into the void and strands itself.
      //
      // Hysteresis state machine:
      //   power < LOW (40% of cap, =48) ........ enter recharge mode
      //   power < HIGH (85% of cap, =102) ...... stay in recharge mode
      //   power >= HIGH ......................... exit recharge mode
      // The _recharging flag persists between simDay calls via the rover's
      // returned state, so the threshold is asymmetric and we don't bounce.
      const wasRecharging = !!rover._recharging;
      // v206: the enter/stay decision now uses the shared dynamic trigger
      // (hysteresis floor + estimated loaded cost home + reserve) instead of
      // the flat 40% line, the flat line was the stranding trap: a rover
      // deep in a PSR hit 40% with a trip home that cost more than 40%.
      const isRecharging = shouldRecharge(rover, s, { night: isNight(gDay), globalDay: gDay });
      if (isRecharging) {
        const target = pickRoverTarget({ ...rover, _recharging: true }, s, newHealth, { night: isNight(gDay), globalDay: gDay });
        if (target && target.reason === "recharge") {
          return { ...rover, _recharging: true, waypoints: [{ x: target.x, y: target.y, _auto: true, _recharge: true }], currentWaypoint: null };
        }
      } else if (wasRecharging) {
        // Crossed the high threshold this step -- exit recharge mode and
        // let the normal auto-seek logic pick a PSR target below.
        rover = { ...rover, _recharging: false };
      }
      // Otherwise: respect USER-set waypoints (without _auto flag), but
      // ALWAYS recompute auto-targets each step. This lets the rover
      // dynamically change direction mid-round as it gets closer to PSRs
      // or as the user adjusts the aim direction.
      const userWaypoints = (rover.waypoints || []).filter(w => !w._auto);
      if (userWaypoints.length > 0 || (rover.currentWaypoint && !rover.currentWaypoint._auto)) {
        return rover;
      }
      const target = pickRoverTarget(rover, s, newHealth, { night: isNight(gDay), globalDay: gDay });
      if (!target) return rover;
      // If the auto-target is in an enemy zone, route around it. Simple
      // tangent dodge: pick a point on the zone perimeter that's between
      // the rover and the target.
      const targetInZone = inEnemyZone(target.x, target.y);
      if (targetInZone) {
        // Aim at the zone perimeter on the rover's side instead
        const dx = rover.x - targetInZone.x;
        const dy = rover.y - targetInZone.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0) {
          const perim = targetInZone.r * 1.15;
          const px = targetInZone.x + (dx / d) * perim;
          const py = targetInZone.y + (dy / d) * perim;
          return { ...rover, waypoints: [{ x: Math.round(px), y: Math.round(py), _auto: true, _dodge: true }], currentWaypoint: null };
        }
      }
      return { ...rover, waypoints: [{ x: target.x, y: target.y, _auto: true }], currentWaypoint: null };
    };

    const sWithAuto = injectAutoTarget(s);
    // Apply same logic to extra rovers
    const extraWithAuto = (s.extraRovers || []).map(er => injectAutoTarget(er));
    const sForSim = { ...sWithAuto, extraRovers: extraWithAuto };

    // Simulate primary rover
    const result = simDay(
      { ...sForSim, waypoints:[...(sForSim.waypoints||[])], mineMap:{...sForSim.mineMap} },
      newHealth, gDay, po
    );
    result.events = (result.events || []).map(ev => ({ ...ev, roverId: 1 }));

    // Simulate each extra rover independently, sharing the same habitat/structure state
    // v27: chain mineMaps. Previously each extra rover started with the
    // primary's post-step mineMap and produced its own mineMap that was
    // discarded -- pixels mined by extras vanished from per-pixel tracking
    // on the next turn. Crater health was correct (it's tracked globally),
    // but rovers would briefly re-attempt depleted pixels before hopping.
    // Now: extras receive the running mineMap (so the second extra sees
    // the first extra's depletions within the same day), and the final
    // mineMap is the last-extra's output, which contains all prior
    // mining for the turn.
    let runningMineMap = result.mineMap;
    // v27: similarly chain pendingDeliveries through extras. Without
    // chaining, each extra saw the original pre-step list and two extras
    // both within ROVER_REACH of the same pad could pick up the SAME
    // pending delivery -- double-spending the item. Now each extra sees
    // the prior extra's post-step list, so each delivery is claimed once.
    let runningPending = result.pendingDeliveries;
    const newExtraRovers = extraWithAuto.map((er, erIdx) => {
      const erState = {
        ...sForSim,
        x: er.x, y: er.y,
        ice: er.ice ?? 0,
        carrying: er.carrying ?? null,
        waypoints: [...(er.waypoints || [])],
        currentWaypoint: er.currentWaypoint ?? null,
        power: er.power ?? POWER_CAP,
        mineMap: runningMineMap,
        pendingDeliveries: runningPending,
        aimDirection: er.aimDirection ?? null,
      };
      const erResult = simDay(erState, newHealth, gDay, po);
      erResult.events = (erResult.events || []).map(ev => ({ ...ev, roverId: erIdx + 2 }));
      // Advance the running maps so the next extra sees this one's effects.
      runningMineMap = erResult.mineMap;
      runningPending = erResult.pendingDeliveries;
      return {
        x: erResult.x, y: erResult.y,
        ice: erResult.ice,
        carrying: erResult.carrying,
        waypoints: erResult.waypoints,
        currentWaypoint: erResult.currentWaypoint,
        status: erResult.status,
        events: erResult.events,
        power: erResult.power,         // write the drained value back
        // carry forward panels/habitats/pads placed by this rover
        _panels: erResult.panels,
        _reactors: erResult.reactors,
        _habitats: erResult.habitats,
        _habitatPower: erResult.habitatPower,
        _landingPads: erResult.landingPads,
        _structureHealth: erResult.structureHealth,
        _pendingDeliveries: erResult.pendingDeliveries,
      };
    });

    // Merge extra rover results: collect all deposits, placed structures.
    // v27: also forward the final runningMineMap so the next day starts
    // with every pixel mined this turn properly accounted for. And the
    // final runningPending so deliveries claimed by ANY rover are removed.
    let mergedResult = {
      ...result,
      mineMap: runningMineMap,
      pendingDeliveries: runningPending,
    };
    let totalDep = 0;
    for (const ev of result.events) if (ev.type==="deposit") totalDep+=ev.kg;

    const allEvents = [...result.events];
    for (const er of newExtraRovers) {
      for (const ev of (er.events||[])) {
        if (ev.type==="deposit") totalDep+=ev.kg;
        allEvents.push(ev);
      }
      // Merge any structures placed by extra rover
      if (er._panels && er._panels.length > mergedResult.panels.length) {
        mergedResult = { ...mergedResult, panels: er._panels,
          structureHealth: { ...mergedResult.structureHealth, panels: er._structureHealth.panels } };
      }
      if (er._reactors && er._reactors.length > (mergedResult.reactors||[]).length) {
        mergedResult = { ...mergedResult, reactors: er._reactors,
          structureHealth: { ...mergedResult.structureHealth, reactors: er._structureHealth.reactors } };
      }
      if (er._habitats && er._habitats.length > mergedResult.habitats.length) {
        mergedResult = { ...mergedResult, habitats: er._habitats,
          habitatPower: er._habitatPower,
          structureHealth: { ...mergedResult.structureHealth, habitats: er._structureHealth.habitats } };
      }
      if (er._landingPads && er._landingPads.length > (mergedResult.landingPads||[]).length) {
        mergedResult = { ...mergedResult, landingPads: er._landingPads,
          structureHealth: { ...mergedResult.structureHealth, landingPads: er._structureHealth.landingPads } };
      }
      // v27: pendingDeliveries merge is now handled by chaining
      // runningPending through each extra rover's simDay call above.
      // The old per-extra diff loop here was incorrect once chaining was
      // introduced (it compared against s.pendingDeliveries, which is the
      // pre-step list, but er._pendingDeliveries is now derived from the
      // chained list). The chained final runningPending is already written
      // to mergedResult.pendingDeliveries.
    }

    // Strip internal merge fields from extraRovers
    const cleanExtraRovers = newExtraRovers.map(({ _panels, _reactors, _habitats, _habitatPower, _landingPads, _structureHealth, _pendingDeliveries, events: _ev, ...clean }) => clean);

    // Strip any auto-injected waypoints / currentWaypoint so they don't
    // persist between turns. The user's aimDirection stays; auto-targets
    // get re-derived freshly on the next step.
    const stripAutoWp = (rover) => {
      if (!rover) return rover;
      const wps = (rover.waypoints || []).filter(w => !w?._auto);
      const cw = rover.currentWaypoint && rover.currentWaypoint._auto ? null : rover.currentWaypoint;
      return { ...rover, waypoints: wps, currentWaypoint: cw };
    };
    const cleanExtraRoversFinal = cleanExtraRovers.map(stripAutoWp);
    const mergedClean = stripAutoWp(mergedResult);

    const finalResult = { ...mergedClean, extraRovers: cleanExtraRoversFinal, events: allEvents };
    // v212: Strategic Reserve escrow. Under the regime (and only there, the
    // knob rides on the preset's physOverrides), a fraction of every deposit
    // is sequestered into the reserve ledger instead of the market ledger.
    // Reserve kg score at ×RESERVE_END_MULT (economy.js): patience pays.
    const escrowFrac = Math.max(0, Math.min(0.9, po.RESERVE_ESCROW_FRAC ?? 0));
    const escrowKg = totalDep * escrowFrac;
    return [{ ...finalResult,
      iceDeposited: s.iceDeposited + totalDep - escrowKg,
      reserveKg: (s.reserveKg ?? 0) + escrowKg,
    }, newHealth, allEvents];
  }

  // ── End Turn for the active player ───────────────────────────────────────
  const endTurn = (pi) => {
    if (replayRun) return;
    if (phase !== PHASE.PLAYING) return;
    const p2Present = !!p2;
    // pi is 0-indexed player index
    if (pi===0 && !p1Done) {
      recordUndoCheckpoint();
      setP1Done(true);
      appendMissionLog({ type:"turn", actor:1, label:"P1 committed its plan and ended turn" });
      if (p2Present && !p2Done) { setActiveTurn(1); } // P2 still needs to go
    } else if (pi===1 && p2Present && !p2Done) {
      recordUndoCheckpoint();
      setP2Done(true);
      appendMissionLog({ type:"turn", actor:2, label:"P2 committed its plan and ended turn" });
      if (!p1Done) { setActiveTurn(0); } // P1 still needs to go
    }
  };

  // ── Facilitator: push to the next round on demand ──────────────────────────
  // Ends the current round immediately and advances. It drives the SAME tested
  // resolution path a natural round-end uses: jump to the final day and end both
  // actors' turns, so the day-resolution effect runs the normal round-end
  // (economy, history entry, round transition, and the mission-end check at the
  // final round). No round logic is duplicated here. Host-only; peers reach it
  // via the facilitator:pushRound action, which the host runs locally.
  const facilitatorPushRound = useCallback(() => {
    if (phase !== PHASE.PLAYING) return;
    if (resolvingRef.current) return;
    if (roundTransition && roundTransition.until > Date.now()) return; // mid-transition
    setDay(DAYS_PER_ROUND - 1);     // newDay = day+1 >= DAYS_PER_ROUND → round-end
    if (!p1Done) endTurn(0);
    if (p2 && !p2Done) endTurn(1);
  }, [phase, p1Done, p2Done, p2, roundTransition]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Diplomacy session: convene / adjourn ───────────────────────────────────
  // "Call the UN to session." Opens a talk-only pause: the day clock and the
  // wall-clock round timer freeze (see the effects below) and actors negotiate.
  // convenedBy is 0 | 1 (an actor moved) or "facilitator" (the chair called it).
  const conveneDiplomacy = useCallback((convenedBy = "facilitator") => {
    if (phase !== PHASE.PLAYING) return;
    if (sessionActive(diplomacy)) return; // already in session, don't restart or double-count
    setDiplomacy(conveneSession(round, { durationMs: diplomacyDurationMs, convenedBy }));
    setDiplomacySessionsHeld(n => n + 1);
    const who = convenedBy === "facilitator" ? "the facilitator" : actorLabel(convenedBy);
    appendMissionLog({ type: "diplomacy", actor: convenedBy === "facilitator" ? null : convenedBy + 1,
      label: `⚖ Conference of Parties convened by ${who}, clock paused, talk only` });
  }, [phase, round, diplomacyDurationMs, diplomacy]); // eslint-disable-line react-hooks/exhaustive-deps

  const endDiplomacy = useCallback((reason = "adjourned") => {
    setDiplomacy(prev => {
      if (!prev || prev.ended) return prev;
      appendMissionLog({ type: "diplomacy", actor: null,
        label: reason === "expired" ? "⚖ Conference of Parties adjourned, time elapsed, play resumes"
                                    : "⚖ Conference of Parties adjourned, play resumes" });
      return { ...prev, ended: true };
    });
  }, [round, day, globalDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-adjourn when the session timer elapses. Re-arms whenever the session
  // record changes; clears on unmount / change so it never double-fires.
  useEffect(() => {
    if (!sessionActive(diplomacy)) return;
    const left = sessionTimeLeftMs(diplomacy);
    const t = setTimeout(() => endDiplomacy("expired"), left + 50);
    return () => clearTimeout(t);
  }, [diplomacy, endDiplomacy]);

  // ── Public claims / propaganda (v181) ──────────────────────────────────────
  // The poster/voter is whoever holds this screen: the seated actor in MP, the
  // active actor in a hotseat. Claims are public and synced to every seat.
  const claimViewer = mp ? myActor : activeTurn;
  const postClaim = useCallback((spec) => {
    if (claimViewer !== 0 && claimViewer !== 1) return;
    const c = makeClaim({ author: claimViewer, round, ...spec });
    setClaims(prev => [...prev, c]);
    appendMissionLog({ type: "claim", actor: claimViewer + 1,
      label: `⚑ ${actorLabel(claimViewer)} ${spec.kind === "pledge" ? "pledged" : "claimed"}: "${c.text}"` });
  }, [claimViewer, round]); // eslint-disable-line react-hooks/exhaustive-deps

  const voteClaim = useCallback((id, stance) => {
    if (claimViewer !== 0 && claimViewer !== 1) return;
    setClaims(prev => prev.map(c => c.id === id ? setClaimStance(c, claimViewer, stance) : c));
  }, [claimViewer]);

  const verifyClaimAction = useCallback((id) => {
    setClaims(prev => prev.map(c => {
      if (c.id !== id || c.status !== "unverified" || c.kind !== "production") return c;
      const authorP = c.author === 0 ? p1 : p2;
      const resolved = resolveClaim(c, authorP);
      if (resolved.status === "true" || resolved.status === "false") {
        appendMissionLog({ type: "claim", actor: c.author + 1,
          label: `⚑ ${actorLabel(c.author)}'s claim "${c.text}" verified ${resolved.status.toUpperCase()}${resolved.status === "false" ? `, actual ${resolved.verifiedActual}` : ""}` });
      }
      return resolved;
    }));
  }, [p1, p2]); // eslint-disable-line react-hooks/exhaustive-deps
  // In a late-arrival session (e.g. the Asymmetric Arrival scenario, where the
  // second board actor, the Ascendant Initiative in the briefs, starts off the
  // board), the facilitator can bring it in immediately instead of waiting for
  // the scheduled arrival day. Drives the same SETUP2 transition the scheduled
  // arrival uses, so the arriving actor places its base normally. No-op once the
  // second actor is already present.
  const facilitatorDeployLateActor = useCallback(() => {
    if (phase !== PHASE.PLAYING) return;
    if (p2) return; // already arrived
    setPhase(PHASE.SETUP2);
    setP1Done(false);
    setP2Done(false);
    setActiveTurn(1);
  }, [phase, p2]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Facilitator GOD MODE ───────────────────────────────────────────────────
  // Direct, no-cost overrides a workshop facilitator can use to steer the table:
  // hand out / claw back budget and score, drop or delete assets, regardless of
  // turn, phase, or affordability. All of these run on the host (peers reach
  // them via the facilitator:* actions) so the authoritative state changes and
  // re-broadcasts to every screen. Each one writes a mission-log line so the
  // table can see the facilitator's hand.
  const ASSET_ARRAY = { solar: "panels", reactor: "reactors", habitat: "habitats", pad: "landingPads", rover: "extraRovers" };
  const ARRAY_TYPE  = { panels: "solar", reactors: "reactor", habitats: "habitat", landingPads: "pad", extraRovers: "rover" };

  const godAdjustBudget = useCallback((targets, { delta, set }) => {
    const apply = (p) => {
      if (!p) return p;
      const next = set != null ? set : (p.budget ?? 0) + (delta ?? 0);
      return { ...p, budget: Math.max(0, Math.round(next)) };
    };
    if (targets === 0 || targets === "both") setP1(apply);
    if (targets === 1 || targets === "both") setP2(apply);
    const who = targets === "both" ? "both actors" : actorLabel(targets);
    const what = set != null ? `set budget to ${set}cr` : `${delta >= 0 ? "+" : ""}${delta}cr budget`;
    appendMissionLog({ type: "facilitator", actor: targets === "both" ? 0 : targets + 1,
      label: `⚙ Facilitator: ${what} for ${who}` });
  }, [round, day, globalDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const godAdjustScore = useCallback((targets, { delta, set }) => {
    const apply = (p) => {
      if (!p) return p;
      // scoreAdjustments feeds the composite score directly (economy.js).
      const cur = p.scoreAdjustments ?? 0;
      const next = set != null ? set : cur + (delta ?? 0);
      return { ...p, scoreAdjustments: Math.round(next) };
    };
    if (targets === 0 || targets === "both") setP1(apply);
    if (targets === 1 || targets === "both") setP2(apply);
    const who = targets === "both" ? "both actors" : actorLabel(targets);
    const what = set != null ? `set score adj to ${set}` : `${delta >= 0 ? "+" : ""}${delta} score`;
    appendMissionLog({ type: "facilitator", actor: targets === "both" ? 0 : targets + 1,
      label: `⚙ Facilitator: ${what} for ${who}` });
  }, [round, day, globalDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const godAddAsset = useCallback((pi, type) => {
    const setFn = pi === 0 ? setP1 : setP2;
    setFn((p) => {
      if (!p || !p.base) return p;
      if (!ASSET_ARRAY[type]) return p;
      // Spiral the drop point a little off the base so repeated adds don't stack.
      const n = (p[ASSET_ARRAY[type]] || []).length;
      const ang = n * 2.399963; // golden angle
      const rad = 6 + n * 3;
      const x = Math.max(0, Math.min(W - 1, Math.round(p.base.x + Math.cos(ang) * rad)));
      const y = Math.max(0, Math.min(H - 1, Math.round(p.base.y + Math.sin(ang) * rad)));
      return grantAssetToPlayer(p, type, {
        x, y, seq: nextSeq(),
        onRidge: RIDGE_MASK[y * W + x] === 1,
        assetPts: ASSET_POINTS[type] ?? 0,
        habitatInit: HABITAT_POWER_INIT,
        roverPower: POWER_CAP,
      });
    });
    appendMissionLog({ type: "facilitator", actor: pi + 1,
      label: `⚙ Facilitator: granted ${actorLabel(pi)} a ${structureLabel(type)} (free)` });
  }, [round, day, globalDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const godRemoveAsset = useCallback((pi, kind) => {
    const setFn = pi === 0 ? setP1 : setP2;
    let removed = false;
    setFn((p) => {
      if (!p || (p[kind] || []).length === 0) return p;
      removed = true;
      return removeLastAsset(p, kind, { assetPts: ASSET_POINTS[ARRAY_TYPE[kind]] ?? 0 });
    });
    if (removed) {
      appendMissionLog({ type: "facilitator", actor: pi + 1,
        label: `⚙ Facilitator: removed a ${structureLabel(ARRAY_TYPE[kind] || kind)} from ${actorLabel(pi)}` });
    }
  }, [round, day, globalDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Facilitator announcement: a free-text event that POPS UP on every targeted
  // actor's screen (not just the log). Routed through the host like injects so
  // it reaches peers; the inject-response queue renders it as an acknowledge-only
  // modal (see InjectResponseModal's announcement mode).
  const godAnnounce = useCallback((text, targets = "both", title = "Facilitator announcement") => {
    const ts = Date.now();
    const entry = {
      type: "inject_announce", ts, round, day, globalDay,
      label: title, icon: "📢", color: "#C0B8E8",
      blurb: text, summary: "Facilitator announcement",
      announce: true, targets,
    };
    setMissionLog(prev => [...prev, entry]);
    setLastEvents(prev => [...(prev || []).slice(-49), { type: "inject", label: title, color: "#C0B8E8", icon: "📢", round, day, ts }]);
  }, [round, day, globalDay]);

  // Player maintenance: reset accrued state so the table can recover between
  // scenarios or after a brutal round. `op` is "clearViolations" | "repair" |
  // "recharge"; targets is 0 | 1 | "both".
  const godMaintenance = useCallback((targets, op) => {
    const apply = (p) => {
      if (!p) return p;
      if (op === "clearViolations") return clearViolations(p);
      if (op === "repair") return repairAllAssets(p);
      if (op === "recharge") return rechargeAll(p, { roverPower: POWER_CAP, habitatPower: HABITAT_POWER_CAP });
      return p;
    };
    if (targets === 0 || targets === "both") setP1(apply);
    if (targets === 1 || targets === "both") setP2(apply);
    const who = targets === "both" ? "both actors" : actorLabel(targets);
    const verb = op === "clearViolations" ? "cleared safety violations"
               : op === "repair" ? "repaired all assets to full health"
               : "recharged all power";
    appendMissionLog({ type: "facilitator", actor: targets === "both" ? 0 : targets + 1,
      label: `⚙ Facilitator: ${verb} for ${who}` });
  }, [round, day, globalDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── v167: negotiation, deals, stances, zones, access ───────────────────────
  const stanceLabel = (k) => ALLOC_PRESETS[k]?.label || k;

  const proposeDeal = useCallback((from, give, want) => {
    if (from !== 0 && from !== 1) return;
    const to = from === 0 ? 1 : 0;
    const deal = makeDeal(from, to, give, want, { round });
    if (isEmptyDeal(deal)) return;
    // One live proposal per proposer; replace any prior pending one.
    setPendingDeals(prev => [...prev.filter(d => !(d.from === from && d.status === "pending")), deal]);
    appendMissionLog({ type: "deal", actor: from + 1,
      label: `🤝 P${from + 1} → P${to + 1}: offers ${summarizeBundle(deal.give, stanceLabel)} for ${summarizeBundle(deal.want, stanceLabel)}` });
  }, [round, day, globalDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const withdrawDeal = useCallback((dealId) => {
    setPendingDeals(prev => prev.filter(d => d.id !== dealId));
  }, []);

  // v168: garbage-collect stale offers when the round advances, expire old ones
  // and drop any the proposer can no longer cover. Host-authoritative in MP.
  useEffect(() => {
    // v200: also run in SOLO/HOTSEAT (mp null). Previously gated on bare !isHost,
    // so in single-player stale/unaffordable deals were never pruned. Only a
    // multiplayer PEER skips (the host prunes and syncs the result).
    if (mp && !isHost) return;
    setPendingDeals(prev => {
      if (!prev || prev.length === 0) return prev;
      const { kept, dropped } = pruneDeals(prev, { round, p1, p2 });
      if (dropped.length === 0) return prev;
      for (const { deal, reason } of dropped) {
        appendMissionLog({ type: "deal", actor: deal.from + 1,
          label: `🤝 P${deal.from + 1}'s offer to P${deal.to + 1} ${reason === "expired" ? "expired" : "lapsed (no longer affordable)"}` });
      }
      return kept;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, isHost]);

  const respondToDeal = useCallback((dealId, accept) => {
    const deal = pendingDeals.find(d => d.id === dealId && d.status === "pending");
    if (!deal) return;
    if (!accept) {
      setPendingDeals(prev => prev.filter(d => d.id !== dealId));
      appendMissionLog({ type: "deal", actor: deal.to + 1, label: `🤝 P${deal.to + 1} declined P${deal.from + 1}'s offer` });
      return;
    }
    const fromP = deal.from === 0 ? p1 : p2;
    const toP = deal.to === 0 ? p1 : p2;
    if (!dealIsHonorable(fromP, toP, deal)) {
      setPendingDeals(prev => prev.filter(d => d.id !== dealId));
      appendMissionLog({ type: "deal", actor: deal.to + 1, label: `🤝 Deal lapsed, a party can no longer cover its side` });
      return;
    }
    const out = applyAcceptedDeal(
      { p1, p2, powerGrid: powerGridState, commsGrid: commsGridState }, deal,
      { sharedGridFor: (offBy) => ({ mode: "shared", offeredBy: offBy + 1, offeredTo: offBy === 0 ? 2 : 1 }) }
    );
    setP1(out.p1); setP2(out.p2);
    if (out.applied.power) setPowerGridState(out.powerGrid);
    if (out.applied.comms) setCommsGridState(out.commsGrid);
    setPendingDeals(prev => prev.filter(d => d.id !== dealId));
    appendMissionLog({ type: "deal", actor: deal.to + 1,
      label: `🤝 P${deal.to + 1} accepted P${deal.from + 1}'s deal, ${summarizeBundle(deal.give, stanceLabel)} ⇄ ${summarizeBundle(deal.want, stanceLabel)}` });
  }, [pendingDeals, p1, p2, powerGridState, commsGridState, round, day, globalDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // v186: per-tier safety-ring resize. `tier` is one of core/harmonization/
  // coordination; `scale` clamps to Christine's allowed bounds. Expanding a tier
  // past baseline (1) is overreach and is penalized (inner rings hardest) via
  // economy.overreachPenalty. Passing tier="all" sets every tier (legacy chips).
  const setTierScale = useCallback((targets, tier, scale) => {
    const clamp = (x) => Math.max(TIER_SCALE_BOUNDS.min, Math.min(TIER_SCALE_BOUNDS.max, x));
    const v = clamp(scale);
    const isDoctrine = tier && typeof tier === "object";
    const apply = (p) => {
      if (!p) return p;
      const cur = { ...DEFAULT_TIER_SCALE, ...(p.tierScale || {}) };
      if (isDoctrine) { for (const k of TIER_KEYS) if (Number.isFinite(tier[k])) cur[k] = clamp(tier[k]); }
      else if (tier === "all") { for (const k of TIER_KEYS) cur[k] = v; }
      else cur[tier] = v;
      return { ...p, tierScale: cur };
    };
    if (targets === 0 || targets === "both") setP1(apply);
    if (targets === 1 || targets === "both") setP2(apply);
    // v203: a doctrine (object) sets all three tiers in ONE action + ONE log line.
    const label = isDoctrine
      ? `all rings, Core ${Math.round(clamp(tier.core ?? 1) * 100)}% · Harmon ${Math.round(clamp(tier.harmonization ?? 1) * 100)}% · Coord ${Math.round(clamp(tier.coordination ?? 1) * 100)}%`
      : `${tier === "all" ? "all rings" : (TIER_LABELS[tier] || tier)} to ${Math.round(v * 100)}%`;
    appendMissionLog({ type: "policy", actor: targets === "both" ? 0 : targets + 1,
      label: `🛡 ${targets === "both" ? "Both actors" : actorLabel(targets)} set ${label}` });
  }, [round, day, globalDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back-compat shim: some call sites / saved sessions still call the old
  // single-knob setter. Route it to "all tiers".
  const setZoneScale = useCallback((targets, scale) => {
    setTierScale(targets, "all", scale);
  }, [setTierScale]);

  // v199: per-player ring DISPLAY magnification. Each actor sizes how big their
  // OWN equipment's safety rings are drawn on the map (1× = true 0.1/0.5/1 km).
  // Visual only, it never changes score or the km the rings represent, and it's
  // independent per actor so one actor's choice doesn't resize the other's rings.
  const setRingMag = useCallback((pi, mag) => {
    const v = Math.max(ZONE_MAGNIFICATION_BOUNDS.min, Math.min(ZONE_MAGNIFICATION_BOUNDS.max, Math.round(mag)));
    const apply = (p) => (p ? { ...p, ringMag: v } : p);
    if (pi === 0 || pi === "both") setP1(apply);
    if (pi === 1 || pi === "both") setP2(apply);
  }, []);

  const setStanceFor = useCallback((targets, presetKey) => {
    if (!ALLOC_PRESETS[presetKey]) return;
    if (targets === "both") { setAllocPreset(0, presetKey); setAllocPreset(1, presetKey); }
    else setAllocPreset(targets, presetKey);
    appendMissionLog({ type: "policy", actor: targets === "both" ? 0 : targets + 1,
      label: `📋 ${targets === "both" ? "Both actors" : actorLabel(targets)} adopted the ${stanceLabel(presetKey)} stance` });
  }, [round, day, globalDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const setEasement = useCallback((pi, grantToActorId, on) => {
    const setFn = pi === 0 ? setP1 : setP2;
    setFn(p => {
      if (!p) return p;
      const cur = new Set(p.easements || []);
      if (on) cur.add(grantToActorId); else cur.delete(grantToActorId);
      return { ...p, easements: [...cur] };
    });
    appendMissionLog({ type: "policy", actor: pi + 1,
      label: `🛡 ${actorLabel(pi)} ${on ? "granted" : "revoked"} a safety easement to P${grantToActorId}` });
  }, [round, day, globalDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Facilitator world overrides (set grid mode / treaty floor / ice directly).
  const setGridMode = useCallback((grid, mode) => {
    const shared = { mode: "shared", offeredBy: 1, offeredTo: 2 };
    const indep = { mode: "independent", offeredBy: null, offeredTo: null };
    const next = mode === "shared" ? shared : indep;
    if (grid === "power") setPowerGridState(next); else setCommsGridState(next);
    appendMissionLog({ type: "facilitator", actor: 0,
      label: `⚙ Facilitator: ${grid} grid → ${mode === "shared" ? "shared" : "independent"}` });
  }, []);

  const godAdjustIce = useCallback((targets, { delta, set }) => {
    const apply = (p) => {
      if (!p) return p;
      const cur = p.iceDeposited ?? 0;
      const next = set != null ? set : cur + (delta ?? 0);
      return { ...p, iceDeposited: Math.max(0, Math.round(next)) };
    };
    if (targets === 0 || targets === "both") setP1(apply);
    if (targets === 1 || targets === "both") setP2(apply);
    appendMissionLog({ type: "facilitator", actor: targets === "both" ? 0 : targets + 1,
      label: `⚙ Facilitator: ${set != null ? `set ice to ${set}kg` : `${delta >= 0 ? "+" : ""}${delta}kg ice`} for ${targets === "both" ? "both actors" : actorLabel(targets)}` });
  }, [round, day, globalDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTreatyFloor = useCallback((targets, value) => {
    const apply = (p) => p ? { ...p, treatyFloor: value } : p;
    if (targets === 0 || targets === "both") setP1(apply);
    if (targets === 1 || targets === "both") setP2(apply);
    appendMissionLog({ type: "facilitator", actor: 0,
      label: `⚙ Facilitator: treaty norm floor → ${value} for ${targets === "both" ? "both actors" : actorLabel(targets)}` });
  }, [round, day, globalDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Facilitator round-duration timer ───────────────────────────────────────
  // When the facilitator sets a wall-clock round duration (> 0), the host
  // auto-advances to the next round that many ms after each round begins. The
  // effect re-arms whenever the round changes (so it chains round to round) and
  // waits out the brief round-transition pause before timing. Host drives it;
  // peers receive the resulting round changes via snapshots.
  useEffect(() => {
    if (mp && !isHost) return;
    if (phase !== PHASE.PLAYING) return;
    if (!roundDurationMs || roundDurationMs <= 0) return;
    if (sessionActive(diplomacy)) return; // v176: round clock frozen during a session
    if (roundTransition && roundTransition.until > Date.now()) return; // start timing after the pause
    const t = setTimeout(() => { facilitatorPushRound(); }, roundDurationMs);
    return () => clearTimeout(t);
  }, [round, roundDurationMs, phase, roundTransition, mp, isHost, facilitatorPushRound, diplomacy]);

  // v176: auto-convene a session on a cadence (facilitator "force interaction"
  // setting). Fires when a new round starts and the cadence lands; host drives
  // it and peers receive the session via snapshot. Never restarts an active one.
  useEffect(() => {
    if (mp && !isHost) return;
    if (phase !== PHASE.PLAYING) return;
    if (!shouldAutoConvene(round, diplomacyAutoEvery)) return;
    if (sessionActive(diplomacy)) return;
    conveneDiplomacy("facilitator");
  }, [round, diplomacyAutoEvery, phase, mp, isHost]); // eslint-disable-line react-hooks/exhaustive-deps

  // When both players are done, resolve the day
  useEffect(() => {
    if (mp && !isHost) return; // In multiplayer, only the host resolves -- peers receive result via snapshot
    if (!p1Done || !p1 || phase!==PHASE.PLAYING) return;
    if (sessionActive(diplomacy)) return; // v176: hold resolution through a talk-only session
    if (p2 && !p2Done) return;
    // Guard: prevent double-resolution. This fires if (a) React StrictMode
    // double-invokes the effect in dev, or (b) the p1/p2 object references in
    // the dep array change mid-resolution before p1Done/p2Done reset to false.
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    // Both players committed -- simulate the day simultaneously
    // Use the same starting craterHealth for both, then merge depletions
    const sharedGridActive = powerGridState.mode === "shared";
    const [chargedP1, chargedP2] = allocateDailyPower([p1, p2], globalDay, sharedGridActive);
    const ch = new Float32Array(craterHealth);
    // Pass opponent state so each player's pickRoverTarget can avoid
    // the OTHER player's safety zones.
    const [np1, _ch2, evs1] = stepPlayer(chargedP1, ch, globalDay, chargedP2, roundLenMul);
    let np2 = p2;
    let ch3 = _ch2;
    let evs2 = [];
    if (p2) {
      [np2, ch3, evs2] = stepPlayer(chargedP2, ch, globalDay, chargedP1, roundLenMul);
      // v27: was `ch3[i] = Math.min(_ch2[i], ch3[i])` -- taking the more-
      // depleted value. That discards one player's contribution: if both
      // mined the same crater on the same day, the merged depletion only
      // reflected whichever depleted more. Effect: total ice extracted
      // could be double what crater depletion suggested, giving co-mining
      // an unintended cooperative bonus. Now combines both depletions:
      // ch3[i] = ch[i] - (d1 + dist) = _ch2[i] + ch3[i] - ch[i], clamped
      // to [0, 1].
      //
      // NOTE: A related issue persists at a smaller scale. Each player's
      // `mineMap` is independent, so both players can each extract up to
      // a pixel's full per-day cap. If they co-mine the same pixel, the
      // total ice they accumulate exceeds what one player would extract
      // alone (still bounded by the linear health multiplier). A future
      // refactor could share `mineMap` across players within a day; the
      // sim/economy implications need to be re-tuned if that ships.
      for (let i = 0; i < ch3.length; i++) {
        ch3[i] = Math.max(0, Math.min(1, _ch2[i] + ch3[i] - ch[i]));
      }
    }

    // ── Safety zone decay ──────────────────────────────────────────────────
    // v96: the ~70-line body was extracted to enemyZones.js applySafetyDecay
    // (shared with the headless bot-sim path, which used to be a hand-synced
    // duplicate). This wrapper just resolves the per-turn physics tunables and
    // delegates. The primary rover is iterated as a rover-typed structure (its
    // zone counts toward violations) but its health goes to a field nothing
    // reads, so it's effectively decay-immune -- preserved behavior.
    const applyDecay = (owner, enemyPositions, attackMil, defenseMil) => {
      const _PASSIVE_DECAY  = physOverrides.PASSIVE_DECAY  ?? PASSIVE_DECAY;
      const _HOSTILE_DECAY  = physOverrides.HOSTILE_DECAY  ?? HOSTILE_DECAY;
      const defMul = MIL_DEFENSE_SCALE + (1 - MIL_DEFENSE_SCALE) * (1 / Math.max(0.1, defenseMil));
      return applySafetyDecay(owner, enemyPositions, {
        passiveDecay: _PASSIVE_DECAY,
        hostileDecayEff: _HOSTILE_DECAY * attackMil * defMul,
        sharedGridActive,
        // v160: take ONLY the physical decay here; violations are attributed to
        // the second arriver below, not charged to the zone owner.
        countViolations: false,
      });
    };

    const mil1 = np1.milScore ?? 1.0;
    const mil2 = np2?.milScore ?? 1.0;
    const p2AllRovers = p2 ? [{ x: np2.x, y: np2.y }, ...(np2.extraRovers || [])] : [];
    const p1AllRovers = [{ x: np1.x, y: np1.y }, ...(np1.extraRovers || [])];
    const { updatedOwner: dnp1, damageDone: dmgByP2 } = p2
      ? applyDecay(np1, p2AllRovers, mil2, mil1)
      : { updatedOwner: np1, damageDone: 0 };
    const { updatedOwner: dnp2, damageDone: dmgByP1 } = p2
      ? applyDecay(np2, p1AllRovers, mil1, mil2)
      : { updatedOwner: np2, damageDone: 0 };
    const fnp1base = dnp1;
    const fnp2base = dnp2;

    // ── v160: second-arriver violation attribution ─────────────────────────
    // The decay above no longer tallies safetyViolations. Charge each violation
    // to whoever arrived SECOND at the contested location (the first placer is
    // innocent), using placement-order seqs. Add onto the running per-actor
    // count so the scoreboard penalty lands on the intruder, not the homesteader.
    {
      // v206: governance regimes weight the violation increment (ITU ×2 for
      // the late party, ATCM ×1.5 inspection cost).
      const violationWeight = governanceViolationWeight(governanceIdForPreset(getScenarioPreset(scenarioPreset)));
      const { v1, v2 } = attributeSafetyViolations(np1, np2, { sharedGridActive, violationWeight });
      if (v1) dnp1.safetyViolations = (dnp1.safetyViolations ?? 0) + v1;
      if (v2 && dnp2) dnp2.safetyViolations = (dnp2.safetyViolations ?? 0) + v2;
    }

    // ── Direct score updates now come from safety violations and grid actions.
    let fnp1 = { ...fnp1base };
    let fnp2 = fnp2base ? { ...fnp2base } : null;

    // ── v174: unpowered-habitat penalty ───────────────────────────────────
    // habitatPower at this point reflects today's allocateDailyPower pass, so a
    // hab that received no charge this day is penalized: accelerated structural
    // decay + a direct scoreboard ding, logged so the player sees the cost.
    const uh1 = applyUnpoweredHabitatPenalty(fnp1);
    fnp1 = uh1.player;
    const uh2 = fnp2 ? applyUnpoweredHabitatPenalty(fnp2) : { player: fnp2, events: [] };
    if (fnp2) fnp2 = uh2.player;
    // v206: stranded-rover penalty (the June 13 "we were not penalized
    // enough" fix), same scoreAdjustments channel as the habitat ding.
    const sp1 = applyStrandedRoverPenalty(fnp1);
    fnp1 = sp1.player;
    const sp2 = fnp2 ? applyStrandedRoverPenalty(fnp2) : { player: fnp2, events: [] };
    if (fnp2) fnp2 = sp2.player;
    // v207: recovery convoy, a rover stranded ≥3 days is rescued at 120cr
    // (restored to 35% power) if the treasury covers it; broke actors stay
    // down and keep paying the daily penalty.
    const rr1 = applyRoverRescue(fnp1, globalDay, POWER_CAP);
    fnp1 = rr1.player;
    const rr2 = fnp2 ? applyRoverRescue(fnp2, globalDay, POWER_CAP) : { player: fnp2, events: [] };
    if (fnp2) fnp2 = rr2.player;
    const unpoweredHabEvents = [
      ...uh1.events.map(ev => ({ ...ev, actor: 1 })),
      ...uh2.events.map(ev => ({ ...ev, actor: 2 })),
      ...sp1.events.map(ev => ({ ...ev, actor: 1 })),
      ...sp2.events.map(ev => ({ ...ev, actor: 2 })),
      ...rr1.events.map(ev => ({ ...ev, actor: 1 })),
      ...rr2.events.map(ev => ({ ...ev, actor: 2 })),
    ];


    const newGlobalDay = globalDay + 1;
    const newDay = day + 1;
    let newRound = round;
    let newCR = [...claimR];

    // ── v179: per-day reconstruction trace ─────────────────────────────────
    // Record every rover's end-of-day position/ice/power/status and the full
    // crater-health snapshot, keyed by the day just simulated. With the
    // day-level event log this makes the export a frame-by-frame record, not
    // just round samples. Host-local; never enters the MP snapshot.
    {
      const traceRover = (p) => {
        if (!p) return "";
        const parts = [];
        const fmt = (r) => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.ice || 0)},${Math.round(r.power ?? 0)},${r.status || ""}`;
        if (p.x != null) parts.push(fmt(p));
        (p.extraRovers || []).forEach(er => { if (er && er.x != null) parts.push(fmt(er)); });
        return parts.join(";");
      };
      tickTraceRef.current.set(globalDay, {
        round, day, globalDay,
        rovers1: traceRover(fnp1),
        rovers2: traceRover(fnp2),
        craterH: Array.from(ch3).map(h => (h ?? 1).toFixed(2)).join("|"),
      });
    }
    const events = [
      ...evs1.map(ev => ({ ...ev, actor: 1 })),
      ...evs2.map(ev => ({ ...ev, actor: 2 })),
      ...unpoweredHabEvents,
    ];
    setLastEvents(events);

    let roundEnded = false;
    let efnp1 = null, efnp2 = null;
    if (newDay >= DAYS_PER_ROUND) {
      const dep1 = evs1.filter(e=>e.type==="deposit").reduce((s,e)=>s+e.kg,0);
      const dep2 = evs2.filter(e=>e.type==="deposit").reduce((s,e)=>s+e.kg,0);
      newCR[0] = Math.min(220, newCR[0] + Math.min(18, dep1/18));
      if (p2) newCR[1] = Math.min(220, newCR[1] + Math.min(18, dep2/18));
      // ── Economy: process round budget (new model) ─────────────────────────
      // Compute cross-player maximums for contentness C
      const E1 = fnp1.econ ?? E_INIT, E2 = fnp2?.econ ?? E_INIT;
      const T1 = fnp1.assetPts ?? 0,  T2 = fnp2?.assetPts ?? 0;  // T = asset points
      const M1 = fnp1.milStock ?? 1,  M2 = fnp2?.milStock ?? 1;
      const E_max = Math.max(E1, E2), T_max = Math.max(T1, T2), M_max = Math.max(M1, M2);

      const processEconomy = (p, E, T, M) => {
        if (p.active === false) return p;
        const alloc = p.alloc || ALLOC_PRESETS[DEFAULT_PRESET_KEY].alloc;
        const budget = calcBudget(E);

        // I_A = asset maintenance this round (new purchase costs are deducted on buy)
        const { maint } = calcAssetCosts(alloc);
        const I_A = (p.panels.length           * maint.solar)
                  + (((p.reactors||[]).length) * maint.reactor)
                  + ((p.habitats||[]).length    * maint.habitat)
                  + ((p.extraRovers||[]).length * maint.rover)
                  + ((p.landingPads||[]).length * maint.pad);

        // Investments as fractions of budget (0-1) so delta equations are scale-stable
        // I_A is paid first; remainder is split by slider proportions
        const spendableFrac = Math.max(0, 1 - I_A / Math.max(1, budget));
        const totalPct      = (alloc.mil + alloc.rd + alloc.econ + (alloc.budget||0)) || 1;
        const I_E = (alloc.econ / totalPct) * spendableFrac;  // fraction → ΔE
        const I_R = (alloc.rd   / totalPct) * spendableFrac;  // fraction → ΔR
        const I_M = (alloc.mil  / totalPct) * spendableFrac;  // fraction → ΔM
        const I_B = ((alloc.budget||0) / totalPct) * spendableFrac; // fraction → bonus credits
        const bonusCredits = Math.round(budget * I_B);

        // Contentness for this player, includes temporary event-driven offset
        const cMod = p.contentnessMod ?? 0;
        const C = calcCompetitiveness(E, T, M, E_max, T_max, M_max, cMod);

        // Decay contentnessMod toward 0 each round by its configured rate.
        // If decay is 0 but mod is nonzero (e.g. event didn't set a decay rate),
        // fall back to a default 0.05/round so mods always eventually clear.
        const decay = (p.contentnessDecay != null && p.contentnessDecay > 0)
          ? p.contentnessDecay
          : (Math.abs(cMod) > 0 ? 0.05 : 0);
        const newCMod = cMod > 0
          ? Math.max(0, cMod - decay)
          : Math.min(0, cMod + decay);
        const newDecay = Math.abs(newCMod) < 0.001 ? 0 : decay;

        // Update stocks
        const newE       = Math.max(0.5, E + calcDeltaE(I_E, C, p.rdAccum ?? 0));
        const newR       = Math.max(0,   (p.rdAccum  ?? 0) + calcDeltaR(I_R, C));
        const newM       = Math.max(0.1, M           + calcDeltaM(I_M, M));
        // v160: budget now ACCUMULATES instead of being overwritten, and the
        // round's income scales with the facilitator's round length.
        //   • Fix (budget increase works): the old line *replaced* the budget
        //     with calcBudget(newE)+bonus every round, silently discarding any
        //     unspent credits, so investing in ECON or saving up never visibly
        //     grew your treasury. We now carry the unspent budget forward and ADD
        //     the round's income on top, so the number goes up the way a player
        //     expects.
        //   • Round length (request 6): a longer round earns proportionally more,
        //     so a 10-minute round is a meaningfully bigger payday than a 2-minute
        //     one (roundLenMul, 1×-4×).
        const roundIncome = (calcBudget(newE) + bonusCredits) * roundLenMul;
        const newBudget  = Math.max(0, Math.round((p.budget ?? 0) + roundIncome));
        const newMilScore = calcMilScore(newM);

        return { ...p, econ: newE, rdAccum: newR, milStock: newM, milScore: newMilScore,
                 budget: newBudget, contentnessMod: newCMod, contentnessDecay: newDecay };
      };
      // DIAGNOSTIC (v67): wraps processEconomy to surface the real error and player
      // state if the economy step crashes. Previously a RangeError from Math.max()
      // spread overflow in the mine-trail renderer was being misattributed by Vite
      // source maps to "calcDeltaE is not defined" here. The root cause (Math.max
      // spread on a large mineMap) was fixed in v65; this try/catch can be removed
      // once the crash is confirmed gone across a full session.
      try {
        efnp1 = processEconomy(fnp1, E1, T1, M1);
        efnp2 = p2 ? processEconomy(fnp2, E2, T2, M2) : null;
      } catch (economyErr) {
        console.error("[processEconomy] crash at round", round, economyErr);
        console.error("[processEconomy] p1 state:", { econ: fnp1.econ, rdAccum: fnp1.rdAccum, milStock: fnp1.milStock, contentnessMod: fnp1.contentnessMod, contentnessDecay: fnp1.contentnessDecay, alloc: fnp1.alloc });
        throw economyErr;
      }

      // v178: compact per-rover position trace for the reconstruction export.
      const roverTrace = (p) => {
        if (!p) return "";
        const parts = [];
        if (p.x != null) parts.push(`${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.ice || 0)}`);
        (p.extraRovers || []).forEach(er => { if (er && er.x != null) parts.push(`${Math.round(er.x)},${Math.round(er.y)},${Math.round(er.ice || 0)}`); });
        return parts.join(";");
      };
      setHistory(h => [...h, {
        r: round,
        d1: Math.round(efnp1.iceDeposited),
        d2: Math.round(efnp2?.iceDeposited ?? 0),
        dep1: Math.round(dep1),
        dep2: Math.round(dep2),
        bud1: Math.round(efnp1.budget),
        bud2: Math.round(efnp2?.budget ?? 0),
        // v173: full per-actor metric snapshot so the detailed CSV export is a
        // real longitudinal series, not just ice+budget.
        m1: actorMetricSnapshot(efnp1),
        m2: efnp2 ? actorMetricSnapshot(efnp2) : null,
        ...(() => { let a = { a1: 0, a2: 0 }; try { a = coordinationIntrusions(efnp1, efnp2, {}); } catch { /* ignore */ } return { adv1: a.a1, adv2: a.a2 }; })(),
        powerGrid: powerGridState?.mode ?? "independent",
        commsGrid: commsGridState?.mode ?? "independent",
        // v178: reconstruction detail, per-round rover positions (primary +
        // extras, as "x,y,ice;..."), declared zone scale, and the full crater
        // health snapshot ("h0|h1|..."), so trajectories and resource depletion
        // can be rebuilt from the CSV, not just end-state metrics.
        rovers1: roverTrace(efnp1),
        rovers2: roverTrace(efnp2),
        zoneScale1: efnp1?.zoneScale ?? 1,
        zoneScale2: efnp2?.zoneScale ?? 1,
        craterH: Array.from(ch3).map(h => (h ?? 1).toFixed(2)).join("|"),
      }]);
      newRound = round + 1;
      roundEnded = true;
    }

    setGlobalDay(newGlobalDay);
    // v101: at the end of a full round, decrement any forced-action states
    // (no-negotiate directives, Earth-side freezes) by one turn and drop the
    // expired ones, so restrictions imposed by injects wear off on schedule.
    const tickRestr = (pl) => pl ? { ...pl, restrictions: tickRestrictions(pl.restrictions) } : pl;
    // v203 (roadmap orbit item b): assets operating inside an orbital-debris
    // keep-out are charged as safety violations at round end, 1 per asset per
    // round, at the standard SCORE_PENALTY_VIO. This is what makes the cheap
    // crash-disposal choice actually bite whoever ends up living in the mess.
    const chargeDebris = (pl, who) => {
      if (!pl || !orbitalDebris.length) return pl;
      const n = debrisViolationCount(orbitalDebris, pl);
      if (!n) return pl;
      appendMissionLog({ type: "policy", actor: who + 1,
        label: `☄ P${who + 1}: ${n} asset${n === 1 ? "" : "s"} operating inside an orbital-debris keep-out · +${n} safety violation${n === 1 ? "" : "s"} (−${n * SCORE_PENALTY_VIO} score)` });
      return { ...pl, safetyViolations: (pl.safetyViolations ?? 0) + n };
    };
    const commit1 = roundEnded ? efnp1 : fnp1;
    const commit2 = p2 ? (roundEnded ? efnp2 : fnp2) : null;
    setP1(roundEnded ? tickRestr(chargeDebris(commit1, 0)) : commit1);
    setP2(roundEnded ? tickRestr(chargeDebris(commit2, 1)) : commit2);
    // v134: decay orbital crash debris each round-end; expired clouds drop off.
    if (roundEnded) setOrbitalDebris(d => tickOrbitalObjects(d));
    setCraterHealth(ch3); setClaimR(newCR);

    const missionEndsOnDepletion = missionEndMode === "depletion" && isMapDepleted(ch3);
    if (roundEnded) {
      if ((missionEndMode === "fixed" && newRound > totalRounds) || missionEndsOnDepletion) {
        setPhase(PHASE.DONE);
        setP1Done(false); setP2Done(false);
        return;
      }
      setRound(newRound); setDay(0);
      // v21: round-end pause bumped 1600ms → 2400ms so the resolution
      // moment lands properly with the slower per-day pacing above.
      setRoundTransition({ round: newRound, until: Date.now() + 2400 });
    } else {
      if (missionEndsOnDepletion) {
        setPhase(PHASE.DONE);
        setP1Done(false); setP2Done(false);
        return;
      }
      setDay(newDay);
    }

    // Reset for next day -- P1 goes first
    setP1Done(false); setP2Done(false);
    setActiveTurn(0);
    resolvingRef.current = false;
  }, [p1Done, p2Done, phase, p1, p2, craterHealth, globalDay, round, day, totalRounds, powerGridState, missionEndMode, roundLenMul, diplomacy]);

  // ── UI helpers ───────────────────────────────────────────────────────────
  // Apply landing damage to every enemy structure whose safety zone contains
  // the landing point (lx, ly). Used by both click-placed structures and
  // rover deployments at base.
  const landingImpact = (pi, lx, ly) => {
    const enemyPi = pi === 0 ? 1 : 0;
    const enemyP = enemyPi === 0 ? p1 : p2;
    if (!enemyP) return;
    const setEnemy = enemyPi === 0 ? setP1 : setP2;
    // v132 (roadmap: commercial re-spec follow-through). Regolith disturbance is
    // now a live consequence, not just a stored field: a high-disturbance
    // emplacer's landings throw debris further and harder, while a
    // low-disturbance prospector barely scratches nearby ground. Scale the
    // landing's damage radius and damage amount by the PLACING actor's
    // disturbanceMod (defaults to 1 -> identical to prior behavior for
    // non-commercial actors).
    const placingP = pi === 0 ? p1 : p2;
    const disturb = (Number.isFinite(placingP?.disturbanceMod) && placingP.disturbanceMod > 0) ? placingP.disturbanceMod : 1;
    // v27: removed dead `setSelf = pi === 0 ? setP1 : setP2` -- declared
    // but never used. Likely a tombstone from an earlier design where
    // landings also credited the attacker with damage points; current
    // scoring derives military assessment from milScore, not from
    // attack-event credits, so this hook was orphaned.
    const eSh = { ...(enemyP.structureHealth || {}) };
    const eLists = {
      panels:      enemyP.panels        || [],
      reactors:    enemyP.reactors      || [],
      habitats:    enemyP.habitats      || [],
      extraRovers: enemyP.extraRovers   || [],
      landingPads: enemyP.landingPads   || [],
    };
    const typeFor = { panels:'solar', reactors:'reactor', habitats:'habitat', extraRovers:'rover', landingPads:'pad' };
    // v164: the VICTIM's own functional landing pads suppress dust in their
    // apron, an asset sitting within a working pad's keep-out takes a fraction
    // of the incoming landing damage. Prepared ground contains the plume, so
    // building pads protects nearby assets' health. Computed from the victim's
    // pre-loop pad health so it doesn't depend on iteration order.
    const padApron = SAFETY_RADIUS.pad;
    const victimPads = (enemyP.landingPads || []).filter(
      (_pd, i) => (enemyP.structureHealth?.landingPads?.[i] ?? 1.0) > 0.1
    );
    const dustShielded = (pt) =>
      victimPads.some(pd => dist(pt, pd) < padApron);
    let totalDamage = 0;
    let shieldedCount = 0;
    for (const k of Object.keys(eLists)) {
      const arr = [...(eSh[k] || eLists[k].map(()=>1.0))];
      const radius = SAFETY_RADIUS[typeFor[k]] * disturb;
      for (let ei = 0; ei < eLists[k].length; ei++) {
        const before = arr[ei] ?? 1.0;
        if (before <= 0) continue;
        if (dist({x:lx, y:ly}, eLists[k][ei]) < radius) {
          const shielded = dustShielded(eLists[k][ei]);
          if (shielded) shieldedCount++;
          const mit = shielded ? (1 - PAD_DUST_MITIGATION) : 1;
          const after = Math.max(0, before - LANDING_DAMAGE * disturb * mit);
          totalDamage += (before - after);
          arr[ei] = after;
        }
      }
      eSh[k] = arr;
    }
    if (totalDamage > 0) {
      setEnemy(prev => prev ? { ...prev, structureHealth: eSh } : prev);
    }
    if (shieldedCount > 0) {
      appendMissionLog({ type: "mitigation", actor: enemyPi + 1,
        label: `🛬 ${actorLabel(enemyPi)}'s landing-pad apron contained dust, ${shieldedCount} asset${shieldedCount > 1 ? "s" : ""} shielded (−${Math.round(PAD_DUST_MITIGATION * 100)}% damage)` });
    }
  };

  // Reactors do NOT apply landing damage on placement. Other asset types
  // (solar, habitat, rover, pad) call landingImpact() which deals
  // LANDING_DAMAGE to every enemy structure whose safety zone the lander
  // overlapped. Reactors are different: their 3-ring exclusion/EMI/plume
  // zone (REACTOR_ZONES) is meant to be coordinated, not breached. Ongoing
  // damage from a reactor sitting inside an enemy safety zone is handled
  // by the per-turn applyDecay() pass in endTurn(). This noop is kept as
  // an explicit hook so a future "reactor placement diplomatic cost"
  // policy can attach here without re-finding the call sites.
  // v27: was previously named `applyReactorPlacementPenalty` and computed
  // a `nearby` count that was discarded -- confusing dead code. Renamed +
  // documented.
  const onReactorPlacement = (playerState /* , enemyState, x, y */) => playerState;

  const appendMissionLog = (entry) => {
    setMissionLog(prev => [...prev, { round, day, globalDay, ...entry }]);
  };

  // v27: `structureLabel` is now imported from src/sim/labels.js so it can
  // be reused by the plot data builder and other extracted modules.

  const getDiplomacyOptions = (pi) => {
    const actor = pi === 0 ? p1 : p2;
    const other = pi === 0 ? p2 : p1;
    if (!gridSharingEnabled || !actor || !other) return [];
    // v101: inject restrictions (no-negotiate directive / Earth-side freeze)
    // block new offers and joins; an already-shared grid can still be decoupled.
    const canNeg = canNegotiateWith(actor, pi === 0 ? 1 : 0);
    // v103: delegated to the shared grid state machine.
    return gridOptions(powerGridState, pi, { permanent: gridSharingPermanent, canNegotiate: canNeg });
  };

  // v103: comms grid options, same machine, no permanence concept.
  const getCommsOptions = (pi) => {
    const actor = pi === 0 ? p1 : p2;
    const other = pi === 0 ? p2 : p1;
    if (!gridSharingEnabled || !actor || !other) return [];
    const canNeg = canNegotiateWith(actor, pi === 0 ? 1 : 0);
    return gridOptions(commsGridState, pi, { permanent: false, canNegotiate: canNeg });
  };

  const applyScoreDelta = (pi, delta) => {
    const setter = pi === 0 ? setP1 : setP2;
    setter(player => player ? {
      ...player,
      scoreAdjustments: (player.scoreAdjustments ?? 0) + delta,
    } : player);
  };

  const executeDiplomaticDecision = (pi) => {
    if (replayRun) return;
    if (phase !== PHASE.PLAYING) return;
    if (!gridSharingEnabled) return;
    if ((pi === 0 ? p1Done : p2Done)) return;
    const actor = pi === 0 ? p1 : p2;
    const other = pi === 0 ? p2 : p1;
    if (!actor || !other) return;

    const action = selectedDiplomacy[pi];
    const actorId = pi + 1;
    if (!action) return;
    recordUndoCheckpoint();

    // v103: transition computed by the shared state machine.
    const result = applyGridAction(powerGridState, pi, action, GRID_DEFS.power, { permanent: gridSharingPermanent });
    if (result) {
      setPowerGridState(result.grid);
      applyScoreDelta(pi, result.score);
      appendMissionLog({ type:"grid", actor: actorId, label: `P${actorId} ${result.logVerb}${result.score ? ` · ${result.score > 0 ? "+" : ""}${result.score} score (cooperation)` : ""}` });
    }
    setSelectedDiplomacy([null, null]);
  };

  // v103: comms grid negotiation, mirroring executeDiplomaticDecision.
  const executeCommsDecision = (pi) => {
    if (replayRun) return;
    if (phase !== PHASE.PLAYING) return;
    if (!gridSharingEnabled) return;
    if ((pi === 0 ? p1Done : p2Done)) return;
    const actor = pi === 0 ? p1 : p2;
    const other = pi === 0 ? p2 : p1;
    if (!actor || !other) return;

    const action = selectedComms[pi];
    const actorId = pi + 1;
    if (!action) return;
    recordUndoCheckpoint();

    const result = applyGridAction(commsGridState, pi, action, GRID_DEFS.comms, { permanent: false });
    if (result) {
      setCommsGridState(result.grid);
      applyScoreDelta(pi, result.score);
      appendMissionLog({ type:"grid", actor: actorId, label: `P${actorId} ${result.logVerb}${result.score ? ` · ${result.score > 0 ? "+" : ""}${result.score} score (cooperation)` : ""}` });
    }
    setSelectedComms([null, null]);
  };

  const buildStructure = (pi, type) => {
    if (replayRun) return;
    // v27: gate on the issuing player's done flag. A done player shouldn't
    // buy or resupply in the window before the day resolves. The toolbar
    // UI already greys out the asset palette and resupply button via
    // isDone (see asset palette + AssetDetailSidebar), but this is the
    // canonical gate against any other code path that might call it
    // (multiplayer peer actions, asset detail sidebar action).
    if (pi === 0 ? p1Done : p2Done) return;
    const p = pi===0 ? p1 : p2;
    if (!p) return;
    if (type === "resupply") {
      const pads = p.landingPads || [];
      const sh0 = p.structureHealth || {};
      const padHealths = sh0.landingPads || pads.map(() => 1.0);
      const hasFunctionalPad = pads.some((_, i) => (padHealths[i] ?? 1.0) > 0);
      if (!hasFunctionalPad) return;
      if ((p.budget ?? 0) < RESUPPLY_COST) return;
      recordUndoCheckpoint();
      const keys = ['panels','reactors','habitats','extraRovers','landingPads'];
      const lists = { panels:p.panels||[], reactors:p.reactors||[], habitats:p.habitats||[], extraRovers:p.extraRovers||[], landingPads:pads };
      const newSH = {};
      for (const k of keys) newSH[k] = [...(sh0[k] || lists[k].map(()=>1.0))];
      const refs = [];
      for (const k of keys) for (let i=0;i<lists[k].length;i++) {
        const h = newSH[k][i] ?? 1.0;
        if (h > 0 && h < 1.0) refs.push({k,i});
      }
      let pool = RESUPPLY_POOL, safety = 600;
      while (pool > 1e-6 && refs.length && safety-- > 0) {
        let minH = Infinity, pick = -1;
        for (let r=0;r<refs.length;r++){const {k,i}=refs[r];const h=newSH[k][i];if(h<1.0&&h<minH){minH=h;pick=r;}}
        if (pick === -1) break;
        const {k,i} = refs[pick];
        const give = Math.min(RESUPPLY_CHUNK, pool, 1.0 - newSH[k][i]);
        newSH[k][i] += give;
        pool -= give;
      }
      // v27: was `structureHealth: newSH` -- but `newSH` only contains
      // the 5 keys in the resupply pool (panels/reactors/habitats/
      // extraRovers/landingPads). Spreading sh0 first preserves comsats
      // and primaryRover health which the resupply pool doesn't touch.
      const np = { ...p, budget:(p.budget??0)-RESUPPLY_COST, structureHealth:{ ...sh0, ...newSH } };
      if (pi===0) setP1(np); else setP2(np);
      appendMissionLog({ type:"purchase", actor: pi + 1, itemType:"resupply", cost:RESUPPLY_COST, label:`P${pi+1} purchased ${structureLabel("resupply")} for ${RESUPPLY_COST}cr · no direct score change (restores asset health, protecting existing asset points)` });
      // Each functional pad receiving this resupply triggers a landing impact
      // at its own coordinates -- so a forward pad sitting in enemy zones acts
      // like a missile strike every time you order resupply.
      pads.forEach((pad, pi2) => {
        if ((padHealths[pi2] ?? 1.0) > 0) landingImpact(pi, pad.x, pad.y);
      });
      return;
    }
    const pads = p.landingPads || [];
    // v160: actors can click-place assets in ANY round, not just the arrival-
    // grace window. Previously `padFree` was `hasPlacementGrace(...) || type ===
    // "pad"`, so after round 1 every non-pad structure was forced through
    // landing-pad delivery and "I can't place my asset" was the result. Direct
    // placement is now always available; pad delivery remains as an alternate
    // path but is no longer mandatory.
    const padFree = true;
    if (pads.length === 0 && !padFree && type !== "rover") return; // need a landing pad first
    const padIdx = pads.length > 0 ? Math.min(selectedPad[pi], pads.length - 1) : 0;
    const { costs } = calcAssetCosts(p.alloc || ALLOC_PRESETS[DEFAULT_PRESET_KEY].alloc, p?.stakeholderId, { padCount: functionalPadCount(p) });
    const cost = costs[type] ?? 999;

    const maxes = { solar: MAX_PANELS, reactor: MAX_REACTORS, habitat: MAX_HABITATS, rover: MAX_ROVERS, pad: MAX_PADS };
    const counts = {
      solar:   p.panels.length,
      reactor: (p.reactors||[]).length,
      habitat: (p.habitats||[]).length,
      rover:   (p.extraRovers||[]).length,
      pad:     (p.landingPads||[]).length,
    };
    if (counts[type] >= maxes[type]) return;
    if ((p.budget ?? 0) < cost) return;
    recordUndoCheckpoint();
    const id = Date.now() + Math.random();
    const pts = ASSET_POINTS[type] ?? 0;
    let np;
    if (type === "rover") {
      // Rovers spawn immediately at the player's base -- no pad pickup needed
      np = { ...p,
             budget:   (p.budget   ?? 0) - cost,
             assetPts: (p.assetPts ?? 0) + pts,
             extraRovers: [...(p.extraRovers||[]), {
               x: p.base.x, y: p.base.y,
               waypoints: [], currentWaypoint: null,
               ice: 0, carrying: null, status: "idle",
               power: POWER_CAP, seq: nextSeq(),
             }],
             structureHealth: {
               ...p.structureHealth,
               extraRovers: [...(p.structureHealth?.extraRovers || []), 1.0],
             },
            };
      landingImpact(pi, p.base.x, p.base.y);
      appendMissionLog({ type:"purchase", actor: pi + 1, itemType:type, cost, label:`P${pi+1} purchased ${structureLabel(type)} for ${cost}cr and deployed it at base · +${pts * SCORE_PTS_PER_AP} score (+${pts} asset pts)` });
    } else if (padFree) {
      // During a player's first 7 days after arrival, all non-rover builds can
      // use manual click placement. After that, non-pad structures must flow
      // through landing-pad delivery.
      // v21: default placement flow now routes through explore mode -- the
      // user clicks a candidate site, the analysis sidebar opens with a
      // "Confirm placement" affordance, and the user accepts or picks a
      // different spot. Setting exploreMode here flips the click handler
      // into explore-first behavior without changing direct rover-led
      // placement (drag-from-rover, landing-pad delivery) which stay as-is.
      setPlacingFor(pi);
      setPlacingType(type);
      setExploreMode(true);
      setExploreClick(null);
      appendMissionLog({ type:"purchase", actor: pi + 1, itemType:type, cost, label:`P${pi+1} purchased ${structureLabel(type)} for ${cost}cr and is exploring placement sites` });
      return;
    } else {
      np = { ...p, budget: (p.budget ?? 0) - cost,
                   assetPts: (p.assetPts ?? 0) + pts,
                    pendingDeliveries: [...(p.pendingDeliveries||[]), { id, type, padIdx }] };
      appendMissionLog({ type:"purchase", actor: pi + 1, itemType:type, cost, label:`P${pi+1} purchased ${structureLabel(type)} for ${cost}cr and routed it to Landing Pad ${padIdx + 1} · +${pts * SCORE_PTS_PER_AP} score (+${pts} asset pts)` });
    }
    if (pi===0) setP1(np); else setP2(np);
  };

  // Drag-and-drop placement: do the purchase + the placement in one go,
  // bypassing the two-step "select then click" flow. Returns true if placed.
  const buildAndPlaceAt = (pi, type, x, y) => {
    if (replayRun) return false;
    // v27: gate on isDone. Same rationale as buildStructure.
    if (pi === 0 ? p1Done : p2Done) return false;
    const p = pi===0 ? p1 : p2;
    if (!p) return false;
    if (type === "resupply") {
      buildStructure(pi, type);
      return true;
    }
    const { costs } = calcAssetCosts(p.alloc || ALLOC_PRESETS[DEFAULT_PRESET_KEY].alloc, p?.stakeholderId, { padCount: functionalPadCount(p) });
    const cost = costs[type] ?? 999;
    if ((p.budget ?? 0) < cost) return false;
    // Rover placement: just spawn at drop point -- costs are deducted here.
    if (type === "rover") {
      recordUndoCheckpoint();
      const setFn = pi===0 ? setP1 : setP2;
      setFn(prev => {
        if (!prev) return prev;
        const sh = { ...(prev.structureHealth || {}) };
        return {
          ...prev,
          budget: (prev.budget??0) - cost,
          assetPts: (prev.assetPts??0) + (ASSET_POINTS.rover ?? 0),
          extraRovers: [...(prev.extraRovers||[]), { x, y, waypoints:[], currentWaypoint:null, ice:0, power:1, status:"idle", seq: nextSeq() }],
          structureHealth: { ...sh, extraRovers: [...(sh.extraRovers||[]), 1.0] },
        };
      });
      appendMissionLog({ type:"purchase", actor: pi+1, itemType:type, cost,
        label:`P${pi+1} deployed a rover at (${x}, ${y}) · drag to place` });
      return true;
    }
    // Structure placement: do everything in one synchronous setter so we don't
    // hit the React-state-batching race where placingFor isn't set when
    // handleClickAt runs.
    recordUndoCheckpoint();
    const pts = ASSET_POINTS[type] ?? 0;
    const setFn = pi===0 ? setP1 : setP2;
    setFn(prev => {
      if (!prev) return prev;
      if ((prev.budget ?? 0) < cost) return prev;
      const sh = { ...(prev.structureHealth || {}) };
      const at = { x, y, seq: nextSeq() }; // v160: placement order for violation attribution
      if (type === "solar") {
        const onRidge = RIDGE_MASK[y * W + x] === 1;
        return { ...prev, budget:(prev.budget??0)-cost, assetPts:(prev.assetPts??0)+pts,
          panels: [...(prev.panels||[]), { x, y, onRidge, seq: at.seq }],
          structureHealth: { ...sh, panels: [...(sh.panels||[]), 1.0] }};
      } else if (type === "reactor") {
        return { ...prev, budget:(prev.budget??0)-cost, assetPts:(prev.assetPts??0)+pts,
          reactors: [...(prev.reactors||[]), at],
          structureHealth: { ...sh, reactors: [...(sh.reactors||[]), 1.0] }};
      } else if (type === "habitat") {
        return { ...prev, budget:(prev.budget??0)-cost, assetPts:(prev.assetPts??0)+pts,
          habitats: [...(prev.habitats||[]), at],
          habitatPower: [...(prev.habitatPower||[]), HABITAT_POWER_INIT],
          structureHealth: { ...sh, habitats: [...(sh.habitats||[]), 1.0] }};
      } else if (type === "pad") {
        return { ...prev, budget:(prev.budget??0)-cost, assetPts:(prev.assetPts??0)+pts,
          scoreAdjustments: (prev.scoreAdjustments??0) + PAD_GEO_BONUS,
          landingPads: [...(prev.landingPads||[]), at],
          structureHealth: { ...sh, landingPads: [...(sh.landingPads||[]), 1.0] }};
      } else if (type === "comsat") {
        return { ...prev, budget:(prev.budget??0)-cost, assetPts:(prev.assetPts??0)+pts,
          comsats: [...(prev.comsats||[]), at],
          structureHealth: { ...sh, comsats: [...(sh.comsats||[]), 1.0] }};
      }
      return prev;
    });
    if (type === "reactor") {
      // Reactor placement is intentionally non-damaging -- see onReactorPlacement.
      const enemyP = pi === 0 ? p2 : p1;
      setFn(prev => onReactorPlacement(prev, enemyP, x, y));
    } else if (type === "comsat") {
      // v27: comsats are orbital relays, not landers -- no landing impact.
      // See the click-place branch above for the full rationale.
    } else {
      landingImpact(pi, x, y);
    }
    appendMissionLog({ type:"placement", actor:pi+1, itemType:type, x, y, geo: type === "pad" ? PAD_GEO_BONUS : 0,
      label:`P${pi+1} placed ${structureLabel(type)} at (${x}, ${y}) · drag to place${type === "pad" ? ` · +${PAD_GEO_BONUS} geopolitical (dust mitigation)` : ""}` });
    return true;
  };

  const setAllocPreset = (pi, presetKey) => {
    if (replayRun) return;
    const preset = ALLOC_PRESETS[presetKey];
    if (!preset) return;
    recordUndoCheckpoint();
    const setter = pi === 0 ? setP1 : setP2;
    setter(p => {
      if (!p) return p;
      return { ...p, allocPreset: presetKey, alloc: { ...preset.alloc } };
    });
  };

  const clearWaypoints = pi => {
    if (replayRun) return;
    // v27: gate on the issuing player's done flag. Same rationale as
    // commitAimDirection -- a done player shouldn't mutate state in the
    // window before the day resolves.
    if (pi === 0 ? p1Done : p2Done) return;
    recordUndoCheckpoint();
    const rIdx = selectedRover[pi];
    const setFn = pi===0 ? setP1 : setP2;
    setFn(p => {
      if (!p) return p;
      if (rIdx === 0) return { ...p, waypoints:[], currentWaypoint:null };
      const erIdx = rIdx - 1;
      const newER = [...(p.extraRovers||[])];
      if (!newER[erIdx]) return p;
      newER[erIdx] = { ...newER[erIdx], waypoints:[], currentWaypoint:null };
      return { ...p, extraRovers: newER };
    });
    appendMissionLog({
      type:"waypoint",
      actor: pi + 1,
      rover: rIdx + 1,
      label:`P${pi+1} cleared the route for R${rIdx + 1}`,
    });
  };

  // ── Register peer-action handlers ─────────────────────────────────────────
  // v27: handler-function refs. The handlers registered below close over
  // functions like handleClickAt, commitAimDirection, etc. -- all of which
  // are fresh references on each render. The dep array on the useEffect is
  // intentionally NARROW (only stable values + a few canonical deps), so
  // without the ref trick, the captured closures would be stale by the time
  // a peer's action arrives.
  //
  // Strategy: a single useRef holds a "latest snapshot" of everything the
  // handlers need. We sync it on every render (cheap -- just an object
  // assignment), and the handlers read via `latestRef.current.X(...)`.
  // The useEffect itself only registers handlers once per real dep change.
  const latestRef = useRef({});
  latestRef.current = {
    endTurn, clearWaypoints, executeDiplomaticDecision, executeCommsDecision,
    handleClickAt, commitWaypoint, commitAimDirection, buildAndPlaceAt,
    phase, placingFor, selectingFor,
    setSelectedBuild, setSelectedDiplomacy, setSelectedComms, setSelectedRover, setSelectedPad,
    setAnnotations,
    facilitatorPushRound, setRoundDurationMs, setTotalRounds, round,
    facilitatorDeployLateActor,
    godAdjustBudget, godAdjustScore, godAddAsset, godRemoveAsset, godAnnounce, godMaintenance,
    proposeDeal, respondToDeal, withdrawDeal, setZoneScale, setTierScale, setRingMag, setStanceFor, setEasement,
    setGridMode, godAdjustIce, setTreatyFloor,
  };

  // The host accepts these from peers via the multiplayer relay. Each handler
  // validates that the peer's seat actually owns the actor they're trying to
  // command, then runs the corresponding local function. Facilitator (seat 0)
  // can act for either actor.
  useEffect(() => {
    // v200: register these locally in SOLO/HOTSEAT as well as on the MP host , 
    // only a multiplayer PEER skips (peers send actions to the host instead).
    // Previously this returned on `!isHost`, which is ALSO true in solo (no mp),
    // so in single-player NONE of the dispatch-based controls (tier sliders, ring
    // size, stance, easements, deals) were ever wired up, they silently did
    // nothing. dispatchAction's solo branch calls handlersRef directly, so those
    // handlers must exist in solo.
    if (mp && !isHost) return;
    const seatCanActAs = (seat, pi) => {
      // Solo (no mp): the local user controls everything. The host-seat
      // value is just a default used for routing local dispatches; it
      // shouldn't gate which actor the user can drive.
      if (!mp) return true;
      // Multiplayer: seat 0 is facilitator (full control), seat 1 is
      // Actor I (can act as pi=0), seat 2 is Actor II (pi=1).
      return seat === 0 || (seat === 1 && pi === 0) || (seat === 2 && pi === 1);
    };

    registerActionHandler("endTurn", ({ pi }, from) => {
      if (!seatCanActAs(from.seat, pi)) return;
      latestRef.current.endTurn(pi);
    });
    registerActionHandler("selectBuild", ({ pi, type }, from) => {
      if (!seatCanActAs(from.seat, pi)) return;
      latestRef.current.setSelectedBuild(prev => { const n=[...prev]; n[pi]=type||null; return n; });
    });
    registerActionHandler("selectDiplomacy", ({ pi, type }, from) => {
      if (!seatCanActAs(from.seat, pi)) return;
      latestRef.current.setSelectedDiplomacy(prev => { const n=[...prev]; n[pi]=type||null; return n; });
    });
    registerActionHandler("selectRover", ({ pi, idx }, from) => {
      if (!seatCanActAs(from.seat, pi)) return;
      latestRef.current.setSelectedRover(prev => { const n=[...prev]; n[pi]=idx; return n; });
    });
    registerActionHandler("selectPad", ({ pi, idx }, from) => {
      if (!seatCanActAs(from.seat, pi)) return;
      latestRef.current.setSelectedPad(prev => { const n=[...prev]; n[pi]=idx; return n; });
    });
    registerActionHandler("clearWaypoints", ({ pi }, from) => {
      if (!seatCanActAs(from.seat, pi)) return;
      latestRef.current.clearWaypoints(pi);
    });
    registerActionHandler("executeDiplomacy", ({ pi }, from) => {
      if (!seatCanActAs(from.seat, pi)) return;
      latestRef.current.executeDiplomaticDecision(pi);
    });
    registerActionHandler("selectComms", ({ pi, type }, from) => {
      if (!seatCanActAs(from.seat, pi)) return;
      latestRef.current.setSelectedComms(prev => { const n=[...prev]; n[pi]=type||null; return n; });
    });
    registerActionHandler("executeComms", ({ pi }, from) => {
      if (!seatCanActAs(from.seat, pi)) return;
      latestRef.current.executeCommsDecision(pi);
    });
    registerActionHandler("mapClick", ({ x, y, shiftKey }, from) => {
      // v27: read phase/placingFor/selectingFor from the latest snapshot ref
      // so a state change between render-N (registration) and render-N+M
      // (peer message arrival) doesn't make us route to the wrong actor.
      const L = latestRef.current;
      let targetActor = null;
      const inSetup = L.phase===PHASE.SETUP1 || L.phase===PHASE.SETUP2;
      if (inSetup) {
        // v156: concurrent setup -- a peer's setup click places a base for THEIR
        // OWN actor (seat 1 -> actor 0, seat 2 -> actor 1), not a phase-fixed
        // actor, so both actors can place at the same time.
        targetActor = from.seat === 2 ? 1 : from.seat === 1 ? 0 : null;
      }
      else if (L.placingFor !== null) targetActor = L.placingFor;
      else if (L.selectingFor !== null) targetActor = L.selectingFor;
      if (targetActor !== null && !seatCanActAs(from.seat, targetActor)) return;
      // Synthesize a minimal event with shiftKey so implicit waypoint mode
      // can detect the modifier. In setup, tell handleClickAt which actor the
      // click is for; elsewhere (null) it derives the actor as before.
      L.handleClickAt(x, y, { shiftKey: !!shiftKey }, inSetup ? targetActor : null);
    });
    registerActionHandler("annotate", ({ x, y, note }, from) => {
      // Anyone can annotate (facilitator-grade markup).
      // v27: read annotations.length via the setter's prev arg, not via
      // closed-over `annotations` -- the handler is registered once per
      // dep-array trigger, and `annotations` would otherwise be stale.
      const colors = ["#E8C998","#C0B8E8","#9BD4B5","#ff6644","#80B0D8"];
      latestRef.current.setAnnotations(prev => {
        const label = (note || "").trim() || `Pin ${prev.length + 1}`;
        return [...prev, { x, y, label, color: colors[prev.length % colors.length], ts: Date.now(), by: from.seat }];
      });
    });
    registerActionHandler("buildAndPlaceAt", ({ pi, type, x, y }, from) => {
      if (!seatCanActAs(from.seat, pi)) return;
      latestRef.current.buildAndPlaceAt(pi, type, x, y);
    });
    registerActionHandler("setWaypoint", ({ pi, rIdx, x, y, shiftAdd }, from) => {
      if (!seatCanActAs(from.seat, pi)) return;
      latestRef.current.commitWaypoint(pi, rIdx, x, y, shiftAdd);
    });
    registerActionHandler("setAimDirection", ({ pi, rIdx, angle }, from) => {
      if (!seatCanActAs(from.seat, pi)) return;
      latestRef.current.commitAimDirection(pi, rIdx, angle);
    });
    // Facilitator-only actions
    registerActionHandler("facilitator:reassignSeat", ({ memberId, seat }, from) => {
      if (from.seat !== 0) return;
      if (mp) mp.reassignSeat(memberId, seat);
    });
    // Facilitator round control (seat 0 only). Push the next round, set a
    // wall-clock round duration, or change the total round count mid-game.
    registerActionHandler("facilitator:pushRound", (_payload, from) => {
      if (!from.local && from.seat !== 0) return;
      latestRef.current.facilitatorPushRound();
    });
    registerActionHandler("facilitator:setRoundDuration", ({ ms }, from) => {
      if (!from.local && from.seat !== 0) return;
      latestRef.current.setRoundDurationMs(Math.max(0, Math.round(ms) || 0));
    });
    registerActionHandler("facilitator:setTotalRounds", ({ totalRounds: tr }, from) => {
      if (!from.local && from.seat !== 0) return;
      const cur = latestRef.current.round || 1;
      latestRef.current.setTotalRounds(Math.max(cur, Math.min(40, Math.round(tr) || cur)));
    });
    registerActionHandler("facilitator:deployLateActor", (_payload, from) => {
      if (!from.local && from.seat !== 0) return;
      latestRef.current.facilitatorDeployLateActor();
    });
    // v160: facilitator "push my view to all screens". The payload carries the
    // pusher's current map view (basemap, overlays, vector layer + opacity, and
    // camera). The host applies it to its OWN screen and stamps a fresh nonce on
    // `viewPush`, which rides the next snapshot out to every peer (each applies
    // it exactly once). This is the deliberate counterpart to the per-client map:
    // normally everyone steers their own view; this forces a shared one on demand.
    registerActionHandler("facilitator:pushView", (payload, from) => {
      if (!from.local && from.seat !== 0) return;
      const vp = payload || {};
      if (vp.baseMap !== undefined) setBaseMap(vp.baseMap === "basemap_illum" ? "annual_illum" : vp.baseMap);
      if (vp.activeOverlaysArr !== undefined) setActiveOverlays(new Set(vp.activeOverlaysArr));
      if (vp.activeVectorOverlaysArr !== undefined) setActiveVectorOverlays(new Set(vp.activeVectorOverlaysArr));
      if (vp.vectorOverlay !== undefined) setVectorOverlay(vp.vectorOverlay);
      if (vp.vectorOverlayOpacity !== undefined) setVectorOverlayOpacity(vp.vectorOverlayOpacity);
      if (vp.viewport !== undefined && vp.viewport) setViewport(v => ({ ...v, ...vp.viewport }));
      setViewPush({ nonce: Date.now() + Math.random(), ...vp });
    });
    // v161: god-mode overrides (seat 0 / host only).
    registerActionHandler("facilitator:adjustBudget", ({ targets, delta, set }, from) => {
      if (!from.local && from.seat !== 0) return;
      latestRef.current.godAdjustBudget(targets, { delta, set });
    });
    registerActionHandler("facilitator:adjustScore", ({ targets, delta, set }, from) => {
      if (!from.local && from.seat !== 0) return;
      latestRef.current.godAdjustScore(targets, { delta, set });
    });
    registerActionHandler("facilitator:addAsset", ({ pi, type }, from) => {
      if (!from.local && from.seat !== 0) return;
      if (pi !== 0 && pi !== 1) return;
      latestRef.current.godAddAsset(pi, type);
    });
    registerActionHandler("facilitator:removeAsset", ({ pi, kind }, from) => {
      if (!from.local && from.seat !== 0) return;
      if (pi !== 0 && pi !== 1) return;
      latestRef.current.godRemoveAsset(pi, kind);
    });
    registerActionHandler("facilitator:announce", ({ text, targets, title }, from) => {
      if (!from.local && from.seat !== 0) return;
      latestRef.current.godAnnounce(text, targets, title);
    });
    registerActionHandler("facilitator:maintain", ({ targets, op }, from) => {
      if (!from.local && from.seat !== 0) return;
      latestRef.current.godMaintenance(targets, op);
    });
    // v167: negotiation. Deal propose/respond/withdraw are actor-or-facilitator;
    // proposing is gated to the proposer's own seat (or facilitator).
    registerActionHandler("deal:propose", ({ from: pf, give, want }, from) => {
      if (!from.local && from.seat !== 0 && from.seat !== pf + 1) return;
      latestRef.current.proposeDeal(pf, give, want);
    });
    registerActionHandler("deal:respond", ({ dealId, accept, responder }, from) => {
      // Only the recipient (or facilitator) may respond.
      if (!from.local && from.seat !== 0 && from.seat !== responder + 1) return;
      latestRef.current.respondToDeal(dealId, accept);
    });
    registerActionHandler("deal:withdraw", ({ dealId }, from) => {
      if (!from.local && from.seat === undefined) return;
      latestRef.current.withdrawDeal(dealId);
    });
    registerActionHandler("player:setZoneScale", ({ pi, scale }, from) => {
      if (!from.local && from.seat !== 0 && from.seat !== pi + 1) return;
      latestRef.current.setZoneScale(pi, scale);
    });
    registerActionHandler("player:setTierScale", ({ pi, tier, scale }, from) => {
      if (!from.local && from.seat !== 0 && from.seat !== pi + 1) return;
      latestRef.current.setTierScale(pi, tier, scale);
    });
    registerActionHandler("player:setRingMag", ({ pi, mag }, from) => {
      if (!from.local && from.seat !== 0 && from.seat !== pi + 1) return;
      latestRef.current.setRingMag(pi, mag);
    });
    registerActionHandler("player:setStance", ({ pi, presetKey }, from) => {
      if (!from.local && from.seat !== 0 && from.seat !== pi + 1) return;
      latestRef.current.setStanceFor(pi, presetKey);
    });
    registerActionHandler("player:setEasement", ({ pi, grantTo, on }, from) => {
      if (!from.local && from.seat !== 0 && from.seat !== pi + 1) return;
      latestRef.current.setEasement(pi, grantTo, on);
    });
    // Facilitator-only world overrides.
    registerActionHandler("facilitator:setGrid", ({ grid, mode }, from) => {
      if (!from.local && from.seat !== 0) return;
      latestRef.current.setGridMode(grid, mode);
    });
    registerActionHandler("facilitator:setStance", ({ targets, presetKey }, from) => {
      if (!from.local && from.seat !== 0) return;
      latestRef.current.setStanceFor(targets, presetKey);
    });
    registerActionHandler("facilitator:setZoneScale", ({ targets, scale }, from) => {
      if (!from.local && from.seat !== 0) return;
      latestRef.current.setZoneScale(targets, scale);
    });
    registerActionHandler("facilitator:setTierScale", ({ targets, tier, scale }, from) => {
      if (!from.local && from.seat !== 0) return;
      latestRef.current.setTierScale(targets, tier, scale);
    });
    registerActionHandler("facilitator:adjustIce", ({ targets, delta, set }, from) => {
      if (!from.local && from.seat !== 0) return;
      latestRef.current.godAdjustIce(targets, { delta, set });
    });
    registerActionHandler("facilitator:setTreatyFloor", ({ targets, value }, from) => {
      if (!from.local && from.seat !== 0) return;
      latestRef.current.setTreatyFloor(targets, value);
    });
    // Actor inject response: apply the chosen deltas to the actor's player state.
    registerActionHandler("inject:respond", ({ pi, deltas, choiceLabel, injectLabel }, from) => {
      if (!seatCanActAs(from.seat, pi)) return;
      const setter = pi === 0 ? setP1 : setP2;
      // v101: resolve a "counterpart" restriction target to the other actor's
      // index before applying, since the responder (pi) knows who that is.
      let appliedDeltas = deltas;
      if (deltas?.restriction?.with === "counterpart") {
        appliedDeltas = { ...deltas, restriction: { ...deltas.restriction, with: pi === 0 ? 1 : 0 } };
      }
      setter(p => p ? applyInjectDeltas(p, appliedDeltas) : p);
      // v153: the OST walk-back inject now moves a tracked treaty floor (see
      // applyInjectDeltas). Surface the new stage in the mission log so the
      // table can see the non-appropriation norm fray in real time, computed
      // the same way applyInjectDeltas does, off the actor's current floor.
      if (appliedDeltas?.treatyErosion !== undefined) {
        const curFloor = (pi === 0 ? p1 : p2)?.treatyFloor;
        const newFloor = erodeTreatyFloor(curFloor, appliedDeltas.treatyErosion);
        appendMissionLog({
          type: "policy", actor: pi + 1,
          label: `P${pi + 1}: treaty floor ${appliedDeltas.treatyErosion > 0 ? "slips" : "recommitted"} \u2014 now ${treatyStage(newFloor)} (${newFloor.toFixed(2)})`,
        });
      }
      // v129 (roadmap: intertemporal disposal). A choice may dump an externality
      // on the OTHER actor -- e.g. cheap satellite disposal whose debris fouls a
      // future user's exploration zone. counterpartDelta is applied to the other
      // actor's player state, so the cost lands on whoever inherits the region,
      // not on the actor who saved money by crashing it.
      if (deltas?.counterpartDelta) {
        const otherPi = pi === 0 ? 1 : 0;
        const otherSetter = otherPi === 0 ? setP1 : setP2;
        otherSetter(op => op ? applyInjectDeltas(op, deltas.counterpartDelta) : op);
        appendMissionLog({
          type: "policy", actor: otherPi + 1,
          label: `P${otherPi + 1} inherits an externality from P${pi + 1}'s choice${deltas.counterpartDelta.scoreAdj ? `: ${deltas.counterpartDelta.scoreAdj > 0 ? "+" : ""}${deltas.counterpartDelta.scoreAdj} score` : ""}`,
        });
      }
      // v134 (roadmap: orbit layer integration). If the choice crash-disposes an
      // orbital object, drop a REAL surface debris keep-out zone (via the orbit
      // module) at the target -- the spatial realization of the externality. A
      // "counterpart" target lands it on the other actor's base region (the
      // future user's ground); otherwise on the responder's own base.
      if (deltas?.dropsDebris) {
        const target = deltas.dropsDebris.target === "counterpart"
          ? (pi === 0 ? p2 : p1)
          : (pi === 0 ? p1 : p2);
        const tx = target?.base?.x ?? W / 2;
        const ty = target?.base?.y ?? H / 2;
        const sat = makeOrbitalObject({ owner: pi, kind: "comsat", massT: deltas.dropsDebris.massT ?? 4, groundX: tx, groundY: ty });
        const { surfaceZone } = disposeOrbitalObject(sat, { mode: "crash", targetX: tx, targetY: ty });
        if (surfaceZone) {
          setOrbitalDebris(d => [...d, { ...surfaceZone, decayRounds: 8 }]);
          appendMissionLog({
            type: "policy", actor: pi + 1,
            label: `P${pi + 1} crash-disposed a satellite · debris keep-out (${(surfaceZone.r * MAP_KM_PER_PX).toFixed(1)} km) left on the surface`,
          });
        }
      }
      // v90/v123 (item 5): surface the scored consequence AND its reason in the
      // mission record. Every inject response now logs why the score did or did
      // not move: the chosen response, and the explicit point delta (or that the
      // choice was deliberately score-neutral).
      const why = choiceLabel ? ` ("${choiceLabel}"${injectLabel ? ` to ${injectLabel}` : ""})` : "";
      if (deltas?.scoreAdj) {
        appendMissionLog({
          type: "policy", actor: pi + 1,
          label: `P${pi + 1} inject response${why}: ${deltas.scoreAdj > 0 ? "+" : ""}${deltas.scoreAdj} score`,
        });
      } else {
        appendMissionLog({
          type: "policy", actor: pi + 1,
          label: `P${pi + 1} inject response${why}: no score change`,
        });
      }
      // v101: note an imposed forced-action state in the log.
      if (deltas?.restriction) {
        appendMissionLog({
          type: "policy", actor: pi + 1,
          label: `P${pi + 1} ${deltas.restriction.label || "restriction"} for ${deltas.restriction.turns} turns`,
        });
      }
    });
    // v27: dep array slimmed to only the truly stable values. All
    // user-facing state and functions are read at call time through
    // latestRef.current (synced every render above), so this effect
    // re-runs only when isHost or the multiplayer connection itself
    // changes -- not on every render.
  }, [isHost, mp, registerActionHandler]);


  const exportMissionData = () => {
    // v178: full-reconstruction export, a single multi-section CSV detailed
    // enough to rebuild the game (initial conditions, crater reference, per-asset
    // inventory with placement timing, longitudinal metrics, per-round rover
    // trace + crater state, and the complete structured event log), not just the
    // end-state metric series.
    const tickTrace = Array.from(tickTraceRef.current.values())
      .filter(t => t.globalDay <= globalDay)
      .sort((a, b) => a.globalDay - b.globalDay);
    const csv = buildReconstructionCsv({
      round, day, globalDay, totalRounds,
      simMode, scenarioPreset, version: APP_VERSION,
      p1, p2, history, missionLog,
      powerGridState, commsGridState, claimR, physOverrides,
      tickTrace,
    });
    const blob = new Blob([csv], { type: "text/csv" });
    downloadBlob(blob, `lunar_policy_sandbox_reconstruction_R${round}D${day}.csv`);
  };

  // v22: workshop round-summary export. Produces a human-readable plain-
  // text card for the CURRENT round -- who built what, who's in blackout,
  // who has active violations, scoring deltas. Facilitators can paste
  // into chat, project on a slide, or hand out as a post-round artifact.
  const exportRoundSummary = () => {
    // v27: pure text-building logic extracted to src/sim/exports.js. App.jsx
    // is responsible only for collecting the inputs and triggering the
    // download. The pure helper has no React dependencies and can be unit-
    // tested with fixture player states (TODO: add a snapshot test).
    const text = buildRoundSummaryText({
      round, day, globalDay,
      p1, p2,
      activeViolations,
      missionLog,
    });
    const blob = new Blob([text], { type: "text/plain" });
    downloadBlob(blob, `lunar_policy_R${round}_summary.txt`);
  };

  const exportStateJSON = () => {
    // v27: pure object-building extracted to src/sim/exports.js. App.jsx
    // is responsible only for collecting the inputs and triggering the
    // download.
    const data = buildMissionStateJson({
      round, day, globalDay, totalRounds, simMode,
      p1, p2,
      history, missionLog, annotations,
      powerGridState,
      cratersTotal: CRATER_DATA.length,
      craterHealth,
      physOverrides,
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    downloadBlob(blob, `psr_mission_state_R${round}.json`);
  };

  const reset = () => {
    setUndoStack([]);
    setPhase(PHASE.SETTINGS); setP1(null); setP2(null);
    setCraterHealth(new Float32Array(CRATER_DATA.length).fill(1.0));
    setRound(1); setDay(0); setGlobalDay(0); setHistory([]);
    setOrbitalDebris([]);
    setClaimR([80,80]); setSelectingFor(null); setPlacingFor(null); setPlacingType(null);
    setActiveTurn(0); setP1Done(false); setP2Done(false); setLastEvents([]);
    setSelectedBuild([null, null]);
    setSelectedDiplomacy([null, null]);
    setSelectedPad([0, 0]);
    setSelectedRover([0, 0]);
    setPowerGridState({ mode:"independent", offeredBy:null, offeredTo:null });
    setBatchRunning(false);
    setBatchProgress({ completed:0, total:batchRunCount, currentSeed:null });
    setBatchResult(null);
    setReplayRun(null);
    setReplayFrameIndex(0);
    setReplayPlaying(false);
    setReplayLoading(false);
    setLiveTimeline([]);
    liveTimelineKeyRef.current = "";
    setShowPlots(false);
    setSeparatePlotsOpen({});
    setMissionLog([]); setAnnotations([]); setAnnotating(false); setAnnotNote("");
    tickTraceRef.current = new Map(); // v179: fresh per-day reconstruction trace
    setClaims([]); // v181: clear the claims board
    setAutoAdvance(false); setShowLog(false); setShowParams(false); setShowAnalytics(false);
  };

  // v107: makeSeededRng, isMapDepleted, clonePlayerState, and structureCounts
  // were extracted to src/sim/playerState.js (pure + unit-tested) and are now
  // imported at the top of this file. The thin scorePlayerState alias below
  // still wraps the canonical economy.js implementation.

  function scorePlayerState(player) {
    // v27: the canonical implementation lives in src/sim/economy.js as a
    // pure function. This local binding is kept as a thin alias for any
    // remaining call sites; future cleanup can replace direct calls with
    // the import.
    return scorePlayerStatePure(player);
  }


  // v27: shared core for snapshotSimState (reads from a sim object) and
  // snapshotLiveFrame (reads from React state). Both produced identical
  // shapes; one helper makes maintenance easier.
  // v108: buildSnapshot and getUndoSegmentKey extracted to src/sim/snapshot.js
  // (pure + unit-tested) and imported at the top of this file.

  function snapshotSimState(sim) {
    return buildSnapshot({
      round: sim.round, day: sim.day, globalDay: sim.globalDay,
      claimR: sim.claimR, powerGridState: sim.powerGridState,
      p1: sim.p1, p2: sim.p2,
      craterHealth: sim.craterHealth,
      history: sim.history,
      missionLogLength: (sim.missionLog || []).length,
      phase: sim.phase,
    });
  }

  function snapshotLiveFrame() {
    return buildSnapshot({
      round, day, globalDay,
      claimR, powerGridState,
      p1, p2,
      craterHealth,
      history,
      missionLogLength: missionLog.length,
      phase,
    });
  }

  function applyFrameSnapshot(frame, logSource = []) {
    if (!frame) return;
    setP1(clonePlayerState(frame.p1));
    setP2(clonePlayerState(frame.p2));
    setCraterHealth(new Float32Array(frame.craterHealth || []));
    setRound(frame.round);
    setDay(frame.day);
    setGlobalDay(frame.globalDay);
    setClaimR([...(frame.claimR || [80, 80])]);
    setPowerGridState({ ...(frame.powerGridState || { mode:"independent", offeredBy:null, offeredTo:null }) });
    setHistory(frame.history || []);
    setLastEvents([]);
    // v27: missionLog is sliced from logSource (replay's full log) and then
    // setMissionLog assigns the result. Each setMissionLog(prev => [...prev,
    // newEntry]) append later creates a new array, so the sliced result we
    // pass here stays stable. Don't deep-clone the slice -- share reference.
    setMissionLog((logSource || []).slice(0, frame.logLength || 0));
    setPhase(frame.phase === PHASE.DONE ? PHASE.DONE : PHASE.PLAYING);
  }

  function captureUndoSnapshot() {
    return {
      segmentKey: getUndoSegmentKeyPure({ phase, round, day, globalDay, activeTurn, p1Done, p2Done }),
      phase,
      p1: clonePlayerState(p1),
      p2: clonePlayerState(p2),
      craterHealth: Array.from(craterHealth || []),
      round,
      day,
      globalDay,
      // v27: history is append-only (see setHistory at line ~3092 which
      // uses [...h, newEntry]) and entries are never mutated, so we can
      // share the reference. Same rationale as missionLog + lastEvents.
      history,
      claimR: [...claimR],
      activeTurn,
      p1Done,
      p2Done,
      selectingFor,
      placingFor,
      placingType,
      selectedRover: [...selectedRover],
      addingWaypoint,
      // v27: lastEvents is replaced (not mutated in place) on each turn
      // by setLastEvents(events), and pushInjectEntry appends via spread.
      // Reference share is safe -- same rationale as missionLog above.
      lastEvents,
      selectedBuild: [...selectedBuild],
      selectedDiplomacy: [...selectedDiplomacy],
      selectedPad: [...selectedPad],
      powerGridState: { ...powerGridState },
      // v27: was `missionLog.map(ev => ({ ...ev }))` and the same for
      // annotations. Both arrays are append-only -- entries are pushed via
      // [...prev, newEntry], never mutated in place. So we can save the
      // reference cheaply. The undo "restore" path uses setMissionLog
      // (snapshot.missionLog) which becomes the live state; any future
      // appends spread onto a new array, leaving the snapshot's array
      // intact. With ~50 undo entries and missionLog growing to 500+
      // events in a long workshop session, the old deep-clone path was
      // doing ~25k shallow clones per checkpoint. Now zero.
      missionLog,
      annotations,
    };
  }

  function applyUndoSnapshot(snapshot) {
    if (!snapshot) return;
    setPhase(snapshot.phase);
    setP1(clonePlayerState(snapshot.p1));
    setP2(clonePlayerState(snapshot.p2));
    setCraterHealth(new Float32Array(snapshot.craterHealth || []));
    setRound(snapshot.round);
    setDay(snapshot.day);
    setGlobalDay(snapshot.globalDay);
    setHistory(snapshot.history || []);
    setClaimR([...(snapshot.claimR || [80, 80])]);
    setActiveTurn(snapshot.activeTurn ?? 0);
    setP1Done(!!snapshot.p1Done);
    setP2Done(!!snapshot.p2Done);
    setSelectingFor(snapshot.selectingFor ?? null);
    setPlacingFor(snapshot.placingFor ?? null);
    setPlacingType(snapshot.placingType ?? null);
    setSelectedRover([...(snapshot.selectedRover || [0, 0])]);
    setAddingWaypoint(!!snapshot.addingWaypoint);
    setLastEvents(snapshot.lastEvents || []);
    setSelectedBuild([...(snapshot.selectedBuild || [null, null])]);
    setSelectedDiplomacy([...(snapshot.selectedDiplomacy || [null, null])]);
    setSelectedPad([...(snapshot.selectedPad || [0, 0])]);
    setPowerGridState({ ...(snapshot.powerGridState || { mode:"independent", offeredBy:null, offeredTo:null }) });
    // v27: was `(snapshot.missionLog || []).map(ev => ({ ...ev }))` and the
    // same for annotations. Both arrays are append-only on the live side
    // (entries are pushed via [...prev, newEntry], never mutated). So we
    // can pass the reference directly to setX without re-cloning. The
    // snapshot itself was also captured by reference (see captureUndo).
    setMissionLog(snapshot.missionLog || []);
    setAnnotations(snapshot.annotations || []);
  }

  const exportSaveGame = () => {
    const snapshot = captureUndoSnapshot();
    const data = {
      format: "psr-savegame-v2",
      savedAt: new Date().toISOString(),
      config: { simMode, totalRounds, missionEndMode, arrivalDelay, scenarioPreset,
                gridSharingEnabled, gridSharingPermanent, actorRoles },
      snapshot,
      liveTimeline: liveTimeline.map(({ __key, ...frame }) => frame),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    downloadBlob(blob, `psr_save_R${round}D${globalDay + 1}.json`);
  };

  const importSaveGame = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data?.snapshot) { alert("Invalid save file: missing snapshot data."); return; }
        const cfg = data.config || {};
        if (cfg.simMode)               setSimMode(cfg.simMode);
        if (cfg.totalRounds)           setTotalRounds(cfg.totalRounds);
        if (cfg.missionEndMode)        setMissionEndMode(cfg.missionEndMode);
        if (cfg.arrivalDelay != null)  setArrivalDelay(cfg.arrivalDelay);
        if (cfg.scenarioPreset)        setScenarioPreset(cfg.scenarioPreset);
        if (cfg.actorRoles)            setActorRoles(cfg.actorRoles);
        if (cfg.gridSharingEnabled != null) setGridSharingEnabled(cfg.gridSharingEnabled);
        if (cfg.gridSharingPermanent != null) setGridSharingPermanent(cfg.gridSharingPermanent);
        setUndoStack([]);
        setReplayRun(null);
        setReplayFrameIndex(0);
        setReplayPlaying(false);
        if (Array.isArray(data.liveTimeline) && data.liveTimeline.length > 0) {
          setLiveTimeline(data.liveTimeline);
          liveTimelineKeyRef.current = "";
        }
        applyUndoSnapshot(data.snapshot);
      } catch (err) {
        alert(`Failed to load save file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // v27: cap the undo stack to prevent unbounded memory growth during long
  // workshop sessions. Each snapshot includes deep-cloned player state,
  // craterHealth (a Float32Array), history, and missionLog -- a few MB each.
  // 50 is plenty for any realistic "I want to take that back" depth; older
  // snapshots get rolled off the bottom.
  const UNDO_STACK_LIMIT = 50;

  const recordUndoCheckpoint = () => {
    if (replayRun || batchRunning || phase === PHASE.SETTINGS || phase === PHASE.BATCH) return;
    const snapshot = captureUndoSnapshot();
    setUndoStack(prev => {
      if (prev[prev.length - 1]?.segmentKey === snapshot.segmentKey) return prev;
      const next = [...prev, snapshot];
      if (next.length > UNDO_STACK_LIMIT) return next.slice(-UNDO_STACK_LIMIT);
      return next;
    });
  };

  const undoLastTurn = () => {
    if (replayRun || batchRunning) return;
    const snapshot = undoStack[undoStack.length - 1];
    if (!snapshot) return;
    applyUndoSnapshot(snapshot);
    setUndoStack(prev => prev.slice(0, -1));
  };

  // v27: removed dead functions `countNearbyEnemyStructuresState` and
  // `applyPureReactorPlacementPenalty` (counted nearby enemy structures but
  // discarded the result). The batch-sim reactor-placement path now uses
  // the same pure-noop hook as the live sim -- see onReactorPlacement above.
  // Reactor emplacement intentionally deals no landing damage; ongoing
  // damage from in-zone reactors is handled by per-turn applyDecay().

  function applyPureLandingImpact(players, actorIdx, lx, ly) {
    const nextPlayers = players.map(p => clonePlayerState(p));
    const enemyIdx = actorIdx === 0 ? 1 : 0;
    const enemyP = nextPlayers[enemyIdx];
    const actorP = nextPlayers[actorIdx];
    if (!enemyP || !actorP) return nextPlayers;
    const eSh = { ...(enemyP.structureHealth || {}) };
    const eLists = {
      panels: enemyP.panels || [],
      reactors: enemyP.reactors || [],
      habitats: enemyP.habitats || [],
      extraRovers: enemyP.extraRovers || [],
      landingPads: enemyP.landingPads || [],
    };
    const typeFor = { panels:"solar", reactors:"reactor", habitats:"habitat", extraRovers:"rover", landingPads:"pad" };
    // v164: mirror the live dust-suppression rule, the victim's functional pads
    // shield assets in their apron.
    const padApron = SAFETY_RADIUS.pad;
    const victimPads = (enemyP.landingPads || []).filter(
      (_pd, i) => (enemyP.structureHealth?.landingPads?.[i] ?? 1.0) > 0.1
    );
    for (const k of Object.keys(eLists)) {
      const arr = [...(eSh[k] || eLists[k].map(() => 1.0))];
      const radius = SAFETY_RADIUS[typeFor[k]];
      for (let ei = 0; ei < eLists[k].length; ei++) {
        const before = arr[ei] ?? 1.0;
        if (before <= 0) continue;
        if (dist({ x: lx, y: ly }, eLists[k][ei]) < radius) {
          const mit = victimPads.some(pd => dist(eLists[k][ei], pd) < padApron) ? (1 - PAD_DUST_MITIGATION) : 1;
          arr[ei] = Math.max(0, before - LANDING_DAMAGE * mit);
        }
      }
      eSh[k] = arr;
    }
    nextPlayers[enemyIdx] = { ...enemyP, structureHealth: eSh };
    // v27: removed dead `if (totalDamage > 0) nextPlayers[actorIdx] = { ...actorP }`.
    // The actor object was already cloned at the top via `nextPlayers.map(p =>
    // clonePlayerState(p))`, and nothing in this function mutates the actor.
    // The conditional shallow-spread reassignment was a no-op (likely a
    // tombstone from an earlier design where landings credited the attacker
    // with damage points; see also the dead `setSelf` in the live landingImpact
    // counterpart that was removed in an earlier session).
    return nextPlayers;
  }

  function findBestIllumSiteNear(x, y, maxRadius = Math.ceil(SAFETY_RADIUS.solar) + 2) {
    const cacheKey = `${Math.round(x)},${Math.round(y)},${maxRadius}`;
    const hit = _illumCacheGet(_illumCacheBest, cacheKey);
    if (hit) return { ...hit }; // copy so callers can't corrupt the cache
    let best = { x: Math.round(x), y: Math.round(y), illum: 0 };
    for (let dy = -maxRadius; dy <= maxRadius; dy++) {
      for (let dx = -maxRadius; dx <= maxRadius; dx++) {
        const nx = Math.round(x + dx), ny = Math.round(y + dy);
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > maxRadius) continue;
        const illum = ILLUM_MAP[ny * W + nx] || 0;
        if (illum > best.illum) best = { x: nx, y: ny, illum };
      }
    }
    _illumCacheSet(_illumCacheBest, cacheKey, best);
    return { ...best };
  }

  function getCraterClusterScore(ci) {
    const c = CRATER_DATA[ci];
    if (!c) return 0;
    let score = c.size / 18;
    for (let oi = 0; oi < CRATER_DATA.length; oi++) {
      if (oi === ci) continue;
      const other = CRATER_DATA[oi];
      const dist = Math.hypot(c.cx - other.cx, c.cy - other.cy);
      if (dist > 120) continue;
      score += (other.size / 45) / Math.max(1, dist / 20);
    }
    return score;
  }

  function chooseStartCrater(otherBase, rng) {
    const ranked = CRATER_DATA.map((crater, ci) => {
      const illum = findBestIllumSiteNear(crater.cx, crater.cy, 10).illum;
      const cluster = getCraterClusterScore(ci);
      const otherPenalty = otherBase ? Math.max(0, 30 - Math.hypot(crater.cx - otherBase.x, crater.cy - otherBase.y)) * 2 : 0;
      return {
        ci,
        score: crater.size / 10 + cluster + illum * 60 - otherPenalty,
      };
    }).sort((a, b) => b.score - a.score);
    const top = ranked.slice(0, Math.min(12, ranked.length));
    const weighted = top.map((item, idx) => ({
      ...item,
      pickWeight: Math.max(1, item.score - idx * 6 + rng() * 10),
    }));
    const totalWeight = weighted.reduce((sum, item) => sum + item.pickWeight, 0);
    let roll = rng() * Math.max(1, totalWeight);
    for (const item of weighted) {
      roll -= item.pickWeight;
      if (roll <= 0) return item.ci;
    }
    return weighted[0]?.ci ?? ranked[0]?.ci ?? 0;
  }

  function chooseBasePositionForCrater(craterIdx, rng) {
    const crater = CRATER_DATA[craterIdx];
    if (!crater) return snapToPSR(W / 2, H / 2);
    const jitter = 3 + Math.floor(rng() * 5);
    const dx = Math.round((rng() - 0.5) * jitter * 2);
    const dy = Math.round((rng() - 0.5) * jitter * 2);
    return snapToPSR(crater.cx + dx, crater.cy + dy);
  }

  function findTopIllumSitesNear(x, y, radius, limit = 8) {
    const cacheKey = `${Math.round(x)},${Math.round(y)},${radius},${limit}`;
    const hit = _illumCacheGet(_illumCacheTop, cacheKey);
    if (hit) return hit.map(s => ({ ...s }));
    const candidates = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = Math.round(x + dx), ny = Math.round(y + dy);
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
        const illum = ILLUM_MAP[ny * W + nx] ?? 0;
        candidates.push({ x:nx, y:ny, illum, dist });
      }
    }
    const top = candidates
      .sort((a, b) => b.illum - a.illum || a.dist - b.dist)
      .slice(0, limit);
    _illumCacheSet(_illumCacheTop, cacheKey, top);
    return top.map(s => ({ ...s }));
  }

  function jitterToward(crater, site, rng, minDist = 2, maxDist = 7) {
    const angle = rng() * Math.PI * 2;
    const d = minDist + rng() * (maxDist - minDist);
    const raw = {
      x: Math.round(site.x + Math.cos(angle) * d),
      y: Math.round(site.y + Math.sin(angle) * d),
    };
    const clamped = {
      x: clamp(raw.x, 0, W - 1),
      y: clamp(raw.y, 0, H - 1),
    };
    return dist(clamped, crater) < maxDist + 10 ? clamped : { x:site.x, y:site.y };
  }

  function chooseHubPlanForCrater(craterIdx, rng) {
    const crater = CRATER_DATA[craterIdx];
    if (!crater) return { habitatTarget:{ x:W/2, y:H/2 }, generatorType:"reactor", generatorTarget:{ x:W/2, y:H/2 } };
    const illumChoices = findTopIllumSitesNear(crater.cx, crater.cy, Math.ceil(SAFETY_RADIUS.solar) + 16, 10);
    const weighted = illumChoices
      .map((site, idx) => ({
        ...site,
        rankScore: (site.illum * 100) - site.dist * 1.4 - idx * 1.2 + (rng() - 0.5) * 8,
      }))
      .sort((a, b) => b.rankScore - a.rankScore);
    const site = weighted[Math.floor(rng() * Math.min(4, weighted.length || 1))] || { x:crater.cx, y:crater.cy, illum:0 };
    const habitatTarget = jitterToward(crater, site, rng, 2, 8);
    const generatorTarget = { x:site.x, y:site.y };
    const padTarget = jitterToward(crater, habitatTarget, rng, 8, 16);
    return {
      habitatTarget,
      generatorType: "solar",
      generatorTarget,
      padTarget,
      fallbackReactorTarget: { x: crater.cx, y: crater.cy },
      illumScore: site.illum,
    };
  }

  function updateSimPlayer(sim, pi, updater) {
    const key = pi === 0 ? "p1" : "p2";
    return { ...sim, [key]: updater(sim[key]) };
  }

  function getBotHub(player) {
    if (!player) return null;
    const habs = player.habitats || [];
    const habHealths = player.structureHealth?.habitats || [];
    // v27: was returning habitats[0] unconditionally -- could route the
    // bot's rovers to a destroyed habitat where deposits fail silently.
    // Now picks the first functional habitat (health > 0); only falls
    // through to the planned hub-plan target / base when all habitats
    // are destroyed.
    const firstFunctional = habs.find((_, i) => (habHealths[i] ?? 1.0) > 0);
    if (firstFunctional) return firstFunctional;
    return player.botMemory?.hubPlan?.habitatTarget || player.base;
  }

  function getAllRoverStates(player) {
    if (!player) return [];
    return [
      { roverIdx:0, rover:player },
      ...((player.extraRovers || []).map((rover, idx) => ({ roverIdx:idx + 1, rover }))),
    ];
  }

  function getRechargeCoverageScore(player, point) {
    if (!player || !point) return 0;
    const generators = [
      ...(player.panels || []).map(p => ({ ...p, kind:"solar" })),
      ...(player.reactors || []).map(r => ({ ...r, kind:"reactor" })),
    ];
    let score = 0;
    for (const generator of generators) {
      if (dist(generator, point) <= SAFETY_RADIUS[generator.kind]) {
        score += generator.kind === "reactor" ? 2.5 : 1;
      }
    }
    return score;
  }

  function chooseExpansionPlan(sim, actor, rng) {
    if (!actor) return null;
    const roverEntries = getAllRoverStates(actor);
    const weakestRover = roverEntries
      .map(entry => ({ ...entry, power: entry.rover.power ?? POWER_CAP }))
      .sort((a, b) => a.power - b.power)[0];
    const ranked = selectOperationalCraters(sim, actor, weakestRover?.rover ? { x:weakestRover.rover.x, y:weakestRover.rover.y } : getBotHub(actor));
    const targetCraterIdx = ranked[0]?.ci ?? actor.botMemory?.homeCraterIdx;
    const crater = CRATER_DATA[targetCraterIdx];
    if (!crater) return null;
    const illumChoices = findTopIllumSitesNear(crater.cx, crater.cy, Math.ceil(SAFETY_RADIUS.solar) + 20, 12);
    const pick = illumChoices[Math.floor(rng() * Math.min(5, illumChoices.length || 1))] || { x:crater.cx, y:crater.cy, illum:0 };
    const solarTarget = { x:pick.x, y:pick.y };
    const habitatTarget = jitterToward(crater, pick, rng, 2, 9);
    const padTarget = jitterToward(crater, habitatTarget, rng, 10, 18);
    return { craterIdx:targetCraterIdx, solarTarget, habitatTarget, padTarget, illum:pick.illum };
  }

  function tryBotPurchase(sim, pi, type, target, opts = {}) {
    const nextSim = buildHeadlessStructure(sim, pi, type, target, opts);
    return nextSim;
  }

  function estimateTravelPowerCost(d, ice = 0, carrying = false) {
    const loadFactor = Math.min(3.0, 1.0 + (ice / 100) + (carrying ? 0.5 : 0));
    return POWER_BASE_DRAIN + POWER_MOVE_DRAIN * (d / Math.max(1, ROVER_STEP)) * loadFactor;
  }

  function getPendingPickupTarget(player, roverPos) {
    if (!player) return null;
    const pads = player.landingPads || [];
    const pending = player.pendingDeliveries || [];
    if (!pads.length || !pending.length) return null;
    // v27: skip destroyed pads. simDay won't pick up at a destroyed pad
    // (its health check correctly bails out), so routing a rover to one
    // is wasted travel. Better to route to a different pad if available.
    const padHealths = player.structureHealth?.landingPads || [];
    const grouped = pending
      .map(item => {
        const pad = pads[item.padIdx];
        const padHealthy = pad && (padHealths[item.padIdx] ?? 1.0) > 0;
        return {
          item, pad,
          dist: padHealthy ? dist(roverPos, pad) : Infinity,
          padHealthy,
        };
      })
      .filter(entry => entry.padHealthy)
      .sort((a, b) => a.dist - b.dist);
    return grouped[0]?.pad || null;
  }

  function pointInGeneratorCoverage(targets, point) {
    if (!point) return false;
    return (targets || []).some(target => dist(point, target) <= SAFETY_RADIUS[target.kind]);
  }

  function getRoverState(player, roverIdx) {
    return roverIdx === 0 ? player : (player.extraRovers || [])[roverIdx - 1];
  }

  function setRoverWaypointForPlayer(player, roverIdx, target) {
    if (!player || !target) return player;
    const waypoint = { x: Math.round(target.x), y: Math.round(target.y) };
    if (roverIdx === 0) {
      return { ...player, waypoints:[waypoint], currentWaypoint:null };
    }
    const extraRovers = [...(player.extraRovers || [])];
    const rover = extraRovers[roverIdx - 1];
    if (!rover) return player;
    extraRovers[roverIdx - 1] = { ...rover, waypoints:[waypoint], currentWaypoint:null };
    return { ...player, extraRovers };
  }

  function buildHeadlessStructure(sim, pi, type, target, opts = {}) {
    const players = [clonePlayerState(sim.p1), clonePlayerState(sim.p2)];
    const player = players[pi];
    if (!player) return sim;
    const pads = player.landingPads || [];
    const padFree = hasPlacementGrace(player.arrivalDay, sim.globalDay) || type === "pad" || opts.forceDirect === true;
    if (pads.length === 0 && !padFree && type !== "rover") return sim;
    const { costs } = calcAssetCosts(player.alloc || ALLOC_PRESETS[DEFAULT_PRESET_KEY].alloc, player?.stakeholderId, { padCount: functionalPadCount(player) });
    const cost = costs[type] ?? 999;
    const maxes = { solar: MAX_PANELS, reactor: MAX_REACTORS, habitat: MAX_HABITATS, rover: MAX_ROVERS, pad: MAX_PADS };
    const counts = {
      solar: player.panels.length,
      reactor: (player.reactors || []).length,
      habitat: (player.habitats || []).length,
      rover: (player.extraRovers || []).length,
      pad: (player.landingPads || []).length,
    };
    if ((counts[type] ?? 0) >= (maxes[type] ?? Infinity)) return sim;
    if ((player.budget ?? 0) < cost) return sim;

    let nextPlayer = clonePlayerState(player);
    nextPlayer.budget = (nextPlayer.budget ?? 0) - cost;
    nextPlayer.assetPts = (nextPlayer.assetPts ?? 0) + (ASSET_POINTS[type] ?? 0);

    if (type === "rover") {
      nextPlayer.extraRovers = [
        ...(nextPlayer.extraRovers || []),
        { x: nextPlayer.base.x, y: nextPlayer.base.y, waypoints:[], currentWaypoint:null, ice:0, carrying:null, status:"idle", power:POWER_CAP },
      ];
      nextPlayer.structureHealth = {
        ...nextPlayer.structureHealth,
        extraRovers: [...(nextPlayer.structureHealth?.extraRovers || []), 1.0],
      };
      players[pi] = nextPlayer;
      const impacted = applyPureLandingImpact(players, pi, nextPlayer.base.x, nextPlayer.base.y);
      return { ...sim, p1: impacted[0], p2: impacted[1], nextId: sim.nextId + 1 };
    }

    if (padFree) {
      const placed = { x: Math.round(target.x), y: Math.round(target.y) };
      if (type === "solar") {
        nextPlayer.panels = [...nextPlayer.panels, { ...placed, onRidge: RIDGE_MASK[placed.y * W + placed.x] === 1 }];
        nextPlayer.structureHealth = { ...nextPlayer.structureHealth, panels: [...(nextPlayer.structureHealth?.panels || []), 1.0] };
      } else if (type === "reactor") {
        nextPlayer.reactors = [...(nextPlayer.reactors || []), placed];
        nextPlayer.structureHealth = { ...nextPlayer.structureHealth, reactors: [...(nextPlayer.structureHealth?.reactors || []), 1.0] };
      } else if (type === "habitat") {
        nextPlayer.habitats = [...(nextPlayer.habitats || []), placed];
        nextPlayer.habitatPower = [...(nextPlayer.habitatPower || []), HABITAT_POWER_INIT];
        nextPlayer.structureHealth = { ...nextPlayer.structureHealth, habitats: [...(nextPlayer.structureHealth?.habitats || []), 1.0] };
      } else if (type === "pad") {
        nextPlayer.landingPads = [...(nextPlayer.landingPads || []), placed];
        nextPlayer.structureHealth = { ...nextPlayer.structureHealth, landingPads: [...(nextPlayer.structureHealth?.landingPads || []), 1.0] };
      }
      players[pi] = nextPlayer;
      if (type === "reactor") {
        // Reactor placement deals no landing damage (see onReactorPlacement).
        return { ...sim, p1: players[0], p2: players[1], nextId: sim.nextId + 1 };
      }
      const impacted = applyPureLandingImpact(players, pi, placed.x, placed.y);
      return { ...sim, p1: impacted[0], p2: impacted[1], nextId: sim.nextId + 1 };
    }

    const padIdx = Math.min(opts.padIdx ?? 0, Math.max(0, pads.length - 1));
    nextPlayer.pendingDeliveries = [
      ...(nextPlayer.pendingDeliveries || []),
      { id: sim.nextId, type, padIdx, target: target ? { x: Math.round(target.x), y: Math.round(target.y) } : null },
    ];
    players[pi] = nextPlayer;
    return { ...sim, p1: players[0], p2: players[1], nextId: sim.nextId + 1 };
  }

  function ensureBotInitialSetup(sim, pi) {
    let nextSim = sim;
    let actor = pi === 0 ? nextSim.p1 : nextSim.p2;
    if (!actor) return nextSim;
    const hubPlan = actor.botMemory?.hubPlan;
    if (!hubPlan) return nextSim;

    if ((actor.landingPads || []).length === 0 && (actor.budget ?? 0) >= BASE_ASSET_COSTS.pad) {
      nextSim = buildHeadlessStructure(nextSim, pi, "pad", hubPlan.padTarget || actor.base, { forceDirect:true });
      actor = pi === 0 ? nextSim.p1 : nextSim.p2;
    }
    if ((actor.habitats || []).length === 0) {
      nextSim = buildHeadlessStructure(nextSim, pi, "habitat", hubPlan.habitatTarget, { forceDirect:true });
      actor = pi === 0 ? nextSim.p1 : nextSim.p2;
    }
    if (((actor.reactors || []).length + actor.panels.length) === 0) {
      nextSim = buildHeadlessStructure(nextSim, pi, hubPlan.generatorType, hubPlan.generatorTarget, { forceDirect:true });
      actor = pi === 0 ? nextSim.p1 : nextSim.p2;
    }
    if ((1 + ((actor.extraRovers || []).length)) < 2 && hubPlan.generatorType === "solar" && (actor.budget ?? 0) >= BASE_ASSET_COSTS.rover) {
      nextSim = buildHeadlessStructure(nextSim, pi, "rover", actor.base);
    }
    return updateSimPlayer(nextSim, pi, p => ({
      ...p,
      botMemory: {
        ...(p.botMemory || {}),
        initialSetupDone: (p.landingPads || []).length > 0 && (p.habitats || []).length > 0 && (((p.reactors || []).length + (p.panels || []).length) > 0),
      },
    }));
  }

  function getAccessibleRechargeTargets(sim, pi) {
    const actor = pi === 0 ? sim.p1 : sim.p2;
    const other = pi === 0 ? sim.p2 : sim.p1;
    if (!actor) return [];
    const shared = sim.powerGridState.mode === "shared";
    const sourcePlayers = shared && other ? [actor, other] : [actor];
    const targets = [];
    for (const source of sourcePlayers) {
      (source.panels || []).forEach((panel, idx) => {
        if ((source.structureHealth?.panels?.[idx] ?? 1.0) <= 0) return;
        targets.push({ x:panel.x, y:panel.y, kind:"solar", ownerId:source.id });
      });
      (source.reactors || []).forEach((reactor, idx) => {
        if ((source.structureHealth?.reactors?.[idx] ?? 1.0) <= 0) return;
        targets.push({ x:reactor.x, y:reactor.y, kind:"reactor", ownerId:source.id });
      });
    }
    return targets;
  }

  function getHostileZoneCountAtPoint(enemy, point, sharedGridActive) {
    if (!enemy || !point) return 0;
    const structures = [
      { list: enemy.habitats || [], type:"habitat", healths: enemy.structureHealth?.habitats || [] },
      { list: enemy.landingPads || [], type:"pad", healths: enemy.structureHealth?.landingPads || [] },
      { list: enemy.extraRovers || [], type:"rover", healths: enemy.structureHealth?.extraRovers || [] },
      ...(sharedGridActive ? [] : [
        { list: enemy.panels || [], type:"solar", healths: enemy.structureHealth?.panels || [] },
        { list: enemy.reactors || [], type:"reactor", healths: enemy.structureHealth?.reactors || [] },
      ]),
    ];
    let count = 0;
    for (const { list, type, healths } of structures) {
      list.forEach((struct, idx) => {
        if ((healths[idx] ?? 1.0) <= 0) return;
        if (dist(point, struct) < SAFETY_RADIUS[type]) count++;
      });
    }
    return count;
  }

  function estimateSharedGridBenefit(receiver, donor) {
    if (!receiver || !donor) return 0;
    const targets = [
      { x: receiver.x, y: receiver.y },
      ...(receiver.extraRovers || []).map(r => ({ x:r.x, y:r.y })),
      ...(receiver.habitats || []).map(h => ({ x:h.x, y:h.y })),
    ];
    const generators = [
      ...(donor.panels || []).map(p => ({ ...p, kind:"solar" })),
      ...(donor.reactors || []).map(r => ({ ...r, kind:"reactor" })),
    ];
    let count = 0;
    for (const target of targets) {
      if (generators.some(g => dist(g, target) <= SAFETY_RADIUS[g.kind])) count++;
    }
    return count;
  }

  function applyHeadlessDiplomacyDecision(sim, pi, action) {
    if (!sim.allowGridSharing) return sim;
    const players = [clonePlayerState(sim.p1), clonePlayerState(sim.p2)];
    const actor = players[pi];
    const other = players[pi === 0 ? 1 : 0];
    if (!actor || !other || !action) return sim;
    const actorId = pi + 1;
    const otherId = actorId === 1 ? 2 : 1;
    let powerGrid = { ...sim.powerGridState };
    const flags = { ...(sim.batchFlags || {}) };
    const keepReplayData = sim.keepReplayData !== false;
    if (action === "open" && powerGrid.mode !== "shared") {
      powerGrid = { mode:"offered", offeredBy: actorId, offeredTo: otherId };
      actor.scoreAdjustments = (actor.scoreAdjustments ?? 0) + 30;
      flags.offers = (flags.offers || 0) + 1;
      return {
        ...sim,
        p1: players[0],
        p2: players[1],
        powerGridState: powerGrid,
        batchFlags: flags,
        missionLog: keepReplayData ? [...(sim.missionLog || []), { round:sim.round, day:sim.day, globalDay:sim.globalDay, type:"grid", label:`P${actorId} opened its power grid to P${otherId}` }] : (sim.missionLog || []),
      };
    }
    if (action === "join" && powerGrid.mode === "offered" && powerGrid.offeredTo === actorId) {
      powerGrid = { mode:"shared", offeredBy: powerGrid.offeredBy, offeredTo: actorId };
      actor.scoreAdjustments = (actor.scoreAdjustments ?? 0) + 20;
      flags.joins = (flags.joins || 0) + 1;
      return {
        ...sim,
        p1: players[0],
        p2: players[1],
        powerGridState: powerGrid,
        batchFlags: flags,
        missionLog: keepReplayData ? [...(sim.missionLog || []), { round:sim.round, day:sim.day, globalDay:sim.globalDay, type:"grid", label:`P${actorId} joined P${powerGrid.offeredBy}'s power grid` }] : (sim.missionLog || []),
      };
    }
    if (action === "decouple" && powerGrid.mode === "shared" && !sim.permanentGridSharing) {
      powerGrid = { mode:"independent", offeredBy:null, offeredTo:null };
      actor.scoreAdjustments = (actor.scoreAdjustments ?? 0) - 20;
      flags.decouples = (flags.decouples || 0) + 1;
      return {
        ...sim,
        p1: players[0],
        p2: players[1],
        powerGridState: powerGrid,
        batchFlags: flags,
        missionLog: keepReplayData ? [...(sim.missionLog || []), { round:sim.round, day:sim.day, globalDay:sim.globalDay, type:"grid", label:`P${actorId} decoupled the shared power grid` }] : (sim.missionLog || []),
      };
    }
    return sim;
  }

  function selectOperationalCraters(sim, player, roverPos) {
    const anchor = getBotHub(player);
    const enemy = player?.id === 1 ? sim.p2 : sim.p1;
    const sharedGridActive = sim.powerGridState.mode === "shared";
    const homeCraterIdx = player?.botMemory?.homeCraterIdx ?? PIXEL_CRATER[Math.round(player.base.y) * W + Math.round(player.base.x)];
    const ranked = CRATER_DATA.map((crater, ci) => {
      const health = sim.craterHealth?.[ci] ?? 1.0;
      if (health <= 0.08) return null;
      const distHub = Math.max(1, dist(anchor, crater));
      const distRover = Math.max(1, dist(roverPos, crater));
      const distEnemy = enemy ? dist(enemy.base, crater) : distHub + 10;
      const illum = findBestIllumSiteNear(crater.cx, crater.cy, 8).illum;
      const hazard = getHostileZoneCountAtPoint(enemy, crater, sharedGridActive);
      const score = (health * crater.size * 2.5) / (10 + distHub * 0.8 + distRover * 0.4)
        + (distEnemy - distHub) * 0.08
        + illum * 18
        - hazard * 18
        + (ci === homeCraterIdx ? 15 : 0);
      return { ci, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    return ranked;
  }

  function chooseBotDiplomacyAction(sim, pi) {
    const actor = pi === 0 ? sim.p1 : sim.p2;
    const other = pi === 0 ? sim.p2 : sim.p1;
    if (!sim.allowGridSharing || !actor || !other) return null;
    const selfBenefit = estimateSharedGridBenefit(actor, other);
    const otherBenefit = estimateSharedGridBenefit(other, actor);
    const actorGenerators = (actor.panels || []).length + (actor.reactors || []).length;
    if (sim.powerGridState.mode === "shared") {
      if (sim.permanentGridSharing) return null;
      if (otherBenefit - selfBenefit >= 2) return "decouple";
      return null;
    }
    if (sim.powerGridState.mode === "offered") {
      if (sim.powerGridState.offeredTo === actor.id && (selfBenefit >= 1 || actorGenerators === 0)) {
        return "join";
      }
      return null;
    }
    if (actorGenerators > 0 && otherBenefit >= 1) {
      if (actor.id === 1 || scorePlayerState(actor) >= scorePlayerState(other) - 25) {
        return "open";
      }
    }
    return null;
  }

  function planBotTurn(sim, pi, rng) {
    let nextSim = sim;
    const player = pi === 0 ? nextSim.p1 : nextSim.p2;
    if (!player || player.active === false || nextSim.globalDay < (player.arrivalDay ?? 0)) return nextSim;

    if (!player.botMemory?.initialized) {
      const homeCraterIdx = PIXEL_CRATER[Math.round(player.base.y) * W + Math.round(player.base.x)];
      const hubPlan = chooseHubPlanForCrater(homeCraterIdx, rng);
      nextSim = updateSimPlayer(nextSim, pi, p => ({
        ...p,
        botMemory: { ...(p.botMemory || {}), initialized:true, homeCraterIdx, hubPlan },
      }));
    }

    const updatedPlayer = pi === 0 ? nextSim.p1 : nextSim.p2;
    const action = chooseBotDiplomacyAction(nextSim, pi);
    if (action) nextSim = applyHeadlessDiplomacyDecision(nextSim, pi, action);

    let actor = pi === 0 ? nextSim.p1 : nextSim.p2;
    const roverEntries = getAllRoverStates(actor);
    const weakestRover = roverEntries
      .map(entry => ({ ...entry, power: entry.rover.power ?? POWER_CAP, ice: entry.rover.ice ?? 0 }))
      .sort((a, b) => a.power - b.power || b.ice - a.ice)[0];
    const expansionPlan = chooseExpansionPlan(nextSim, actor, rng);
    const roverCount = getAllRoverStates(actor).length;
    const generatorCount = (actor.panels || []).length + (actor.reactors || []).length;
    const habitatCount = (actor.habitats || []).length;
    const effectiveDemand = roverCount + habitatCount;

    if (!actor.botMemory?.initialSetupDone || (actor.habitats || []).length === 0 || (((actor.reactors || []).length + actor.panels.length) === 0)) {
      nextSim = ensureBotInitialSetup(nextSim, pi);
      actor = pi === 0 ? nextSim.p1 : nextSim.p2;
    } else if ((actor.landingPads || []).length === 0 && (actor.budget ?? 0) >= BASE_ASSET_COSTS.pad) {
      nextSim = buildHeadlessStructure(nextSim, pi, "pad", actor.botMemory?.hubPlan?.padTarget || actor.base, { forceDirect: hasPlacementGrace(actor.arrivalDay, nextSim.globalDay) });
      actor = pi === 0 ? nextSim.p1 : nextSim.p2;
    }

    if ((actor.reactors || []).length === 0 && (actor.landingPads || []).length > 0 && (actor.budget ?? 0) >= (BASE_ASSET_COSTS.reactor + 30)) {
      const lowIllumHub = (actor.botMemory?.hubPlan?.illumScore ?? 0) < 0.48;
      const reactorNeed = lowIllumHub || (actor.panels || []).length >= Math.max(3, (actor.habitats || []).length + 1);
      if (nextSim.round >= 4 && reactorNeed) {
        nextSim = buildHeadlessStructure(nextSim, pi, "reactor", actor.botMemory?.hubPlan?.fallbackReactorTarget || getBotHub(actor));
        actor = pi === 0 ? nextSim.p1 : nextSim.p2;
      }
    }

    const panelTarget = Math.max(2, roverCount + (actor.habitats || []).length - ((actor.reactors || []).length * 2));
    const expansionNeed = expansionPlan && getRechargeCoverageScore(actor, expansionPlan.habitatTarget) < 1.4;
    if (expansionNeed && (actor.budget ?? 0) >= BASE_ASSET_COSTS.solar && (actor.panels || []).length < panelTarget) {
      nextSim = tryBotPurchase(nextSim, pi, "solar", expansionPlan.solarTarget, { forceDirect: hasPlacementGrace(actor.arrivalDay, nextSim.globalDay) });
      actor = pi === 0 ? nextSim.p1 : nextSim.p2;
    }
    if (expansionPlan && generatorCount > effectiveDemand && (actor.habitats || []).length < Math.max(2, Math.ceil(roverCount / 2)) && (actor.budget ?? 0) >= BASE_ASSET_COSTS.habitat && nextSim.round >= 3) {
      const farFromHub = dist(expansionPlan.habitatTarget, getBotHub(actor)) > SAFETY_RADIUS.habitat * 0.7;
      if (farFromHub) {
        nextSim = tryBotPurchase(nextSim, pi, "habitat", expansionPlan.habitatTarget, { forceDirect: hasPlacementGrace(actor.arrivalDay, nextSim.globalDay) });
        actor = pi === 0 ? nextSim.p1 : nextSim.p2;
      }
    }
    if ((actor.landingPads || []).length < 2 && generatorCount > effectiveDemand && expansionPlan && (actor.budget ?? 0) >= BASE_ASSET_COSTS.pad && nextSim.round >= 3) {
      const farPad = dist(expansionPlan.padTarget, getBotHub(actor)) > SAFETY_RADIUS.pad * 0.8;
      if (farPad) {
        nextSim = tryBotPurchase(nextSim, pi, "pad", expansionPlan.padTarget, { forceDirect: hasPlacementGrace(actor.arrivalDay, nextSim.globalDay) });
        actor = pi === 0 ? nextSim.p1 : nextSim.p2;
      }
    }
    if (generatorCount > effectiveDemand && (1 + (actor.extraRovers || []).length) < Math.min(4, (actor.habitats || []).length + 2) && (actor.budget ?? 0) >= BASE_ASSET_COSTS.rover && (((actor.reactors || []).length + actor.panels.length) > 0)) {
      nextSim = buildHeadlessStructure(nextSim, pi, "rover", actor.base);
      actor = pi === 0 ? nextSim.p1 : nextSim.p2;
    }

    const totalRovers = 1 + ((actor.extraRovers || []).length);
    for (let roverIdx = 0; roverIdx < totalRovers; roverIdx++) {
      actor = pi === 0 ? nextSim.p1 : nextSim.p2;
      const rover = getRoverState(actor, roverIdx);
      if (!rover) continue;
      const roverPos = { x: rover.x, y: rover.y };
      const roverPower = rover.power ?? actor.power ?? POWER_CAP;
      const roverIce = rover.ice ?? actor.ice ?? 0;
      const pendingPickup = getPendingPickupTarget(actor, roverPos);
      const rechargeTargets = getAccessibleRechargeTargets(nextSim, pi);
      const enemy = pi === 0 ? nextSim.p2 : nextSim.p1;
      const sharedGridActive = nextSim.powerGridState.mode === "shared";
      const inRechargeZone = pointInGeneratorCoverage(rechargeTargets, roverPos);
      const nearestRecharge = rechargeTargets
        .map(target => {
          const hazard = getHostileZoneCountAtPoint(enemy, target, sharedGridActive);
          const foreignPenalty = target.ownerId !== actor.id ? (roverPower < POWER_LOW * 0.35 ? 4 : 18) : 0;
          const hazardPenalty = hazard * (roverPower < POWER_LOW * 0.35 ? 8 : 48);
          const powerBias = target.kind === "reactor" ? -10 : 0;
          return { ...target, score: dist(roverPos, target) + foreignPenalty + hazardPenalty + powerBias };
        })
        .sort((a, b) => a.score - b.score)[0];
      const nearestRechargeDist = nearestRecharge ? dist(roverPos, nearestRecharge) : Infinity;
      const rechargeReserve = nearestRecharge ? estimateTravelPowerCost(nearestRechargeDist, roverIce, !!rover.carrying) + 14 : POWER_LOW * 2.2;
      const departureFloor = Math.max(POWER_CAP * 0.82, rechargeReserve + 16);
      if (rover.carrying?.target) {
        nextSim = updateSimPlayer(nextSim, pi, p => setRoverWaypointForPlayer(p, roverIdx, rover.carrying.target));
        continue;
      }
      if (inRechargeZone && roverPower < departureFloor) {
        nextSim = updateSimPlayer(nextSim, pi, p => setRoverWaypointForPlayer(p, roverIdx, nearestRecharge || roverPos));
        continue;
      }
      if (pendingPickup && roverIce <= ICE_CAP * 0.05 && roverPower > rechargeReserve * 1.1) {
        nextSim = updateSimPlayer(nextSim, pi, p => setRoverWaypointForPlayer(p, roverIdx, pendingPickup));
        continue;
      }
      if (nearestRecharge && roverPower <= rechargeReserve) {
        nextSim = updateSimPlayer(nextSim, pi, p => setRoverWaypointForPlayer(p, roverIdx, nearestRecharge));
        continue;
      }
      // v174: 0.3 → 0.5. With the old 800 kg hopper, 30% (240 kg) was never
      // reached at ~0.8 kg/day, so bots never deposited either. The hopper is
      // now 80 kg; 50% (40 kg) fills in roughly a round, so bots run partial
      // loads home on the same cadence as the live auto-router.
      if (roverIce > ICE_CAP * 0.5 && actor.habitats?.length) {
        nextSim = updateSimPlayer(nextSim, pi, p => setRoverWaypointForPlayer(p, roverIdx, getBotHub(p)));
        continue;
      }
      if (roverPower < Math.max(POWER_LOW * 1.6, 38) && nearestRecharge) {
        nextSim = updateSimPlayer(nextSim, pi, p => setRoverWaypointForPlayer(p, roverIdx, nearestRecharge));
        continue;
      }
      const ranked = selectOperationalCraters(nextSim, actor, roverPos);
      const targetCrater = CRATER_DATA[ranked[Math.min(roverIdx, Math.max(0, ranked.length - 1))]?.ci ?? actor.botMemory.homeCraterIdx];
      if (targetCrater) {
        const targetPoint = { x: targetCrater.cx, y: targetCrater.cy };
        const toMine = estimateTravelPowerCost(dist(roverPos, targetPoint), roverIce, !!rover.carrying);
        const toRechargeAfterMine = nearestRecharge ? estimateTravelPowerCost(dist(targetPoint, nearestRecharge), Math.min(ICE_CAP, roverIce + 40), false) : POWER_LOW * 2.5;
        const projectedMineTrip = toMine + toRechargeAfterMine + 14;
        if (nearestRecharge && roverPower <= projectedMineTrip) {
          nextSim = updateSimPlayer(nextSim, pi, p => setRoverWaypointForPlayer(p, roverIdx, nearestRecharge));
        } else {
          nextSim = updateSimPlayer(nextSim, pi, p => setRoverWaypointForPlayer(p, roverIdx, targetPoint));
        }
      }
    }

    return nextSim;
  }

  function resolveHeadlessDay(sim) {
    const keepReplayData = sim.keepReplayData !== false;
    // v205: a headless sim carries its OWN physics overrides (set from the
    // batch/sweep config, including the scenario preset's overrides). Fall
    // back to the live UI state only when none were provided, so the normal
    // in-app batch behaves exactly as before.
    const simPo = (sim.physOverrides && Object.keys(sim.physOverrides).length > 0)
      ? sim.physOverrides : physOverrides;
    const sharedGridActive = sim.powerGridState.mode === "shared";
    const [chargedP1, chargedP2] = allocateDailyPower([sim.p1, sim.p2], sim.globalDay, sharedGridActive);
    const ch = new Float32Array(sim.craterHealth);
    const [np1, _ch2, evs1] = stepPlayer(chargedP1, ch, sim.globalDay, chargedP2, 1, simPo);
    let np2 = sim.p2;
    let ch3 = _ch2;
    let evs2 = [];
    if (sim.p2) {
      [np2, ch3, evs2] = stepPlayer(chargedP2, ch, sim.globalDay, chargedP1, 1, simPo);
      // v27: match the live combined-depletions formula. See applyDay in
      // App.jsx for the rationale (was `Math.min`, which discarded one
      // player's contribution when both mined the same crater).
      for (let i = 0; i < ch3.length; i++) {
        ch3[i] = Math.max(0, Math.min(1, _ch2[i] + ch3[i] - ch[i]));
      }
    }

    // v96: extracted to enemyZones.js applySafetyDecay (was a hand-synced
    // duplicate of the live applyDecay). Both paths now share one tested
    // implementation, so the batch Monte Carlo can never silently drift from
    // live behavior again.
    const applyDecayToOwner = (owner, enemyPositions, attackMil, defenseMil) => {
      const _PASSIVE_DECAY = simPo.PASSIVE_DECAY ?? PASSIVE_DECAY;
      const _HOSTILE_DECAY = simPo.HOSTILE_DECAY ?? HOSTILE_DECAY;
      const defMul = MIL_DEFENSE_SCALE + (1 - MIL_DEFENSE_SCALE) * (1 / Math.max(0.1, defenseMil));
      return applySafetyDecay(owner, enemyPositions, {
        passiveDecay: _PASSIVE_DECAY,
        hostileDecayEff: _HOSTILE_DECAY * attackMil * defMul,
        sharedGridActive,
        countViolations: false, // v160: attributed to the second arriver below
      });
    };

    const mil1 = np1.milScore ?? 1.0;
    const mil2 = np2?.milScore ?? 1.0;
    const p1AllRovers = [{ x: np1.x, y: np1.y }, ...(np1.extraRovers || [])];
    const p2AllRovers = np2 ? [{ x: np2.x, y: np2.y }, ...(np2.extraRovers || [])] : [];
    const { updatedOwner: dnp1, damageDone: dmgByP2 } = sim.p2
      ? applyDecayToOwner(np1, p2AllRovers, mil2, mil1)
      : { updatedOwner: np1, damageDone: 0 };
    const { updatedOwner: dnp2, damageDone: dmgByP1 } = sim.p2
      ? applyDecayToOwner(np2, p1AllRovers, mil1, mil2)
      : { updatedOwner: np2, damageDone: 0 };
    // v160: keep the headless Monte Carlo in lockstep with live scoring, charge
    // violations to whoever arrived second, not to the zone owner.
    if (sim.p2) {
      // v206: governance regimes weight the violation increment (ITU ×2 for
      // the late party, ATCM ×1.5 inspection cost). Same weight in both the
      // live and headless paths so batch results match table play.
      const violationWeight = governanceViolationWeight(sim.governanceId ?? null);
      const { v1, v2 } = attributeSafetyViolations(np1, np2, { sharedGridActive, violationWeight });
      if (v1) dnp1.safetyViolations = (dnp1.safetyViolations ?? 0) + v1;
      if (v2 && dnp2) dnp2.safetyViolations = (dnp2.safetyViolations ?? 0) + v2;
    }
    let fnp1 = { ...dnp1 };
    let fnp2 = dnp2 ? { ...dnp2 } : null;

    // v174: unpowered-habitat penalty, keep the headless Monte Carlo in
    // lockstep with the live path so batch-sim scoring reflects the same cost.
    const uh1 = applyUnpoweredHabitatPenalty(fnp1);
    fnp1 = uh1.player;
    const uh2 = fnp2 ? applyUnpoweredHabitatPenalty(fnp2) : { player: fnp2, events: [] };
    if (fnp2) fnp2 = uh2.player;

    // v206: stranded-rover penalty, a dead rover now costs score per day
    // (the June 13 "we were not penalized enough" fix), same channel as the
    // unpowered-habitat ding.
    const sp1 = applyStrandedRoverPenalty(fnp1);
    fnp1 = sp1.player;
    const sp2 = fnp2 ? applyStrandedRoverPenalty(fnp2) : { player: fnp2, events: [] };
    if (fnp2) fnp2 = sp2.player;
    const rr1 = applyRoverRescue(fnp1, sim.globalDay, POWER_CAP);
    fnp1 = rr1.player;
    const rr2 = fnp2 ? applyRoverRescue(fnp2, sim.globalDay, POWER_CAP) : { player: fnp2, events: [] };
    if (fnp2) fnp2 = rr2.player;

    const events = [
      ...evs1.map(ev => ({ ...ev, actor: 1 })),
      ...evs2.map(ev => ({ ...ev, actor: 2 })),
      ...uh1.events.map(ev => ({ ...ev, actor: 1 })),
      ...uh2.events.map(ev => ({ ...ev, actor: 2 })),
      ...sp1.events.map(ev => ({ ...ev, actor: 1 })),
      ...sp2.events.map(ev => ({ ...ev, actor: 2 })),
      ...rr1.events.map(ev => ({ ...ev, actor: 1 })),
      ...rr2.events.map(ev => ({ ...ev, actor: 2 })),
    ];
    const mined1 = evs1.filter(e => e.type === "mine").map(e => e.craterIdx);
    const mined2 = evs2.filter(e => e.type === "mine").map(e => e.craterIdx);
    const contestedToday = mined1.some(ci => mined2.includes(ci));
    const missionLog = keepReplayData
      ? [
          ...(sim.missionLog || []),
          ...events.map(ev => ({
            round: sim.round, day: sim.day, globalDay: sim.globalDay,
            type: ev.type, actor: ev.actor, roverId: ev.roverId,
            kg: ev.kg, craterIdx: ev.craterIdx, itemType: ev.itemType
          })),
        ]
      : (sim.missionLog || []);

    const newGlobalDay = sim.globalDay + 1;
    const newDay = sim.day + 1;
    let newRound = sim.round;
    let newCR = [...sim.claimR];
    let roundEnded = false;
    let history = keepReplayData ? [...(sim.history || [])] : (sim.history || []);
    let efnp1 = null, efnp2 = null;

    if (newDay >= DAYS_PER_ROUND) {
      const dep1 = evs1.filter(e => e.type === "deposit").reduce((s, e) => s + e.kg, 0);
      const dep2 = evs2.filter(e => e.type === "deposit").reduce((s, e) => s + e.kg, 0);
      newCR[0] = Math.min(220, newCR[0] + Math.min(18, dep1 / 18));
      if (sim.p2) newCR[1] = Math.min(220, newCR[1] + Math.min(18, dep2 / 18));

      const E1 = fnp1.econ ?? E_INIT, E2 = fnp2?.econ ?? E_INIT;
      const T1 = fnp1.assetPts ?? 0, T2 = fnp2?.assetPts ?? 0;
      const M1 = fnp1.milStock ?? 1, M2 = fnp2?.milStock ?? 1;
      const E_max = Math.max(E1, E2), T_max = Math.max(T1, T2), M_max = Math.max(M1, M2);
      const processEconomy = (p, E, T, M) => {
        if (p.active === false) return p;
        const alloc = p.alloc || ALLOC_PRESETS[DEFAULT_PRESET_KEY].alloc;
        const totalPct = (alloc.mil + alloc.rd + alloc.econ + (alloc.budget || 0)) || 1;
        const I_E = alloc.econ / totalPct;
        const I_R = alloc.rd / totalPct;
        const I_M = alloc.mil / totalPct;
        const I_B = (alloc.budget || 0) / totalPct;
        const cMod = p.contentnessMod ?? 0;
        const C = calcCompetitiveness(E, T, M, E_max, T_max, M_max, cMod);
        const decay = p.contentnessDecay ?? 0;
        const newCMod = cMod > 0 ? Math.max(0, cMod - decay) : Math.min(0, cMod + decay);
        const bonusCredits = Math.round(I_B * (p.budget ?? 0));
        const newE = Math.max(0.5, E + calcDeltaE(I_E, C, p.rdAccum ?? 0));
        const newR = Math.max(0, (p.rdAccum ?? 0) + calcDeltaR(I_R, C));
        const newM = Math.max(0.1, M + calcDeltaM(I_M, M));
        const newBudget = Math.max(0, calcBudget(newE) + bonusCredits);
        return { ...p, econ: newE, rdAccum: newR, milStock: newM, milScore: calcMilScore(newM), budget: newBudget, contentnessMod: newCMod, contentnessDecay: Math.abs(newCMod) < 0.001 ? 0 : decay };
      };
      efnp1 = processEconomy(fnp1, E1, T1, M1);
      efnp2 = sim.p2 ? processEconomy(fnp2, E2, T2, M2) : null;

      // v211: per-round timeseries (opt-in via simulateBotGame opts.roundSeries).
      // R6 in the research plan asks whether violations and contestation RISE
      // in late rounds as craters deplete, endpoints can't answer that. Rows
      // carry cumulative counters plus this-round deltas against the previous
      // round's mark, so trend analysis needs no reconstruction.
      if (sim.roundSeries) {
        const bf = sim.batchFlags || {};
        const mark = sim._seriesMark || { vio1:0, vio2:0, ice1:0, ice2:0, contested:0, shared:0, stranded:0 };
        const vio1 = efnp1?.safetyViolations ?? 0, vio2 = efnp2?.safetyViolations ?? 0;
        const ice1 = efnp1?.iceDeposited ?? 0, ice2 = efnp2?.iceDeposited ?? 0;
        const contested = bf.contestedDays || 0, shared = bf.sharedDays || 0;
        const strandedTot = (bf.stranded1 || 0) + (bf.stranded2 || 0);
        const depleted = CRATER_DATA.filter((_, ci) => (ch3[ci] ?? 1) < 0.2).length;
        sim.roundSeries.push({
          r: sim.round,
          vio1: +vio1.toFixed(2), vio2: +vio2.toFixed(2),
          dVio: +((vio1 - mark.vio1) + (vio2 - mark.vio2)).toFixed(2),
          ice1: Math.round(ice1), ice2: Math.round(ice2),
          dIce: Math.round((ice1 - mark.ice1) + (ice2 - mark.ice2)),
          dContested: contested - mark.contested,
          dShared: shared - mark.shared,
          dStranded: strandedTot - mark.stranded,
          depleted,
        });
        sim._seriesMark = { vio1, vio2, ice1, ice2, contested, shared, stranded: strandedTot };
      }
      if (keepReplayData) {
        history = [...history, {
          r: sim.round,
          d1: Math.round(efnp1.iceDeposited),
          d2: Math.round(efnp2?.iceDeposited ?? 0),
          dep1: Math.round(dep1),
          dep2: Math.round(dep2),
          bud1: Math.round(efnp1.budget),
          bud2: Math.round(efnp2?.budget ?? 0),
        }];
      }
      newRound = sim.round + 1;
      roundEnded = true;
    }

    // v205: per-actor operational-failure telemetry for the Monte Carlo.
    // These counters power the per-trial CSV export (deposit-blocked days,
    // stranding-risk warnings, hard strandings, unpowered-habitat days), so
    // batch analysis can quantify the failure modes playtesters flagged in
    // the June 13 debrief ("we were not penalized enough", "ice deposited
    // 0 ... I think that's a bug") and the July 1 call (PSR trapping).
    const countType = (evs, t) => evs.filter(e => e.type === t).length;
    const batchFlags = {
      ...(sim.batchFlags || {}),
      sharedDays: (sim.batchFlags?.sharedDays || 0) + (sharedGridActive ? 1 : 0),
      contestedDays: (sim.batchFlags?.contestedDays || 0) + (contestedToday ? 1 : 0),
      depBlocked1: (sim.batchFlags?.depBlocked1 || 0) + countType(evs1, "deposit_blocked"),
      depBlocked2: (sim.batchFlags?.depBlocked2 || 0) + countType(evs2, "deposit_blocked"),
      strandRisk1: (sim.batchFlags?.strandRisk1 || 0) + countType(evs1, "strand_risk"),
      strandRisk2: (sim.batchFlags?.strandRisk2 || 0) + countType(evs2, "strand_risk"),
      stranded1:   (sim.batchFlags?.stranded1   || 0) + countType(evs1, "stranded"),
      stranded2:   (sim.batchFlags?.stranded2   || 0) + countType(evs2, "stranded"),
      unpowHab1:   (sim.batchFlags?.unpowHab1   || 0) + uh1.events.length,
      unpowHab2:   (sim.batchFlags?.unpowHab2   || 0) + uh2.events.length,
      strandPen1:  (sim.batchFlags?.strandPen1  || 0) + (sp1.count || 0),
      strandPen2:  (sim.batchFlags?.strandPen2  || 0) + (sp2.count || 0),
      rescues1:    (sim.batchFlags?.rescues1    || 0) + rr1.events.length,
      rescues2:    (sim.batchFlags?.rescues2    || 0) + rr2.events.length,
      // v208: stranding CAUSE attribution, from the v207 diagnostic payloads.
      // night → died during the night cycle (charging gap); far → died >60px
      // (~30 km) from any home structure (overrun/route failure); other →
      // in-range daytime death (allocation contention, damaged generators).
      strandNight: (sim.batchFlags?.strandNight || 0)
        + [...evs1, ...evs2].filter(e => e.type === "stranded" && e.night).length,
      strandFar:   (sim.batchFlags?.strandFar   || 0)
        + [...evs1, ...evs2].filter(e => e.type === "stranded" && !e.night && (e.dHome ?? 0) > 60).length,
      strandOther: (sim.batchFlags?.strandOther || 0)
        + [...evs1, ...evs2].filter(e => e.type === "stranded" && !e.night && (e.dHome ?? 0) <= 60).length,
    };

    const depletedOut = isMapDepleted(ch3);
    const fixedOut = sim.missionEndMode === "fixed" && roundEnded && newRound > sim.totalRounds;
    const nextPhase = fixedOut || depletedOut ? PHASE.DONE : PHASE.PLAYING;
    return {
      ...sim,
      p1: roundEnded ? efnp1 : fnp1,
      p2: sim.p2 ? (roundEnded ? efnp2 : fnp2) : null,
      craterHealth: ch3,
      claimR: newCR,
      round: roundEnded ? Math.min(newRound, sim.totalRounds) : sim.round,
      day: roundEnded ? 0 : newDay,
      globalDay: newGlobalDay,
      phase: nextPhase,
      missionLog,
      lastEvents: keepReplayData ? events : [],
      history,
      batchFlags,
    };
  }

  function simulateBotGame(config, seed, opts = {}) {
    const storeReplay = opts.storeReplay !== false;
    const rng = makeSeededRng(seed);
    const p1Crater = chooseStartCrater(null, rng);
    const p1Base = chooseBasePositionForCrater(p1Crater, rng);
    let sim = {
      phase: PHASE.PLAYING,
      keepReplayData: storeReplay,
      totalRounds: config.totalRounds,
      missionEndMode: config.missionEndMode,
      allowGridSharing: config.gridSharingEnabled,
      permanentGridSharing: config.gridSharingPermanent,
      p1: makePlayer(p1Base, 1, PLAYER1_COLOR),
      p2: config.scenarioPreset === "unevenArrival" ? null : makePlayer(chooseBasePositionForCrater(chooseStartCrater(p1Base, rng), rng), 2, PLAYER2_COLOR),
      craterHealth: new Float32Array(CRATER_DATA.length).fill(1.0),
      round: 1,
      day: 0,
      globalDay: 0,
      history: [],
      missionLog: [],
      lastEvents: [],
      claimR: [80, 80],
      powerGridState: { mode:"independent", offeredBy:null, offeredTo:null },
      batchFlags: { offers:0, joins:0, decouples:0, sharedDays:0, contestedDays:0 },
      physOverrides: { ...(config.physOverrides || {}) },
      governanceId: config.governanceId ?? null,
      roundSeries: opts.roundSeries ? [] : null,
      nextId: 1,
    };
    const frames = storeReplay ? [snapshotSimState(sim)] : null;
    const maxDays = config.missionEndMode === "depletion" ? 2500 : config.totalRounds * DAYS_PER_ROUND + 2;

    while (sim.phase !== PHASE.DONE && sim.globalDay < maxDays) {
      if (config.scenarioPreset === "unevenArrival" && !sim.p2 && sim.globalDay >= config.arrivalDelay) {
        const p2Crater = chooseStartCrater(sim.p1?.base, rng);
        const p2Base = chooseBasePositionForCrater(p2Crater, rng);
        sim = {
          ...sim,
          p2: makePlayer(p2Base, 2, PLAYER2_COLOR, { arrivalDay: config.arrivalDelay }),
          missionLog: storeReplay ? [...sim.missionLog, { round:sim.round, day:sim.day, globalDay:sim.globalDay, type:"arrival", label:"P2 arrived and established a base" }] : sim.missionLog,
        };
        if (storeReplay) frames.push(snapshotSimState(sim));
      }
      // v27: symmetric planning. Was previously:
      //     sim = planBotTurn(sim, 0, rng);   // P1 plans
      //     sim = planBotTurn(sim, 1, rng);   // P2 sees P1's just-applied changes
      // This gave P2 a one-turn information advantage in batch sims, since
      // the live game commits both players simultaneously via resolveDay.
      // Now both bots plan against the SAME presim snapshot and we merge
      // each player's resulting slot back together.
      const presim = sim;
      const afterP1 = planBotTurn(presim, 0, rng);
      const afterP2 = planBotTurn(presim, 1, rng);
      // For grid-state diplomacy decisions and per-action counters, fold
      // the deltas from both plans back onto the presim baseline.
      const mergedBatchFlag = (key) => {
        const baseline = presim.batchFlags?.[key] ?? 0;
        const dP1 = (afterP1.batchFlags?.[key] ?? 0) - baseline;
        const dP2 = (afterP2.batchFlags?.[key] ?? 0) - baseline;
        return baseline + dP1 + dP2;
      };
      sim = {
        ...presim,
        p1: afterP1.p1,
        p2: afterP2.p2,
        powerGridState: pickMergedGridState(presim.powerGridState, afterP1.powerGridState, afterP2.powerGridState),
        batchFlags: {
          ...(presim.batchFlags || {}),
          offers:    mergedBatchFlag("offers"),
          joins:     mergedBatchFlag("joins"),
          decouples: mergedBatchFlag("decouples"),
        },
        // Mission-log entries appended by either plan get concatenated.
        missionLog: [
          ...presim.missionLog,
          ...afterP1.missionLog.slice(presim.missionLog.length),
          ...afterP2.missionLog.slice(presim.missionLog.length),
        ],
      };
      sim = resolveHeadlessDay(sim);
      if (storeReplay) frames.push(snapshotSimState(sim));
    }

    const score1 = scorePlayerState(sim.p1);
    const score2 = scorePlayerState(sim.p2);
    const totalMapIce = getTotalMapIce(config.physOverrides);
    const totalExtracted = CRATER_DATA.reduce((sum, crater, ci) => {
      const remaining = sim.craterHealth[ci] ?? 1;
      return sum + (1 - remaining) * getCraterIceCapacity(crater, config.physOverrides?.DEPLETION_RATE);
    }, 0);
    return {
      seed,
      config,
      roundSeries: sim.roundSeries || undefined,
      frames: frames || undefined,
      missionLog: storeReplay ? [...sim.missionLog] : undefined,
      summary: {
        winner: score1 > score2 ? 1 : score2 > score1 ? 2 : 0,
        score1, score2,
        ice1: sim.p1?.iceDeposited ?? 0,
        ice2: sim.p2?.iceDeposited ?? 0,
        ap1: sim.p1?.assetPts ?? 0,
        ap2: sim.p2?.assetPts ?? 0,
        vio1: sim.p1?.safetyViolations ?? 0,
        vio2: sim.p2?.safetyViolations ?? 0,
        counts1: structureCounts(sim.p1),
        counts2: structureCounts(sim.p2),
        depBlocked1: sim.batchFlags.depBlocked1 || 0,
        depBlocked2: sim.batchFlags.depBlocked2 || 0,
        strandRisk1: sim.batchFlags.strandRisk1 || 0,
        strandRisk2: sim.batchFlags.strandRisk2 || 0,
        stranded1: sim.batchFlags.stranded1 || 0,
        stranded2: sim.batchFlags.stranded2 || 0,
        unpowHab1: sim.batchFlags.unpowHab1 || 0,
        unpowHab2: sim.batchFlags.unpowHab2 || 0,
        strandPenDays1: sim.batchFlags.strandPen1 || 0,
        strandPenDays2: sim.batchFlags.strandPen2 || 0,
        rescues1: sim.batchFlags.rescues1 || 0,
        rescues2: sim.batchFlags.rescues2 || 0,
        strandNight: sim.batchFlags.strandNight || 0,
        strandFar: sim.batchFlags.strandFar || 0,
        strandOther: sim.batchFlags.strandOther || 0,
        reserve1: sim.p1?.reserveKg ?? 0,
        reserve2: sim.p2?.reserveKg ?? 0,
        offers: sim.batchFlags.offers || 0,
        joins: sim.batchFlags.joins || 0,
        decouples: sim.batchFlags.decouples || 0,
        sharedDays: sim.batchFlags.sharedDays || 0,
        contestedDays: sim.batchFlags.contestedDays || 0,
        cratersDepleted: CRATER_DATA.filter((_, ci) => (sim.craterHealth[ci] ?? 1) < 0.2).length,
        durationDays: sim.globalDay,
        totalExtracted,
        totalMapIce,
        extractedPct: totalExtracted / Math.max(1, totalMapIce),
      },
    };
  }

  function summarizeBatchRuns(config, runs) {
    const avg = fn => runs.reduce((sum, run) => sum + fn(run), 0) / Math.max(1, runs.length);
    const p1Wins = runs.filter(r => r.summary.winner === 1).length;
    const p2Wins = runs.filter(r => r.summary.winner === 2).length;
    const draws = runs.length - p1Wins - p2Wins;
    return {
      config,
      runs: runs.map(run => ({ seed:run.seed, config:run.config, summary:run.summary })),
      totalRuns: runs.length,
      p1WinRate: p1Wins / Math.max(1, runs.length),
      p2WinRate: p2Wins / Math.max(1, runs.length),
      drawRate: draws / Math.max(1, runs.length),
      avgScore1: avg(r => r.summary.score1),
      avgScore2: avg(r => r.summary.score2),
      avgIce1: avg(r => r.summary.ice1),
      avgIce2: avg(r => r.summary.ice2),
      avgAp1: avg(r => r.summary.ap1),
      avgAp2: avg(r => r.summary.ap2),
      avgVio1: avg(r => r.summary.vio1),
      avgVio2: avg(r => r.summary.vio2),
      avgDepleted: avg(r => r.summary.cratersDepleted),
      avgSharedDays: avg(r => r.summary.sharedDays),
      avgContestedDays: avg(r => r.summary.contestedDays),
      avgExtracted: avg(r => r.summary.totalExtracted),
      avgExtractedPct: avg(r => r.summary.extractedPct),
      totalMapIce: runs[0]?.summary.totalMapIce ?? getTotalMapIce(config.physOverrides),
      avgDepBlocked: avg(r => (r.summary.depBlocked1 ?? 0) + (r.summary.depBlocked2 ?? 0)),
      avgStranded: avg(r => (r.summary.stranded1 ?? 0) + (r.summary.stranded2 ?? 0)),
      avgUnpowHabDays: avg(r => (r.summary.unpowHab1 ?? 0) + (r.summary.unpowHab2 ?? 0)),
      strandRate: runs.filter(r => (r.summary.stranded1 ?? 0) + (r.summary.stranded2 ?? 0) > 0).length / Math.max(1, runs.length),
      depositBlockRate: runs.filter(r => (r.summary.depBlocked1 ?? 0) + (r.summary.depBlocked2 ?? 0) > 0).length / Math.max(1, runs.length),
      offerRate: runs.filter(r => r.summary.offers > 0).length / Math.max(1, runs.length),
      joinRate: runs.filter(r => r.summary.joins > 0).length / Math.max(1, runs.length),
      decoupleRate: runs.filter(r => r.summary.decouples > 0).length / Math.max(1, runs.length),
    };
  }

  function loadReplayFrame(run, frameIdx) {
    const frame = run?.frames?.[frameIdx];
    if (!frame) return;
    setReplayFrameIndex(frameIdx);
    applyFrameSnapshot(frame, run.missionLog || []);
  }

  async function watchReplayRun(run) {
    if (!run) return;
    setUndoStack([]);
    setReplayLoading(true);
    setReplayPlaying(false);
    setSimMode("analysis");
    setScenarioPreset(run.config?.scenarioPreset || "standard");
    setTotalRounds(run.config?.totalRounds || 12);
    setMissionEndMode(run.config?.missionEndMode || "fixed");
    setArrivalDelay(run.config?.arrivalDelay || 5);
    setGridSharingEnabled(run.config?.gridSharingEnabled ?? true);
    setGridSharingPermanent(run.config?.gridSharingPermanent ?? false);
    await new Promise(resolve => setTimeout(resolve, 0));
    const replayData = run.frames ? run : simulateBotGame(run.config, run.seed, { storeReplay:true });
    setReplayRun(replayData);
    loadReplayFrame(replayData, 0);
    setReplayLoading(false);
  }

  function exitReplay() {
    setReplayPlaying(false);
    setReplayRun(null);
    setReplayFrameIndex(0);
    setPhase(PHASE.BATCH);
  }

  async function startBatchRunner() {
    const config = {
      scenarioPreset,
      totalRounds,
      missionEndMode,
      arrivalDelay,
      gridSharingEnabled,
      gridSharingPermanent,
      physOverrides: { ...physOverrides },
      runCount: batchRunCount,
    };
    setBatchRunning(true);
    setUndoStack([]);
    setBatchResult(null);
    setBatchProgress({ completed:0, total:batchRunCount, currentSeed:null });
    setReplayRun(null);
    setReplayPlaying(false);
    setPhase(PHASE.BATCH);
    // v205: deterministic base seed. Research batches must be reproducible:
    // the same settings now always run the same seed sequence, and the seed
    // is recorded per trial in the CSV export. (Was Date.now(), which made
    // every batch unrepeatable.)
    const baseSeed = 0x5EED2026 >>> 0;
    const runs = [];
    for (let i = 0; i < batchRunCount; i++) {
      const seed = (baseSeed + i * 9973) >>> 0;
      setBatchProgress({ completed:i, total:batchRunCount, currentSeed:seed });
      runs.push(simulateBotGame(config, seed));
      if (i % 2 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    const summary = summarizeBatchRuns(config, runs);
    setBatchProgress({ completed:batchRunCount, total:batchRunCount, currentSeed:null });
    setBatchResult(summary);
    setBatchRunning(false);
  }

  // ── v205: Monte Carlo research exports ────────────────────────────────────
  // (1) batchTrialsCsv: one row per trial from the current batch, the raw
  //     material for distributions, not just the on-screen averages.
  // (2) runResearchSweep: run a battery of configs × fixed seeds headlessly
  //     and emit ONE long-format CSV (config columns + per-trial outcomes).
  //     Exposed on window.__runResearchSweep so a headless browser can drive
  //     large batteries and collect the CSV without touching the UI.
  const MC_TRIAL_COLUMNS = [
    "run_id","seed","scenario","total_rounds","mission_end","arrival_delay",
    "grid_sharing","grid_permanent","winner","score1","score2","score_gap",
    "ice1_kg","ice2_kg","ap1","ap2","vio1","vio2",
    "dep_blocked1","dep_blocked2","strand_risk1","strand_risk2",
    "stranded1","stranded2","unpow_hab1","unpow_hab2",
    "offers","joins","decouples","shared_days","contested_days",
    "craters_depleted","duration_days","extracted_kg","extracted_pct",
    "rovers1","rovers2","habitats1","habitats2","reactors1","reactors2",
    "governance","strand_pen_days1","strand_pen_days2","rescues1","rescues2",
    "strand_night","strand_far","strand_other","reserve1_kg","reserve2_kg",
  ];
  function mcTrialRow(runId, run) {
    const s = run.summary, c = run.config;
    return [
      runId, run.seed, c.scenarioPreset, c.totalRounds, c.missionEndMode,
      c.arrivalDelay ?? "", c.gridSharingEnabled ? 1 : 0, c.gridSharingPermanent ? 1 : 0,
      s.winner, s.score1.toFixed(1), s.score2.toFixed(1), (s.score1 - s.score2).toFixed(1),
      s.ice1.toFixed(1), s.ice2.toFixed(1), s.ap1, s.ap2, s.vio1, s.vio2,
      s.depBlocked1 ?? 0, s.depBlocked2 ?? 0, s.strandRisk1 ?? 0, s.strandRisk2 ?? 0,
      s.stranded1 ?? 0, s.stranded2 ?? 0, s.unpowHab1 ?? 0, s.unpowHab2 ?? 0,
      s.offers, s.joins, s.decouples, s.sharedDays, s.contestedDays,
      s.cratersDepleted, s.durationDays, s.totalExtracted.toFixed(1),
      (s.extractedPct * 100).toFixed(2),
      s.counts1?.rovers ?? "", s.counts2?.rovers ?? "",
      s.counts1?.habitats ?? "", s.counts2?.habitats ?? "",
      s.counts1?.reactors ?? "", s.counts2?.reactors ?? "",
      c.governanceId ?? "", s.strandPenDays1 ?? 0, s.strandPenDays2 ?? 0,
      s.rescues1 ?? 0, s.rescues2 ?? 0,
      s.strandNight ?? 0, s.strandFar ?? 0, s.strandOther ?? 0,
      (s.reserve1 ?? 0).toFixed(1), (s.reserve2 ?? 0).toFixed(1),
    ].join(",");
  }
  function batchTrialsCsv(result = batchResult) {
    if (!result?.runs?.length) return "";
    const rows = result.runs.map((run, i) => mcTrialRow(`batch_${i}`, run));
    return [MC_TRIAL_COLUMNS.join(","), ...rows].join("\n");
  }
  function exportBatchTrialsCsv() {
    const csv = batchTrialsCsv();
    if (!csv) return;
    downloadBlob(new Blob([csv], { type:"text/csv" }), `lps_mc_trials_${batchResult.totalRuns}x_${batchResult.config.scenarioPreset}.csv`);
  }

  // The default research battery. Each entry: an id, a config patch over the
  // standard two-actor game, and how many fixed seeds to run. Seeds are
  // deterministic (base 0x5EED2026, stride 9973) so every battery is exactly
  // reproducible and any single trial can be replayed from its seed.
  const RESEARCH_BATTERY = [
    { id:"baseline",      seeds:300, config:{ scenarioPreset:"standard",  totalRounds:12, gridSharingEnabled:true,  gridSharingPermanent:false } },
    { id:"grid_off",      seeds:200, config:{ scenarioPreset:"standard",  totalRounds:12, gridSharingEnabled:false, gridSharingPermanent:false } },
    { id:"grid_perm",     seeds:200, config:{ scenarioPreset:"standard",  totalRounds:12, gridSharingEnabled:true,  gridSharingPermanent:true  } },
    { id:"cooperative",   seeds:200, config:{ scenarioPreset:"nocombat",  totalRounds:12, gridSharingEnabled:true  } },
    { id:"atcm",          seeds:200, config:{ scenarioPreset:"atcm",      totalRounds:16, gridSharingEnabled:true  } },
    { id:"itu",           seeds:200, config:{ scenarioPreset:"itu",       totalRounds:12, gridSharingEnabled:true  } },
    { id:"strategic_res", seeds:200, config:{ scenarioPreset:"strategic_reserve", totalRounds:20, gridSharingEnabled:true } },
    { id:"first_mover",   seeds:300, config:{ scenarioPreset:"sprint",    totalRounds:4,  gridSharingEnabled:true  } },
    { id:"arrival_d2",    seeds:150, config:{ scenarioPreset:"unevenArrival", totalRounds:20, arrivalDelay:2,  gridSharingEnabled:true } },
    { id:"arrival_d5",    seeds:150, config:{ scenarioPreset:"unevenArrival", totalRounds:20, arrivalDelay:5,  gridSharingEnabled:true } },
    { id:"arrival_d10",   seeds:150, config:{ scenarioPreset:"unevenArrival", totalRounds:20, arrivalDelay:10, gridSharingEnabled:true } },
    { id:"arrival_d20",   seeds:150, config:{ scenarioPreset:"unevenArrival", totalRounds:20, arrivalDelay:20, gridSharingEnabled:true } },
    { id:"long_horizon",  seeds:150, config:{ scenarioPreset:"longhaul",  totalRounds:20, gridSharingEnabled:true } },
  ];
  const MC_ROUND_COLUMNS = [
    "battery_id","run_id","seed","round","vio1","vio2","d_vio","ice1","ice2",
    "d_ice","d_contested","d_shared","d_stranded","craters_depleted",
  ];
  async function runResearchSweep(battery = RESEARCH_BATTERY, opts = {}) {
    const baseSeed = (opts.baseSeed ?? 0x5EED2026) >>> 0;
    const rows = [ ["battery_id", ...MC_TRIAL_COLUMNS].join(",") ];
    const roundRows = opts.timeseries ? [ MC_ROUND_COLUMNS.join(",") ] : null;
    const total = battery.reduce((s, b) => s + b.seeds, 0);
    let done = 0;
    setBatchRunning(true);
    setBatchProgress({ completed:0, total, currentSeed:null });
    for (const entry of battery) {
      // Merge the scenario preset's physics overrides (e.g. the Cooperative
      // regime's HOSTILE_DECAY:0) exactly as the live setup screen does when
      // a preset is clicked, the pilot sweep proved that skipping this makes
      // "cooperative", "itu", and "standard" run byte-identical trials.
      const preset = getScenarioPreset(entry.config.scenarioPreset);
      const config = {
        missionEndMode: "fixed", arrivalDelay: 5,
        gridSharingEnabled: true, gridSharingPermanent: false,
        governanceId: governanceIdForPreset(preset),
        ...entry.config,
        physOverrides: {
          ...(preset?.overrides || {}),
          ...(opts.physOverrides || {}),
          ...(entry.config.physOverrides || {}),
        },
        runCount: entry.seeds,
      };
      for (let i = 0; i < entry.seeds; i++) {
        const seed = (baseSeed + i * 9973) >>> 0;
        const run = simulateBotGame(config, seed, { storeReplay:false, roundSeries: !!opts.timeseries });
        rows.push([entry.id, mcTrialRow(`${entry.id}_${i}`, run)].join(","));
        if (roundRows && run.roundSeries) {
          for (const rr of run.roundSeries) {
            roundRows.push([entry.id, `${entry.id}_${i}`, seed, rr.r, rr.vio1, rr.vio2,
              rr.dVio, rr.ice1, rr.ice2, rr.dIce, rr.dContested, rr.dShared,
              rr.dStranded, rr.depleted].join(","));
          }
        }
        done++;
        if (done % 10 === 0) {
          setBatchProgress({ completed:done, total, currentSeed:seed });
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    }
    setBatchProgress({ completed:total, total, currentSeed:null });
    setBatchRunning(false);
    const csv = rows.join("\n");
    if (opts.download !== false) {
      downloadBlob(new Blob([csv], { type:"text/csv" }), `lps_research_sweep_${total}trials.csv`);
      if (roundRows) {
        downloadBlob(new Blob([roundRows.join("\n")], { type:"text/csv" }), `lps_round_series_${total}trials.csv`);
      }
    }
    return roundRows ? { trialsCsv: csv, roundsCsv: roundRows.join("\n") } : csv;
  }
  // Headless hooks: a driving browser can call these directly.
  useEffect(() => {
    window.__runResearchSweep = runResearchSweep;
    window.__mcTrialsCsv = batchTrialsCsv;
    window.__RESEARCH_BATTERY = RESEARCH_BATTERY;
    return () => {
      delete window.__runResearchSweep;
      delete window.__mcTrialsCsv;
      delete window.__RESEARCH_BATTERY;
    };
  });

  const waitForPaint = async (frames = 2) => {
    for (let i = 0; i < frames; i++) {
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
    }
  };

  const gridStatusLabel = (gridState) => {
    if (gridState?.mode === "shared") return "GRID SHARED";
    if (gridState?.mode === "offered" && gridState?.offeredBy && gridState?.offeredTo) {
      return `GRID OFFER P${gridState.offeredBy}\u2192P${gridState.offeredTo}`;
    }
    return "GRID INDEPENDENT";
  };

  const infrastructureInline = (player) => {
    const counts = structureCounts(player);
    return `🏠×${counts.habitats} ☀×${counts.panels} ☢×${counts.reactors} 🚗×${counts.rovers} 🛬×${counts.pads}`;
  };

  const padNum = (value, width=4) => String(Math.round(value ?? 0)).padStart(width, " ");

  const composeGifFrame = (frame) => {
    const mapCanvas = canvasRef.current;
    const composed = document.createElement("canvas");
    composed.width = W;
    composed.height = H + GIF_OVERLAY_HEIGHT;
    const ctx = composed.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, composed.width, composed.height);
    ctx.drawImage(mapCanvas, 0, 0, W, H);

    const overlayY = H;
    ctx.fillStyle = "#0B0918";
    ctx.fillRect(0, overlayY, W, GIF_OVERLAY_HEIGHT);
    ctx.strokeStyle = "rgba(90,140,200,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, overlayY + 0.5);
    ctx.lineTo(W, overlayY + 0.5);
    ctx.stroke();

    const p1Frame = frame.p1;
    const p2Frame = frame.p2;
    const score1Frame = Math.round(scorePlayerState(p1Frame));
    const score2Frame = Math.round(scorePlayerState(p2Frame));
    const totalMapIce = getTotalMapIce(physOverrides);
    const totalExtracted = CRATER_DATA.reduce((sum, crater, ci) => {
      const remaining = frame.craterHealth?.[ci] ?? 1;
      return sum + getCraterIceCapacity(crater, physOverrides.DEPLETION_RATE ?? DEPLETION_RATE) * (1 - remaining);
    }, 0);
    const extractionPct = (totalExtracted / Math.max(1, totalMapIce)) * 100;
    const leftMaxWidth = W - 250;
    const p2ArrivalDays = scenarioPreset === "unevenArrival" && !p2Frame && frame.globalDay < arrivalDelay
      ? Math.max(0, arrivalDelay - frame.globalDay)
      : null;

    ctx.textBaseline = "top";
    ctx.font = "12px 'Spectral', 'Bricolage Grotesque', monospace";
    ctx.fillStyle = "#8B86B0";
    ctx.fillText("OVERLAP MISSION SNAPSHOT", 14, overlayY + 8, leftMaxWidth);

    ctx.font = "14px 'Bricolage Grotesque', monospace";
    ctx.fillStyle = "#A8A8F0";
    ctx.fillText(
      `P1 ${padNum(score1Frame, 5)} | ICE ${padNum(p1Frame?.iceDeposited, 4)}kg | VIO ${padNum(p1Frame?.safetyViolations, 2)} | ${infrastructureInline(p1Frame)}`,
      14,
      overlayY + 28,
      leftMaxWidth,
    );
    ctx.fillStyle = "#C0B8E8";
    ctx.fillText(
      `P2 ${padNum(score2Frame, 5)} | ICE ${padNum(p2Frame?.iceDeposited, 4)}kg | VIO ${padNum(p2Frame?.safetyViolations, 2)} | ${infrastructureInline(p2Frame)}`,
      14,
      overlayY + 48,
      leftMaxWidth,
    );

    ctx.textAlign = "right";
    ctx.fillStyle = "#C0B8E8";
    ctx.fillText(`EXTRACTED ${padNum(totalExtracted, 5)} / ${padNum(totalMapIce, 5)} kg`, W - 14, overlayY + 8);
    ctx.fillText(`MAP DEPLETION ${String(extractionPct.toFixed(1)).padStart(5, " ")}%`, W - 14, overlayY + 28);
    ctx.fillText(gridStatusLabel(frame.powerGridState), W - 14, overlayY + 48);

    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.font = "13px 'Bricolage Grotesque', monospace";
    ctx.fillStyle = "rgba(230,245,255,0.92)";
    const stamp = `R${frame.round} • D${frame.day + 1}/${DAYS_PER_ROUND} • DAY ${frame.globalDay + 1}`;
    const stampW = ctx.measureText(stamp).width;
    const boxW = stampW + 16;
    const boxH = 24;
    const boxX = W - boxW - 12;
    const boxY = H - boxH - 10;
    ctx.fillStyle = "rgba(2,8,18,0.78)";
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = "rgba(12192,184,232,0.24)";
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
    ctx.fillStyle = "rgba(230,245,255,0.92)";
    ctx.fillText(stamp, W - 20, H - 16);

    if (p2ArrivalDays != null) {
      const arrivalText = `P2 ARRIVES IN ${p2ArrivalDays} DAY${p2ArrivalDays === 1 ? "" : "S"}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.font = "13px 'Bricolage Grotesque', monospace";
      const arrivalW = ctx.measureText(arrivalText).width;
      const arrivalBoxW = arrivalW + 16;
      const arrivalBoxH = 24;
      const arrivalBoxX = 12;
      const arrivalBoxY = H - arrivalBoxH - 10;
      ctx.fillStyle = "rgba(2,8,18,0.78)";
      ctx.fillRect(arrivalBoxX, arrivalBoxY, arrivalBoxW, arrivalBoxH);
      ctx.strokeStyle = "rgba(12192,184,232,0.24)";
      ctx.strokeRect(arrivalBoxX + 0.5, arrivalBoxY + 0.5, arrivalBoxW - 1, arrivalBoxH - 1);
      ctx.fillStyle = "#C0B8E8";
      ctx.fillText(arrivalText, arrivalBoxX + 8, H - 16);
    }

    return composed;
  };

  async function exportMissionGif() {
    if (gifExporting || !canvasRef.current || !p1) return;
    setGifExporting(true);
    // GIF export progress logging is gated behind this flag so a finished build
    // stays quiet in the console; flip to true when debugging GIF export.
    const GIF_DEBUG = false;
    const gifLog = (...a) => { if (GIF_DEBUG) console.log(...a); };
    const savedSnapshot = captureUndoSnapshot();
    gifSavedSnapshotRef.current = savedSnapshot;
    const savedReplayRun = replayRun;
    const savedReplayFrameIndex = replayFrameIndex;
    const savedReplayPlaying = replayPlaying;
    try {
      setReplayPlaying(false);
      const sourceFrames = replayRun?.frames?.length
        ? replayRun.frames
        : liveTimeline.map(({ __key, ...frame }) => frame);
      const logSource = replayRun?.missionLog?.length ? replayRun.missionLog : missionLog;
      const framesToExport = sourceFrames.length ? sourceFrames : [snapshotLiveFrame()];
      gifLog(`[GIF] Starting export: ${framesToExport.length} frames, ${W}x${H + GIF_OVERLAY_HEIGHT}`);
      gifLog(`[GIF] Worker URL: ${gifWorkerUrl}`);
      const gif = new GIF({
        workers: 2,
        quality: 10,
        width: W,
        height: H + GIF_OVERLAY_HEIGHT,
        workerScript: gifWorkerUrl,
      });

      // Phase 1: render each frame and compress to a PNG blob (~10x smaller than raw pixels).
      const frameBlobs = [];
      for (let fi = 0; fi < framesToExport.length; fi++) {
        const frame = framesToExport[fi];
        applyFrameSnapshot(frame, logSource);
        await waitForPaint(3); // bumped from 2 -- give canvas time to redraw the new state
        const composed = composeGifFrame(frame);
        const blob = await new Promise(resolve => composed.toBlob(resolve, "image/png"));
        if (!blob) {
          console.error(`[GIF] Frame ${fi}: toBlob returned null`);
          continue;
        }
        frameBlobs.push(blob);
      }
      gifLog(`[GIF] Phase 1 done: ${frameBlobs.length} frame blobs captured`);

      // Phase 2: decode blobs one at a time into a single reusable canvas and feed GIF.js.
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = W;
      tempCanvas.height = H + GIF_OVERLAY_HEIGHT;
      const tempCtx = tempCanvas.getContext("2d");
      for (let i = 0; i < frameBlobs.length; i++) {
        const bitmap = await createImageBitmap(frameBlobs[i]);
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(bitmap, 0, 0);
        bitmap.close();
        frameBlobs[i] = null;
        gif.addFrame(tempCanvas, { copy: true, delay: GIF_FRAME_DELAY });
      }
      gifLog(`[GIF] Phase 2 done: all frames added to GIF encoder. Rendering...`);

      const blob = await new Promise((resolve, reject) => {
        gif.on("finished", (b) => {
          gifLog(`[GIF] Render finished, blob size: ${b?.size} bytes`);
          resolve(b);
        });
        gif.on("abort", () => reject(new Error("GIF export aborted")));
        gif.on("progress", (p) => {
          // Progress is 0..1; log at decile boundaries to keep console quiet
          if (Math.round(p * 10) !== Math.round((p - 0.01) * 10)) {
            gifLog(`[GIF] Progress: ${Math.round(p * 100)}%`);
          }
        });
        gif.render();
      });
      if (!blob) {
        console.error("[GIF] Render finished but blob was null/undefined");
        throw new Error("GIF render produced no blob");
      }
      gifLog(`[GIF] Triggering download: ${blob.size} bytes`);
      // Always show a user-visible download dialog so the file is reachable
      // even if the browser silently blocks the automatic anchor click.
      // The auto-download still fires, but the modal is the authoritative path.
      const fname = `psr_mission_${replayRun ? "replay" : "live"}_day${globalDay + 1}.gif`;
      const blobUrl = URL.createObjectURL(blob);
      setGifReady({ url: blobUrl, filename: fname, size: blob.size });
      // Also try the auto-download as a convenience (some browsers honor it,
      // some don't -- the modal is always the fallback).
      try { downloadBlob(blob, fname); } catch (e) { console.warn("[GIF] Auto-download failed, modal still available:", e); }
    } catch (err) {
      console.error("[GIF] Export failed:", err);
      // Surface a user-visible error via the mission log so they know what
      // happened. Use appendMissionLog so round/day/globalDay get stamped
      // consistently with every other log entry -- previously this pushed
      // a raw row that rendered with empty "R · D" in the log panel.
      try {
        appendMissionLog({
          type: "system_error",
          label: "GIF EXPORT FAILED",
          blurb: String(err?.message || err),
          color: "#E89BB5",
          icon: "✗",
        });
      } catch {}
    } finally {
      if (savedReplayRun?.frames?.[savedReplayFrameIndex]) {
        setReplayRun(savedReplayRun);
        setReplayFrameIndex(savedReplayFrameIndex);
        applyFrameSnapshot(savedReplayRun.frames[savedReplayFrameIndex], savedReplayRun.missionLog || []);
        setReplayPlaying(savedReplayPlaying);
      } else {
        setReplayRun(null);
        setReplayFrameIndex(0);
        setReplayPlaying(false);
        applyUndoSnapshot(savedSnapshot);
      }
      setGifExporting(false);
    }
  }

  const plotSource = useMemo(() => {
    const frames = replayRun?.frames?.length
      ? replayRun.frames
      : liveTimeline.length
        ? liveTimeline.map(({ __key, ...frame }) => frame)
        : (p1 ? [snapshotLiveFrame()] : []);
    const log = replayRun?.missionLog?.length ? replayRun.missionLog : missionLog;
    return { frames, log };
  }, [
    replayRun, liveTimeline, missionLog, p1, p2, round, day, globalDay,
    claimR, history, powerGridState, craterHealth, phase
  ]);

  // v27: plotDefinitions extracted to src/sim/plotData.js (~440 lines of
  // pure data transformation). The dep array previously listed many
  // closure-captured state values (p1, p2, physOverrides, round, day,
  // globalDay, history) that were never actually read inside the memo
  // body -- only frame properties (f.globalDay, frame.p1, frame.p2). Now
  // the dep is just `plotSource`.
  const plotDefinitions = useMemo(() => buildPlotDefinitions(plotSource), [plotSource]);

  const drawPlotCanvas = (canvas, plot) => {
    if (!canvas || !plot) return;
    const ctx = canvas.getContext("2d");
    const width = plot.width;
    const height = plot.height;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0B0918";
    ctx.fillRect(0, 0, width, height);

    const yTickLabels = plot.booleanPlot
      ? ["TRUE", "FALSE"]
      : (plot.categoricalTicks || []);
    const longestYTick = yTickLabels.reduce((max, label) => Math.max(max, String(label || "").length), 0);
    const leftMargin = plot.categoricalTicks
      ? Math.min(240, Math.max(92, 28 + longestYTick * 8))
      : 56;
    const margin = { top: 42, right: 18, bottom: 78 + Math.ceil(Math.max(1, plot.series.length) / plot.legendCols) * 18, left: leftMargin + (plot.yLabel ? 18 : 0) };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;
    const flatValues = plot.series.flatMap(s => s.data.filter(v => v != null));
    // v69: was `Math.max(1, ...flatValues, 0)`. That is the exact spread-into-
    // Math.max pattern that caused the v65 mine-trail RangeError: with enough
    // accumulated points (the live timeline caps at 500 frames × ~30 series,
    // and replay runs can exceed that) the argument spread overflows the JS
    // call-stack arg limit and throws. Confirmed reproducible at ~130k args.
    // Loop-based max has no such limit. Same fix the mine renderer already got.
    let flatMax = 0;
    for (let vi = 0; vi < flatValues.length; vi++) {
      const v = flatValues[vi];
      if (v > flatMax) flatMax = v;
    }
    const yMin = 0;
    const yMax = plot.booleanPlot ? 1 : plot.categoricalTicks ? Math.max(1, plot.categoricalTicks.length - 1) : Math.max(1, flatMax);

    ctx.fillStyle = "#8B86B0";
    ctx.font = "16px 'Spectral', monospace";
    ctx.textBaseline = "top";
    ctx.fillText(plot.title, 14, 10);

    ctx.strokeStyle = "rgba(200,196,220,0.12)";
    ctx.lineWidth = 1;
    const gridSteps = plot.booleanPlot ? 1 : plot.categoricalTicks ? Math.max(1, plot.categoricalTicks.length - 1) : 4;
    for (let i = 0; i <= gridSteps; i++) {
      const y = margin.top + (chartH * i / Math.max(1, gridSteps));
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();
      const value = yMax - ((yMax - yMin) * i / Math.max(1, gridSteps));
      ctx.fillStyle = "#8B86B0";
      ctx.font = "11px 'Bricolage Grotesque', monospace";
      ctx.textAlign = "right";
      const tickLabel = plot.booleanPlot
        ? (value >= 0.5 ? "TRUE" : "FALSE")
        : plot.categoricalTicks
          ? (plot.categoricalTicks[Math.round(value)] ?? "")
          : plot.tickFormatter
            ? plot.tickFormatter(value)
            : value.toFixed(value >= 10 ? 0 : 1);
      ctx.fillText(tickLabel, margin.left - 8, y - 6);
    }

    const pointX = (idx) => margin.left + (plot.xLabels.length <= 1 ? 0 : (chartW * idx / (plot.xLabels.length - 1)));
    const pointY = (value) => margin.top + chartH - (((value - yMin) / Math.max(1e-6, yMax - yMin)) * chartH);
    const xTickCount = Math.min(6, plot.xLabels.length);
    ctx.textAlign = "center";
    for (let i = 0; i < xTickCount; i++) {
      const idx = plot.xLabels.length <= 1 ? 0 : Math.round((plot.xLabels.length - 1) * i / Math.max(1, xTickCount - 1));
      const x = pointX(idx);
      ctx.strokeStyle = "rgba(200,196,220,0.10)";
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, margin.top + chartH);
      ctx.stroke();
      ctx.fillStyle = "#8B86B0";
      ctx.font = "11px 'Bricolage Grotesque', monospace";
      ctx.fillText(plot.xLabels[idx], x, margin.top + chartH + 10);
    }

    if (plot.xLabel) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#C0B8E8";
      ctx.font = "12px 'Bricolage Grotesque', monospace";
      ctx.fillText(plot.xLabel, margin.left + chartW / 2, margin.top + chartH + 28);
    }

    if (plot.yLabel) {
      ctx.save();
      ctx.translate(18, margin.top + chartH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillStyle = "#C0B8E8";
      ctx.font = "12px 'Bricolage Grotesque', monospace";
      ctx.fillText(plot.yLabel, 0, 0);
      ctx.restore();
    }

    plot.series.forEach((series) => {
      let firstIdx = series.data.findIndex(v => v != null);
      if (firstIdx < 0) return;
      if (!plot.pointOnly && !series.pointOnly) {
        ctx.strokeStyle = series.color;
        ctx.lineWidth = plot.booleanPlot ? 2 : 2.2;
        ctx.beginPath();
        let started = false;
        series.data.forEach((value, idx) => {
          if (value == null) { started = false; return; }
          const x = pointX(idx);
          const y = pointY(value);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else { ctx.lineTo(x, y); }
        });
        ctx.stroke();
        const firstValue = series.data[firstIdx];
        const bubbleX = pointX(firstIdx);
        const bubbleY = pointY(firstValue);
        ctx.fillStyle = "#0B0918";
        ctx.beginPath();
        ctx.arc(bubbleX, bubbleY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = series.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (series.spikeOnly) {
          series.data.forEach((value, idx) => {
            if (value == null || value <= 0) return;
            const bubbleX = pointX(idx);
            const bubbleY = pointY(value);
            ctx.fillStyle = "#0B0918";
            ctx.beginPath();
            ctx.arc(bubbleX, bubbleY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = series.color;
            ctx.lineWidth = 2;
            ctx.stroke();
          });
        }
      } else {
        series.data.forEach((value, idx) => {
          if (value == null) return;
          const bubbleX = pointX(idx);
          const bubbleY = pointY(value);
          ctx.fillStyle = "#0B0918";
          ctx.beginPath();
          ctx.arc(bubbleX, bubbleY, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = series.color;
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }
    });

    const legendStartY = margin.top + chartH + 44;
    const colWidth = Math.floor((width - 24) / plot.legendCols);
    plot.series.forEach((series, idx) => {
      const col = idx % plot.legendCols;
      const row = Math.floor(idx / plot.legendCols);
      const x = 14 + col * colWidth;
      const y = legendStartY + row * 18;
      ctx.fillStyle = series.color;
      ctx.fillRect(x, y + 4, 12, 4);
      ctx.fillStyle = "#C0B8E8";
      ctx.textAlign = "left";
      ctx.font = "11px 'Bricolage Grotesque', monospace";
      ctx.fillText(series.label, x + 18, y);
    });
  };

  const downloadCanvasPng = (canvas, filename) => {
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = filename;
    a.click();
  };

  const exportAllPlots = () => {
    plotDefinitions.forEach(plot => {
      const canvas = plotCanvasRefs.current[plot.id];
      if (canvas) downloadCanvasPng(canvas, `${plot.id}.png`);
    });
  };

  const buildSeparatePlot = (plot, series, idx) => ({
    ...plot,
    id: `${plot.id}-single-${idx}`,
    title: `${plot.title} · ${series.label}`,
    series: [{ ...series }],
    legendCols: 1,
    height: 240 + 18,
  });

  const PlotCanvas = ({ plot }) => {
    const ref = useRef(null);
    useEffect(() => {
      if (ref.current) {
        drawPlotCanvas(ref.current, plot);
        plotCanvasRefs.current[plot.id] = ref.current;
      }
    }, [plot]);
    return (
      <canvas
        ref={ref}
        width={plot.width}
        height={plot.height}
        style={{ width:"100%", height:"auto", display:"block", borderRadius:8, background:"#0B0918" }}
      />
    );
  };

  const Bar = ({ val, max, color, h=4 }) => {
    const pct = clamp((val/max)*100,0,100);
    return (
      <div style={{ height:h, background:"rgba(200,196,220,0.08)", borderRadius:2, overflow:"hidden",
        position:"relative", boxShadow:"inset 0 1px 0 rgba(0,0,0,0.3)" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:2,
          transition:"width 0.18s ease",
          boxShadow: pct > 20 ? `0 0 6px ${color}66` : "none" }} />
      </div>
    );
  };

  const night = showLayers.night && isNight(globalDay);
  const totalIce1 = p1?.iceDeposited||0, totalIce2 = p2?.iceDeposited||0;
  const mined1 = Object.keys(p1?.mineMap||{}).length, mined2 = Object.keys(p2?.mineMap||{}).length;
  const depleted = CRATER_DATA.filter((_,ci) => (craterHealth[ci]||1)<0.2).length;
  // ── Composite Mission Score ──────────────────────────────────────────────
  // Unified with `scorePlayerState` (defined above) so the HUD, analytics,
  // and batch-sim ranking all report the same number. v27 fix: the HUD
  // previously omitted the v21 carry-ice bonus (50% credit for ice in
  // transit), which meant the analytics chart and the displayed score
  // showed different numbers. Now both use the same formula:
  //
  //   score = iceDeposited
  //         + (carriedIce + carriedVol) * 0.5
  //         + assetPts * 15
  //         + scoreAdjustments
  //         - safetyViolations * 25
  const score1 = scorePlayerState(p1);
  const score2 = scorePlayerState(p2);
  const winner = phase===PHASE.DONE ? (score1>score2?1:score2>score1?2:0) : null;
  const share1 = score1 / (score1+score2||1);
  const replayActive = !!replayRun;
  const durationSummaryLabel = missionEndMode === "depletion" ? "UNTIL DEPLETION" : `${totalRounds} ROUNDS · ${totalRounds * DAYS_PER_ROUND} DAYS`;
  const roundCounterLabel = missionEndMode === "depletion" ? `R${round} · D${day+1}/${DAYS_PER_ROUND}` : `R${round}/${totalRounds} · D${day+1}/${DAYS_PER_ROUND}`;

  // Top-of-screen role banner (multiplayer only)
  const roleBannerEl = showMpChrome && mp ? (
    <RoleBanner
      mp={mp}
      hostSeat={hostSeat}
      overrideAs={overrideAs}
      onSetOverride={(v) => setOverrideAs(v)}
      onOpenInjects={() => setInjectsPanelOpen(v => !v)}
    />
  ) : null;

  // ── Facilitator inject handling ──────────────────────────────────────────
  // Pushed injects land in the mission log + lastEvents so they're visible to
  // everyone in the room. The push is broadcast through the snapshot.
  // v27: pushInject and pushCustomInject were nearly identical -- both built
  // a structured log entry, appended to missionLog, and pushed a trimmed
  // lastEvents row. Factored into one helper.
  const pushInjectEntry = useCallback((entry, summaryLabel) => {
    const ts = Date.now();
    const fullEntry = { round, day, globalDay, ts, ...entry };
    setMissionLog(prev => [...prev, fullEntry]);
    setLastEvents(prev => [
      ...(prev || []).slice(-49),
      {
        type: "inject",
        label: summaryLabel,
        color: entry.color,
        icon: entry.icon,
        round, day, ts,
      },
    ]);
  }, [round, day, globalDay]);

  const pushInject = useCallback((inject, targets) => {
    // Facilitator pushes the event only, actors choose their own response.
    // Deltas are applied when each actor makes their decision, not here.
    // `targets` ("both"|"p1"|"p2") is stored so each actor can filter
    // whether this inject is directed at them.
    pushInjectEntry({
      type: "inject",
      label: `INJECT · ${inject.label}`,
      icon: inject.icon,
      color: inject.color,
      summary: inject.summary,
      blurb: inject.blurb,
      choices: inject.choices.map(c => ({ label: c.label, desc: c.desc, deltas: c.deltas })),
      injectId: inject.id,
      debriefReveal: inject.debriefReveal ?? null,
      targets,
    }, inject.label);
  }, [pushInjectEntry]);

  const pushCustomInject = useCallback((text) => {
    pushInjectEntry({
      type: "inject_custom",
      label: "INJECT · facilitator",
      icon: "✶",
      color: "#A8A8F0",
      blurb: text,
    }, "Facilitator inject");
  }, [pushInjectEntry]);

  // Facilitator round-control dispatchers. dispatchAction routes correctly: the
  // host (or solo) runs the handler locally; a facilitator peer sends it to the
  // host. Optimistic local set for the duration/total so the facilitator's own
  // UI reflects the change immediately even before the next snapshot.
  const facPushRound = useCallback(() => {
    dispatchAction("facilitator:pushRound", {});
  }, [dispatchAction]);
  const facSetRoundDuration = useCallback((ms) => {
    const v = Math.max(0, Math.round(ms) || 0);
    if (!mp || isHost) setRoundDurationMs(v); // optimistic for host/solo
    dispatchAction("facilitator:setRoundDuration", { ms: v });
  }, [dispatchAction, mp, isHost]);
  const facSetTotalRounds = useCallback((tr) => {
    const v = Math.max(round, Math.min(40, Math.round(tr) || round));
    if (!mp || isHost) setTotalRounds(v); // optimistic for host/solo
    dispatchAction("facilitator:setTotalRounds", { totalRounds: v });
  }, [dispatchAction, mp, isHost, round]);
  const facDeployLateActor = useCallback(() => {
    dispatchAction("facilitator:deployLateActor", {});
  }, [dispatchAction]);
  // v160: facilitator "push my view to all screens", snapshots the current map
  // view + camera and routes it through the host, which applies it and fans it
  // out to every peer. Works whether the facilitator is the host or a peer.
  const facPushView = useCallback(() => {
    dispatchAction("facilitator:pushView", {
      baseMap,
      activeOverlaysArr: Array.from(activeOverlays),
      activeVectorOverlaysArr: Array.from(activeVectorOverlays),
      vectorOverlay,
      vectorOverlayOpacity,
      viewport: { zoom: viewport.zoom, panX: viewport.panX, panY: viewport.panY, autoFit: viewport.autoFit },
    });
    setViewPushToast("Pushed your view to all screens");
    setTimeout(() => setViewPushToast(""), 2600);
  }, [dispatchAction, baseMap, activeOverlays, activeVectorOverlays, vectorOverlay, vectorOverlayOpacity, viewport]);

  // v161: god-mode dispatchers, route through the host so the authoritative
  // state changes and re-broadcasts to every screen (works host or peer).
  const facAdjustBudget = useCallback((targets, opts) => {
    dispatchAction("facilitator:adjustBudget", { targets, ...opts });
  }, [dispatchAction]);
  const facAdjustScore = useCallback((targets, opts) => {
    dispatchAction("facilitator:adjustScore", { targets, ...opts });
  }, [dispatchAction]);
  const facAddAsset = useCallback((pi, type) => {
    dispatchAction("facilitator:addAsset", { pi, type });
  }, [dispatchAction]);
  const facRemoveAsset = useCallback((pi, kind) => {
    dispatchAction("facilitator:removeAsset", { pi, kind });
  }, [dispatchAction]);
  const facAnnounce = useCallback((text, targets, title) => {
    dispatchAction("facilitator:announce", { text, targets, title });
  }, [dispatchAction]);
  const facMaintain = useCallback((targets, op) => {
    dispatchAction("facilitator:maintain", { targets, op });
  }, [dispatchAction]);

  // v167: negotiation dispatchers (actor-facing + facilitator world overrides).
  const dealPropose = useCallback((from, give, want) => dispatchAction("deal:propose", { from, give, want }), [dispatchAction]);
  const dealRespond = useCallback((dealId, accept, responder) => dispatchAction("deal:respond", { dealId, accept, responder }), [dispatchAction]);
  const dealWithdraw = useCallback((dealId) => dispatchAction("deal:withdraw", { dealId }), [dispatchAction]);
  const playerSetZoneScale = useCallback((pi, scale) => dispatchAction("player:setZoneScale", { pi, scale }), [dispatchAction]);
  const playerSetTierScale = useCallback((pi, tier, scale) => dispatchAction("player:setTierScale", { pi, tier, scale }), [dispatchAction]);
  const playerSetRingMag = useCallback((pi, mag) => dispatchAction("player:setRingMag", { pi, mag }), [dispatchAction]);
  const playerSetStance = useCallback((pi, presetKey) => dispatchAction("player:setStance", { pi, presetKey }), [dispatchAction]);
  const playerSetEasement = useCallback((pi, grantTo, on) => dispatchAction("player:setEasement", { pi, grantTo, on }), [dispatchAction]);
  const facSetGrid = useCallback((grid, mode) => dispatchAction("facilitator:setGrid", { grid, mode }), [dispatchAction]);
  const facSetStance = useCallback((targets, presetKey) => dispatchAction("facilitator:setStance", { targets, presetKey }), [dispatchAction]);
  const facSetZoneScale = useCallback((targets, scale) => dispatchAction("facilitator:setZoneScale", { targets, scale }), [dispatchAction]);
  const facSetTierScale = useCallback((targets, tier, scale) => dispatchAction("facilitator:setTierScale", { targets, tier, scale }), [dispatchAction]);
  const facAdjustIce = useCallback((targets, opts) => dispatchAction("facilitator:adjustIce", { targets, ...opts }), [dispatchAction]);
  const facSetTreatyFloor = useCallback((targets, value) => dispatchAction("facilitator:setTreatyFloor", { targets, value }), [dispatchAction]);

  // then remove only this actor's entry from the queue (the next actor's
  // entry for the same inject, if any, remains and will show next).
  const handleInjectResponse = useCallback((injectEntry, choice) => {
    const actorIdx = injectEntry.forActor ?? (myActor !== null && myActor !== undefined ? myActor : 0);
    if (choice?.deltas) {
      dispatchAction("inject:respond", { pi: actorIdx, deltas: choice.deltas, choiceLabel: choice.label || choice.text || null, injectLabel: injectEntry.label || injectEntry.title || null });
    }
    // Remove only this specific queue entry (matched by ts + forActor), not
    // all entries for this ts, the other actor's entry should still show.
    setPendingInjects(prev => {
      const idx = prev.findIndex(e => e.ts === injectEntry.ts && e.forActor === injectEntry.forActor);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, [myActor, dispatchAction]);

  const activeInject = pendingInjects[0] ?? null;
  const injectResponseModalEl = activeInject ? (
    <InjectResponseModal
      key={`${activeInject.ts}-${activeInject.forActor}`}
      inject={activeInject}
      actorLabel={actorLabel(activeInject.forActor ?? myActor ?? 0)}
      onChoose={handleInjectResponse}
    />
  ) : null;

  // DEV BACKDOOR, remove before ship
  // DEV BACKDOOR, remove before ship
  const devActorLabel = hostSeat === 2 ? "Actor II" : "Actor I";
  const devFacilitatorButtonEl = import.meta.env.DEV ? (
    <div style={{
      position: "fixed", bottom: 12, right: 12, zIndex: 99999,
      display: "flex", gap: 5, alignItems: "center",
      fontFamily: "monospace", fontSize: 11, opacity: 0.85,
    }}>
      {devFacilitator && (
        <button
          onClick={() => { setHostSeat(s => s === 1 ? 2 : 1); seenInjectIds.current.clear(); setPendingInjects([]); }}
          style={{
            background: "#1B1030", color: "#E8D5F5",
            border: "1px dashed #A070C0", borderRadius: 6,
            padding: "5px 10px", cursor: "pointer",
          }}
          title="Switch which actor sees the next inject modal"
        >
          {devActorLabel} ↕
        </button>
      )}
      <button
        onClick={() => { setDevFacilitator(v => !v); setInjectsPanelOpen(true); }}
        style={{
          background: devFacilitator ? "#7B2D8B" : "#2D1B3D",
          color: "#E8D5F5", border: "1px dashed #A070C0",
          borderRadius: 6, padding: "5px 10px", cursor: "pointer",
        }}
        title="DEV ONLY · remove before ship"
      >
        {devFacilitator ? "⬡ facilitator ON" : "⬡ facilitator"}
      </button>
    </div>
  ) : null;

  const facilitatorPanelEl = isFacilitator && injectsPanelOpen ? (
    <FacilitatorPanel
      isOpen={injectsPanelOpen}
      onClose={() => setInjectsPanelOpen(false)}
      onPushInject={pushInject}
      onPushCustom={pushCustomInject}
      members={mp?.members || []}
      currentRound={round}
      currentDay={day + 1}
      p1Label={actorLabel(0)}
      p2Label={actorLabel(1)}
      onPushRound={facPushRound}
      roundDuration={roundDurationMs}
      onSetRoundDuration={facSetRoundDuration}
      onConveneDiplomacy={() => sessionActive(diplomacy) ? endDiplomacy("adjourned") : conveneDiplomacy("facilitator")}
      diplomacyActive={sessionActive(diplomacy)}
      diplomacyDurationMs={diplomacyDurationMs}
      onSetDiplomacyDuration={setDiplomacyDurationMs}
      diplomacyAutoEvery={diplomacyAutoEvery}
      onSetDiplomacyAutoEvery={setDiplomacyAutoEvery}
      diplomacySessionsHeld={diplomacySessionsHeld}
      totalRounds={totalRounds}
      onSetTotalRounds={facSetTotalRounds}
      missionEndMode={missionEndMode}
      phasePlaying={phase === PHASE.PLAYING}
      lateArrivalPending={phase === PHASE.PLAYING && !p2}
      onDeployLateActor={facDeployLateActor}
      onPushView={facPushView}
      multiplayer={!!mp}
      onGodBudget={facAdjustBudget}
      onGodScore={facAdjustScore}
      onGodAddAsset={facAddAsset}
      onGodRemoveAsset={facRemoveAsset}
      onAnnounce={facAnnounce}
      onGodMaintain={facMaintain}
      onSetGrid={facSetGrid}
      onSetStance={facSetStance}
      onSetZoneScale={facSetZoneScale}
      onSetTierScale={facSetTierScale}
      onAdjustIce={facAdjustIce}
      onSetTreatyFloor={facSetTreatyFloor}
      worldState={{
        powerGrid: powerGridState?.mode || "independent",
        commsGrid: commsGridState?.mode || "independent",
        p1: p1 ? { ice: Math.round(p1.iceDeposited ?? 0), zoneScale: p1.zoneScale ?? 1, stance: p1.allocPreset || "balanced", treatyFloor: p1.treatyFloor ?? null } : null,
        p2: p2 ? { ice: Math.round(p2.iceDeposited ?? 0), zoneScale: p2.zoneScale ?? 1, stance: p2.allocPreset || "balanced", treatyFloor: p2.treatyFloor ?? null } : null,
      }}
      layerVis={{
        safety: showLayers.safety !== false,
        violations: showLayers.violations !== false,
        power: showLayers.power !== false,
      }}
      onToggleLayer={(key) => setShowLayers(prev => ({ ...prev, [key]: prev[key] === false }))}
      godState={{
        p1: p1 ? {
          budget: Math.round(p1.budget ?? 0),
          scoreAdj: Math.round(p1.scoreAdjustments ?? 0),
          score: Math.round(scorePlayerState(p1)),
          counts: { solar: (p1.panels||[]).length, reactor: (p1.reactors||[]).length, habitat: (p1.habitats||[]).length, pad: (p1.landingPads||[]).length, rover: (p1.extraRovers||[]).length },
        } : null,
        p2: p2 ? {
          budget: Math.round(p2.budget ?? 0),
          scoreAdj: Math.round(p2.scoreAdjustments ?? 0),
          score: Math.round(scorePlayerState(p2)),
          counts: { solar: (p2.panels||[]).length, reactor: (p2.reactors||[]).length, habitat: (p2.habitats||[]).length, pad: (p2.landingPads||[]).length, rover: (p2.extraRovers||[]).length },
        } : null,
      }}
    />
  ) : null;

  // ── v167: actor-facing negotiation panel (deals / stance / zones) ─────────
  // v188: in local (non-multiplayer) hotseat play, `myActor` is null, which used
  // to hide the Negotiation panel entirely, so players could never reach the
  // per-tier safety-zone sliders. Fall back to the active turn's actor locally so
  // whoever's turn it is controls their own zones/stance/deals.
  const panelActor = mp ? myActor : activeTurn;
  const negotiationPanelEl = (phase === PHASE.PLAYING && !isFacilitator && (panelActor === 0 || panelActor === 1)) ? (
    <NegotiationPanel
      myActor={panelActor}
      myLabel={actorLabel(panelActor)}
      otherLabel={actorLabel(panelActor === 0 ? 1 : 0)}
      me={panelActor === 0 ? p1 : p2}
      other={panelActor === 0 ? p2 : p1}
      pendingDeals={pendingDeals}
      stances={[["balanced", "Balanced"], ["economic", "Economic"], ["austerity", "Surge"], ["military", "Security"]]}
      currentStance={(panelActor === 0 ? p1 : p2)?.allocPreset || "balanced"}
      currentZoneScale={(panelActor === 0 ? p1 : p2)?.zoneScale ?? 1}
      currentTierScale={(panelActor === 0 ? p1 : p2)?.tierScale ?? DEFAULT_TIER_SCALE}
      myAssetCount={zoneAssetCount(panelActor === 0 ? p1 : p2)}
      easementGranted={((panelActor === 0 ? p1 : p2)?.easements || []).includes(panelActor === 0 ? 2 : 1)}
      easementFromOther={((panelActor === 0 ? p2 : p1)?.easements || []).includes(panelActor + 1)}
      powerShared={powerGridState?.mode === "shared"}
      commsShared={commsGridState?.mode === "shared"}
      onPropose={(give, want) => dealPropose(panelActor, give, want)}
      onRespond={(dealId, accept) => dealRespond(dealId, accept, panelActor)}
      onWithdraw={dealWithdraw}
      onSetStance={(k) => playerSetStance(panelActor, k)}
      onSetZoneScale={(v) => playerSetZoneScale(panelActor, v)}
      onSetTierScale={(tier, v) => playerSetTierScale(panelActor, tier, v)}
      onSetEasement={(grantTo, on) => playerSetEasement(panelActor, grantTo, on)}
    />
  ) : null;

  // ── v170: Open Lunar 3-ring zone legend (shown when Zones layer is on) ─────
  const coordAdvisoryCount = (() => {
    if (phase !== PHASE.PLAYING || !p1 || !p2) return 0;
    try {
      const sharedGridActive = powerGridState?.mode === "shared";
      const { a1, a2 } = coordinationIntrusions(p1, p2, { coordMult: ZONE_TIER_MULT.coordination / ZONE_TIER_MULT.exclusion, sharedGridActive });
      return a1 + a2;
    } catch { return 0; }
  })();
  const zoneLegendEl = (phase === PHASE.PLAYING && showLayers.safety !== false) ? (
    <div style={{ position: "fixed", right: 12, bottom: 12, zIndex: 6500,
      background: "rgba(18,16,34,0.92)", border: "1px solid rgba(192,184,232,0.22)",
      borderRadius: 7, padding: "8px 11px", fontFamily: "'Bricolage Grotesque',sans-serif",
      boxShadow: "0 8px 24px rgba(0,0,0,0.45)", maxWidth: 240 }}>
      <div style={{ fontSize: 8, letterSpacing: "0.18em", color: "#A8A8F0", fontWeight: 700,
        textTransform: "uppercase", marginBottom: 6 }}>Safety zones · Tiballi 3-ring</div>
      {[
        ["solid",  "Core Operations", `${ZONE_KM.core} km · operator only, breach scores`],
        ["dashed", "Harmonization", `${ZONE_KM.harmonization} km · cross w/ prior coordination`],
        ["dotted", "Coordination Buffer", `${ZONE_KM.coordination} km · overlap OK, notify`],
      ].map(([bs, t, d]) => (
        <div key={t} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", flexShrink: 0,
            display: "inline-block", background: "transparent",
            borderWidth: bs === "solid" ? 2 : 1.5, borderStyle: bs, borderColor: "#C8C4DC" }} />
          <span style={{ fontSize: 10.5, color: "#ECEAF8", fontWeight: 600 }}>{t}</span>
          <span style={{ fontSize: 9, color: "#8B86B0" }}>· {d}</span>
        </div>
      ))}
      <div style={{ fontSize: 8.5, color: "#8B86B0", marginTop: 5, marginBottom: 3, fontStyle: "italic" }}>Rings tinted by team:</div>
      {[["Actor I", p1?.color || PLAYER1_COLOR], ["Actor II", p2?.color || PLAYER2_COLOR]].map(([nm, col]) => (
        <div key={nm} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", flexShrink: 0, display: "inline-block",
            background: col + "55", border: `2px solid ${col}` }} />
          <span style={{ fontSize: 10, color: "#ECEAF8", fontWeight: 600 }}>{nm}</span>
        </div>
      ))}
      {coordAdvisoryCount > 0 && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(192,184,232,0.14)",
          fontSize: 10, color: "#80C8E8", fontWeight: 600 }}>
          ⚠ {coordAdvisoryCount} coordination {coordAdvisoryCount === 1 ? "advisory" : "advisories"} active
        </div>
      )}
      {/* v199: per-player ring size. Each actor sizes the rings on THEIR OWN
          equipment (1× = true 0.1/0.5/1 km; higher magnifies for visibility).
          Controls the actor whose turn it is (hotseat) or your own seat (MP).
          Visual only, never changes score or the km the rings represent. */}
      {(() => {
        const ringActor = (panelActor === 0 || panelActor === 1) ? panelActor : null;
        if (ringActor === null) return null; // facilitator / spectator: no own equipment to size
        const mag = Math.min(ZONE_MAGNIFICATION_BOUNDS.max, Math.max(ZONE_MAGNIFICATION_BOUNDS.min, ((ringActor === 0 ? p1 : p2)?.ringMag) ?? ZONE_DEFAULT_MAGNIFICATION));
        return (
          <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(192,184,232,0.20)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 8, letterSpacing: "0.12em", color: (ringActor === 0 ? p1?.color : p2?.color) || "#A8A8F0", fontWeight: 700, textTransform: "uppercase" }}>{actorLabel(ringActor)} · ring display <span style={{ opacity: 0.65, letterSpacing: "0.04em" }}>(visual · free)</span></span>
              <button onClick={() => { playerSetRingMag(ringActor, ZONE_DEFAULT_MAGNIFICATION); playerSetTierScale(ringActor, "all", 1); }}
                title="Reset this actor's ring size and Core/Harmon/Coord tiers to defaults"
                style={{ fontSize: 8.5, fontWeight: 700, color: "#C0B8E8", background: "rgba(168,168,240,0.14)",
                  border: "1px solid rgba(168,168,240,0.3)", borderRadius: 4, padding: "1px 6px", cursor: "pointer" }}>↺ reset</button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "#ECEAF8", fontWeight: 700 }}>{mag <= 1 ? "1× (true)" : `${Math.round(mag)}×`}</span>
            </div>
            <input type="range" min={ZONE_MAGNIFICATION_BOUNDS.min} max={ZONE_MAGNIFICATION_BOUNDS.max} step={1} value={mag}
              onChange={(e) => playerSetRingMag(ringActor, parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: (ringActor === 0 ? p1?.color : p2?.color) || "#A8A8F0", cursor: "pointer" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
              {[["1× true", 1], ["2×", 2], ["keep-out", ZONE_KEEPOUT_MAGNIFICATION], ["5×", 5]].map(([lbl, v]) => (
                <button key={lbl} onClick={() => playerSetRingMag(ringActor, v)}
                  style={{ flex: 1, margin: "0 2px", padding: "3px 0", fontSize: 8.5, fontWeight: 700,
                    background: Math.abs(mag - v) < 0.5 ? "#A8A8F0" : "rgba(168,168,240,0.14)",
                    color: Math.abs(mag - v) < 0.5 ? "#141220" : "#C0B8E8",
                    border: "1px solid rgba(168,168,240,0.3)", borderRadius: 4, cursor: "pointer" }}>{lbl}</button>
              ))}
            </div>
            <div style={{ fontSize: 8, color: "#8B86B0", fontStyle: "italic", marginTop: 4, lineHeight: 1.35 }}>
              {mag <= 1
                ? `Sizing ${actorLabel(ringActor)}'s equipment at true ${ZONE_KM.core} / ${ZONE_KM.harmonization} / ${ZONE_KM.coordination} km, matches the scale bar.`
                : `${actorLabel(ringActor)}'s rings magnified ${Math.round(mag)}× for visibility · true size ${ZONE_KM.core} / ${ZONE_KM.harmonization} / ${ZONE_KM.coordination} km · visual only.`}
            </div>
            {/* v202: DECLARED zone size, the actual DLA footprint this actor
                claims, per tier. Unlike the display slider above, this changes
                the scored keep-out; declaring wider than Christine's baseline
                (100%) is overreach and costs score (inner rings hardest). Each
                actor controls only their own equipment; drag previews locally
                and commits on release (one dispatch + one mission-log line). */}
            {(() => {
              const tp = ringActor === 0 ? p1 : p2;
              const ts = { ...DEFAULT_TIER_SCALE, ...(tp?.tierScale || {}) };
              const nAssets = Math.max(1, zoneAssetCount(tp));
              const TIER_UI = [
                { key: "core",          short: "Core",    km: ZONE_KM.core,          accent: "#FF7A52" },
                { key: "harmonization", short: "Harmon.", km: ZONE_KM.harmonization, accent: "#39C0C8" },
                { key: "coordination",  short: "Coord.",  km: ZONE_KM.coordination,  accent: "#9AA0AE" },
              ];
              const eff = (k) => (legendTierDrag && legendTierDrag.key === k)
                ? legendTierDrag.v
                : (Number.isFinite(ts[k]) ? ts[k] : 1);
              const costOf = (k, s) => Math.round(Math.max(0, s - 1) * (TIER_OVERREACH_WEIGHT[k] ?? 1) * nAssets * SCORE_OVERREACH_PENALTY);
              const commit = (k) => {
                if (legendTierDrag && legendTierDrag.key === k) {
                  playerSetTierScale(ringActor, k, legendTierDrag.v);
                  setLegendTierDrag(null);
                }
              };
              const totalCost = TIER_UI.reduce((s, { key }) => s + costOf(key, eff(key)), 0);
              const anyOver = TIER_UI.some(({ key }) => eff(key) > 1.001);
              return (
                <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(192,184,232,0.20)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <span style={{ fontSize: 8, letterSpacing: "0.12em", color: (ringActor === 0 ? p1?.color : p2?.color) || "#A8A8F0", fontWeight: 700, textTransform: "uppercase" }}>
                      {actorLabel(ringActor)} · declared size <span style={{ opacity: 0.65, letterSpacing: "0.04em" }}>(scored)</span>
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: anyOver ? "#F0A030" : "#9BD4B5" }}>
                      {anyOver ? `−${totalCost}` : "✓"}
                    </span>
                  </div>
                  {TIER_UI.map(({ key, short, km, accent }) => {
                    const cur = eff(key);
                    const over = cur > 1.001;
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 8.5, fontWeight: 700, color: accent, width: 44, flexShrink: 0 }}>{short}</span>
                        <input type="range" min={TIER_SCALE_BOUNDS.min} max={TIER_SCALE_BOUNDS.max} step={0.05} value={cur}
                          onChange={(e) => setLegendTierDrag({ key, v: parseFloat(e.target.value) })}
                          onPointerUp={() => commit(key)} onKeyUp={() => commit(key)} onBlur={() => commit(key)}
                          style={{ flex: 1, accentColor: over ? "#F0A030" : accent, cursor: "pointer", minWidth: 0 }} />
                        <span style={{ fontSize: 8.5, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                          color: over ? "#F0A030" : "#C8C4DC", width: 62, textAlign: "right", flexShrink: 0 }}>
                          {(km * cur).toFixed(2).replace(/\.?0+$/, "")} km{over ? ` −${costOf(key, cur)}` : ""}
                        </span>
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 8, color: "#8B86B0", fontStyle: "italic", marginTop: 3, lineHeight: 1.35 }}>
                    {anyOver
                      ? `Declaring wider than the DLA baseline is overreach, costing ${actorLabel(ringActor)} ${totalCost} score across ${nAssets} zone${nAssets === 1 ? "" : "s"}. Inner rings are penalized hardest.`
                      : "Your claimed DLA footprint. Widen any ring past 100% and the overreach costs score, inner rings hardest. Shrinking is free."}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}
    </div>
  ) : null;

  // Renders as a slide-in panel on the left when an asset has been clicked.
  // Shows full stats and any available actions.
  const assetDetailSidebarEl = (
    <AssetDetailSidebar
      assetDetail={assetDetail}
      p1={p1}
      p2={p2}
      p1Done={p1Done}
      p2Done={p2Done}
      canControlActor={canControlActor}
      clearWaypoints={clearWaypoints}
      setAssetDetail={setAssetDetail}
      buildStructure={buildStructure}
    />
  );

  // ── Explore Terrain sidebar ─────────────────────────────────────────────
  // Shown when the user is in explore mode and has clicked a point. Pulls
  // the analyzePixel() data and renders equipment recommendations.
  const exploreSidebarEl = (
    <ExploreSidebar
      exploreMode={exploreMode}
      exploreClick={exploreClick}
      setExploreClick={setExploreClick}
      phase={phase}
      mp={mp}
      myActor={myActor}
      activeTurn={activeTurn}
      p1={p1}
      p2={p2}
      placingFor={placingFor}
      placingType={placingType}
      setPlacingFor={setPlacingFor}
      setPlacingType={setPlacingType}
      buildAndPlaceAt={(pi, type, x, y) => {
        // v159 FIX (actor-2-assets-vanish-in-multiplayer): a peer's
        // confirm-placement used to call the LOCAL buildAndPlaceAt, which
        // mutates only this client's player state. The host never heard about
        // it, so its next snapshot -- lacking the asset -- wiped it. Because
        // actor 1 is the host (local placement is authoritative) and actor 2
        // is the peer, only actor 2's assets disappeared, and only in
        // multiplayer. Fix: peers dispatch the placement to the host via the
        // (previously unused) buildAndPlaceAt action handler; the host applies
        // it authoritatively and broadcasts the result back. We force the
        // placement to the peer's OWN actor so a snapshot-clobbered shared
        // cursor can't misattribute it.
        if (mp && !isHost) {
          const actor = (myActor === 0 || myActor === 1) ? myActor : pi;
          if (!canControlActor(actor)) return false;
          dispatchAction("buildAndPlaceAt", { pi: actor, type, x, y });
          return true;
        }
        return buildAndPlaceAt(pi, type, x, y);
      }}
    />
  );

  // ── GIF download modal ──────────────────────────────────────────────────
  // Always-visible explicit download path. The browser's silent auto-click
  // sometimes fails (Safari, security-locked Chrome, permission prompts), so
  // we present an explicit anchor the user clicks themselves -- this works
  // in every browser, every time.
  const gifReadyModalEl = <GifReadyModal gifReady={gifReady} setGifReady={setGifReady} />;

  // ── Settings screen ──────────────────────────────────────────────────────
  if (phase===PHASE.SETTINGS) return (<>
    {roleBannerEl}
    {facilitatorPanelEl}
    {negotiationPanelEl}
    {zoneLegendEl}
    {assetDetailSidebarEl}
    {exploreSidebarEl}
    {gifReadyModalEl}
    {devFacilitatorButtonEl}
    {injectResponseModalEl}
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse at 35% 25%, #1A1830 0%, #0B0918 55%, #141220 100%)",
      fontFamily:"'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,sans-serif", color:"#C8C4DC",
      display:"flex", flexDirection:"column",
      position:"relative", overflow:"hidden",
    }}>
      {/* Background stars */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none", overflow:"hidden" }}>
        {Array.from({length:60},(_,i) => (
          <div key={i} style={{
            position:"absolute",
            left:`${(i*37+13)%100}%`, top:`${(i*53+7)%100}%`,
            width: i%5===0 ? 2 : 1, height: i%5===0 ? 2 : 1,
            borderRadius:"50%",
            background: `rgba(200,196,220,${0.15 + (i%4)*0.1})`,
            animation:`flicker ${2+i%3}s ease-in-out ${(i*0.3)%2}s infinite`,
          }}/>
        ))}
      </div>

      {/* ── Slim top header ── */}
      <div style={{
        position:"relative", zIndex:1,
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"13px 36px 11px",
        borderBottom:"1px solid rgba(200,196,220,0.07)",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <svg width="20" height="20" viewBox="0 0 22 22" style={{ display:"block", flexShrink:0 }}>
            <defs>
              <radialGradient id="moonGrad2" cx="0.35" cy="0.35">
                <stop offset="0%" stopColor="#ECEAF8" stopOpacity="0.95"/>
                <stop offset="100%" stopColor="#A8A8F0" stopOpacity="0.65"/>
              </radialGradient>
            </defs>
            <circle cx="11" cy="11" r="9" fill="url(#moonGrad2)"/>
            <circle cx="14.5" cy="9.5" r="8.5" fill="#1B1934"/>
          </svg>
          <div style={{ fontSize:8, letterSpacing:"0.38em", color:"#8B86B0", fontWeight:500, textTransform:"uppercase" }}>
            Open Lunar Foundation
          </div>
          <div style={{ width:1, height:16, background:"rgba(200,196,220,0.15)" }}/>
          <h1 style={{ margin:0, fontSize:22, fontWeight:300, letterSpacing:"-0.01em",
            fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
            color:"#ECEAF8", fontStyle:"italic", lineHeight:1,
          }}>
            Over<span style={{ fontWeight:600 }}>lap</span><span style={{ fontWeight:300, fontSize:11, color:"#8B86B0", fontStyle:"normal", letterSpacing:"0.08em", marginLeft:9 }}>a lunar policy sandbox</span>
          </h1>
        </div>
        <div style={{ fontSize:8, color:"#3A3658", letterSpacing:"0.22em",
          fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:300 }}>
          Fellowship Deliverable &middot; Paulson, L.V. &middot; Zawadzki, T. &middot; OLF &middot; 2026
        </div>
      </div>

      {/* Workshop participants -- multiplayer only */}
      {mp && showMpChrome && (
        <div style={{ position:"relative", zIndex:1, padding:"8px 36px 0" }}>
          {viewPushToast && (
            <div style={{
              background:"rgba(46,32,104,0.92)",
              border:"1px solid rgba(168,168,240,0.55)",
              borderLeft:"3px solid #C0B8E8",
              borderRadius:6, padding:"8px 16px", marginBottom:8,
              display:"flex", alignItems:"center", gap:10,
              fontFamily:"'Bricolage Grotesque',sans-serif",
            }}>
              <span style={{ fontSize:13, flexShrink:0 }}>📡</span>
              <span style={{ fontSize:11, color:"#ECEAF8", fontWeight:500, letterSpacing:"0.02em" }}>
                {viewPushToast}
              </span>
            </div>
          )}
          {mp.notice && (
            <div style={{
              background:"rgba(46,32,104,0.85)",
              border:"1px solid rgba(168,168,240,0.45)",
              borderLeft:"3px solid #A8A8F0",
              borderRadius:6, padding:"8px 16px", marginBottom:8,
              display:"flex", alignItems:"center", gap:10,
              fontFamily:"'Bricolage Grotesque',sans-serif",
            }}>
              <span style={{ width:8, height:8, borderRadius:"50%",
                background:(mp.reconnecting || !mp.hostPresent) ? "#A8A8F0" : "#80B0D8", flexShrink:0 }} />
              <span style={{ fontSize:11, color:"#ECEAF8", fontWeight:500, letterSpacing:"0.02em" }}>
                {mp.notice}
              </span>
            </div>
          )}
          <div style={{
            background:"rgba(27,25,52,0.6)",
            border:"1px solid rgba(168,168,240,0.18)",
            borderLeft:"2px solid rgba(168,168,240,0.55)",
            borderRadius:6, padding:"12px 20px",
            display:"flex", alignItems:"center", gap:16, flexWrap:"wrap",
          }}>
            <div style={{ fontSize:8.5, letterSpacing:"0.34em", color:"#C0B8E8",
              fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500,
              textTransform:"uppercase", flexShrink:0 }}>
              Participants &middot; {mp.members.length}
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", flex:1 }}>
              {mp.members.map((m) => {
                const seatColor = m.seat === 0 ? "#C0B8E8" : m.seat === 1 ? PLAYER1_COLOR : PLAYER2_COLOR;
                const seatLabel = m.seat === 0 ? "Facilitator" : m.seat === 1 ? actorLabel(0) : m.seat === 2 ? actorLabel(1) : `Seat ${m.seat}`;
                const canChange = isHost || m.id === mp.you?.id;
                return (
                  <div key={m.id} style={{
                    display:"flex", alignItems:"center", gap:6,
                    padding:"4px 10px",
                    background:"rgba(27,25,52,0.92)",
                    border:"1px solid rgba(200,196,220,0.06)",
                    borderRadius:4,
                  }}>
                    <span style={{ width:6, height:6, borderRadius:"50%", background:seatColor, boxShadow:`0 0 6px ${seatColor}`, flex:"0 0 auto" }}/>
                    <span style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:12, color:"#ECEAF8", fontWeight:400 }}>
                      {m.name}
                      {m.id === mp.you?.id && <span style={{ color:"#8B86B0", fontStyle:"italic", fontSize:10, marginLeft:3 }}> you</span>}
                    </span>
                    {canChange ? (
                      <select value={m.seat}
                        onChange={(e) => mp.setRole(+e.target.value, m.id === mp.you?.id ? null : m.id)}
                        style={{ background:"rgba(20,18,32,0.95)", border:`1px solid ${seatColor}55`, color:seatColor,
                          padding:"2px 6px", borderRadius:3, fontFamily:"'Bricolage Grotesque',sans-serif",
                          fontSize:10, fontWeight:500, cursor:"pointer", outline:"none" }}>
                        <option value={1} style={{background:"#1B1934"}}>{actorLabel(0)}</option>
                        <option value={2} style={{background:"#1B1934"}}>{actorLabel(1)}</option>
                        <option value={0} style={{background:"#1B1934"}}>Facilitator</option>
                      </select>
                    ) : (
                      <span style={{ fontFamily:"'Bricolage Grotesque',sans-serif", color:seatColor, fontSize:10, fontWeight:500 }}>{seatLabel}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Main config grid ── */}
      <div style={{
        position:"relative", zIndex:1,
        flex:1, overflowY:"auto",
        padding:"10px 36px 16px",
        display:"grid",
        gridTemplateColumns:"1fr 1fr 1fr",
        gridTemplateRows:"auto auto auto",
        gap:9,
        alignContent:"start",
      }}>

        {/* ── Row 1: Stakeholder archetypes, full width ── */}
        <div style={{ gridColumn:"1 / -1", background:"linear-gradient(180deg, rgba(27,25,52,0.7), rgba(20,18,32,0.7))", border:"1px solid rgba(168,168,240,0.18)", borderRadius:8, padding:"10px 16px 12px" }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:14, marginBottom:8 }}>
            <div style={{ fontSize:9, letterSpacing:"0.22em", color:"#8B86B0", fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500, textTransform:"uppercase", flexShrink:0 }}>Stakeholder Archetypes</div>
            <div style={{ fontSize:10.5, color:"#8B86B0", fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", lineHeight:1.4 }}>
              Each actor takes on a real-world lunar surface identity. Hover any button for details.
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {[0,1].map(pi => {
              const def = getStakeholderDef(actorRoles[pi]);
              const color = pi === 0 ? PLAYER1_COLOR : PLAYER2_COLOR;
              return (
                <div key={pi}>
                  <div style={{ fontSize:9.5, letterSpacing:"0.18em", color, fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:600, textTransform:"uppercase", marginBottom:5 }}>Actor {pi === 0 ? "I" : "II"}</div>
                  <div style={{ display:"flex", gap:4 }}>
                    {STAKEHOLDER_DEFS.map(s => {
                      const selected = actorRoles[pi] === s.id;
                      return (
                        <button key={s.id}
                          onClick={() => setActorRoles(prev => { const n=[...prev]; n[pi]=s.id; return n; })}
                          title={s.blurb}
                          style={{
                            flex:"1 0 0", background:selected?`linear-gradient(135deg, ${s.palette.main}28, ${s.palette.main}10)`:"rgba(27,25,52,0.5)",
                            border:`1px solid ${selected?s.palette.main:"rgba(200,196,220,0.14)"}`,
                            borderRadius:4, padding:"6px 4px", cursor:"pointer",
                            boxShadow:selected?`0 0 10px ${s.palette.main}33`:"none",
                            transition:"all 0.14s", textAlign:"center",
                          }}>
                          <div style={{ fontSize:11.5, color:selected?"#ECEAF8":"#C0B8E8", fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", letterSpacing:"-0.005em", lineHeight:1.3 }}>{s.name}</div>
                        </button>
                      );
                    })}
                  </div>
                  {/* Single-line selected archetype description */}
                  <div style={{ fontSize:9.5, color:"#8B86B0", fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", marginTop:4, lineHeight:1.3 }}>
                    {def.blurb}
                  </div>
                  {/* v136: bloc internals. Core actors (Artemis / ILRS) are
                      coalitions; show the internal negotiation -- the factions,
                      the agreed-position cohesion, and the swing faction -- so a
                      facilitator can see the bloc is a compromise, not a monolith. */}
                  {BLOC_SUBACTORS[actorRoles[pi]] && (() => {
                    const neg = negotiateBloc(actorRoles[pi]);
                    const pct = Math.round((neg.cohesion ?? 0) * 100);
                    const barColor = pct >= 70 ? "#78DC96" : pct >= 50 ? "#E8C998" : "#E0907E";
                    return (
                      <div style={{ marginTop:6, padding:"6px 8px", background:"rgba(52,96,168,0.06)", border:"1px solid rgba(128,176,216,0.15)", borderRadius:5 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
                          <span style={{ fontSize:7.5, letterSpacing:"0.16em", color:"#80B0D8", textTransform:"uppercase", fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:600 }}>Internal negotiation</span>
                          <span style={{ fontSize:9, color:barColor, fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>{pct}% cohesion</span>
                        </div>
                        {/* cohesion bar */}
                        <div style={{ height:3, background:"rgba(200,196,220,0.12)", borderRadius:2, overflow:"hidden", marginBottom:5 }}>
                          <div style={{ width:`${pct}%`, height:"100%", background:barColor }} />
                        </div>
                        {neg.factions.map(f => (
                          <div key={f.id} style={{ display:"flex", justifyContent:"space-between", fontSize:9, color: neg.dissenter?.id === f.id ? "#E0B0A0" : "#A8A8F0", fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", lineHeight:1.5 }}>
                            <span>{f.label}{neg.dissenter?.id === f.id ? " · swing" : ""}</span>
                            <span style={{ color:"#5A567A" }}>{Math.round(f.influence * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Col 1 Row 2: Simulation Mode ── */}
        <div style={{ background:"rgba(27,25,52,0.92)", border:"1px solid rgba(200,196,220,0.14)", borderRadius:8, padding:"11px 14px", display:"flex", flexDirection:"column" }}>
          <div style={{ fontSize:8.5, letterSpacing:"0.22em", color:"#C0B8E8", marginBottom:8, paddingLeft:8, borderLeft:"2px solid #A8A8F0", textTransform:"uppercase", fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>Simulation Mode</div>
          <div style={{ display:"flex", gap:5, flex:1 }}>
            {[
              ["competitive","Two-Actor","Two stakeholders compete for PSR resources"],
              ["solo","Single-Actor","You direct Actor I; Actor II auto-extracts"],
              ["analysis","Monte Carlo","Run batched bot trials and review outcomes"],
            ].map(([m,label,tip]) => (
              <button key={m} onClick={()=>setSimMode(m)} title={tip} style={{
                flex:1, background:simMode===m?"rgba(192,184,232,0.15)":"rgba(200,196,220,0.05)",
                border:`1px solid ${simMode===m?"rgba(192,184,232,0.4)":"rgba(200,196,220,0.10)"}`,
                color:simMode===m?"#ECEAF8":"#8B86B0",
                borderRadius:5, padding:"0 6px", cursor:"pointer",
                fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
                lineHeight:1.3, textAlign:"center",
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              }}>
                <div style={{ fontSize:13, fontStyle:"italic", fontWeight:simMode===m?500:400, letterSpacing:"-0.005em" }}>{label}</div>
                <div style={{ marginTop:4, fontSize:8.5, fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:400, fontStyle:"normal", color:simMode===m?"#A8A8F0":"#5A567A", letterSpacing:"0.02em", lineHeight:1.3 }}>{tip}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Col 2 Row 2: Mission Duration ── */}
        <div style={{ background:"rgba(27,25,52,0.92)", border:"1px solid rgba(200,196,220,0.14)", borderRadius:8, padding:"11px 14px", display:"flex", flexDirection:"column", justifyContent:"center" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12 }}>
            <div style={{ fontSize:9, letterSpacing:"0.22em", color:"#C0B8E8", paddingLeft:10, borderLeft:"2px solid #A8A8F0", textTransform:"uppercase", fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>Mission Duration</div>
            <span style={{ fontSize:13, fontWeight:500, color:"#A8A8F0", fontFamily:"'Spectral',Georgia,serif", letterSpacing:"-0.005em" }}>
              {missionEndMode === "depletion" ? "Until depletion" : `${totalRounds} rounds · ${totalRounds*DAYS_PER_ROUND}d`}
            </span>
          </div>
          {missionEndMode === "fixed" && (
            <input type="range" min={4} max={20} value={totalRounds}
              onChange={e=>setTotalRounds(+e.target.value)}
              style={{ width:"100%", accentColor:"#A8A8F0", cursor:"pointer", marginBottom:10 }} />
          )}
          <div style={{ display:"flex", gap:5, marginBottom: scenarioPreset==="unevenArrival"?12:0 }}>
            {[[4,"Quick","fixed"],[8,"Short","fixed"],[12,"Standard","fixed"],[20,"Long","fixed"],["depletion","Open","depletion"]].map(([v,l,mode]) => (
              <button key={l} onClick={()=>{
                if (mode === "depletion") setMissionEndMode("depletion");
                else { setMissionEndMode("fixed"); setTotalRounds(v); }
              }} style={{
                flex:1, background:(mode==="depletion" ? missionEndMode==="depletion" : missionEndMode==="fixed" && totalRounds===v)?"rgba(168,168,240,0.12)":"rgba(200,196,220,0.05)",
                border:`1px solid ${(mode==="depletion" ? missionEndMode==="depletion" : missionEndMode==="fixed" && totalRounds===v)?"#A8A8F055":"rgba(200,196,220,0.10)"}`,
                color:(mode==="depletion" ? missionEndMode==="depletion" : missionEndMode==="fixed" && totalRounds===v)?"#ECEAF8":"#8B86B0",
                borderRadius:4, padding:"9px 0", cursor:"pointer", fontSize:12,
                fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
              }}>{l}</button>
            ))}
          </div>
          {(scenarioPreset === "unevenArrival" || scenarioPreset === "sprint") && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:11, color:"#C0B8E8", fontStyle:"italic", fontFamily:"'Spectral',Georgia,serif" }}>First-mover delay · Actor II arrives later</span>
                <span style={{ fontSize:12, fontWeight:500, color:"#C0B8E8", fontFamily:"'Spectral',Georgia,serif" }}>{arrivalDelay === 0 ? "simultaneous" : `+${arrivalDelay} day${arrivalDelay!==1?"s":""}`}</span>
              </div>
              <input type="range" min={0} max={90} value={arrivalDelay}
                onChange={e=>setArrivalDelay(+e.target.value)}
                style={{ width:"100%", accentColor:"#C0B8E8", cursor:"pointer" }} />
              <div style={{ fontSize:9.5, color:"#8B86B0", marginTop:4, fontStyle:"italic", fontFamily:"'Spectral',Georgia,serif" }}>
                {arrivalDelay === 0
                  ? "Both actors deploy together (control run)."
                  : `Actor I builds solo for ${arrivalDelay} day${arrivalDelay!==1?"s":""} before Actor II can place a base, set 0 for a simultaneous control.`}
              </div>
            </div>
          )}
        </div>

        {/* ── Col 3 Row 2: Shared Power Grid ── */}
        <div style={{ background:"rgba(27,25,52,0.92)", border:"1px solid rgba(200,196,220,0.14)", borderRadius:8, padding:"11px 14px" }}>
          <div style={{ fontSize:9, letterSpacing:"0.22em", color:"#C0B8E8", marginBottom:7, paddingLeft:8, borderLeft:"2px solid #A8A8F0", textTransform:"uppercase", fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>Shared Power Grid</div>
          <div style={{ display:"flex", gap:6, marginBottom:gridSharingEnabled?8:0 }}>
            {[
              ["enabled","Enabled","Offers and joins permitted"],
              ["disabled","Disabled","Power grids remain isolated"],
            ].map(([mode,label,tip]) => (
              <button key={mode} onClick={()=>setGridSharingEnabled(mode==="enabled")} style={{
                flex:1, background:(gridSharingEnabled===(mode==="enabled"))?"rgba(192,184,232,0.15)":"rgba(200,196,220,0.05)",
                border:`1px solid ${(gridSharingEnabled===(mode==="enabled"))?"rgba(192,184,232,0.4)":"rgba(200,196,220,0.10)"}`,
                color:(gridSharingEnabled===(mode==="enabled"))?"#ECEAF8":"#8B86B0",
                borderRadius:5, padding:"9px 8px", cursor:"pointer",
                fontFamily:"'Spectral',Georgia,serif", lineHeight:1.3, textAlign:"left",
              }}>
                <div style={{ fontSize:13, fontStyle:"italic", fontWeight:(gridSharingEnabled===(mode==="enabled"))?500:400, letterSpacing:"-0.005em" }}>{label}</div>
                <div style={{ marginTop:3, fontSize:8.5, fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:400, fontStyle:"normal", color:(gridSharingEnabled===(mode==="enabled"))?"#A8A8F0":"#5A567A", letterSpacing:"0.02em" }}>{tip}</div>
              </button>
            ))}
          </div>
          {gridSharingEnabled && (
            <div style={{ display:"flex", gap:6 }}>
              {[
                [false,"Reversible","Either actor may later decouple"],
                [true,"Permanent","Shared grid cannot be decoupled"],
              ].map(([perm,label,tip]) => (
                <button key={label} onClick={()=>setGridSharingPermanent(perm)} style={{
                  flex:1, background:gridSharingPermanent===perm?"rgba(168,168,240,0.12)":"rgba(200,196,220,0.05)",
                  border:`1px solid ${gridSharingPermanent===perm?"rgba(168,168,240,0.35)":"rgba(200,196,220,0.10)"}`,
                  color:gridSharingPermanent===perm?"#ECEAF8":"#8B86B0",
                  borderRadius:5, padding:"8px 8px", cursor:"pointer",
                  fontFamily:"'Spectral',Georgia,serif", lineHeight:1.3, textAlign:"left",
                }}>
                  <div style={{ fontSize:12, fontStyle:"italic", fontWeight:gridSharingPermanent===perm?500:400, letterSpacing:"-0.005em" }}>{label}</div>
                  <div style={{ marginTop:2, fontSize:8.5, fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:400, fontStyle:"normal", color:gridSharingPermanent===perm?"#A8A8F0":"#5A567A", letterSpacing:"0.02em" }}>{tip}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Col 1 Row 3: Scenario Presets ── */}
        <div style={{ background:"rgba(27,25,52,0.92)", border:"1px solid rgba(200,196,220,0.14)", borderRadius:8, padding:"11px 14px", display:"flex", flexDirection:"column" }}>
          <div style={{ fontSize:9, letterSpacing:"0.22em", color:"#C0B8E8", marginBottom:7, paddingLeft:8, borderLeft:"2px solid #A8A8F0", textTransform:"uppercase", fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>Scenario Presets</div>
          <div style={{ display:"flex", flexDirection:"column", gap:4, flex:1, justifyContent:"space-between" }}>
            {SCENARIO_PRESETS.map(scen => (
              <button key={scen.id} onClick={()=>{
                setScenarioPreset(scen.id);
                setTotalRounds(scen.rounds);
                setMissionEndMode("fixed");
                if (scen.overrides) setPhysOverrides(scen.overrides);
                else setPhysOverrides({});
              }} style={{
                background:scenarioPreset===scen.id?"rgba(192,184,232,0.10)":"rgba(200,196,220,0.03)",
                border:`1px solid ${scenarioPreset===scen.id?"rgba(192,184,232,0.32)":"rgba(200,196,220,0.08)"}`,
                borderRadius:5, padding:"6px 10px", cursor:"pointer", textAlign:"left",
                display:"flex", justifyContent:"space-between", alignItems:"center",
                flex:1,
              }}>
                <span>
                  <div style={{ fontSize:12, fontStyle:"italic", color:scenarioPreset===scen.id?"#ECEAF8":"#C8C4DC", fontWeight:scenarioPreset===scen.id?500:400, letterSpacing:"-0.005em", fontFamily:"'Spectral','Iowan Old Style',Georgia,serif" }}>{scen.label}</div>
                  <div style={{ fontSize:8.5, color:"#5A567A", marginTop:2, letterSpacing:"0.01em", fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:400 }}>{scen.desc}</div>
                </span>
                <span style={{ fontSize:13, color:scenarioPreset===scen.id?"#A8A8F0":"#3A3658", fontFamily:"'Spectral',serif" }}>→</span>
              </button>
            ))}
          </div>
          {(() => {
            // v118: when a terrestrial governance-analogue preset is selected,
            // surface its framing so the facilitator can brief the table on the
            // rule philosophy this run is modelling (ATCM consensus / ITU
            // coordination), not just the clock and economy knobs.
            const g = getScenarioPreset(scenarioPreset)?.governance;
            if (!g) return null;
            // v131: the same framing panel serves governance analogues (ATCM /
            // ITU) and scenario briefings (strategic reserve). Label it by which.
            const isGovernance = scenarioPreset === "atcm" || scenarioPreset === "itu";
            const kindLabel = isGovernance ? "Governance analogue" : "Scenario briefing";
            return (
              <div style={{ marginTop:8, padding:"9px 11px", background:"rgba(52,96,168,0.07)", border:"1px solid rgba(128,176,216,0.18)", borderRadius:6 }}>
                <div style={{ fontSize:8.5, letterSpacing:"0.18em", color:"#80B0D8", textTransform:"uppercase", fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500, marginBottom:4 }}>{kindLabel} · {g.analogue}</div>
                <div style={{ fontSize:11, color:"#C8C4DC", fontStyle:"italic", lineHeight:1.45, fontFamily:"'Spectral',Georgia,serif", marginBottom:5 }}>{g.premise}</div>
                <div style={{ fontSize:10.5, color:"#8B86B0", lineHeight:1.5, fontFamily:"'Spectral',Georgia,serif" }}>{g.tabletop}</div>
              </div>
            );
          })()}
        </div>

        {/* ── Col 2 Row 3: Map Overlays (top) + Monte Carlo (bottom, always shown, dimmed when inactive) ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:9, height:"100%" }}>
          <div style={{ background:"rgba(27,25,52,0.92)", border:"1px solid rgba(200,196,220,0.14)", borderRadius:8, padding:"11px 14px", flex:1, display:"flex", flexDirection:"column", justifyContent:"center" }}>
            <div style={{ fontSize:9, letterSpacing:"0.22em", color:"#C0B8E8", marginBottom:10, paddingLeft:8, borderLeft:"2px solid #A8A8F0", textTransform:"uppercase", fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>Map Overlays</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
              {LAYER_TOGGLES.map(({ key, long }) => (
                <button key={key} onClick={()=>setShowLayers(s=>({...s,[key]:!s[key]}))} style={{
                  background:showLayers[key]?"rgba(192,184,232,0.12)":"rgba(200,196,220,0.04)",
                  border:`1px solid ${showLayers[key]?"rgba(192,184,232,0.32)":"rgba(200,196,220,0.10)"}`,
                  color:showLayers[key]?"#ECEAF8":"#8B86B0", borderRadius:4, padding:"9px 16px",
                  cursor:"pointer", fontSize:12,
                  fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", fontWeight:400,
                  letterSpacing:"-0.005em", display:"inline-flex", alignItems:"center", gap:7,
                }}>
                  <span style={{ display:"inline-block", width:7, height:7, borderRadius:"50%",
                    background:showLayers[key]?"#A8A8F0":"transparent",
                    border:`1px solid ${showLayers[key]?"#A8A8F0":"#5A567A"}` }}/>
                  {long}
                </button>
              ))}
            </div>
          </div>
          <div style={{
            background:"rgba(27,25,52,0.92)", border:"1px solid rgba(200,196,220,0.14)", borderRadius:8, padding:"11px 14px",
            opacity: simMode === "analysis" ? 1 : 0.45,
            transition:"opacity 0.2s",
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: simMode === "analysis" ? 7 : 5 }}>
              <div style={{ fontSize:9, letterSpacing:"0.22em", color:"#C0B8E8", paddingLeft:8, borderLeft:"2px solid #A8A8F0", textTransform:"uppercase", fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>Monte Carlo Trials</div>
              <span style={{ fontSize:12, fontWeight:500, color:"#C0B8E8", fontFamily:"'Spectral',Georgia,serif" }}>{batchRunCount} trial{batchRunCount!==1?"s":""}</span>
            </div>
            {simMode !== "analysis" && (
              <div style={{ fontSize:9, color:"#5A567A", fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", marginBottom:6, letterSpacing:"0.01em" }}>
                For Monte Carlo simulations only
              </div>
            )}
            <input type="range" min={1} max={500} step={1} value={batchRunCount}
              onChange={e=>setBatchRunCount(+e.target.value)}
              disabled={simMode !== "analysis"}
              style={{ width:"100%", accentColor:"#C0B8E8", cursor: simMode === "analysis" ? "pointer" : "default", marginBottom:6 }} />
            <div style={{ display:"flex", gap:5 }}>
              {[1,10,25,50,100,250].map(v => (
                <button key={v}
                  onClick={()=>{ if (simMode === "analysis") setBatchRunCount(v); }}
                  style={{
                    flex:1, background:batchRunCount===v?"rgba(192,184,232,0.12)":"rgba(200,196,220,0.05)",
                    border:`1px solid ${batchRunCount===v?"rgba(192,184,232,0.35)":"rgba(200,196,220,0.10)"}`,
                    color:batchRunCount===v?"#ECEAF8":"#8B86B0", borderRadius:4, padding:"6px 0",
                    cursor: simMode === "analysis" ? "pointer" : "default",
                    fontSize:12, fontFamily:"'Spectral',Georgia,serif",
                    fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
                  }}>{v}</button>
              ))}
            </div>
            {simMode === "analysis" && (
              <button onClick={() => runResearchSweep(RESEARCH_BATTERY, { timeseries: true })} disabled={batchRunning} style={{
                width:"100%", marginTop:8,
                background:"rgba(155,212,181,0.10)", border:"1px solid rgba(155,212,181,0.30)",
                color:"#9BD4B5", borderRadius:5, padding:"7px 0",
                cursor: batchRunning ? "default" : "pointer", opacity: batchRunning ? 0.5 : 1,
                fontSize:11, fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic",
              }} title="Run the full 13-config research battery (~2,550 seeded trials) and download one long-format CSV.">
                ⚗ Research sweep · 13 configs → CSV
              </button>
            )}
          </div>
        </div>

        {/* ── Col 3 Row 3: Exercise Briefing (stretches) + Deploy + Load ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:9, height:"100%" }}>
          <div style={{ background:"rgba(46,32,104,0.28)", border:"1px solid rgba(168,168,240,0.16)", borderRadius:8, padding:"11px 14px", flex:1, display:"flex", flexDirection:"column", justifyContent:"center" }}>
            <div style={{ fontSize:9, letterSpacing:"0.22em", color:"#C0B8E8", marginBottom:10, paddingLeft:8, borderLeft:"2px solid #A8A8F0", textTransform:"uppercase", fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>Exercise Briefing</div>
            <div style={{ fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", fontSize:12.5, color:"#C8C4DC", lineHeight:1.75, letterSpacing:"0.002em" }}>
              {simMode === "analysis" ? (
                <>
                  <div>i. &nbsp;Launch a seeded batch of automated trials.</div>
                  <div>ii. &nbsp;Watch the indicator fill as runs complete.</div>
                  <div>iii. &nbsp;Review yields, violations, and grid outcomes.</div>
                  <div>iv. &nbsp;Open any run and replay it day by day.</div>
                </>
              ) : (
                <>
                  <div>i. &nbsp;<span style={{color:"#A8A8F0",fontStyle:"normal",fontFamily:"'Bricolage Grotesque',sans-serif",fontWeight:500,fontSize:11}}>{actorLabel(0)}</span> plans an action, concludes the round.</div>
                  <div>ii. &nbsp;<span style={{color:"#80B0D8",fontStyle:"normal",fontFamily:"'Bricolage Grotesque',sans-serif",fontWeight:500,fontSize:11}}>{actorLabel(1)}</span> plans an action, concludes the round.</div>
                  <div>iii. &nbsp;Both actions resolve simultaneously.</div>
                  <div>iv. &nbsp;Repeat until the regime ends.</div>
                </>
              )}
            </div>
          </div>
          <div style={{ flexShrink:0 }}>
            <input ref={saveFileInputRef} type="file" accept=".json" style={{ display:"none" }}
              onChange={e => { importSaveGame(e.target.files?.[0]); e.target.value = ""; }} />
            <button onClick={() => saveFileInputRef.current?.click()} style={{
              width:"100%", background:"transparent",
              border:"1px solid rgba(200,196,220,0.14)",
              color:"#C0B8E8", borderRadius:5, padding:"9px 0 10px", cursor:"pointer",
              fontSize:10, letterSpacing:"0.18em",
              fontFamily:"'Bricolage Grotesque',sans-serif",
              fontWeight:400, textTransform:"uppercase",
            }}>
              Load Saved Session
              <div style={{ fontSize:8, color:"#5A567A", textAlign:"center", marginTop:5, letterSpacing:"0.02em", fontStyle:"italic", fontFamily:"'Spectral',Georgia,serif", textTransform:"none" }}>
                Load a .json save file from a previous session
              </div>
            </button>
          </div>
          <button onClick={()=>{
            if (simMode==="analysis") startBatchRunner();
            else { setUndoStack([]); setPhase(PHASE.SETUP1); }
          }} style={{
            width:"100%",
            background:"linear-gradient(180deg, rgba(168,168,240,0.18) 0%, rgba(46,32,104,0.4) 100%)",
            border:"1px solid rgba(168,168,240,0.45)",
            color:"#ECEAF8", borderRadius:6, padding:"13px 0 14px", cursor:"pointer",
            fontSize:14, letterSpacing:"0.04em",
            fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
            fontWeight:400, fontStyle:"italic",
            boxShadow:"0 8px 24px rgba(46,32,104,0.35), inset 0 1px 0 rgba(236,234,248,0.08)",
            flexShrink:0,
          }}>
            <div style={{ fontSize:8.5, letterSpacing:"0.34em", color:"#A8A8F0", fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500, fontStyle:"normal", marginBottom:5, textTransform:"uppercase" }}>
              {simMode==="analysis" ? "Begin" : "Initiate"}
            </div>
            {simMode==="analysis" ? "Run Batch Simulation" : "Deploy Mission"}
          </button>
        </div>

      </div>{/* end main config grid */}
    </div>
  </>);

  // ── Main HUD ─────────────────────────────────────────────────────────────
  if (phase===PHASE.BATCH) {
    const pct = Math.round((batchProgress.completed / Math.max(1, batchProgress.total)) * 100);
    const bestRun = batchResult?.runs?.slice().sort((a, b) => Math.abs(b.summary.score1 - b.summary.score2) - Math.abs(a.summary.score1 - a.summary.score2))[0];
    return (<>
      {roleBannerEl}
    {facilitatorPanelEl}
    {negotiationPanelEl}
    {zoneLegendEl}
    {assetDetailSidebarEl}
    {exploreSidebarEl}
    {gifReadyModalEl}
    {devFacilitatorButtonEl}
    {injectResponseModalEl}
      <div style={{
        minHeight:"100vh",
        background:"radial-gradient(ellipse at 35% 25%, #1A1830 0%, #0B0918 55%, #141220 100%)",
        fontFamily:"'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,sans-serif", color:"#C8C4DC",
        display:"flex", flexDirection:"column", alignItems:"center", padding:"28px 20px",
      }}>
        <div style={{ width:"100%", maxWidth:760, display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:24 }}>
          <div>
            <div style={{ fontSize:8.5, letterSpacing:"0.42em", color:"#8B86B0",
              fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500,
              textTransform:"uppercase", marginBottom:6 }}>
              Monte Carlo Trials
            </div>
            <div style={{ fontSize:28, color:"#ECEAF8", letterSpacing:"-0.012em",
              fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
              fontStyle:"italic", fontWeight:300, lineHeight:1.1 }}>
              {batchRunning ? <>Running <span style={{fontWeight:600}}>batch</span></>
                : <>Batch <span style={{fontWeight:600}}>results</span></>}
            </div>
          </div>
          <button onClick={()=>!batchRunning && !replayLoading && setPhase(PHASE.SETTINGS)} disabled={batchRunning || replayLoading} style={{
            background:"rgba(200,196,220,0.05)", border:"1px solid rgba(200,196,220,0.14)",
            color:(batchRunning || replayLoading)?"#3A3658":"#C0B8E8", borderRadius:6, padding:"8px 16px",
            cursor:(batchRunning || replayLoading)?"default":"pointer",
            fontSize:12, fontFamily:"'Spectral',Georgia,serif",
            fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
          }}>← Back</button>
        </div>

        {batchRunning ? (
          <div style={{ width:"100%", maxWidth:520, background:"rgba(27,25,52,0.92)", border:"1px solid rgba(200,196,220,0.14)",
            borderRadius:12, padding:"36px 32px", textAlign:"center", boxShadow:"0 0 40px rgba(168,168,240,0.08)" }}>
            <div style={{
              width:180, height:180, margin:"0 auto 24px", borderRadius:"50%",
              background:`conic-gradient(#C0B8E8 ${pct}%, rgba(200,196,220,0.10) 0%)`,
              display:"grid", placeItems:"center", boxShadow:"0 0 30px rgba(192,184,232,0.15)"
            }}>
              <div style={{
                width:142, height:142, borderRadius:"50%", background:"rgba(20,18,32,0.97)",
                border:"1px solid rgba(200,196,220,0.08)", display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center"
              }}>
                <div style={{ fontSize:34, color:"#ECEAF8",
                  fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
                  fontWeight:300, fontStyle:"italic", letterSpacing:"-0.02em" }}>{pct}<span style={{fontSize:18,color:"#8B86B0"}}>%</span></div>
                <div style={{ fontSize:10, color:"#8B86B0", letterSpacing:"-0.005em",
                  fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", marginTop:2 }}>
                  {batchProgress.completed} of {batchProgress.total}
                </div>
              </div>
            </div>
            <div style={{ fontSize:13, color:"#C0B8E8", letterSpacing:"-0.005em",
              fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", marginBottom:10 }}>
              Simulating strategic trials
            </div>
            <div style={{ fontSize:10, color:"#8B86B0", lineHeight:1.7,
              fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
              Ruleset: {scenarioPreset} · {missionEndMode === "depletion" ? "until depletion" : `${totalRounds} rounds · ${totalRounds * DAYS_PER_ROUND} days`}
              {scenarioPreset === "unevenArrival" && <> · Actor II delay {arrivalDelay}d</>}
              {gridSharingEnabled ? ` · sharing ${gridSharingPermanent ? "permanent" : "reversible"}` : " · sharing disabled"}
            </div>
            {batchProgress.currentSeed != null && (
              <div style={{ marginTop:12, fontSize:9, color:"#5A567A",
                fontFamily:"'Bricolage Grotesque',sans-serif", letterSpacing:"0.08em" }}>
                seed {batchProgress.currentSeed}
              </div>
            )}
          </div>
        ) : replayLoading ? (
          <div style={{ width:"100%", maxWidth:520, background:"rgba(27,25,52,0.92)", border:"1px solid rgba(200,196,220,0.14)",
            borderRadius:12, padding:"36px 32px", textAlign:"center", boxShadow:"0 0 40px rgba(168,168,240,0.08)" }}>
            <div style={{ width:28, height:28, margin:"0 auto 16px", borderRadius:"50%", border:"2px solid rgba(192,184,232,0.25)",
              borderTopColor:"#C0B8E8", animation:"spin 1s linear infinite" }} />
            <div style={{ fontSize:13, color:"#C0B8E8", letterSpacing:"-0.005em",
              fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", marginBottom:10 }}>
              Rebuilding replay
            </div>
            <div style={{ fontSize:10, color:"#8B86B0", lineHeight:1.7,
              fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", maxWidth:340, margin:"0 auto" }}>
              Re-simulating the selected run from its stored seed to avoid keeping every long-match frame in memory.
            </div>
          </div>
        ) : batchResult ? (
          <div style={{ width:"100%", maxWidth:860, display:"flex", flexDirection:"column", gap:9 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))", gap:8 }}>
              {[
                [`Actor I win rate`, `${(batchResult.p1WinRate * 100).toFixed(1)}%`, "#A8A8F0"],
                [`Actor II win rate`, `${(batchResult.p2WinRate * 100).toFixed(1)}%`, "#F0A030"],
                [`Avg. ice`, `${batchResult.avgIce1.toFixed(0)} / ${batchResult.avgIce2.toFixed(0)} kg`, "#C0B8E8"],
                [`Avg. extracted`, `${batchResult.avgExtracted.toFixed(0)} / ${batchResult.totalMapIce.toFixed(0)} kg`, "#9BD4B5"],
                [`Map extraction`, `${(batchResult.avgExtractedPct * 100).toFixed(1)}%`, "#9BD4B5"],
                [`Avg. score`, `${batchResult.avgScore1.toFixed(0)} / ${batchResult.avgScore2.toFixed(0)}`, "#ECEAF8"],
                [`Join rate`, `${(batchResult.joinRate * 100).toFixed(1)}%`, "#C0B8E8"],
                [`Avg. shared days`, `${batchResult.avgSharedDays.toFixed(1)}`, "#C0B8E8"],
              ].map(([label, value, color]) => (
                <div key={label} style={{ background:"rgba(27,25,52,0.92)",
                  border:`1px solid ${color}22`, borderLeft:`2px solid ${color}88`,
                  borderRadius:6, padding:"12px 14px" }}>
                  <div style={{ fontSize:9, color:"#8B86B0", letterSpacing:"0.18em",
                    fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500,
                    textTransform:"uppercase" }}>{label}</div>
                  <div style={{ marginTop:6, fontSize:18, color,
                    fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
                    fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em" }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={startBatchRunner} style={{
                background:"rgba(192,184,232,0.12)", border:"1px solid rgba(192,184,232,0.4)",
                color:"#ECEAF8", borderRadius:6, padding:"10px 18px", cursor:"pointer",
                fontSize:13, fontFamily:"'Spectral',Georgia,serif",
                fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
              }}>Run again</button>
              <button onClick={exportBatchTrialsCsv} style={{
                background:"rgba(155,212,181,0.10)", border:"1px solid rgba(155,212,181,0.35)",
                color:"#9BD4B5", borderRadius:6, padding:"10px 18px", cursor:"pointer",
                fontSize:13, fontFamily:"'Spectral',Georgia,serif",
                fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
              }}>CSV · all {batchResult.totalRuns} trials</button>
              {bestRun && (
                <button onClick={()=>watchReplayRun(bestRun)} style={{
                  background:"rgba(168,168,240,0.12)", border:"1px solid rgba(168,168,240,0.4)",
                  color:"#ECEAF8", borderRadius:6, padding:"10px 18px", cursor:"pointer",
                  fontSize:13, fontFamily:"'Spectral',Georgia,serif",
                  fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
                }}>Watch representative run</button>
              )}
            </div>

            <div style={{ background:"rgba(27,25,52,0.92)", border:"1px solid rgba(200,196,220,0.14)", borderRadius:10, padding:"11px 14px" }}>
              <div style={{ fontSize:9, letterSpacing:"0.22em", color:"#C0B8E8", marginBottom:12,
                paddingLeft:10, borderLeft:"2px solid #A8A8F0", textTransform:"uppercase",
                fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>
                Individual Runs
              </div>
              <div style={{ maxHeight:420, overflowY:"auto", display:"flex", flexDirection:"column", gap:6 }}>
                {batchResult.runs.map((run, idx) => (
                  <div key={run.seed} style={{ display:"grid", gridTemplateColumns:"58px 90px 1fr 1fr 88px", gap:10, alignItems:"center",
                    padding:"9px 12px", borderRadius:6,
                    background:"rgba(200,196,220,0.03)",
                    border:"1px solid rgba(200,196,220,0.08)" }}>
                    <div style={{ fontSize:10, color:"#8B86B0",
                      fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>Run {idx+1}</div>
                    <div style={{ fontSize:11,
                      color:run.summary.winner===1?"#A8A8F0":run.summary.winner===2?"#F0A030":"#8B86B0",
                      fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic",
                      letterSpacing:"-0.005em" }}>
                      {run.summary.winner===0 ? "Draw" : run.summary.winner===1 ? actorLabel(0) : actorLabel(1)}
                    </div>
                    <div style={{ fontSize:10, color:"#8B86B0", letterSpacing:"-0.002em",
                      fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:400 }}>
                      score {run.summary.score1.toFixed(0)}/{run.summary.score2.toFixed(0)} · ice {run.summary.ice1.toFixed(0)}/{run.summary.ice2.toFixed(0)}
                    </div>
                    <div style={{ fontSize:10, color:"#8B86B0", letterSpacing:"-0.002em",
                      fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:400 }}>
                      violations {run.summary.vio1.toFixed(0)}/{run.summary.vio2.toFixed(0)} · extracted {(run.summary.extractedPct * 100).toFixed(1)}%
                    </div>
                    <button onClick={()=>watchReplayRun(run)} style={{
                      background:"rgba(200,196,220,0.06)", border:"1px solid rgba(200,196,220,0.14)",
                      color:"#C0B8E8", borderRadius:5, padding:"6px 10px", cursor:"pointer",
                      fontSize:11, fontFamily:"'Spectral',Georgia,serif",
                      fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
                    }}>Watch</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>);
  }

  if (!dataReady) return (<>
    {roleBannerEl}
    {facilitatorPanelEl}
    {negotiationPanelEl}
    {zoneLegendEl}
    {assetDetailSidebarEl}
    {exploreSidebarEl}
    {gifReadyModalEl}
    {devFacilitatorButtonEl}
    {injectResponseModalEl}
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      height:"100vh",background:"radial-gradient(ellipse at 35% 25%, #1A1830 0%, #0B0918 55%, #141220 100%)",
      color:"#C0B8E8",fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic",
      fontSize:14, letterSpacing:"-0.005em", gap:18}}>
      <div style={{ width:32, height:32, borderRadius:"50%", border:"2px solid rgba(168,168,240,0.18)",
        borderTopColor:"#A8A8F0", animation:"spin 1s linear infinite" }}/>
      Loading lunar map data…
    </div>
  </>);

  // Favorability values at the hover cursor, computed once here so both the
  // terrain readout (inside its IIFE) and the tricolor guide (outside it) share
  // the same values without duplication.
  const hoverFavData = hover ? (() => {
    const ix = siteIndices(hover.x, hover.y);
    return {
      lfi:  ix ? ix.lfi  : null,
      sofi: ix ? ix.sofi : null,
      ifi:  ix ? ix.ifi  : null,
    };
  })() : null;

  // Hoisted hover terrain readout data, shared between the bottom-right
  // terrain readout (now removed) and the tricolor widget.
  const hoverData = hover ? (() => {
    const { lat, lon } = pxToLatLon(hover.x, hover.y);
    const idx = hover.y * W + hover.x;
    const tempNorm = TEMPERATURE_MAP[idx];
    const tempK = Math.round(25 + tempNorm * 275);
    return {
      lat, lon,
      inPSR: PSR_MASK[idx] === 1,
      onRidge: RIDGE_MASK[idx] === 1,
      illum: (ILLUM_MAP[idx] * 100).toFixed(0),
      ice: (ICE_DEPTH_MAP[idx] * 100).toFixed(0),
      h2: (HYDROGEN_MAP[idx] * 100).toFixed(0),
      slope: SLOPE_MAP[idx].toFixed(0),
      tempK,
    };
  })() : null;

  return (<>
    {roleBannerEl}
    {facilitatorPanelEl}
    {negotiationPanelEl}
    {zoneLegendEl}
    {assetDetailSidebarEl}
    {exploreSidebarEl}
    {gifReadyModalEl}
    {devFacilitatorButtonEl}
    {injectResponseModalEl}
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse at 25% 15%, #1A1830 0%, #0B0918 55%, #141220 100%)",
      fontFamily:"'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,sans-serif", color:"#C8C4DC",
      display:"flex", flexDirection:"column", alignItems:"center",
      padding:"8px",
    }}>
      {/* Workshop-mode hint band */}
      {workshopMode && (
        <div style={{
          width:"100%", maxWidth:1400, marginBottom:6,
          background:"linear-gradient(90deg, rgba(168,168,240,0.10) 0%, rgba(46,32,104,0.18) 100%)",
          borderLeft:"2px solid rgba(168,168,240,0.5)",
          borderRadius:3,
          padding:"6px 12px",
          fontSize:10.5, color:"#C0B8E8", letterSpacing:"-0.002em",
          fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic",
          display:"flex", alignItems:"center", justifyContent:"space-between", gap:12,
        }}>
          <span>
            <span style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontStyle:"normal",
              fontWeight:500, fontSize:8.5, letterSpacing:"0.22em", textTransform:"uppercase",
              color:"#A8A8F0", marginRight:10 }}>Workshop</span>
            Participants see actor-level decisions only. Engineering detail hidden.
          </span>
        </div>
      )}

      {/* Top bar */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        width:"100%", maxWidth:1400, marginBottom:6 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <svg width="16" height="16" viewBox="0 0 22 22" style={{ display:"block", flexShrink:0 }}>
            <defs>
              <radialGradient id="moonGradTop" cx="0.35" cy="0.35">
                <stop offset="0%" stopColor="#ECEAF8" stopOpacity="0.95"/>
                <stop offset="100%" stopColor="#A8A8F0" stopOpacity="0.65"/>
              </radialGradient>
            </defs>
            <circle cx="11" cy="11" r="9" fill="url(#moonGradTop)"/>
            <circle cx="14.5" cy="9.5" r="8.5" fill="#1B1934"/>
          </svg>
          <div>
            <div style={{ fontSize:8, letterSpacing:"0.28em", color:"#8B86B0",
              fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500, marginBottom:2,
              textTransform:"uppercase" }}>Open Lunar Foundation</div>
            <h1 style={{ margin:0, fontSize:17, fontWeight:300, letterSpacing:"-0.01em",
              fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
              color:"#ECEAF8", fontStyle:"italic", lineHeight:1 }}>
              Over<span style={{ fontWeight:600 }}>lap</span><span style={{ fontWeight:300, fontSize:11, color:"#8B86B0", fontStyle:"normal", letterSpacing:"0.08em", marginLeft:9 }}>a lunar policy sandbox</span>
            </h1>
          </div>
        </div>
        <div style={{ display:"flex", gap:4, alignItems:"center" }}>
          {/* Layers popover trigger */}
          <button onClick={() => setLayersPanelOpen(v => !v)} title="Overlay layers"
            style={{
              background: activeOverlays.size > 0 ? "rgba(168,168,240,0.18)" : "rgba(200,196,220,0.04)",
              border:`1px solid ${activeOverlays.size > 0 ? "rgba(168,168,240,0.45)" : "rgba(200,196,220,0.10)"}`,
              color: activeOverlays.size > 0 ? "#ECEAF8" : "#8B86B0",
              borderRadius:4, padding:"5px 10px", cursor:"pointer", fontSize:10,
              fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", fontWeight:400,
              display:"inline-flex", alignItems:"center", gap:6,
            }}>
            <span style={{ display:"inline-flex", gap:2 }}>
              {LAYER_INFO.slice(0,5).map((L) => (
                <span key={L.key} style={{
                  width:6, height:6, borderRadius:"50%",
                  background: activeOverlays.has(L.key) ? L.color : "transparent",
                  border: `1px solid ${activeOverlays.has(L.key) ? L.color : "#5A567A"}`,
                }}/>
              ))}
            </span>
            Layers{activeOverlays.size > 0 ? ` · ${activeOverlays.size}` : ""}
          </button>
          {LAYER_TOGGLES.map(({ key, short }) => (
            <button key={key} onClick={()=>setShowLayers(s=>({...s,[key]:!(s[key]===false?false:s[key]!==false?true:false)}))}
              title={`Toggle ${key} layer`} style={{
              background:(showLayers[key]!==false)?"rgba(192,184,232,0.12)":"rgba(200,196,220,0.04)",
              border:`1px solid ${(showLayers[key]!==false)?"rgba(192,184,232,0.3)":"rgba(200,196,220,0.10)"}`,
              color:(showLayers[key]!==false)?"#ECEAF8":"#8B86B0", borderRadius:4, padding:"4px 9px",
              cursor:"pointer", fontSize:10,
              fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", fontWeight:400,
              letterSpacing:"-0.005em",
              display:"inline-flex", alignItems:"center", gap:5,
            }}>
              <span style={{ display:"inline-block", width:5, height:5, borderRadius:"50%",
                background:showLayers[key]?"#A8A8F0":"transparent",
                border:`1px solid ${showLayers[key]?"#A8A8F0":"#5A567A"}` }}/>
              {short}
            </button>
          ))}
          <button onClick={() => setAutoPilot(v => !v)} title="Auto-allocate budget and prompt resupply when assets are damaged"
            style={{
              background: autoPilot ? "rgba(155,212,181,0.15)" : "rgba(200,196,220,0.04)",
              border: `1px solid ${autoPilot ? "rgba(155,212,181,0.45)" : "rgba(200,196,220,0.12)"}`,
              color: autoPilot ? "#9BD4B5" : "#8B86B0",
              borderRadius: 4, padding: "4px 10px", cursor: "pointer",
              fontSize: 10, fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic", fontWeight: 400,
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>
            <span style={{
              display: "inline-block", width: 5, height: 5, borderRadius: "50%",
              background: autoPilot ? "#9BD4B5" : "transparent",
              border: `1px solid ${autoPilot ? "#9BD4B5" : "#5A567A"}`,
            }}/>
            Autopilot{autoPilot ? " on" : ""}
          </button>
          <button onClick={reset} title="Restart exercise" style={{ background:"transparent",
            border:"1px solid rgba(200,196,220,0.12)",
            color:"#8B86B0", borderRadius:4, padding:"4px 10px", cursor:"pointer",
            fontSize:11,
            fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", fontWeight:400 }}>Reset</button>
        </div>
      </div>

      {/* Layers popover panel -- appears below the top bar when open */}
      {layersPanelOpen && (
        <div style={{
          width:"100%", maxWidth:1400, marginBottom:6,
          background:"rgba(20,18,32,0.96)",
          border:"1px solid rgba(168,168,240,0.32)",
          borderLeft:"2px solid rgba(168,168,240,0.65)",
          borderRadius:6, padding:"12px 16px 14px",
          boxShadow:"0 10px 30px rgba(0,0,0,0.5)",
        }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:9, letterSpacing:"0.28em", color:"#C0B8E8",
              fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>
              MAP OVERLAYS · click to toggle · stack any combination
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setActiveOverlays(new Set())} style={{
                background:"transparent", border:"1px solid rgba(200,196,220,0.18)",
                color:"#8B86B0", borderRadius:3, padding:"3px 9px", cursor:"pointer",
                fontSize:10, fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
                Clear all
              </button>
              <button onClick={() => setLayersPanelOpen(false)} style={{
                background:"transparent", border:"none",
                color:"#8B86B0", cursor:"pointer", fontSize:14, lineHeight:1, padding:"0 4px" }}>×</button>
            </div>
          </div>
          {/* v182: curated presets, one tap to a focused view. The full grouped
              list below stays for advanced users who want to customize. */}
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 8.5, letterSpacing: "0.2em", color: "#5A567A",
              fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 500,
              textTransform: "uppercase", marginBottom: 6,
            }}>Quick views</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {LAYER_PRESETS.map((preset) => {
                const active = activePresetKey === preset.key;
                return (
                  <button key={preset.key} onClick={() => applyLayerPreset(preset)} title={preset.desc}
                    style={{
                      background: active ? `linear-gradient(135deg, ${preset.color}30, ${preset.color}12)` : "rgba(200,196,220,0.04)",
                      border: `1px solid ${active ? preset.color : "rgba(200,196,220,0.14)"}`,
                      borderRadius: 5, padding: "7px 13px", cursor: "pointer",
                      color: active ? "#ECEAF8" : "#A8A4C0",
                      fontFamily: "'Bricolage Grotesque',sans-serif",
                      fontSize: 11, fontWeight: active ? 600 : 500, letterSpacing: "0.02em",
                      display: "inline-flex", alignItems: "center", gap: 7,
                      boxShadow: active ? `0 0 12px ${preset.color}33` : "none",
                      transition: "all 0.12s",
                    }}>
                    <span style={{
                      width: 9, height: 9, borderRadius: "50%", background: preset.color,
                      boxShadow: active ? `0 0 7px ${preset.color}` : "none",
                      opacity: active ? 1 : 0.6, flexShrink: 0,
                    }}/>
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Base map switcher */}
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 8.5, letterSpacing: "0.2em", color: "#5A567A",
              fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 500,
              textTransform: "uppercase", marginBottom: 6,
            }}>Base map</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {BASEMAP_OPTIONS.map((opt) => {
                const active = baseMap === opt.key;
                const url = MAP_LAYERS[opt.key];
                return (
                  <button key={opt.key} onClick={() => setBaseMap(opt.key)} title={opt.subtitle}
                    style={{
                      width: 138, padding: 0,
                      background: "transparent",
                      border: `1px solid ${active ? "#A8A8F0" : "rgba(200,196,220,0.18)"}`,
                      borderRadius: 5, cursor: "pointer",
                      boxShadow: active ? "0 0 14px rgba(168,168,240,0.32), inset 0 0 0 1px rgba(168,168,240,0.3)" : "none",
                      overflow: "hidden",
                      display: "flex", flexDirection: "column",
                      transition: "all 0.12s",
                    }}>
                    <div style={{
                      width: "100%", height: 90,
                      background: url ? `url(${url}) center/cover` : "#1B1934",
                      borderBottom: `1px solid ${active ? "rgba(168,168,240,0.3)" : "rgba(200,196,220,0.08)"}`,
                    }}/>
                    <div style={{ padding: "7px 9px 9px", textAlign: "left", background: "rgba(20,18,32,0.75)" }}>
                      <div style={{
                        fontFamily: "'Spectral',Georgia,serif", fontSize: 12, fontStyle: "italic",
                        fontWeight: 500, color: active ? "#ECEAF8" : "#C0B8E8",
                        letterSpacing: "-0.005em",
                      }}>{opt.label}</div>
                      <div style={{
                        fontSize: 9.5, color: "#8B86B0", marginTop: 1,
                        fontFamily: "'Bricolage Grotesque',sans-serif",
                        lineHeight: 1.3,
                      }}>{opt.subtitle}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vector physics overlays -- toggleable, stack any combination */}
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 8.5, letterSpacing: "0.2em", color: "#5A567A",
              fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 500,
              textTransform: "uppercase", marginBottom: 6,
            }}>Physics overlays · raster contours</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {VECTOR_OVERLAYS.map((vo) => {
                const active = activeVectorOverlays.has(vo.key);
                return (
                  <button key={vo.key}
                    onClick={() => {
                      setActiveVectorOverlays(prev => {
                        const next = new Set(prev);
                        if (next.has(vo.key)) next.delete(vo.key);
                        else next.add(vo.key);
                        return next;
                      });
                    }}
                    title={vo.description}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 8,
                      background: active ? `${vo.color}1c` : "rgba(200,196,220,0.04)",
                      border: `1px solid ${active ? vo.color + "88" : "rgba(200,196,220,0.14)"}`,
                      borderLeft: `3px solid ${active ? vo.color : "transparent"}`,
                      borderRadius: 3, padding: "6px 10px",
                      cursor: "pointer", textAlign: "left",
                      transition: "all 0.12s",
                    }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: 2, flexShrink: 0, marginTop: 1,
                      background: active ? vo.color : "transparent",
                      border: `1.5px solid ${vo.color}`,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "#0F0C1E", fontWeight: 700,
                    }}>{active ? "✓" : ""}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontFamily: "'Spectral',Georgia,serif",
                        fontSize: 12, fontStyle: "italic", fontWeight: 500,
                        color: active ? "#ECEAF8" : "#C0B8E8",
                      }}>{vo.label}</div>
                      <div style={{
                        fontSize: 9.5, color: "#8B86B0", marginTop: 1,
                        fontFamily: "'Bricolage Grotesque',sans-serif",
                        lineHeight: 1.3,
                      }}>{vo.description}</div>
                      {/* v92: band legend, shown inline when overlay is active */}
                      {active && vo.bands && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                          {vo.bands.map((band) => (
                            <div key={band.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{
                                width: 12, height: 12, flexShrink: 0, borderRadius: 2,
                                background: band.color,
                                border: `1px solid ${band.border}`,
                                display: "inline-block",
                              }} />
                              <span style={{
                                fontSize: 9, color: "#C0B8E8",
                                fontFamily: "'Bricolage Grotesque',sans-serif",
                              }}>{band.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* v105: crisp vector favorability overlay -- a published true-vector
              plate layered over the basemap, sharp at any zoom (unlike the
              canvas-drawn composite). */}
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 8.5, letterSpacing: "0.2em", color: "#5A567A",
              fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 500,
              textTransform: "uppercase", marginBottom: 6,
            }}>Favorability overlay · crisp vector</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {[
                { key: null,                    label: "Off",       color: "#8B86B0" },
                { key: "basemap_fig_composite", label: "Composite", color: "#A8A8F0" },
                { key: "basemap_fig_lfi",       label: "LFI",       color: "#E63B2E" },
                { key: "basemap_fig_sofi",      label: "SOFI",      color: "#5DCAA5" },
                { key: "basemap_fig_ifi",       label: "IFI",       color: "#6E7BE8" },
              ].map((opt) => {
                const active = vectorOverlay === opt.key;
                return (
                  <button key={opt.label}
                    onClick={() => setVectorOverlay(opt.key)}
                    title={opt.key ? `Crisp vector ${opt.label} overlay` : "Turn the vector overlay off"}
                    style={{
                      flex: "1 1 auto", minWidth: 52,
                      background: active ? `${opt.color}22` : "rgba(200,196,220,0.04)",
                      border: `1px solid ${active ? opt.color + "99" : "rgba(200,196,220,0.14)"}`,
                      borderRadius: 3, padding: "5px 8px", cursor: "pointer",
                      fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 10,
                      fontWeight: active ? 700 : 500, letterSpacing: "0.04em",
                      color: active ? "#ECEAF8" : "#C0B8E8", textAlign: "center",
                      transition: "all 0.12s",
                    }}>{opt.label}</button>
                );
              })}
            </div>
            {vectorOverlay && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
                <span style={{ fontSize: 9, color: "#8B86B0", fontFamily: "'Bricolage Grotesque',sans-serif", letterSpacing: "0.04em" }}>OPACITY</span>
                <input type="range" min="0.2" max="1" step="0.05" value={vectorOverlayOpacity}
                  onChange={e => setVectorOverlayOpacity(parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: "#A8A8F0" }} />
                <span style={{ fontSize: 9, color: "#C0B8E8", fontFamily: "'Bricolage Grotesque',monospace", width: 28, textAlign: "right" }}>{Math.round(vectorOverlayOpacity*100)}%</span>
              </div>
            )}
          </div>

          {/* Group by category */}
          {["favorability","feasibility","ice","illum","thermal","comms","terrain"].map((group) => {
            const items = LAYER_INFO.filter(L => L.group === group);
            if (items.length === 0) return null;
            const groupLabel = { favorability:"Mission-phase favorability", feasibility:"Asset placement feasibility", ice:"Ice & volatiles", illum:"Illumination", thermal:"Thermal", comms:"Communications", terrain:"Terrain" }[group];
            const groupAllowed = !workshopMode || group !== "terrain";
            if (!groupAllowed) return null;
            return (
              <div key={group} style={{ marginBottom: 10 }}>
                <div style={{
                  fontSize:8.5, letterSpacing:"0.2em", color:"#5A567A",
                  fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500,
                  textTransform:"uppercase", marginBottom:5,
                }}>{groupLabel}</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {items.map((L) => {
                    const active = activeOverlays.has(L.key);
                    return (
                      <button key={L.key} onClick={() => toggleOverlay(L.key)} title={L.desc}
                        style={{
                          background: active ? `linear-gradient(135deg, ${L.color}28, ${L.color}10)` : "rgba(200,196,220,0.04)",
                          border: `1px solid ${active ? L.color : "rgba(200,196,220,0.14)"}`,
                          borderRadius:4, padding:"6px 11px", cursor:"pointer",
                          color: active ? "#ECEAF8" : "#A8A4C0",
                          fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic",
                          fontSize:11.5, fontWeight:400, letterSpacing:"-0.005em",
                          display:"inline-flex", alignItems:"center", gap:7,
                          boxShadow: active ? `0 0 10px ${L.color}33` : "none",
                          transition:"all 0.12s",
                        }}>
                        <span style={{
                          width:9, height:9, borderRadius:"50%", background: L.color,
                          boxShadow: active ? `0 0 6px ${L.color}` : "none",
                          opacity: active ? 1 : 0.5,
                          flexShrink:0,
                        }}/>
                        {L.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div style={{
            marginTop:8, paddingTop:8,
            borderTop:"1px solid rgba(200,196,220,0.08)",
            fontSize:10.5, color:"#8B86B0",
            fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic",
            lineHeight:1.5,
          }}>
            Overlays composite additively: when high values from two layers coincide,
            their colors mix and brighten. Try stacking <span style={{color:"#5AB4FF"}}>ice depth</span>{" "}
            with <span style={{color:"#5AE0D8"}}>water/hydrogen</span> to find the strongest
            cryotrap signatures.
          </div>
        </div>
      )}

      {/* ── Tool Toolbar ─────────────────────────────────────────────────── */}
      <div style={{ display:"flex", gap:4, width:"100%", maxWidth:1400, marginBottom:5,
        background:"rgba(20,18,32,0.88)", border:"1px solid rgba(200,196,220,0.08)",
        borderRadius:6, padding:"5px 8px", alignItems:"center", flexWrap:"wrap" }}>

        {/* Sim mode badge */}
        <div style={{ fontSize:11, color:"#C0B8E8", letterSpacing:"-0.005em",
          fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", fontWeight:400,
          marginRight:6, whiteSpace:"nowrap" }}>
          {replayActive ? "Replay" : simMode==="solo"?"Single-Actor":simMode==="analysis"?"Monte Carlo":"Two-Actor"}
        </div>

        <div style={{ width:1, height:16, background:"rgba(200,196,220,0.10)" }}/>

        {/* Workshop-mode toggle -- hides engineering detail for facilitated sessions */}
        <button onClick={()=>setWorkshopMode(v=>!v)}
          title={workshopMode ? "Show full engineering model" : "Hide engineering detail for participants"}
          style={{
          background: workshopMode ? "rgba(168,168,240,0.18)" : "rgba(200,196,220,0.05)",
          border:`1px solid ${workshopMode?"rgba(168,168,240,0.45)":"rgba(200,196,220,0.10)"}`,
          color: workshopMode ? "#ECEAF8" : "#8B86B0",
          borderRadius:4, padding:"4px 10px", cursor:"pointer",
          fontSize:8.5, letterSpacing:"0.18em",
          fontFamily:"'Bricolage Grotesque',sans-serif",
          fontWeight:500, textTransform:"uppercase",
          whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:6,
        }}>
          <span style={{ display:"inline-block", width:5, height:5, borderRadius:"50%",
            background: workshopMode ? "#A8A8F0" : "transparent",
            border: `1px solid ${workshopMode?"#A8A8F0":"#5A567A"}` }}/>
          Workshop
        </button>

        {/* v175/v187: score-reveal stages, hidden → approximation → actual.
            Default is hidden; the facilitator steps the reveal up for players.
            The facilitator's own Scorebar always shows the actual metrics. */}
        <button onClick={()=>setScoreVisibility(v => v === "hidden" ? "proxy" : v === "proxy" ? "shown" : "hidden")}
          title={
            scoreVisibility === "shown" ? "Players see ACTUAL metrics, click to hide"
            : scoreVisibility === "proxy" ? "Players see an APPROXIMATE standing, click to reveal actual metrics"
            : "Players see NOTHING (very hidden), click to reveal an approximate standing"
          }
          style={{
          background: scoreVisibility !== "shown" ? "rgba(232,201,152,0.16)" : "rgba(200,196,220,0.05)",
          border:`1px solid ${scoreVisibility!=="shown"?"rgba(232,201,152,0.45)":"rgba(200,196,220,0.10)"}`,
          color: scoreVisibility !== "shown" ? "#E8C998" : "#8B86B0",
          borderRadius:4, padding:"4px 10px", cursor:"pointer",
          fontSize:8.5, letterSpacing:"0.18em",
          fontFamily:"'Bricolage Grotesque',sans-serif",
          fontWeight:500, textTransform:"uppercase",
          whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:6,
        }}>
          <span style={{ display:"inline-block", width:5, height:5, borderRadius:"50%",
            background: scoreVisibility !== "shown" ? "#E8C998" : "transparent",
            border: `1px solid ${scoreVisibility!=="shown"?"#E8C998":"#5A567A"}` }}/>
          {scoreVisibility === "shown" ? "Reveal: actual" : scoreVisibility === "proxy" ? "Reveal: approx." : "Reveal: hidden"}
        </button>

        {/* v176: convene / adjourn a diplomacy session. Facilitator + host (or
            anyone in a local hotseat game) can call the room to the table. */}
        {(!mp || isHost || isFacilitator) && phase === PHASE.PLAYING && (() => {
          const inSession = sessionActive(diplomacy);
          return (
            <button onClick={() => inSession ? endDiplomacy("adjourned") : conveneDiplomacy("facilitator")}
              title={inSession ? "Adjourn the Conference of Parties and resume play" : "Convene a talk-only Conference of Parties, freezes the clock"}
              style={{
              background: inSession ? "rgba(168,168,240,0.20)" : "rgba(200,196,220,0.05)",
              border:`1px solid ${inSession?"rgba(168,168,240,0.55)":"rgba(200,196,220,0.10)"}`,
              color: inSession ? "#ECEAF8" : "#8B86B0",
              borderRadius:4, padding:"4px 10px", cursor:"pointer",
              fontSize:8.5, letterSpacing:"0.18em",
              fontFamily:"'Bricolage Grotesque',sans-serif",
              fontWeight:500, textTransform:"uppercase",
              whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:6,
            }}>
              <span style={{ display:"inline-block", width:5, height:5, borderRadius:"50%",
                background: inSession ? "#A8A8F0" : "transparent",
                border: `1px solid ${inSession?"#A8A8F0":"#5A567A"}` }}/>
              {inSession ? "Adjourn UN" : "Convene UN"}
            </button>
          );
        })()}

        {/* v177: fog-of-war toggle, game-wide rule (facilitator/host), synced. */}
        {(!mp || isHost || isFacilitator) && (
          <button onClick={()=>setFogOfWar(v=>!v)}
            title={fogOfWar ? "Fog of war ON, opponent positions hidden until scouted. Click to disable." : "Enable fog of war, hide opponent asset positions until your sensors scout them"}
            style={{
            background: fogOfWar ? "rgba(128,176,216,0.20)" : "rgba(200,196,220,0.05)",
            border:`1px solid ${fogOfWar?"rgba(128,176,216,0.5)":"rgba(200,196,220,0.10)"}`,
            color: fogOfWar ? "#80B0D8" : "#8B86B0",
            borderRadius:4, padding:"4px 10px", cursor:"pointer",
            fontSize:8.5, letterSpacing:"0.18em",
            fontFamily:"'Bricolage Grotesque',sans-serif",
            fontWeight:500, textTransform:"uppercase",
            whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:6,
          }}>
            <span style={{ display:"inline-block", width:5, height:5, borderRadius:"50%",
              background: fogOfWar ? "#80B0D8" : "transparent",
              border: `1px solid ${fogOfWar?"#80B0D8":"#5A567A"}` }}/>
            {fogOfWar ? "Fog: on" : "Fog: off"}
          </button>
        )}

        {/* v181: public claims / propaganda board toggle (available to everyone). */}
        {phase === PHASE.PLAYING && (
          <button onClick={()=>setShowClaims(v=>!v)}
            title="Open the public claims board, post production claims or pledges, believe/doubt others, and verify bluffs"
            style={{
            background: showClaims ? "rgba(192,184,232,0.18)" : "rgba(200,196,220,0.05)",
            border:`1px solid ${showClaims?"rgba(192,184,232,0.5)":"rgba(200,196,220,0.10)"}`,
            color: showClaims ? "#C0B8E8" : "#8B86B0",
            borderRadius:4, padding:"4px 10px", cursor:"pointer",
            fontSize:8.5, letterSpacing:"0.18em",
            fontFamily:"'Bricolage Grotesque',sans-serif",
            fontWeight:500, textTransform:"uppercase",
            whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:6,
          }}>
            <span style={{ fontSize:9 }}>⚑</span>
            Claims{claims.length ? ` (${claims.length})` : ""}
          </button>
        )}

        <div style={{ width:1, height:16, background:"rgba(200,196,220,0.10)" }}/>

        {/* Auto-advance control */}
        <button onClick={()=>setAutoAdvance(v=>!v)} title="Auto-advance rounds" style={{
          background: autoAdvance ? "rgba(155,212,181,0.14)" : "rgba(200,196,220,0.05)",
          border:`1px solid ${autoAdvance?"rgba(155,212,181,0.32)":"rgba(200,196,220,0.10)"}`,
          color: autoAdvance ? "#9BD4B5" : "#8B86B0",
          borderRadius:4, padding:"4px 10px", cursor:"pointer",
          fontSize:10, fontFamily:"'Spectral',Georgia,serif",
          fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
          whiteSpace:"nowrap",
        }}>
          {autoAdvance ? "Pause" : "Auto"}
        </button>

        <button onClick={undoLastTurn} disabled={undoStack.length===0 || replayActive || batchRunning} title="Undo the latest planning segment" style={{
          background: undoStack.length>0 && !replayActive && !batchRunning ? "rgba(192,184,232,0.1)" : "rgba(200,196,220,0.05)",
          border:`1px solid ${undoStack.length>0 && !replayActive && !batchRunning ? "rgba(192,184,232,0.24)" : "rgba(200,196,220,0.10)"}`,
          color: undoStack.length>0 && !replayActive && !batchRunning ? "#C0B8E8" : "#3A3658",
          borderRadius:4, padding:"4px 10px", cursor: undoStack.length>0 && !replayActive && !batchRunning ? "pointer" : "default",
          fontSize:11, fontFamily:"'Spectral',Georgia,serif",
          fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
          whiteSpace:"nowrap",
        }}>
          Undo
        </button>

        {autoAdvance && (
          <select value={autoSpeed} onChange={e=>setAutoSpeed(+e.target.value)} style={{
            background:"rgba(27,25,52,0.95)", border:"1px solid rgba(155,212,181,0.2)",
            color:"#9BD4B5", borderRadius:4, padding:"4px 6px",
            fontSize:10, fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic",
            fontWeight:400, letterSpacing:"-0.005em", outline:"none",
          }}>
            <option value={4800}>0.5×</option>
            <option value={2400}>1×</option>
            <option value={1200}>2×</option>
            <option value={480}>5×</option>
            <option value={200}>12×</option>
          </select>
        )}

        {replayActive && (
          <>
            <div style={{ width:1, height:16, background:"rgba(200,196,220,0.10)" }}/>
            <button onClick={()=>loadReplayFrame(replayRun, Math.max(0, replayFrameIndex - 1))} disabled={replayFrameIndex===0} style={{
              background:"rgba(200,196,220,0.05)", border:"1px solid rgba(200,196,220,0.10)",
              color: replayFrameIndex===0 ? "#3A3658" : "#C0B8E8", borderRadius:4, padding:"3px 8px",
              cursor: replayFrameIndex===0 ? "default" : "pointer",
              fontSize:11, fontFamily:"'Spectral',Georgia,serif",
              fontStyle:"italic", fontWeight:400,
            }}>◀</button>
            <button onClick={()=>setReplayPlaying(v=>!v)} style={{
              background: replayPlaying ? "rgba(192,184,232,0.14)" : "rgba(192,184,232,0.08)",
              border:`1px solid ${replayPlaying?"rgba(192,184,232,0.32)":"rgba(192,184,232,0.22)"}`,
              color: replayPlaying ? "#ECEAF8" : "#C0B8E8", borderRadius:4, padding:"4px 10px",
              cursor:"pointer", fontSize:11, fontFamily:"'Spectral',Georgia,serif",
              fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
            }}>{replayPlaying ? "Pause" : "Play"}</button>
            <button onClick={()=>loadReplayFrame(replayRun, Math.min((replayRun?.frames?.length ?? 1) - 1, replayFrameIndex + 1))}
              disabled={replayFrameIndex >= (replayRun?.frames?.length ?? 1) - 1} style={{
              background:"rgba(200,196,220,0.05)", border:"1px solid rgba(200,196,220,0.10)",
              color: replayFrameIndex >= (replayRun?.frames?.length ?? 1) - 1 ? "#3A3658" : "#C0B8E8",
              borderRadius:4, padding:"3px 8px", cursor: replayFrameIndex >= (replayRun?.frames?.length ?? 1) - 1 ? "default" : "pointer",
              fontSize:11, fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", fontWeight:400,
            }}>▶</button>
            <div style={{ fontSize:10, color:"#8B86B0", whiteSpace:"nowrap",
              fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
              {replayFrameIndex+1} / {replayRun?.frames?.length ?? 1}
            </div>
            <button onClick={exitReplay} style={{
              background:"rgba(232,155,181,0.08)", border:"1px solid rgba(232,155,181,0.22)",
              color:"#E89BB5", borderRadius:4, padding:"4px 10px", cursor:"pointer",
              fontSize:11, fontFamily:"'Spectral',Georgia,serif",
              fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
            }}>Exit replay</button>
          </>
        )}

        <div style={{ width:1, height:16, background:"rgba(200,196,220,0.10)" }}/>

        {/* Annotation tool */}
        <button onClick={()=>setAnnotating(v=>!v)} title="Place map annotations" style={{
          background: annotating ? "rgba(232,201,152,0.14)" : "rgba(200,196,220,0.05)",
          border:`1px solid ${annotating?"rgba(232,201,152,0.32)":"rgba(200,196,220,0.10)"}`,
          color: annotating ? "#E8C998" : "#8B86B0",
          borderRadius:4, padding:"4px 10px", cursor:"pointer",
          fontSize:11, fontFamily:"'Spectral',Georgia,serif",
          fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
        }}>Pin</button>

        {annotating && (
          <input
            value={annotNote}
            onChange={e=>setAnnotNote(e.target.value)}
            placeholder="Pin label…"
            style={{
              background:"rgba(27,25,52,0.95)", border:"1px solid rgba(232,201,152,0.28)",
              color:"#E8C998", borderRadius:4, padding:"4px 8px",
              fontSize:10, fontFamily:"'Spectral',Georgia,serif",
              fontStyle:"italic", outline:"none", width:110,
            }}
          />
        )}

        {annotations.length > 0 && (
          <button onClick={()=>setAnnotations([])} title="Clear all pins" style={{
            background:"transparent", border:"1px solid rgba(232,155,181,0.22)",
            color:"#E89BB5", borderRadius:4, padding:"4px 8px", cursor:"pointer",
            fontSize:10, fontFamily:"'Spectral',Georgia,serif",
            fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
          }}>Clear · {annotations.length}</button>
        )}

        <div style={{ width:1, height:16, background:"rgba(200,196,220,0.10)" }}/>

        {/* Panel toggles */}
        {[
          ["Log", showLog, ()=>setShowLog(v=>!v), "Event log · L", true],
          ["Data", showAnalytics, ()=>setShowAnalytics(v=>!v), "Analytics charts · A", false],
          ["Params", showParams, ()=>setShowParams(v=>!v), "Physics parameters · P", false],
          ["Help", showHelp, ()=>setShowHelp(v=>!v), "Keyboard shortcuts · ?", true],
          ["How to play", showTutorial, ()=>{ if (showTutorial) closeTutorial(); else setShowTutorial(true); }, "Guided tour · H", true],
          ["DLA zones", showHazard, ()=>setShowHazard(v=>!v), "Derive safety zones from a hazard · Z", false],
          ["Figures", showFigures, ()=>setShowFigures(v=>!v), "Published map figures · G", false],
        ].filter(([,,,, showInWorkshop]) => !workshopMode || showInWorkshop)
         .map(([label, active, fn, tip]) => (
          <button key={label} onClick={fn} title={tip} style={{
            background: active ? "rgba(192,184,232,0.12)" : "rgba(200,196,220,0.05)",
            border:`1px solid ${active?"rgba(192,184,232,0.3)":"rgba(200,196,220,0.10)"}`,
            color: active ? "#ECEAF8" : "#8B86B0",
            borderRadius:4, padding:"4px 10px", cursor:"pointer",
            fontSize:11, fontFamily:"'Spectral',Georgia,serif",
            fontStyle:"italic", fontWeight:active?500:400, letterSpacing:"-0.005em",
          }}>{label}</button>
        ))}

        <div style={{ marginLeft:"auto", display:"flex", gap:4 }}>
          {!workshopMode && (
            <button onClick={()=>setShowPlots(true)} disabled={!p1 || batchRunning || replayLoading} title="Open analysis plots" style={{
              background:"rgba(200,196,220,0.05)", border:"1px solid rgba(200,196,220,0.10)",
              color: (!p1 || batchRunning || replayLoading) ? "#3A3658" : "#C0B8E8", borderRadius:4, padding:"4px 10px",
              cursor: (!p1 || batchRunning || replayLoading) ? "default" : "pointer",
              fontSize:11, fontFamily:"'Spectral',Georgia,serif",
              fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
            }}>Plots</button>
          )}
          <button onClick={exportSaveGame} disabled={!p1 || gifExporting} title="Save full state to a .json file you can reload later" style={{
            background:"rgba(200,196,220,0.05)", border:"1px solid rgba(200,196,220,0.10)",
            color: (!p1 || gifExporting) ? "#3A3658" : "#C0B8E8", borderRadius:4, padding:"4px 10px",
            cursor: (!p1 || gifExporting) ? "default" : "pointer",
            fontSize:11, fontFamily:"'Spectral',Georgia,serif",
            fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
          }}>Save</button>
          <button onClick={() => { setExploreMode(em => !em); setExploreClick(null); }} title="Click anywhere on the map to analyze terrain and place assets" style={{
            background: exploreMode
              ? "linear-gradient(135deg, rgba(168,168,240,0.42), rgba(168,168,240,0.16))"
              : "linear-gradient(135deg, rgba(168,168,240,0.20), rgba(168,168,240,0.06))",
            border: `1.5px solid ${exploreMode ? "rgba(168,168,240,0.85)" : "rgba(168,168,240,0.55)"}`,
            color: exploreMode ? "#ECEAF8" : "#ECEAF8",
            borderRadius:4, padding:"6px 16px", cursor:"pointer",
            fontSize:12, fontFamily:"'Bricolage Grotesque',sans-serif",
            fontWeight:700, letterSpacing:"0.05em",
            boxShadow: exploreMode
              ? "0 0 18px rgba(168,168,240,0.45), inset 0 0 0 1px rgba(236,234,248,0.10)"
              : "0 0 8px rgba(168,168,240,0.20)",
            transition: "all 0.15s",
          }}>
            {exploreMode ? "◉ EXPLORING…" : "◎ EXPLORE & PLACE"}
          </button>
          <button onClick={exportMissionGif} disabled={!p1 || gifExporting || batchRunning || replayLoading} title="Export the visible timeline as an animated GIF" style={{
            background: (!p1 || gifExporting || batchRunning || replayLoading)
              ? "rgba(232,201,152,0.04)"
              : "linear-gradient(135deg, rgba(232,201,152,0.18), rgba(232,201,152,0.08))",
            border: `1px solid ${(!p1 || gifExporting || batchRunning || replayLoading) ? "rgba(232,201,152,0.15)" : "rgba(232,201,152,0.45)"}`,
            color: (!p1 || gifExporting || batchRunning || replayLoading) ? "#5A567A" : "#E8C998",
            borderRadius:4, padding:"5px 14px",
            cursor: (!p1 || gifExporting || batchRunning || replayLoading) ? "default" : "pointer",
            fontSize:12, fontFamily:"'Bricolage Grotesque',sans-serif",
            fontWeight:600, letterSpacing:"0.04em",
            boxShadow: (!p1 || gifExporting || batchRunning || replayLoading) ? "none" : "0 0 12px rgba(232,201,152,0.18)",
            transition: "all 0.15s",
          }}>
            {gifExporting ? "EXPORTING…" : "EXPORT GIF"}
          </button>
          {gifExporting && (
            <button onClick={() => {
              if (gifSavedSnapshotRef.current) applyUndoSnapshot(gifSavedSnapshotRef.current);
              gifSavedSnapshotRef.current = null;
              setGifExporting(false);
            }} title="Cancel GIF export and restore state" style={{
              background:"rgba(232,155,181,0.12)", border:"1px solid rgba(232,155,181,0.35)",
              color:"#E89BB5", borderRadius:4, padding:"4px 10px", cursor:"pointer",
              fontSize:11, fontFamily:"'Spectral',Georgia,serif",
              fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
            }}>Cancel GIF</button>
          )}
          {/* v22: Round-summary text export for workshop facilitators */}
          {phase === PHASE.PLAYING && (
            <button onClick={exportRoundSummary} disabled={!p1} title="Export a one-page text summary of the current round: scores, violations, blackouts, events" style={{
              background: !p1
                ? "rgba(125,216,176,0.04)"
                : "linear-gradient(135deg, rgba(125,216,176,0.20), rgba(125,216,176,0.06))",
              border: `1px solid ${!p1 ? "rgba(125,216,176,0.15)" : "rgba(125,216,176,0.50)"}`,
              color: !p1 ? "#5A567A" : "#9BD4B5",
              borderRadius:4, padding:"5px 14px",
              cursor: !p1 ? "default" : "pointer",
              fontSize:11, fontFamily:"'JetBrains Mono',monospace",
              fontWeight:600, letterSpacing:"0.06em",
              boxShadow: !p1 ? "none" : "0 0 10px rgba(125,216,176,0.20)",
              transition: "all 0.15s",
            }}>
              R{round} SUMMARY
            </button>
          )}
          {!workshopMode && (
            <button onClick={exportMissionData} disabled={missionLog.length===0} title="Export event log as CSV" style={{
              background:"rgba(200,196,220,0.05)", border:"1px solid rgba(200,196,220,0.10)",
              color: missionLog.length>0?"#9BD4B5":"#3A3658", borderRadius:4, padding:"4px 10px",
              cursor: missionLog.length>0?"pointer":"default",
              fontSize:11, fontFamily:"'Spectral',Georgia,serif",
              fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
            }}>CSV</button>
          )}
          {!workshopMode && (
            <button onClick={exportStateJSON} disabled={!p1} title="Export full state as JSON" style={{
              background:"rgba(200,196,220,0.05)", border:"1px solid rgba(200,196,220,0.10)",
              color: p1?"#A8A8F0":"#3A3658", borderRadius:4, padding:"4px 10px",
            cursor: p1?"pointer":"default",
            fontSize:11, fontFamily:"'Spectral',Georgia,serif",
            fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
          }}>JSON</button>
          )}
        </div>
      </div>

      {/* Plots panel -- extracted to src/ui/PlotsPanel.jsx */}
      <PlotsPanel
        open={showPlots}
        onClose={() => setShowPlots(false)}
        plotDefinitions={plotDefinitions}
        plotCanvasRefs={plotCanvasRefs}
        separatePlotsOpen={separatePlotsOpen}
        setSeparatePlotsOpen={setSeparatePlotsOpen}
        downloadCanvasPng={downloadCanvasPng}
        exportAllPlots={exportAllPlots}
        buildSeparatePlot={buildSeparatePlot}
        PlotCanvas={PlotCanvas}
        sourceLabel={replayRun ? "replay frames" : "live timeline"}
      />

      {/* Turn / phase prompt */}
      {(() => {
        let msg, color;
        if (replayActive) { msg=`Replay mode · frame ${replayFrameIndex+1} of ${replayRun?.frames?.length ?? 1}`; color="#C0B8E8"; }
        else if (phase===PHASE.SETUP1) {
          // v156: concurrent setup -- show each player what THEY still need to do.
          const mine = (myActor===0||myActor===1) ? myActor : null;
          if (mine===0)      msg = p1 ? "Base placed \u2014 waiting for the other actor to place theirs\u2026" : "Actor I: click a dark PSR crater to place your base";
          else if (mine===1) msg = p2 ? "Base placed \u2014 waiting for the other actor to place theirs\u2026" : "Actor II: click a dark PSR crater to place your base";
          else               msg = !p1 ? "Actor I: click a dark PSR crater to place its base" : "Actor II: click a dark PSR crater to place its base";
          color="#A8A8F0";
        }
        else if (phase===PHASE.SETUP2) { msg="Actor II: click a dark PSR crater to place your base"; color="#80B0D8"; }
        else if (phase===PHASE.DONE) { msg="Exercise complete · debrief below"; color="#C0B8E8"; }
        else if (phase===PHASE.PLAYING && scenarioPreset === "unevenArrival" && !p2 && globalDay < arrivalDelay) {
          const daysRemaining = Math.max(0, arrivalDelay - globalDay);
          msg=`Actor I head start · Actor II arrives in ${daysRemaining} day${daysRemaining!==1?"s":""}`;
          color="#C0B8E8";
        }
        else if (placingFor!==null) {
          const labels = {solar:"a solar panel",reactor:"a nuclear reactor",habitat:"a habitat",pad:"a landing pad"};
          const what = labels[placingType] || placingType;
          msg=`${actorLabel(placingFor)}: click anywhere to place ${what}`;
          color=placingFor===0?"#A8A8F0":"#80B0D8";
        }
        else if (selectingFor!==null) {
          msg=`${actorLabel(selectingFor)}: left-click set waypoint · right-click add more · click ✓ Done to confirm`;
          color=selectingFor===0?"#A8A8F0":"#80B0D8";
        } else if (p1Done && p2Done) {
          msg="Resolving round…"; color="#9BD4B5";
        } else if (p1Done && !p2Done) {
          msg=`${actorLabel(0)} confirmed · ${actorLabel(1)}: plan your action and conclude the round`; color="#80B0D8";
        } else if (!p1Done && p2Done) {
          msg=`${actorLabel(1)} confirmed · ${actorLabel(0)}: plan your action and conclude the round`; color="#A8A8F0";
        } else {
          const who = actorLabel(activeTurn);
          const col2 = activeTurn===0 ? "#A8A8F0" : "#80B0D8";
          msg=`${who}: set a direction and conclude the round`; color=col2;
        }
        return (
          <div style={{
            width:"100%", maxWidth:1400,
            background:night?"rgba(46,32,104,0.65)":"rgba(20,18,32,0.85)",
            border:`1px solid ${color}33`,
            borderLeft:`3px solid ${color}`,
            borderRadius:4, padding:"8px 16px", marginBottom:6,
            fontSize:11.5, letterSpacing:"-0.005em", textAlign:"left", color,
            fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", fontWeight:400,
            backdropFilter:"blur(4px)",
          }}>{msg}</div>
        );
      })()}

      {/* Scorebar -- extracted to src/ui/Scorebar.jsx */}
      <Scorebar
        actorLabel={actorLabel}
        roundCounterLabel={roundCounterLabel}
        score1={score1}
        score2={score2}
        totalIce1={totalIce1}
        totalIce2={totalIce2}
        share1={share1}
        p1={p1}
        p2={p2}
        depleted={depleted}
        workshopMode={workshopMode}
        totalCraters={CRATER_DATA.length}
        scoreVisibility={scoreVisibility}
        revealScores={phase === PHASE.DONE || isFacilitator}
      />

      {/* Ice share bar */}
      <div style={{ width:"100%", maxWidth:1400, height:4, background:"rgba(200,196,220,0.06)",
        borderRadius:2, overflow:"hidden", marginBottom:6, display:"flex",
        boxShadow:"inset 0 1px 0 rgba(0,0,0,0.3)" }}>
        <div style={{ width:`${share1*100}%`, background:"linear-gradient(90deg,#2E2068aa,#A8A8F0cc)", transition:"width 0.4s ease", boxShadow:"1px 0 6px #A8A8F066" }} />
        <div style={{ flex:1, background:"linear-gradient(90deg,#80B0D8cc,#3460A8aa)" }} />
      </div>

      {/* Main content */}
      <div style={{ display:"flex", gap:6, width:"100%", maxWidth:1400, alignItems:"flex-start" }}>
        {/* Player panels, Actor I left (order:0), Actor II right (order:2) */}
        {[0,1].map(pi => {
          const p = pi===0 ? p1 : p2;
          const color = pi===0 ? "#A8A8F0" : "#80B0D8";
          if (!p) {
            if (scenarioPreset === "unevenArrival" && pi === 1 && phase === PHASE.PLAYING && globalDay < arrivalDelay) {
              const daysRemaining = Math.max(0, arrivalDelay - globalDay);
              return (
                <div key={pi} style={{ order:pi===0?0:2, width:210, flexShrink:0, background:"rgba(32,30,64,0.85)",
                  border:"1px solid rgba(168,168,240,0.28)", borderRadius:8, padding:10,
                  minHeight:120, boxShadow:"inset 0 0 24px rgba(168,168,240,0.06)" }}>
                  <div style={{ fontSize:13, fontWeight:500, fontStyle:"italic", color:color, letterSpacing:"-0.005em",
                    fontFamily:"'Spectral','Iowan Old Style',Georgia,serif", marginBottom:8 }}>{actorLabel(1)}</div>
                  <div style={{ fontSize:8, color:"#8B86B0", letterSpacing:"0.18em",
                    textTransform:"uppercase", marginBottom:6,
                    fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>
                    Awaiting arrival
                  </div>
                  <div style={{ fontSize:22, color:"#C0B8E8", fontWeight:500,
                    fontStyle:"italic", letterSpacing:"-0.012em",
                    fontFamily:"'Spectral','Iowan Old Style',Georgia,serif", marginBottom:4 }}>
                    D+{arrivalDelay}
                  </div>
                  <div style={{ fontSize:10, color:"#5A567A", lineHeight:1.5,
                    fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
                    Actor II lands in {daysRemaining} day{daysRemaining!==1?"s":""}.
                  </div>
                </div>
              );
            }
            return (
              <div key={pi} style={{ order:pi===0?0:2, width:210, flexShrink:0, background:"rgba(200,196,220,0.04)",
                border:"1px solid rgba(200,196,220,0.08)", borderRadius:8, padding:10,
                display:"flex", alignItems:"center", justifyContent:"center",
                color:"#5A567A", fontSize:11, letterSpacing:"-0.005em", minHeight:120,
                fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
                Awaiting
              </div>
            );
          }
          if (p.active === false) {
            const daysRemaining = Math.max(0, (p.arrivalDay ?? arrivalDelay) - globalDay);
            return (
              <div key={pi} style={{ order:pi===0?0:2, width:210, flexShrink:0, background:"rgba(32,30,64,0.85)",
                border:"1px solid rgba(168,168,240,0.28)", borderRadius:8, padding:11,
                minHeight:120, boxShadow:"inset 0 0 24px rgba(168,168,240,0.06)" }}>
                <div style={{ fontSize:13, fontWeight:500, fontStyle:"italic",
                  color:color, letterSpacing:"-0.005em",
                  fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
                  marginBottom:8 }}>{actorLabel(pi)}</div>
                <div style={{ fontSize:8, color:"#8B86B0", letterSpacing:"0.18em",
                  textTransform:"uppercase", marginBottom:6,
                  fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>
                  Awaiting arrival
                </div>
                <div style={{ fontSize:22, color:"#C0B8E8", fontWeight:500,
                  fontStyle:"italic", letterSpacing:"-0.012em",
                  fontFamily:"'Spectral','Iowan Old Style',Georgia,serif", marginBottom:4 }}>
                  D+{p.arrivalDay ?? arrivalDelay}
                </div>
                <div style={{ fontSize:10, color:"#5A567A", lineHeight:1.5,
                  fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
                  {actorLabel(pi)} lands in {daysRemaining} day{daysRemaining!==1?"s":""}.
                </div>
              </div>
            );
          }

          const panelPwr = p.panels.reduce((s,pn)=>{
            if (night) return s; // no charging at night
            const px2=Math.round(pn.y)*W+Math.round(pn.x);
            const illum2=(px2>=0&&px2<W*H)?ILLUM_MAP[px2]:1.0;
            return s+PANEL_RIDGE*illum2;
          },0);
          const reactorPwr = (p.reactors||[]).reduce((s, _, i) => {
            const health = p.structureHealth?.reactors?.[i] ?? 1.0;
            return health > 0 ? s + REACTOR_OUTPUT : s;
          }, 0);
          const isSelecting = selectingFor===pi;
          const roverIdx    = selectedRover[pi];
          const activeRover = roverIdx === 0 ? p : (p.extraRovers||[])[roverIdx - 1];
          // v21: was `R${roverIdx + 1}` -- read as "Player R1/R2" in the
          // sidebar header and caused confusion with the player numbering.
          // Use the full word so it's unambiguous against the player ID.
          const activeRoverLabel = `Rover ${roverIdx + 1}`;
          const wpCount     = activeRover
            ? (activeRover.waypoints||[]).length + (activeRover.currentWaypoint ? 1 : 0) : 0;
          const totalRovers = 1 + (p.extraRovers||[]).length;
          // All of these reflect the currently-selected rover, not always the primary
          const arX = activeRover ? Math.round(activeRover.x ?? p.x) : Math.round(p.x);
          const arY = activeRover ? Math.round(activeRover.y ?? p.y) : Math.round(p.y);
          const si  = STATUS_INFO[(activeRover?.status ?? p.status)] || STATUS_INFO.idle;
          const onRidgeNow = RIDGE_MASK[arY * W + arX] === 1;
          const ci = PIXEL_CRATER[arY * W + arX];
          const localHealth = ci>=0 ? craterHealth[ci] : null;
          const isDone = (pi===0&&p1Done)||(pi===1&&p2Done);
          const isMyTurn = activeTurn===pi && !isDone && phase===PHASE.PLAYING;

          // ── Condensed opponent panel ──────────────────────────────────────
          // When the viewer is an actor playing the *other* role, this panel
          // shows only public information: name, status, ice deposited, last
          // known position dot. Internal economy, build queue, R&D and military
          // are hidden. Facilitator and the host (when host=actor and
          // overrideAs is null on the same actor) see the full panel.
          if (shouldHideOpponentDetails(pi)) {
            return (
              <div key={pi} style={{
                order:pi===0?0:2,
                width:210, flexShrink:0,
                border:`1px dashed ${color}55`,
                borderRadius:8, padding:"12px 12px 14px",
                transition:"border 0.2s",
                opacity: 0.92,
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  marginBottom:10, borderBottom:`1px solid ${color}22`, paddingBottom:8 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:color,
                      boxShadow: isMyTurn ? `0 0 8px ${color}` : "none" }} />
                    <span style={{ fontSize:13, fontWeight:500, fontStyle:"italic", color, letterSpacing:"-0.005em",
                      fontFamily:"'Spectral','Iowan Old Style',Georgia,serif" }}>
                      {actorLabel(pi)}
                    </span>
                  </div>
                  <span style={{ fontSize:9, color:"#8B86B0", letterSpacing:"0.14em",
                    textTransform:"uppercase", fontFamily:"'Bricolage Grotesque',sans-serif",
                    fontWeight:500 }}>OPPONENT</span>
                </div>

                <div style={{ fontSize:9, color:"#5A567A", letterSpacing:"0.16em",
                  textTransform:"uppercase", fontFamily:"'Bricolage Grotesque',sans-serif",
                  fontWeight:500, marginBottom:3 }}>STATUS</div>
                <div style={{ fontSize:13, color: si.col, fontStyle:"italic",
                  fontFamily:"'Spectral',Georgia,serif", marginBottom:11,
                  letterSpacing:"-0.005em" }}>
                  {isDone ? "Plan committed" : isMyTurn ? "Acting now" : si.label}
                </div>

                <div style={{ fontSize:9, color:"#5A567A", letterSpacing:"0.16em",
                  textTransform:"uppercase", fontFamily:"'Bricolage Grotesque',sans-serif",
                  fontWeight:500, marginBottom:3 }}>ICE DEPOSITED</div>
                <div style={{ fontSize:20, color: "#C0B8E8", fontWeight:500,
                  fontStyle:"italic", letterSpacing:"-0.012em",
                  fontFamily:"'Spectral','Iowan Old Style',Georgia,serif", marginBottom:11 }}>
                  {Math.round(p.iceDeposited || 0)} kg
                </div>

                {/* v175: opponent force composition, public competitive intel
                    (counts only, no locations, no score) so a player can size
                    up the rival at a glance even with the score hidden. */}
                <div style={{ fontSize:9, color:"#5A567A", letterSpacing:"0.16em",
                  textTransform:"uppercase", fontFamily:"'Bricolage Grotesque',sans-serif",
                  fontWeight:500, marginBottom:5 }}>FORCE COMPOSITION</div>
                {(() => {
                  const sh = p.structureHealth || {};
                  const live = (arr, key) => (arr || []).filter((_, i) => (sh[key]?.[i] ?? 1.0) > 0.1).length;
                  const rovers   = 1 + live(p.extraRovers, "extraRovers");
                  const habitats = live(p.habitats, "habitats");
                  const pads     = live(p.landingPads, "landingPads");
                  const solar    = live(p.panels, "panels");
                  const reactors = live(p.reactors, "reactors");
                  const items = [
                    { label: "rovers",    val: rovers },
                    { label: "habitats",  val: habitats },
                    { label: "pads",      val: pads },
                    { label: "solar",     val: solar },
                    { label: "reactors",  val: reactors },
                  ];
                  return (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 8px", marginBottom:14 }}>
                      {items.map(it => (
                        <div key={it.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline",
                          borderBottom:"1px solid rgba(200,196,220,0.07)", paddingBottom:2 }}>
                          <span style={{ fontSize:9.5, color:"#8B86B0", fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>{it.label}</span>
                          <span style={{ fontSize:12, color: it.val>0 ? "#ECEAF8" : "#5A567A", fontWeight:600,
                            fontFamily:"'Bricolage Grotesque',sans-serif", fontVariantNumeric:"tabular-nums" }}>{it.val}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <div style={{ fontSize:9, color:"#5A567A", letterSpacing:"0.16em",
                  textTransform:"uppercase", fontFamily:"'Bricolage Grotesque',sans-serif",
                  fontWeight:500, marginBottom:3 }}>LAST KNOWN POSITION</div>
                <div style={{ fontSize:12, color:"#80B0D8", fontFamily:"'Bricolage Grotesque',sans-serif",
                  fontWeight:400, letterSpacing:"0.02em", marginBottom:14 }}>
                  ({arX}, {arY}){onRidgeNow ? " · on ridge" : ""}
                </div>

                <div style={{
                  padding:"10px 10px", background:"rgba(168,168,240,0.05)",
                  border:"1px solid rgba(168,168,240,0.12)", borderRadius:4,
                  fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic",
                  fontSize:11, color:"#8B86B0", lineHeight:1.5,
                }}>
                  Detailed asset state, budget allocation, R&D, military
                  stock, and build queue are hidden from opposing actors.
                </div>
              </div>
            );
          }

          return (
            <div key={pi} style={{
              order:pi===0?0:2,
              width:210, flexShrink:0,
              background: isDone ? `rgba(${pi===0?"168,168,240":"128,176,216"},0.08)` :
                          isMyTurn ? `rgba(${pi===0?"46,32,104":"32,52,96"},0.55)` : "rgba(27,25,52,0.92)",
              border:`1px solid ${isDone?(color+"66"):isMyTurn?(color+"aa"):(color+"1a")}`,
              borderRadius:8, padding:"10px 11px", transition:"border 0.2s, box-shadow 0.2s",
              boxShadow: isMyTurn && !isDone ? `0 0 18px ${color}22, inset 0 0 30px ${color}05` : "none",
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:9,
                borderBottom:`1px solid ${color}18`, paddingBottom:7 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:color,
                    boxShadow:isMyTurn?`0 0 10px ${color}, 0 0 20px ${color}66`:"none",
                    transition:"box-shadow 0.3s" }} />
                  <span style={{ fontSize:13, fontWeight:500, fontStyle:"italic", color, letterSpacing:"-0.005em",
                    fontFamily:"'Spectral','Iowan Old Style',Georgia,serif" }}>{actorLabel(pi)}</span>
                  {isDone && <span style={{ fontSize:9, color:"#9BD4B5", letterSpacing:"-0.002em",
                    fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>· done</span>}
                  {isMyTurn && <span style={{ fontSize:8, color, opacity:0.85, letterSpacing:"0.16em",
                    textTransform:"uppercase",
                    fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>Active</span>}
                </div>
                <span style={{ fontSize:9, color:si.col, background:`${si.col}14`,
                  border:`1px solid ${si.col}3a`, borderRadius:3, padding:"3px 7px",
                  letterSpacing:"-0.002em",
                  fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>{si.label}</span>
              </div>

              {/* v22: Mission-ops telemetry strip -- a compact mono readout
                  showing the most critical live values in alignment.
                  Reads at a glance during workshop facilitation: who has
                  what, who's about to fail. */}
              {(() => {
                const totalIce = (p.iceDeposited || 0);
                const carried = (p.ice || 0) + (p.extraRovers || []).reduce((s, er) => s + (er?.ice || 0), 0);
                const pwr = activeRover?.power ?? p.power;
                const rawEv = earthVisAt(arX, arY);
                const ev = effectiveEarthVis(arX, arY, p.comsats || []);
                const relayed = ev > rawEv + 0.001;
                const blackout = ev < COMMS_BLACKOUT_THRESHOLD;
                const cells = [
                  { label:"PWR",   val:Math.round(pwr),                 max:POWER_CAP, color:pwr > POWER_LOW ? "#9BD4B5" : "#E89BB5" },
                  { label:"DTE",   val:Math.round(ev*100) + "%",        color: blackout ? "#E89BB5" : ev<0.55 ? "#E8C998" : "#9BD4B5",
                    badge: relayed ? "⇄" : null },
                  { label:"ICE",   val:Math.round(totalIce) + "kg",     color:"#80B0D8",  sub: carried > 0 ? `+${Math.round(carried)}` : null },
                  { label:"CR",    val:Math.round(p.budget || 0),       color:"#E8C998" },
                ];
                return (
                  <div className="ops-frame" style={{
                    display:"grid",
                    gridTemplateColumns:"repeat(4, 1fr)",
                    gap:2,
                    background:"linear-gradient(180deg, rgba(11,9,24,0.8), rgba(20,18,32,0.6))",
                    border:"1px solid rgba(168,168,240,0.18)",
                    borderRadius:4,
                    padding:"6px 8px",
                    marginBottom:8,
                    fontFamily:"'JetBrains Mono', monospace",
                  }}>
                    {cells.map((c, i) => (
                      <div key={i} style={{ textAlign:"left",
                        borderLeft: i === 0 ? "none" : "1px solid rgba(168,168,240,0.10)",
                        paddingLeft: i === 0 ? 0 : 6,
                      }}>
                        <div style={{ fontSize:7.5, letterSpacing:"0.16em", color:"#7DD8B0",
                          fontWeight:600, marginBottom:1 }}>
                          {c.label}
                        </div>
                        <div style={{ fontSize:13, color:c.color, fontWeight:600,
                          fontVariantNumeric:"tabular-nums" }}>
                          {c.val}{c.badge && <span style={{ fontSize:10, marginLeft:2, color:"#7DD8B0" }}>{c.badge}</span>}
                        </div>
                        {c.sub && (
                          <div style={{ fontSize:8, color:"#7090A8" }}>
                            {c.sub}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Power */}
              <div style={{ marginBottom:6 }}>
                {(() => {
                  const roverPower = activeRover?.power ?? p.power;
                  const powerLow = roverPower > POWER_LOW;
                  return (
                    <>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:7, color:"#3A3658", marginBottom:2 }}>
                  <span style={{fontFamily:"'Spectral',Georgia,serif",fontStyle:"italic",fontSize:9.5,color:"#8B86B0",letterSpacing:"-0.005em"}}>{activeRoverLabel} power</span>
                  <span style={{ color:powerLow?"#9BD4B5":"#E89BB5",
                    fontFamily:"'Spectral',Georgia,serif",fontStyle:"italic",fontSize:10 }}>{roverPower.toFixed(0)}/{POWER_CAP}</span>
                </div>
                <Bar val={roverPower} max={POWER_CAP} color={powerLow?"#9BD4B5":"#E89BB5"} h={4} />
                    </>
                  );
                })()}
                <div style={{ fontSize:9, color:night?"#8B86B0":"#5A567A", marginTop:3, letterSpacing:"-0.002em",
                  fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:400 }}>
                  {activeRoverLabel} battery ·
                  +{Math.round(panelPwr + reactorPwr)}/day · {p.panels.length} panel{p.panels.length!==1?"s":""}
                  {(p.reactors||[]).length>0 &&
                    <span style={{color}}> · {(p.reactors||[]).length} ☢ reactor{(p.reactors||[]).length!==1?"s":""}</span>}
                  {p.panels.filter(pn=>pn.onRidge).length>0 &&
                    <span style={{color:"#9BD4B5"}}> ({p.panels.filter(pn=>pn.onRidge).length}★ridge)</span>}
                  {night && p.panels.length>0 && <span style={{color:"#C0B8E8"}}> 🌙 solar offline</span>}
                </div>
              </div>

              {/* v21: Comms / Earth visibility -- sampled from LRO/LOLA
                  earth_visibility raster at the active rover's pixel.
                  Below COMMS_BLACKOUT_THRESHOLD the rover is in DTE
                  blackout: visible LoS to Earth is terrain-blocked at
                  this point in the libration cycle. Shown as a chip so
                  it sits at the same priority as power & ice. */}
              {(() => {
                const rx = activeRover?.x ?? p.x;
                const ry = activeRover?.y ?? p.y;
                const rawEv = earthVisAt(rx, ry);
                const ev = effectiveEarthVis(rx, ry, p.comsats || []);
                const relayed = ev > rawEv + 0.001;
                const blackout = ev < COMMS_BLACKOUT_THRESHOLD;
                const evCol = blackout ? "#E89BB5" : ev < 0.55 ? "#E8C998" : "#9BD4B5";
                return (
                  <div style={{ marginBottom:6 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:7, color:"#3A3658", marginBottom:2 }}>
                      <span style={{fontFamily:"'Spectral',Georgia,serif",fontStyle:"italic",fontSize:9.5,color:"#8B86B0",letterSpacing:"-0.005em"}}>{activeRoverLabel} Earth comms</span>
                      <span style={{ color: evCol,
                        fontFamily:"'Spectral',Georgia,serif",fontStyle:"italic",fontSize:10 }}>
                        {(ev*100).toFixed(0)}% DTE{relayed ? " ⇄" : ""}
                      </span>
                    </div>
                    <Bar val={ev*100} max={100} color={evCol} h={4} />
                    <div style={{ fontSize:9, color: blackout ? "#E89BB5" : "#5A567A",
                      marginTop:3, letterSpacing:"-0.002em",
                      fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight: blackout ? 600 : 400 }}>
                      {blackout
                        ? <>📡 Comms blackout: Earth below horizon. Deploy a comsat relay.</>
                        : relayed
                        ? <>📡 Comsat relay active: signal boosted from {(rawEv*100).toFixed(0)}% to {(ev*100).toFixed(0)}%.</>
                        : ev < 0.55
                        ? <>📡 Intermittent DTE: libration windows only (LRO/LOLA).</>
                        : <>📡 Clear DTE line-of-sight. LRO/LOLA-derived.</>}
                    </div>
                  </div>
                );
              })()}

              {/* Ice carry -- shows selected rover's cargo */}
              <div style={{ marginBottom:6 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:7, color:"#3A3658", marginBottom:2 }}>
                  <span style={{fontFamily:"'Spectral',Georgia,serif",fontStyle:"italic",fontSize:9.5,color:"#8B86B0",letterSpacing:"-0.005em"}}>{activeRoverLabel} ice carry</span>
                  <span style={{color:"#80B0D8",fontFamily:"'Spectral',Georgia,serif",fontStyle:"italic",fontSize:10}}>{(activeRover?.ice??p.ice).toFixed(0)}/{ICE_CAP}kg</span>
                </div>
                <Bar val={activeRover?.ice??p.ice} max={ICE_CAP} color="#80B0D8" h={4} />
                <div style={{ fontSize:9, color:"#5A567A", marginTop:3, letterSpacing:"-0.002em",
                  fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:400 }}>
                  Cargo currently loaded on {activeRoverLabel.toLowerCase()}
                </div>
              </div>

              {/* Budget */}
              {!workshopMode && (() => {
                const bud = p.budget ?? calcBudget(E_INIT);
                const { costs } = calcAssetCosts(p.alloc || ALLOC_PRESETS[DEFAULT_PRESET_KEY].alloc, p?.stakeholderId, { padCount: functionalPadCount(p) });
                const budCol = bud > 60 ? "#9BD4B5" : bud > 20 ? "#E8C998" : "#E89BB5";
                const E = p.econ ?? E_INIT;
                const M = p.milStock ?? 1;
                return (
                  <div style={{ marginBottom:6 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:7, color:"#3A3658", marginBottom:2 }}>
                      <span style={{fontFamily:"'Spectral',Georgia,serif",fontStyle:"italic",fontSize:9.5,color:"#8B86B0",letterSpacing:"-0.005em"}}>Budget</span>
                      <span style={{color:budCol,fontFamily:"'Spectral',Georgia,serif",fontStyle:"italic",fontSize:10}}>{Math.round(bud)}cr</span>
                    </div>
                    <Bar val={bud} max={400} color={budCol} h={4} />
                    <div style={{ fontSize:9, color:"#5A567A", marginTop:3, letterSpacing:"-0.002em",
                      fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:400 }}>
                      E:{E.toFixed(1)} · R:{Math.round(p.rdAccum??0)} · M:{M.toFixed(1)} · Mil:{(p.milScore??1).toFixed(2)}x
                    </div>
                  </div>
                );
              })()}

              {/* Asset Points */}
              {!workshopMode && (() => {
                const pts = p.assetPts ?? 0;
                // Rolling display target: grow the bar's ceiling in 50-ap steps
                // so early bases fill a short bar and massive bases still show
                // progress rather than the bar staying pinned near empty.
                const maxPts = Math.max(50, Math.ceil((pts + 1) / 50) * 50);
                const breakdown = [
                  { icon:"🏠", count:(p.habitats||[]).length,      pts:ASSET_POINTS.habitat },
                  { icon:"🛬", count:(p.landingPads||[]).length,   pts:ASSET_POINTS.pad     },
                  { icon:"🚗", count:(p.extraRovers||[]).length + 1, pts:ASSET_POINTS.rover   },
                  { icon:"☀", count:p.panels.length,               pts:ASSET_POINTS.solar   },
                  { icon:"☢", count:(p.reactors||[]).length,       pts:ASSET_POINTS.reactor },
                ].filter(b => b.count > 0);
                const ptsCol = pts >= 20 ? "#E8C998" : pts >= 10 ? "#E8C998" : "#8B86B0";
                return (
                  <div style={{ marginBottom:5 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:7, color:"#8B86B0", marginBottom:2 }}>
                      <span style={{fontFamily:"'Spectral',Georgia,serif",fontStyle:"italic",fontSize:9.5,color:"#8B86B0",letterSpacing:"-0.005em"}}>Asset points</span>
                      <span style={{ color:ptsCol, fontWeight:500, fontStyle:"italic",
                        fontFamily:"'Spectral',Georgia,serif", fontSize:11, letterSpacing:"-0.005em" }}>{pts}</span>
                    </div>
                    <Bar val={pts} max={maxPts} color={ptsCol} h={3} />
                    {/* v21: asset breakdown chips (🏠×N ☀×N ...) removed
                        per request -- the build palette + map make this
                        information legible without doubling it as text. */}
                    {/* Habitat power bars */}
                    {(p.habitats||[]).length > 0 && (
                      <div style={{ marginTop:6 }}>
                        <div style={{ fontSize:9.5, color:"#8B86B0", marginBottom:3, letterSpacing:"-0.005em",
                          fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
                          Habitat power
                        </div>
                        {(p.habitats||[]).map((_, i) => {
                          const hPwr = (p.habitatPower ?? [])[i] ?? HABITAT_POWER_INIT;
                          const frac = Math.max(0, hPwr / HABITAT_POWER_CAP);
                          const col  = frac > 0.4 ? "#9BD4B5" : frac > 0.15 ? "#E8C998" : "#E89BB5";
                          const label = frac <= 0 ? "Offline" : `${hPwr.toFixed(0)}/${HABITAT_POWER_CAP}`;
                          return (
                            <div key={i} style={{ marginBottom:3 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"#8B86B0", marginBottom:1,
                                fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
                                <span>Hab {i+1}</span>
                                <span style={{ color: frac <= 0 ? "#E89BB5" : col }}>{label}</span>
                              </div>
                              <Bar val={hPwr} max={HABITAT_POWER_CAP} color={col} h={3} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Policy stance selector */}
              {!workshopMode && (() => {
                const alloc      = p.alloc || ALLOC_PRESETS[DEFAULT_PRESET_KEY].alloc;
                const presetKey  = p.allocPreset || DEFAULT_PRESET_KEY;
                const E          = p.econ ?? E_INIT;
                const projBudget = calcBudget(E);
                const { maint: aM } = calcAssetCosts(alloc);
                const totalMaint = (p.panels.length * aM.solar)
                  + (((p.reactors||[]).length) * aM.reactor)
                  + ((p.habitats||[]).length * aM.habitat)
                  + ((p.extraRovers||[]).length * aM.rover)
                  + ((p.landingPads||[]).length * aM.pad);
                const spendableFrac = Math.max(0, 1 - totalMaint / Math.max(1, projBudget));
                const totalPct  = (alloc.mil + alloc.rd + alloc.econ + (alloc.budget||0)) || 1;
                const I_E_proj  = ((alloc.econ / totalPct) * spendableFrac).toFixed(2);
                const I_R_proj  = ((alloc.rd   / totalPct) * spendableFrac).toFixed(2);
                const I_M_proj  = ((alloc.mil  / totalPct) * spendableFrac).toFixed(2);
                const I_B_proj  = Math.round(((alloc.budget||0) / totalPct) * spendableFrac * projBudget);
                const activePreset = ALLOC_PRESETS[presetKey] || ALLOC_PRESETS[DEFAULT_PRESET_KEY];
                // ECO = national economy investment (compounds into future budgets)
                // BUD = lunar cash extraction (immediate credits, sacrifices E growth)
                const bars = [
                  { key:"mil",    label:"MIL",  col:"#E89BB5", val:alloc.mil,       tip:`${I_M_proj} → ΔM` },
                  { key:"rd",     label:"R&D",  col:"#C0B8E8", val:alloc.rd,        tip:`${I_R_proj} → ΔR` },
                  { key:"econ",   label:"ECON", col:"#9BD4B5", val:alloc.econ,      tip:`${I_E_proj} → ΔE` },
                  { key:"budget", label:"CASH", col:"#E8C998", val:alloc.budget||0, tip:`+${I_B_proj}cr` },
                ];
                // Hex color → rgba string for badge background
                const hexToRgba = (hex, a) => {
                  const r = parseInt(hex.slice(1,3),16);
                  const g = parseInt(hex.slice(3,5),16);
                  const b = parseInt(hex.slice(5,7),16);
                  return `rgba(${r},${g},${b},${a})`;
                };
                return (
                  <div style={{ marginBottom:6, background:"rgba(0,0,0,0.2)",
                    border:"1px solid rgba(200,196,220,0.06)", borderRadius:5, padding:"8px 9px" }}>

                    {/* Header */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                      fontSize:9.5, color:"#8B86B0", marginBottom:8, letterSpacing:"-0.005em",
                      fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
                      <span>Policy Stance · E={E.toFixed(1)}</span>
                      <span style={{ color:"#E8C998" }}>{projBudget}cr/rnd</span>
                    </div>

                    {/* Active stance badge */}
                    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:8,
                      padding:"6px 8px", borderRadius:5,
                      background: hexToRgba(activePreset.color, 0.10),
                      border:`1px solid ${hexToRgba(activePreset.color, 0.27)}` }}>
                      <span style={{ fontSize:13, lineHeight:1, color:activePreset.color, flexShrink:0 }}>{activePreset.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:10, fontWeight:600, color:activePreset.color,
                          fontFamily:"'Bricolage Grotesque',sans-serif", letterSpacing:"0.02em",
                          textTransform:"uppercase" }}>{activePreset.label}</div>
                        <div style={{ fontSize:8.5, color:"#5A567A", marginTop:1,
                          fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic",
                          overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2,
                          WebkitBoxOrient:"vertical" }}>{activePreset.desc}</div>
                      </div>
                    </div>

                    {/* Read-only allocation bars */}
                    <div style={{ display:"flex", gap:4, marginBottom:8 }}>
                      {bars.map(({ key, label, col, val, tip }) => (
                        <div key={key} style={{ flex:1, textAlign:"center" }}>
                          <div style={{ fontSize:7, color:col, fontFamily:"'Bricolage Grotesque',sans-serif",
                            fontWeight:600, letterSpacing:"0.05em", textTransform:"uppercase",
                            marginBottom:3 }}>{label}</div>
                          <div style={{ height:36, background:"rgba(0,0,0,0.25)", borderRadius:3,
                            overflow:"hidden", position:"relative", border:"1px solid rgba(200,196,220,0.08)" }}>
                            <div style={{ position:"absolute", bottom:0, left:0, right:0,
                              height:`${val}%`, background:col+"44",
                              borderTop:`1px solid ${col}88`, transition:"height 0.3s ease" }} />
                          </div>
                          <div style={{ fontSize:8, color:col, marginTop:2,
                            fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>{val}%</div>
                          <div style={{ fontSize:7, color:"#3A3658", marginTop:1,
                            fontFamily:"'Bricolage Grotesque',sans-serif" }}>{tip}</div>
                        </div>
                      ))}
                    </div>

                    {/* v180: full budget-lever explainer + contentment. The old
                        key only covered ECON/CASH; players didn't understand MIL
                        / R&D or the morale mechanic, so they only ever touched one
                        lever. Collapsed by default to respect the panel, one tap
                        to learn what every lever trades off. */}
                    {(() => {
                      const cMod = p.contentnessMod || 0;
                      const contentLabel = cMod > 0.01 ? `+${cMod.toFixed(2)} · boosting growth`
                        : cMod < -0.01 ? `${cMod.toFixed(2)} · dragging growth`
                        : "neutral";
                      const contentCol = cMod > 0.01 ? "#9BD4B5" : cMod < -0.01 ? "#E89BB5" : "#8B86B0";
                      const LEVERS = [
                        { label:"MIL",  col:"#E89BB5", body:"military stock → deterrence & incident response, and a security score. Trades away economic growth." },
                        { label:"R&D",  col:"#C0B8E8", body:"research → more ice per rover (mining yield) and competitiveness. Pays back over a few rounds." },
                        { label:"ECON", col:"#9BD4B5", body:"national economy → compounds into a higher budget every round. The long-run growth engine." },
                        { label:"CASH", col:"#E8C998", body:"immediate lunar credits this round to build now, spent, not invested, so future budgets don't grow." },
                      ];
                      return (
                        <div style={{ marginBottom:7 }}>
                          <button
                            onClick={() => setAllocHelpOpen(o => !o)}
                            style={{ width:"100%", textAlign:"left", cursor:"pointer",
                              background:"rgba(200,196,220,0.04)", border:"1px solid rgba(200,196,220,0.08)",
                              borderRadius:4, padding:"4px 7px", color:"#8B86B0",
                              fontSize:8, letterSpacing:"0.04em",
                              fontFamily:"'Bricolage Grotesque',sans-serif",
                              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <span>ⓘ What each lever does</span>
                            <span style={{ color:"#5A567A" }}>{allocHelpOpen ? "▴" : "▾"}</span>
                          </button>
                          {allocHelpOpen && (
                            <div style={{ marginTop:5, display:"flex", flexDirection:"column", gap:4,
                              borderLeft:"2px solid rgba(200,196,220,0.10)", paddingLeft:7 }}>
                              {LEVERS.map(l => (
                                <div key={l.label} style={{ fontSize:7.5, lineHeight:1.45,
                                  color:"#8B86B0", fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
                                  <span style={{ color:l.col, fontWeight:600, fontStyle:"normal",
                                    fontFamily:"'Bricolage Grotesque',sans-serif", letterSpacing:"0.04em" }}>{l.label}</span>
                                  {", "}{l.body}
                                </div>
                              ))}
                              <div style={{ fontSize:7.5, lineHeight:1.45, color:"#8B86B0",
                                fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic",
                                marginTop:2, paddingTop:4, borderTop:"1px solid rgba(200,196,220,0.07)" }}>
                                Growth (ECON & R&D) scales with <span style={{ color:"#C0B8E8", fontStyle:"normal", fontFamily:"'Bricolage Grotesque',sans-serif" }}>competitiveness</span>, your standing in economy, infrastructure and security. Events nudge <span style={{ color:contentCol, fontStyle:"normal", fontFamily:"'Bricolage Grotesque',sans-serif" }}>contentment</span>, a temporary boost or drag that drifts back to neutral over rounds.
                              </div>
                            </div>
                          )}
                          {/* Always-visible contentment readout when an event has shifted it. */}
                          {Math.abs(cMod) > 0.01 && (
                            <div style={{ marginTop:5, fontSize:8, color:contentCol,
                              fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic",
                              display:"flex", justifyContent:"space-between" }}>
                              <span>Contentment</span><span>{contentLabel}</span>
                            </div>
                          )}
                          {/* v208: live NEXT-ROUND PROJECTION. June 13 debrief: "we only
                              used one budget … didn't understand the pros of using
                              different budgets and the consequences of each." The
                              explainer (v180) said what levers do in prose; this shows
                              what YOUR current mix does in numbers, computed with the
                              same calcDelta* functions the round-end economy uses, so
                              the preview can never drift from the sim. */}
                          {(() => {
                            const opp = pi === 0 ? p2 : p1;
                            const alloc = p.alloc || ALLOC_PRESETS[DEFAULT_PRESET_KEY].alloc;
                            const totalPct = (alloc.mil + alloc.rd + alloc.econ + (alloc.budget || 0)) || 1;
                            const E = p.econ ?? E_INIT, T = p.assetPts ?? 0, M = p.milStock ?? 1;
                            const oE = opp?.econ ?? E, oT = opp?.assetPts ?? 0, oM = opp?.milStock ?? 1;
                            const C = calcCompetitiveness(E, T, M, Math.max(E, oE), Math.max(T, oT), Math.max(M, oM), cMod);
                            const dE = calcDeltaE(alloc.econ / totalPct, C, p.rdAccum ?? 0);
                            const dR = calcDeltaR(alloc.rd / totalPct, C);
                            const dM = calcDeltaM(alloc.mil / totalPct, M);
                            const cashNow = Math.round(((alloc.budget || 0) / totalPct) * (p.budget ?? 0));
                            const nextBudget = Math.max(0, calcBudget(Math.max(0.5, E + dE)) + cashNow);
                            const fmt = (v, dp = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;
                            const cells = [
                              [`Δ economy`, fmt(dE, 2), dE >= 0 ? "#9BD4B5" : "#E89BB5"],
                              [`Δ R&D`, fmt(dR, 1), "#C0B8E8"],
                              [`Δ military`, fmt(dM, 2), "#E89BB5"],
                              [`next budget`, `~${nextBudget}cr`, "#E8C998"],
                            ];
                            return (
                              <div style={{ marginTop:5, padding:"5px 7px", borderRadius:4,
                                background:"rgba(168,168,240,0.05)", border:"1px solid rgba(168,168,240,0.10)" }}>
                                <div style={{ fontSize:7, letterSpacing:"0.14em", color:"#8B86B0",
                                  textTransform:"uppercase", marginBottom:4,
                                  fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>
                                  This mix, projected at round end
                                </div>
                                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"3px 8px" }}>
                                  {cells.map(([l, v, col]) => (
                                    <div key={l} style={{ display:"flex", justifyContent:"space-between",
                                      fontSize:8, fontFamily:"'Bricolage Grotesque',sans-serif" }}>
                                      <span style={{ color:"#8B86B0" }}>{l}</span>
                                      <span style={{ color:col, fontWeight:600 }}>{v}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}

                    {/* Preset picker grid */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:3 }}>
                      {Object.values(ALLOC_PRESETS).map(preset => {
                        const isActive = preset.key === presetKey;
                        return (
                          <button key={preset.key}
                            onClick={() => !isDone && setAllocPreset(pi, preset.key)}
                            disabled={isDone}
                            title={preset.desc}
                            style={{
                              padding:"5px 6px", borderRadius:4, cursor:isDone?"not-allowed":"pointer",
                              background: isActive ? hexToRgba(preset.color, 0.13) : "rgba(200,196,220,0.04)",
                              border:`1px solid ${isActive ? hexToRgba(preset.color, 0.4) : "rgba(200,196,220,0.10)"}`,
                              display:"flex", alignItems:"center", gap:5, textAlign:"left",
                              transition:"border-color 0.15s, background 0.15s",
                            }}>
                            <span style={{ fontSize:10, color: isActive ? preset.color : "#5A567A",
                              lineHeight:1, flexShrink:0 }}>{preset.icon}</span>
                            <span style={{ fontSize:8.5, color: isActive ? preset.color : "#8B86B0",
                              fontFamily:"'Bricolage Grotesque',sans-serif",
                              fontWeight: isActive ? 600 : 400, letterSpacing:"0.02em",
                              textTransform:"uppercase" }}>{preset.label}</span>
                          </button>
                        );
                      })}
                    </div>

                  </div>
                );
              })()}

              {localHealth!==null && (
                <div style={{ marginBottom:5, fontSize:10, padding:"4px 0",
                  color:localHealth>0.6?"#9BD4B5":localHealth>0.3?"#E8C998":"#E89BB5",
                  letterSpacing:"-0.005em",
                  fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
                  Crater {(localHealth*100).toFixed(0)}% intact
                </div>
              )}

              {wpCount>0 && (
                <div style={{ fontSize:10, color:"#A8A8F0", marginBottom:6,
                  letterSpacing:"-0.005em",
                  fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
                  {wpCount} waypoint{wpCount!==1?"s":""} queued
                  {roverIdx>0 && <span style={{color,opacity:0.6}}> · Rover {roverIdx+1}</span>}
                </div>
              )}

              {/* Auto-return indicator */}
              {p.returning && false && (
                <div style={{ fontSize:10, color:"#E8C998", marginBottom:5,
                  fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>Auto-returning to base</div>
              )}

              {/* Buttons */}
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {/* Rover selector tabs */}
                {totalRovers > 1 && (
                  <div style={{ display:"flex", gap:3 }}>
                    {Array.from({length:totalRovers},(_,ri) => {
                      const isActive = roverIdx === ri;
                      const rState   = ri === 0 ? p : (p.extraRovers||[])[ri-1];
                      const rIce     = rState?.ice ?? 0;
                      return (
                        <button key={ri}
                          onClick={() => dispatchAction("selectRover", { pi, idx: ri })}
                          disabled={!canControlActor(pi)}
                          style={{
                            flex:1, padding:"4px 0",
                            background: isActive?(color+"22"):"rgba(200,196,220,0.05)",
                            border:`1px solid ${isActive?color+"66":"rgba(200,196,220,0.12)"}`,
                            color: isActive?"#ECEAF8":"#8B86B0",
                            borderRadius:3, cursor:"pointer",
                            fontSize:10, fontFamily:"'Spectral',Georgia,serif",
                            fontStyle:"italic", fontWeight:isActive?500:400,
                            letterSpacing:"-0.005em",
                          }}>
                          R{ri+1}{rIce>2?` · ${rIce.toFixed(0)}kg`:""}
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* Waypoint button -- sets waypoint for currently selected rover */}
                <button onClick={()=>{ setSelectingFor(isSelecting?null:pi); setAddingWaypoint(false); }}
                  disabled={isDone}
                  style={{
                    background:isSelecting?`rgba(${pi===0?"168,168,240":"128,176,216"},0.14)`:"rgba(200,196,220,0.06)",
                    border:`1px solid ${isSelecting?color:"rgba(200,196,220,0.12)"}`,
                    color:isSelecting?"#ECEAF8":isDone?"#3A3658":"#C0B8E8",
                    borderRadius:5, padding:"7px 0", cursor:isDone?"not-allowed":"pointer",
                    fontSize:11, letterSpacing:"-0.005em",
                    fontFamily:"'Spectral',Georgia,serif",
                    fontStyle:"italic", fontWeight:isSelecting?500:400,
                    opacity:isDone?0.35:1,
                    boxShadow:isSelecting?`0 0 10px ${color}33`:"none",
                  }}>
                  {isSelecting?"Confirm route":"Set waypoint"}
                </button>

                {wpCount>0 && (
                  <button onClick={()=>dispatchAction("clearWaypoints", { pi })} disabled={isDone || !canControlActor(pi)} style={{
                    background:"rgba(232,155,181,0.07)", border:"1px solid rgba(232,155,181,0.22)",
                    color:isDone?"#3A3658":"#E89BB5", borderRadius:5, padding:"5px 0",
                    cursor:isDone?"not-allowed":"pointer",
                    fontSize:10, fontFamily:"'Spectral',Georgia,serif",
                    fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
                    opacity:isDone?0.35:1 }}>Clear route</button>
                )}

                {/* v21: Build dropdown removed. Placement now flows
                    exclusively through the EXPLORE & PLACE button in
                    the top toolbar -- click it, click a candidate site,
                    confirm the placement from the analysis sidebar.
                    Pending deliveries and rover-carrying notices are
                    preserved here because they're status, not a
                    placement entry point. */}
                {((p.pendingDeliveries||[]).length > 0 || (activeRover?.carrying ?? p.carrying)) && (
                  <div style={{ display:"flex", flexDirection:"column", gap:3,
                    background:"rgba(200,196,220,0.04)", border:"1px solid rgba(200,196,220,0.06)",
                    borderRadius:5, padding:"6px 6px 5px" }}>
                    {(p.pendingDeliveries||[]).length > 0 && (
                      <div style={{fontSize:10, color:"#E8C998", padding:"4px 0",
                        background:"rgba(232,201,152,0.06)", border:"1px solid rgba(232,201,152,0.16)",
                        borderRadius:3, textAlign:"center", letterSpacing:"-0.005em",
                        fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic"}}>
                        🛬 {(p.pendingDeliveries||[]).map(d=>({solar:"☀",reactor:"☢",habitat:"🏠",rover:"🚗",pad:"🛬"})[d.type]||"?").join(" ")} in transit
                      </div>
                    )}
                    {(activeRover?.carrying ?? p.carrying) && (
                      <div style={{fontSize:10, color:"#E8C998", padding:"4px 0",
                        background:"rgba(232,201,152,0.06)", border:"1px solid rgba(232,201,152,0.16)",
                        borderRadius:3, textAlign:"center", letterSpacing:"-0.005em",
                        fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic"}}>
                        🚚 {roverIdx>0?`R${roverIdx+1} `:""}{({solar:"☀",reactor:"☢",habitat:"🏠",rover:"🚗",pad:"🛬"})[(activeRover?.carrying??p.carrying).type]} › set destination
                      </div>
                    )}
                  </div>
                )}
                {!isDone && canControlActor(pi) && !((p.pendingDeliveries||[]).length > 0 || (activeRover?.carrying ?? p.carrying)) && (
                  <div style={{
                    padding:"7px 9px",
                    background:"linear-gradient(135deg, rgba(168,168,240,0.10), rgba(168,168,240,0.03))",
                    border:"1px dashed rgba(168,168,240,0.35)",
                    borderRadius:5,
                    fontSize:10, color:"#A8A8F0",
                    fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic",
                    letterSpacing:"-0.005em", textAlign:"center",
                  }}>
                    Use <span style={{ fontFamily:"'Bricolage Grotesque',sans-serif",
                      fontStyle:"normal", fontWeight:700, color:"#ECEAF8",
                      letterSpacing:"0.04em", fontSize:9.5 }}>◎ EXPLORE & PLACE</span> to build
                  </div>
                )}

                {/* Diplomatic decisions */}
                {(() => {
                  const dipOptions = getDiplomacyOptions(pi);
                  const sel = selectedDiplomacy[pi];
                  const actorObj = pi === 0 ? p1 : p2;
                  const restr = restrictionStatus(actorObj); // v101: forced-state badge
                  const statusText = !gridSharingEnabled
                    ? "Grid status: disabled"
                    : powerGridState.mode === "shared"
                    ? `Grid: shared${gridSharingPermanent ? " · permanent" : ""}`
                    : powerGridState.mode === "offered" && powerGridState.offeredBy === pi + 1
                      ? `Grid: offer out to Actor ${powerGridState.offeredTo===1?"I":"II"}`
                      : powerGridState.mode === "offered" && powerGridState.offeredTo === pi + 1
                        ? `Grid: offer from Actor ${powerGridState.offeredBy===1?"I":"II"}`
                        : "Grid: independent";
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:4,
                      background:"rgba(200,196,220,0.04)", border:"1px solid rgba(200,196,220,0.06)",
                      borderRadius:5, padding:"7px 8px 6px" }}>
                      {restr && (
                        <div style={{
                          fontSize:9.5, fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:600,
                          letterSpacing:"0.03em", color:"#E8B0C0", background:"rgba(200,90,120,0.12)",
                          border:"1px solid rgba(232,155,181,0.4)", borderRadius:4, padding:"4px 7px",
                        }}>
                          ⊘ {restr}
                        </div>
                      )}
                      <select
                        value={sel||""}
                        onChange={e => dispatchAction("selectDiplomacy", { pi, type: e.target.value||null })}
                        disabled={isDone || dipOptions.length === 0 || !canControlActor(pi)}
                        style={{
                          background:"rgba(27,25,52,0.92)",
                          border:`1px solid ${isDone?"rgba(200,196,220,0.06)":sel?(color+"55"):"rgba(200,196,220,0.16)"}`,
                          color:isDone?"#3A3658":sel?"#ECEAF8":(dipOptions.length === 0 ? "#3A3658" : "#C0B8E8"),
                          borderRadius:4, padding:"6px 8px",
                          cursor:isDone||dipOptions.length===0?"not-allowed":"pointer",
                          fontSize:11, fontFamily:"'Spectral',Georgia,serif",
                          fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
                          outline:"none", width:"100%",
                          opacity:isDone?0.35:1,
                        }}>
                        <option value="">Grid decisions…</option>
                        {dipOptions.map(o => (
                          <option key={o.type} value={o.type} style={{ background:"#1B1934", color:"#C0B8E8" }}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <div style={{ fontSize:9, color:"#8B86B0", letterSpacing:"-0.002em", textAlign:"center",
                        fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
                        {statusText}
                      </div>
                      <button
                        onClick={() => dispatchAction("executeDiplomacy", { pi })}
                        disabled={!sel || isDone || !canControlActor(pi)}
                        style={{
                          background: sel ? "rgba(168,168,240,0.12)" : "rgba(200,196,220,0.04)",
                          border:`1px solid ${sel?"rgba(168,168,240,0.4)":"rgba(200,196,220,0.10)"}`,
                          color: sel ? "#ECEAF8" : "#3A3658",
                          borderRadius:5, padding:"7px 0",
                          cursor: sel && !isDone ? "pointer" : "not-allowed",
                          fontSize:11, fontFamily:"'Spectral',Georgia,serif",
                          fontStyle:"italic", fontWeight:sel?500:400, letterSpacing:"-0.005em",
                          opacity:isDone?0.35:1,
                        }}>
                        {sel ? "Transmit decision" : "Select a grid action"}
                      </button>
                    </div>
                  );
                })()}

                {/* v103: Comms grid negotiation, parallel to the power grid */}
                {(() => {
                  const commsOptions = getCommsOptions(pi);
                  const sel = selectedComms[pi];
                  const statusText = !gridSharingEnabled
                    ? "Comms: disabled"
                    : commsGridState.mode === "shared"
                    ? "Comms: shared · relays pooled"
                    : commsGridState.mode === "offered" && commsGridState.offeredBy === pi + 1
                      ? `Comms: offer out to Actor ${commsGridState.offeredTo===1?"I":"II"}`
                      : commsGridState.mode === "offered" && commsGridState.offeredTo === pi + 1
                        ? `Comms: offer from Actor ${commsGridState.offeredBy===1?"I":"II"}`
                        : "Comms: independent";
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:4,
                      background:"rgba(52,96,168,0.05)", border:"1px solid rgba(128,176,216,0.10)",
                      borderRadius:5, padding:"7px 8px 6px" }}>
                      <select
                        value={sel||""}
                        onChange={e => dispatchAction("selectComms", { pi, type: e.target.value||null })}
                        disabled={isDone || commsOptions.length === 0 || !canControlActor(pi)}
                        style={{
                          background:"rgba(27,25,52,0.92)",
                          border:`1px solid ${isDone?"rgba(128,176,216,0.06)":sel?"#80B0D855":"rgba(128,176,216,0.20)"}`,
                          color:isDone?"#3A3658":sel?"#ECEAF8":(commsOptions.length === 0 ? "#3A3658" : "#80B0D8"),
                          borderRadius:4, padding:"6px 8px",
                          cursor:isDone||commsOptions.length===0?"not-allowed":"pointer",
                          fontSize:11, fontFamily:"'Spectral',Georgia,serif",
                          fontStyle:"italic", fontWeight:400, letterSpacing:"-0.005em",
                          outline:"none", width:"100%",
                          opacity:isDone?0.35:1,
                        }}>
                        <option value="">Comms decisions…</option>
                        {commsOptions.map(o => (
                          <option key={o.type} value={o.type} style={{ background:"#1B1934", color:"#80B0D8" }}>
                            {o.label === "Decouple" ? "Decouple Comms" : o.label} {o.type === "open" ? "comms" : ""}
                          </option>
                        ))}
                      </select>
                      <div style={{ fontSize:9, color:"#80B0D8", opacity:0.7, letterSpacing:"-0.002em", textAlign:"center",
                        fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
                        {statusText}
                      </div>
                      <button
                        onClick={() => dispatchAction("executeComms", { pi })}
                        disabled={!sel || isDone || !canControlActor(pi)}
                        style={{
                          background: sel ? "rgba(52,96,168,0.18)" : "rgba(128,176,216,0.04)",
                          border:`1px solid ${sel?"rgba(128,176,216,0.45)":"rgba(128,176,216,0.10)"}`,
                          color: sel ? "#ECEAF8" : "#3A3658",
                          borderRadius:5, padding:"7px 0",
                          cursor: sel && !isDone ? "pointer" : "not-allowed",
                          fontSize:11, fontFamily:"'Spectral',Georgia,serif",
                          fontStyle:"italic", fontWeight:sel?500:400, letterSpacing:"-0.005em",
                          opacity:isDone?0.35:1,
                        }}>
                        {sel ? "Transmit comms decision" : "Select a comms action"}
                      </button>
                    </div>
                  );
                })()}
                {phase===PHASE.PLAYING && (
                  <button
                    onClick={()=>{
                      // Defensive: in solo (no multiplayer), call endTurn
                      // directly as well as routing through the action
                      // dispatcher. The dispatcher path also works, but
                      // calling directly guarantees the conclude action
                      // fires even if the handler registration is stale.
                      if (!mp) {
                        endTurn(pi);
                      } else {
                        dispatchAction("endTurn", { pi });
                      }
                    }}
                    disabled={isDone || !canControlActor(pi) || sessionActive(diplomacy)}
                    style={{
                      background:isDone?"rgba(155,212,181,0.15)":isMyTurn?`linear-gradient(135deg,${color}28,${color}10)`:"rgba(200,196,220,0.05)",
                      border:`1px solid ${isDone?"rgba(155,212,181,0.45)":isMyTurn?color:"rgba(200,196,220,0.12)"}`,
                      color:isDone?"#9BD4B5":isMyTurn?"#ECEAF8":"#3A3658",
                      borderRadius:6, padding:"10px 0 11px", cursor:isDone?"default":"pointer",
                      fontSize:13, letterSpacing:"-0.005em",
                      fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
                      fontStyle:"italic", fontWeight:isMyTurn?500:400, transition:"all 0.18s",
                      boxShadow:isMyTurn&&!isDone?`0 0 18px ${color}44, 0 4px 12px ${color}22, inset 0 1px 0 rgba(236,234,248,0.08)`:"none",
                      animation: isMyTurn&&!isDone ? (pi===0?"pulse-glow 2.5s ease-in-out infinite":"pulse-glow-p2 2.5s ease-in-out infinite") : "none",
                      marginTop:2,
                    }}>
                    {isDone ? "Round concluded" : "Conclude round"}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Centre: map + info */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:5, minWidth:0, order:1 }}>
          {/* v21: Top "ACTOR BUILD PALETTE" bar removed -- placement now
              flows exclusively through Explore-then-place. The palette
              created two competing entry points (drag from top palette
              vs. dropdown vs. explore button) which fragmented the UX.
              v49: Dead drag-ghost state, map drag handlers, and ghost
              preview render removed -- palette no longer exists so all
              were permanently unreachable code. */}
          {/* Map canvas */}
          <div
            ref={mapContainerRef}
            style={{
            position:"relative", width:"100%", aspectRatio:"1",
            borderRadius:8, overflow:"hidden",
            // v23.1: deep slate background so the basemap fade-out at high
            // zoom looks intentional (schematic) instead of broken (washed out).
            background: "#0B0918",
            border:`1px solid ${night?"rgba(100,80,200,0.3)":"rgba(60,100,160,0.2)"}`,
            boxShadow:night?"0 0 36px rgba(60,40,140,0.5), inset 0 0 0 1px rgba(100,80,200,0.1)":"0 0 30px rgba(10,40,90,0.4), inset 0 0 0 1px rgba(60,100,180,0.08)",
            cursor:annotating?"crosshair":selectingFor!==null||phase===PHASE.SETUP1||phase===PHASE.SETUP2?"crosshair":"default",
          }}>
            {!mapLoaded && (
              <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center", gap:10,
                background:"#0B0918", color:"#3A3658", fontSize:9, letterSpacing:"0.15em" }}>
                <div style={{ width:24, height:24, borderRadius:"50%", border:"2px solid #3A3658",
                  borderTopColor:"#C0B8E8", animation:"spin 1s linear infinite" }}/>
                LOADING LUNAR MAP...
              </div>
            )}
            {/* v26: zoom+pan implemented via element sizing instead of
                CSS transform. The previous approach (`transform: scale(zoom)
                translate(pan)`) is composited -- the browser rasterizes
                each child once at its intrinsic CSS size and then
                bilinear-stretches the resulting layer to the post-transform
                size. For SVG basemaps this defeats the entire point of
                using vectors: they re-rasterize crisply only when the
                browser actually layouts them at a new size. Sizing the
                inner wrapper via `width/height: ${zoom*100}%` triggers
                real layout on every zoom change, so the SVG `<img>`
                child rasterizes at the new size every time. The pan is
                applied via `left/top` offset (also a layout-time change,
                not a composited transform). During the 0.6s auto-fit
                transition CSS interpolates these properties smoothly;
                browsers may raster-cache during the transition (slight
                softness for ~0.6s) but at rest the basemap is crisp.

                The math: an outer container of CSS size containerW lays
                out this inner div at width = zoom*containerW. Inside,
                a source-pixel (x, y) on the W×H map appears at
                  container_percent_x = leftPct + (x/W) * 100 * zoom
                where leftPct = 50*(1-zoom) - (panX/W)*100*zoom centers
                the map when pan=0 and offsets correctly otherwise.
                The icon-overlay and drag-ghost screen-position formulas
                derived in v25 (~lines 10766, 10903) match this exactly,
                so all layers stay pixel-aligned. */}
            {(() => {
              const zoom = viewport.zoom;
              const leftPct = 50 * (1 - zoom) - (viewport.panX / W) * 100 * zoom;
              const topPct  = 50 * (1 - zoom) - (viewport.panY / H) * 100 * zoom;
              return (
            <div style={{
              position:"absolute",
              left:   `${leftPct}%`,
              top:    `${topPct}%`,
              width:  `${zoom * 100}%`,
              height: `${zoom * 100}%`,
              transition: viewport.autoFit
                ? "left 0.6s cubic-bezier(0.22, 1, 0.36, 1), top 0.6s cubic-bezier(0.22, 1, 0.36, 1), width 0.6s cubic-bezier(0.22, 1, 0.36, 1), height 0.6s cubic-bezier(0.22, 1, 0.36, 1)"
                : "none",
            }}>
            {/* v24/v26: Basemap rendered as a DOM <img> element. The
                parent's layout-driven sizing (v26) means the browser
                re-rasterizes the SVG at the new size at every zoom step,
                giving vector-crisp output. Raster basemaps interpolate
                from their 2424×2424 source. */}
            {mapLoaded && (
              <img
                src={MAP_LAYERS[baseMap] || MAP_LAYERS.basemap_quickmap}
                alt=""
                draggable={false}
                decoding="sync"
                style={{
                  position:"absolute", inset:0,
                  width:"100%", height:"100%",
                  pointerEvents:"none",
                  userSelect:"none",
                  // v196: was "crisp-edges" for raster basemaps at zoom, which
                  // is nearest-neighbour and shows hard pixel blocks when the
                  // bitmap is enlarged. "auto" lets the browser bilinear-smooth
                  // the upscale, so zoomed raster basemaps read clean instead of
                  // pixelated. Vector (SVG) basemaps were already crisp either way.
                  imageRendering: "auto",
                  // v90: when the favorability composite is the active overlay,
                  // dim + contrast the relief so the composite reads like the
                  // post's Figure 5 (saturated colour over near-black shadow)
                  // rather than washing out over light relief.
                  // v90/v91: when the favorability composite is the active
                  // overlay, the base needs to be dark so the colour reads.
                  // The topo-contour basemap is already a dark shaded-relief
                  // map, so it only gets a gentle touch; the bright photo
                  // basemaps (dramatic/quickmap) get heavily dimmed.
                  // The dark contour basemaps (synthetic + published topo) are
                  // already near-black, so they only get a gentle touch under
                  // the composite. The bright photo rasters (dramatic/quickmap)
                  // get heavily dimmed. The published COLORED figure plates are
                  // favorability maps in their own right, so when used as the
                  // base they are left undimmed.
                  filter: activeOverlays.has("idx_composite")
                    ? ((baseMap === "basemap_topo_contour" || baseMap === "basemap_topo_vector" || baseMap === "basemap_fig_topo")
                        ? "brightness(0.92) contrast(1.05)"
                        : baseMap.startsWith("basemap_fig_")
                          ? undefined
                          : "brightness(0.3) contrast(1.35) saturate(1.1)")
                    : undefined,
                  // Clip raster basemaps to the polar disk circle so the square
                  // corners don't show against the dark background.
                  clipPath: RASTER_BASEMAPS.has(baseMap) ? "circle(50% at 50% 50%)" : undefined,
                  transition:"opacity 0.4s ease",
                }}
              />
            )}
            {/* v25/v26: tonal overlay -- replaces the CSS filter chain on
                the basemap img. Day mode is a subtle desaturation +
                slight cool wash to keep terrain readable without the
                lurid magenta the basemap raw out. Night mode is a
                deep-violet multiply. Sits between basemap and the
                canvas overlay so it tints terrain but not the glowing
                rover icons / safety rings. */}
            {mapLoaded && (
              <div style={{
                position:"absolute", inset:0,
                pointerEvents:"none",
                background: night
                  ? "linear-gradient(135deg, rgba(20,16,48,0.62), rgba(36,24,68,0.55))"
                  : "rgba(20,18,40,0.08)",
                mixBlendMode: "multiply",
                transition: "background 0.4s ease",
              }}/>
            )}
            {/* v105: crisp DOM favorability overlay. A published true-vector
                plate layered as an <img> in the same zoom-transformed wrapper
                as the basemap, so the favorability colour stays sharp at any
                zoom (the canvas-drawn idx_composite pixelates because it is
                rasterized at 1212px then scaled). Sits above the basemap +
                tonal wash but below the canvas (rover icons, safety rings,
                labels), so gameplay markers still draw on top. */}
            {mapLoaded && vectorOverlay && MAP_LAYERS[vectorOverlay] && (
              <img
                src={MAP_LAYERS[vectorOverlay]}
                alt=""
                draggable={false}
                decoding="sync"
                style={{
                  position:"absolute", inset:0,
                  width:"100%", height:"100%",
                  pointerEvents:"none", userSelect:"none",
                  opacity: vectorOverlayOpacity,
                  mixBlendMode: "screen",
                  transition:"opacity 0.3s ease",
                }}
              />
            )}
            <canvas ref={canvasRef}
              style={{ width:"100%", height:"100%", display:"block", position:"absolute", inset:0 }}
              onClick={handleClick} onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}
              onMouseLeave={()=>{ setHover(null); setRoverDrag(null); }}
              onContextMenu={handleRightClick} />
            </div>
              );
            })()}
            {/* Zoom controls */}
            <div style={{
              position:"absolute", top:8, right:8, zIndex:5,
              display:"flex", flexDirection:"column", gap:3,
              background:"rgba(20,18,32,0.78)",
              border:"1px solid rgba(168,168,240,0.28)",
              borderRadius:4, padding:3,
            }}>
              {[
                // v27: was capping at 4.0 here while the keyboard handler
                // (line ~376) capped at 4.5 -- minor UX inconsistency.
                // Both now use 4.5, matching computeAutoFitViewport's
                // MAX_ZOOM_AUTOFIT constant from src/sim/viewport.js.
                ["+", "Zoom in (+ key)", () => setViewport(v => ({ ...v, zoom: Math.min(4.5, v.zoom * 1.4), autoFit:false }))],
                ["−", "Zoom out (− key)", () => setViewport(v => ({ ...v, zoom: Math.max(0.5, v.zoom / 1.4), autoFit:false }))],
                ["⌂", "Auto-fit to assets (0 key) · arrow keys pan", () => setViewport(v => ({ ...v, autoFit:true }))],
              ].map(([sym, title, fn]) => (
                <button key={sym} onClick={fn} title={title} style={{
                  width:24, height:24, padding:0,
                  background:"rgba(168,168,240,0.08)",
                  border:"1px solid rgba(168,168,240,0.25)",
                  color:"#C0B8E8", borderRadius:3, cursor:"pointer",
                  fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:14, fontWeight:600,
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>{sym}</button>
              ))}
              <div style={{
                fontSize:8.5, color:"#8B86B0", textAlign:"center", padding:"2px 0",
                fontFamily:"'Bricolage Grotesque',monospace", letterSpacing:"0.04em",
              }}>{viewport.zoom.toFixed(1)}×</div>
            </div>

            {/* v150: bottom-center scale bar -- shows real-world ground
                distance for the current zoom level. The map container is
                MAP_KM (606km) wide at zoom=1; at zoom z the same container
                width shows MAP_KM/z of ground, so km-per-screen-px =
                (MAP_KM/z) / containerWidthPx. We pick a "nice" round
                distance (1/2/5 * 10^n) whose on-screen width lands in a
                comfortable 60-160px band, then size the bar to match. */}
            {(() => {
              // v156: the tracked width can briefly read 0 right after a
              // re-render (before the ResizeObserver re-fires), which made the
              // scale bar blink out. Fall back to the live container width so it
              // stays put.
              const containerW = mapContainerWidth || mapContainerRef.current?.offsetWidth || 0;
              if (containerW <= 0) return null;
              // v150: scale-bar math extracted to src/sim/scaleBar.js (tested).
              const sb = scaleBarFor(MAP_KM, viewport.zoom || 1, containerW);
              if (!sb) return null;
              const { barPx, label } = sb;

              return (
                <div style={{
                  position:"absolute", bottom:12, left:"50%",
                  transform:"translateX(-50%)", zIndex:5,
                  display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                  pointerEvents:"none",
                  fontFamily:"'Bricolage Grotesque', monospace",
                }}>
                  {/* Ruler bar: bright mint with end-ticks, glowing */}
                  <div style={{
                    position:"relative",
                    width:`${barPx}px`, height:8,
                    display:"flex", alignItems:"center",
                  }}>
                    {/* horizontal rule */}
                    <div style={{
                      position:"absolute", left:0, right:0, top:"50%",
                      height:2, transform:"translateY(-50%)",
                      background:"#7DD8B0",
                      boxShadow:"0 0 8px rgba(125,216,176,0.9), 0 0 16px rgba(125,216,176,0.5)",
                    }} />
                    {/* end ticks */}
                    {[0, barPx].map((x, i) => (
                      <div key={i} style={{
                        position:"absolute", top:0, bottom:0, left:`${x}px`,
                        width:2, marginLeft:-1,
                        background:"#7DD8B0",
                        boxShadow:"0 0 8px rgba(125,216,176,0.9), 0 0 16px rgba(125,216,176,0.5)",
                      }} />
                    ))}
                    {/* center tick, slightly shorter */}
                    <div style={{
                      position:"absolute", top:2, bottom:2, left:`${barPx/2}px`,
                      width:1.5, marginLeft:-0.75,
                      background:"#7DD8B0",
                      opacity:0.7,
                    }} />
                  </div>
                  <div style={{
                    fontSize:11, fontWeight:700, color:"#0B0918",
                    letterSpacing:"0.08em",
                    background:"#7DD8B0",
                    borderRadius:4,
                    padding:"3px 10px",
                    boxShadow:"0 0 10px rgba(125,216,176,0.7), 0 2px 8px rgba(0,0,0,0.5)",
                  }}>{label}</div>
                </div>
              );
            })()}


            {/* v21: cinematic vignette + edge fade -- non-interactive, sits
                outside the zoom transform so it stays glued to the frame. */}
            <div style={{
              position:"absolute", inset:0, pointerEvents:"none", zIndex:3,
              background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(8,6,24,0.55) 100%)",
              mixBlendMode: "multiply",
            }} />
            {/* Subtle inner border glow */}
            <div style={{
              position:"absolute", inset:0, pointerEvents:"none", zIndex:3,
              boxShadow: "inset 0 0 70px rgba(80,60,160,0.18), inset 0 0 0 1px rgba(168,168,240,0.06)",
              borderRadius: 8,
            }} />

            {/* v23: blueprint grid -- fades as zoom increases. At 1× the
                grid sits at low opacity for ambient ops-feel; at 3×+ it
                disappears so close-in inspection of terrain isn't
                obscured by giant grid squares. */}
            {viewport.zoom < 2.5 && (
              <div style={{
                position:"absolute", inset:0, pointerEvents:"none", zIndex:2,
                backgroundImage:
                  "linear-gradient(rgba(168,168,240,0.03) 1px, transparent 1px), " +
                  "linear-gradient(90deg, rgba(168,168,240,0.03) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
                mixBlendMode: "screen",
                opacity: Math.max(0, 0.65 - 0.20 * Math.max(0, (viewport.zoom || 1) - 1)),
              }} />
            )}            {/* v22: scan line -- animated horizontal sweep, subtle ops-feel.
                v49: gated on !prefersReducedMotion so a backgrounded or
                power-saving browser can't freeze this as a static artifact. */}
            {!window.matchMedia("(prefers-reduced-motion: reduce)").matches && (
            <div style={{
              position:"absolute", inset:0, pointerEvents:"none", zIndex:4,
              overflow:"hidden", borderRadius:8,
            }}>
              <div style={{
                position:"absolute", left:0, right:0, height:"30%",
                background: "linear-gradient(180deg, transparent 0%, rgba(125,216,176,0.045) 50%, transparent 100%)",
                animation: "ops-scan 8s linear infinite",
                animationPlayState: document.hidden ? "paused" : "running",
                pointerEvents:"none",
              }} />
            </div>
            )}
            {/* v22: corner crosshairs -- four small tactical brackets at the
                map corners. Reads as a viewport rather than a chart. */}
            {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
              <div key={`${v}${h}`} style={{
                position:"absolute", [v]:8, [h]:8, zIndex:4,
                width:14, height:14, pointerEvents:"none",
                borderTop:    v === "top"    ? "1.5px solid rgba(168,168,240,0.55)" : "none",
                borderBottom: v === "bottom" ? "1.5px solid rgba(168,168,240,0.55)" : "none",
                borderLeft:   h === "left"   ? "1.5px solid rgba(168,168,240,0.55)" : "none",
                borderRight:  h === "right"  ? "1.5px solid rgba(168,168,240,0.55)" : "none",
              }} />
            ))}
            {/* v22: top-edge mission strip -- coordinate readout + status
                indicators in monospace, mission-ops style. */}
            <div style={{
              position:"absolute", top:8, left:30, right:36, zIndex:4,
              pointerEvents:"none",
              display:"flex", justifyContent:"space-between", alignItems:"center",
              fontFamily:"'JetBrains Mono', monospace", fontSize:9.5,
              color:"#7DD8B0", letterSpacing:"0.10em",
              textShadow:"0 0 8px rgba(125,216,176,0.6), 0 0 2px rgba(0,0,0,0.9)",
              fontWeight:500,
            }}>
              <div style={{ display:"flex", gap:14 }}>
                <span><span style={{ opacity:0.55 }}>LAT</span> 80.00°S</span>
                <span><span style={{ opacity:0.55 }}>LON</span> 0000°</span>
                <span><span style={{ opacity:0.55 }}>EXT</span> 606 km</span>
              </div>
              <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                <span style={{ animation:"ops-blink 1.6s infinite" }}>● LIVE</span>
                {phase === PHASE.PLAYING && (
                  <span><span style={{ opacity:0.55 }}>R</span>{round}<span style={{ opacity:0.55 }}>/D</span>{day+1}</span>
                )}
              </div>
            </div>

            {/* Lunar context, collapsible pill */}
            <div style={{
              position:"absolute", bottom:10, left:10, zIndex:5,
              fontFamily:"'Bricolage Grotesque', system-ui, sans-serif",
            }}>
              {/* Pill button, always visible */}
              <button
                onClick={() => setLunarContextExpanded(v => !v)}
                style={{
                  display:"flex", alignItems:"center", gap:7,
                  background:"linear-gradient(135deg, rgba(20,18,32,0.92), rgba(32,30,64,0.88))",
                  border:"1px solid rgba(168,168,240,0.32)",
                  borderRadius:20, padding:"5px 11px 5px 8px",
                  cursor:"pointer",
                  boxShadow:"0 2px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(236,234,248,0.06)",
                  transition:"border-color 0.15s",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" style={{ display:"block", flexShrink:0 }}>
                  <circle cx="8" cy="8" r="6.5" fill="#3A365E" stroke="rgba(168,168,240,0.4)" strokeWidth="0.8"/>
                  <ellipse cx="5.5" cy="7" rx="2" ry="1.5" fill="rgba(11,9,24,0.6)"/>
                  <ellipse cx="9" cy="6" rx="1.3" ry="1" fill="rgba(11,9,24,0.55)"/>
                  <ellipse cx="9.5" cy="8.5" rx="1.4" ry="1.2" fill="rgba(11,9,24,0.55)"/>
                  <circle cx="8" cy="13.5" r="1" fill="#ECEAF8" opacity="0.9"/>
                  <line x1="8" y1="1.5" x2="8" y2="3" stroke="#80B0D8" strokeWidth="0.8"/>
                  <circle cx="8" cy="1.2" r="1" fill="#80B0D8"/>
                </svg>
                <span style={{
                  fontSize:9.5, letterSpacing:"0.12em", color:"#A8A8F0",
                  fontWeight:600, textTransform:"uppercase",
                }}>80°S · Near-Limb</span>
                <span style={{
                  fontSize:9, color:"rgba(168,168,240,0.45)", marginLeft:1,
                  display:"inline-block",
                  transform: lunarContextExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition:"transform 0.2s",
                }}>▾</span>
              </button>

              {/* Expanded panel, pops up above the pill */}
              {/* Expanded panel, pops up above the pill */}
              {lunarContextExpanded && (
                <div style={{
                  position:"absolute", bottom:"calc(100% + 6px)", left:0,
                  background:"linear-gradient(135deg, rgba(20,18,32,0.95), rgba(32,30,64,0.92))",
                  border:"1px solid rgba(168,168,240,0.32)",
                  borderRadius:6, padding:"10px 12px 11px",
                  boxShadow:"0 4px 20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(236,234,248,0.06)",
                  width:148,
                  animation:"fadeIn 0.15s ease-out",
                  fontFamily:"'Bricolage Grotesque', system-ui, sans-serif",
                }}>
                  {/* Single near-side disc, pole dot + Earth arrow */}
                  <svg width="124" height="132" viewBox="0 0 124 132" style={{ display:"block", margin:"0 auto" }}>
                    <defs>
                      <radialGradient id="ctxNearGrad" cx="0.38" cy="0.35">
                        <stop offset="0%"  stopColor="#5A5688" />
                        <stop offset="55%" stopColor="#3A365E" />
                        <stop offset="100%" stopColor="#1B1934" />
                      </radialGradient>
                      <radialGradient id="ctxPoleGrad" cx="0.5" cy="0.5">
                        <stop offset="0%"  stopColor="#A8A8F0" stopOpacity="0.35"/>
                        <stop offset="100%" stopColor="#A8A8F0" stopOpacity="0.0"/>
                      </radialGradient>
                    </defs>

                    {/* Moon disc */}
                    <circle cx="62" cy="68" r="54" fill="url(#ctxNearGrad)"
                      stroke="rgba(168,168,240,0.35)" strokeWidth="1" />

                    {/* Maria, subtle dark patches */}
                    <ellipse cx="52" cy="57" rx="11" ry="8"   fill="rgba(20,18,32,0.55)" />
                    <ellipse cx="70" cy="50" rx="7"  ry="5"   fill="rgba(20,18,32,0.5)"  />
                    <ellipse cx="76" cy="63" rx="7"  ry="6.5" fill="rgba(20,18,32,0.5)"  />
                    <ellipse cx="57" cy="75" rx="6"  ry="4.5" fill="rgba(20,18,32,0.5)"  />
                    <ellipse cx="44" cy="78" rx="4"  ry="4"   fill="rgba(20,18,32,0.45)" />
                    <ellipse cx="82" cy="78" rx="4.5" ry="4"  fill="rgba(20,18,32,0.45)" />

                    {/* Equator + prime meridian hint lines */}
                    <line x1="8" y1="68" x2="116" y2="68"
                      stroke="rgba(168,168,240,0.18)" strokeWidth="0.5" strokeDasharray="2,3"/>
                    <ellipse cx="62" cy="68" rx="14" ry="54"
                      fill="none" stroke="rgba(168,168,240,0.18)"
                      strokeWidth="0.5" strokeDasharray="2,3"/>

                    {/* South pole highlight */}
                    <circle cx="62" cy="120" r="5" fill="url(#ctxPoleGrad)"/>
                    <circle cx="62" cy="120" r="2.4" fill="#ECEAF8"/>
                    {/* Pole label */}
                    <text x="62" y="131" textAnchor="middle" fontSize="6"
                      fill="#A8A8F0" fontFamily="'JetBrains Mono', monospace"
                      letterSpacing="0.10em">90°S · MAP</text>

                    {/* Earth arrow above the disc */}
                    <circle cx="62" cy="7" r="3.5" fill="#80B0D8" stroke="#ECEAF8" strokeWidth="0.6"/>
                    <line x1="62" y1="10.5" x2="62" y2="14"
                      stroke="#80B0D8" strokeWidth="1.8"/>
                    <text x="62" y="4.5" textAnchor="middle" fontSize="6"
                      fill="#80B0D8" fontFamily="'JetBrains Mono', monospace"
                      letterSpacing="0.10em">EARTH</text>

                    {/* Near-limb arc, dashed highlight on the limb edge closest to Earth */}
                    <path d="M 62 14 A 54 54 0 0 1 62 122"
                      fill="none" stroke="rgba(128,176,216,0.45)" strokeWidth="2.5"
                      strokeDasharray="5,4" strokeLinecap="round"/>

                    {/* Apollo 11 marker */}
                    <circle cx="76" cy="63" r="1.5" fill="#E8C998"/>
                    <text x="79" y="62" fontSize="4.5" fill="#E8C998"
                      fontFamily="'JetBrains Mono', monospace">A11</text>
                  </svg>

                  {/* Caption */}
                  <div style={{
                    fontSize:8, color:"#7090A8", marginTop:6,
                    paddingTop:5, borderTop:"1px solid rgba(168,168,240,0.10)",
                    lineHeight:1.5, letterSpacing:"0.02em",
                  }}>
                    Near-limb south pole. DTE comms vary with libration; comsats extend coverage into shadow.
                  </div>
                </div>
              )}
            </div>

            {/* v21: Active-violations HUD -- surfaces all live area breaches
                so they cannot be missed even if the rings get visually busy.
                Sits in the top-left corner of the map viewport, animated. */}
            {/* v121 (item 4): persistent DLA hazard badge. When a Lunar Radius
                Framework hazard scenario is active, name the source site and the
                core/buffer/coord zones so it is obvious the safety rings are
                hazard-derived, not default. Sits top-left; nudged down when the
                violations HUD is also showing so the two do not overlap. */}
            {phase === PHASE.PLAYING && activeHazard && (
              <div style={{
                position:"absolute", top: activeViolations.length > 0 ? 132 : 10, left:10, zIndex:6,
                maxWidth: 280,
                background:"linear-gradient(135deg, rgba(20,30,52,0.94), rgba(16,22,44,0.94))",
                border:"1.5px solid rgba(128,176,216,0.55)",
                borderRadius:6,
                padding:"8px 11px 9px",
                boxShadow:"0 0 20px rgba(52,96,168,0.28), 0 4px 14px rgba(0,0,0,0.45)",
                fontFamily:"'Bricolage Grotesque', system-ui, sans-serif",
              }}>
                <div style={{ fontSize:9.5, letterSpacing:"0.16em", color:"#80B0D8", fontWeight:700, marginBottom:3, textTransform:"uppercase", display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ display:"inline-block", width:7, height:7, borderRadius:"50%", background:"#80B0D8", boxShadow:"0 0 6px #80B0D8" }} />
                  DLA Hazard Zones Active
                </div>
                {activeHazard.site && (
                  <div style={{ fontSize:12, color:"#ECEAF8", fontStyle:"italic", fontFamily:"'Spectral',Georgia,serif", marginBottom:2 }}>{activeHazard.site}</div>
                )}
                {activeHazard.zones && (
                  <div style={{ fontSize:9.5, color:"#A8A8F0", letterSpacing:"0.02em" }}>
                    core {activeHazard.zones.core?.toFixed?.(1)}km · buffer {activeHazard.zones.buffer?.toFixed?.(1)}km · coord {activeHazard.zones.coord?.toFixed?.(1)}km
                  </div>
                )}
                <div style={{ fontSize:8.5, color:"#5A6788", marginTop:3, fontStyle:"italic", fontFamily:"'Spectral',Georgia,serif" }}>Lunar Radius Framework · press Z to adjust</div>
              </div>
            )}
            {phase === PHASE.PLAYING && activeViolations.length > 0 && (
              <div style={{
                position:"absolute", top:10, left:10, zIndex:6,
                maxWidth: 280,
                background:"linear-gradient(135deg, rgba(60,12,12,0.94), rgba(40,10,30,0.94))",
                border:"1.5px solid rgba(255,100,80,0.65)",
                borderRadius:6,
                padding:"9px 11px 10px",
                boxShadow:"0 0 24px rgba(255,80,60,0.35), 0 4px 14px rgba(0,0,0,0.5)",
                animation:"violation-pulse 1.3s ease-in-out infinite",
                fontFamily:"'Bricolage Grotesque', system-ui, sans-serif",
              }}>
                <div style={{
                  fontSize:10.5, letterSpacing:"0.14em", color:"#FFE0B0",
                  fontWeight:700, marginBottom:5,
                  display:"flex", alignItems:"center", gap:6,
                }}>
                  <span style={{ fontSize:13 }}>⚠</span>
                  AREA VIOLATIONS · {activeViolations.length}
                </div>
                {/* v100: show the scored cost. Each breached zone adds one
                    safety violation per turn it persists, at SCORE_PENALTY_VIO
                    points each, so the live HUD teaches the running cost the
                    way the debrief does. Broken down per actor when both are
                    in breach, so a facilitator can see who is paying. */}
                {(() => {
                  const byOwner = activeViolations.reduce((m, v) => {
                    m[v.owner] = (m[v.owner] || 0) + 1; return m;
                  }, {});
                  const owners = Object.keys(byOwner).sort();
                  const totalPerTurn = activeViolations.length * SCORE_PENALTY_VIO;
                  return (
                    <div style={{
                      fontSize:10, color:"#FFD0A8", marginBottom:6, lineHeight:1.4,
                      paddingBottom:5, borderBottom:"1px solid rgba(255,140,100,0.25)",
                    }}>
                      <span style={{ fontWeight:700, color:"#FFE0B0" }}>−{totalPerTurn}</span> points per turn while breached
                      {owners.length > 1 && (
                        <span style={{ color:"#E8A888" }}>
                          {"  ·  "}
                          {owners.map((o, i) => (
                            <span key={o}>{i > 0 ? " · " : ""}{o} −{byOwner[o] * SCORE_PENALTY_VIO}</span>
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })()}
                <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                  {activeViolations.slice(0, 5).map((v, i) => (
                    <div key={i} style={{
                      fontSize:10.5, color:"#FFD8B8", lineHeight:1.35,
                      fontWeight:400,
                    }}>
                      <span style={{ color:"#FFE0B0", fontWeight:600 }}>{v.owner}</span>
                      {" "}{({solar:"solar field",reactor:"reactor",habitat:"habitat",pad:"landing pad",rover:"rover"})[v.type] || v.type}
                      {" "}({v.radiusKm} km) breached by{" "}
                      <span style={{ color:"#FFB090", fontWeight:600 }}>{v.violatorCount}</span>
                    </div>
                  ))}
                  {activeViolations.length > 5 && (
                    <div style={{ fontSize:9.5, color:"#C09060", fontStyle:"italic", marginTop:2 }}>
                      +{activeViolations.length - 5} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* v21: Comms-blackout HUD -- counts rovers currently in DTE
                blackout (sampled from LRO/LOLA EARTH_VIS_MAP). Sits below
                the violations HUD when both are active, otherwise top-left.
                Same visual language as the violations panel but with
                comms styling (cyan/orange) so they don't read identically. */}
            {phase === PHASE.PLAYING && (() => {
              const blackoutRovers = [];
              for (const [pi, p] of [[0, p1], [1, p2]]) {
                if (!p) continue;
                const owner = pi === 0 ? "P1" : "P2";
                const csList = p.comsats || [];
                if (p.x != null && p.y != null && isInCommsBlackoutFor(p.x, p.y, csList)) {
                  blackoutRovers.push({ owner, label: `${owner} Rover 1`, ev: effectiveEarthVis(p.x, p.y, csList) });
                }
                (p.extraRovers || []).forEach((er, i) => {
                  if (!er) return;
                  if (isInCommsBlackoutFor(er.x, er.y, csList)) {
                    blackoutRovers.push({ owner, label: `${owner} Rover ${i + 2}`, ev: effectiveEarthVis(er.x, er.y, csList) });
                  }
                });
              }
              if (blackoutRovers.length === 0) return null;
              // v100: +22 accounts for the per-turn cost line added under the
              // violations header so the comms HUD still stacks below it.
              const topOffset = activeViolations.length > 0 ? 10 + 8 + (4 + Math.min(activeViolations.length, 5)) * 20 + 14 + 22 : 10;
              return (
                <div style={{
                  position:"absolute", top: topOffset, left:10, zIndex:6,
                  maxWidth: 280,
                  background:"linear-gradient(135deg, rgba(28,40,60,0.94), rgba(20,18,32,0.92))",
                  border:"1.5px solid rgba(120,216,240,0.55)",
                  borderRadius:6, padding:"9px 11px 10px",
                  boxShadow:"0 0 18px rgba(80,180,232,0.25), 0 4px 14px rgba(0,0,0,0.5)",
                  fontFamily:"'Bricolage Grotesque', system-ui, sans-serif",
                }}>
                  <div style={{
                    fontSize:10.5, letterSpacing:"0.14em", color:"#80B0D8",
                    fontWeight:700, marginBottom:5,
                    display:"flex", alignItems:"center", gap:6,
                  }}>
                    <span style={{ fontSize:13 }}>📡</span>
                    COMMS BLACKOUT · {blackoutRovers.length}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                    {blackoutRovers.slice(0, 5).map((b, i) => (
                      <div key={i} style={{ fontSize:10.5, color:"#D8E0E8", lineHeight:1.35 }}>
                        <span style={{ color:"#80B0D8", fontWeight:600 }}>{b.label}</span>
                        {" · "}
                        <span style={{ color:"#E89BB5" }}>{(b.ev * 100).toFixed(0)}% DTE</span>
                      </div>
                    ))}
                    {blackoutRovers.length > 5 && (
                      <div style={{ fontSize:9.5, color:"#7090A8", fontStyle:"italic", marginTop:2 }}>
                        +{blackoutRovers.length - 5} more
                      </div>
                    )}
                  </div>
                  <div style={{
                    fontSize:9, color:"#7090A8", marginTop:5, fontStyle:"italic",
                    fontFamily:"'Spectral', Georgia, serif",
                    borderTop:"1px solid rgba(120,216,240,0.18)", paddingTop:4,
                  }}>
                    Waypoints set now will queue 1 day · LRO/LOLA
                  </div>
                </div>
              );
            })()}

            {/* v21: Round transition banner -- extracted to src/ui/RoundTransitionBanner.jsx */}
            <RoundTransitionBanner roundTransition={roundTransition} />
            {/* v176: Diplomacy session banner. The host (or a non-MP facilitator)
                can adjourn early; peers just see the countdown. */}
            <DiplomacyBanner
              session={diplomacy}
              convenerLabel={sessionConvenerLabel(diplomacy, actorLabel)}
              clock={formatSessionClock(sessionTimeLeftMs(diplomacy))}
              progress={sessionProgress(diplomacy)}
              canAdjourn={!mp || isHost || isFacilitator}
              onAdjourn={() => endDiplomacy("adjourned")}
            />
            {/* v181: public claims board (toggled from the toolbar). */}
            {showClaims && phase === PHASE.PLAYING && (
              <ClaimsPanel
                claims={claims}
                viewer={claimViewer}
                actorLabel={actorLabel}
                p1={p1} p2={p2}
                isFacilitator={isFacilitator}
                onPost={postClaim}
                onVote={voteClaim}
                onVerify={verifyClaimAction}
                onClose={() => setShowClaims(false)}
              />
            )}

            {/* v26: Named-feature labels (craters + graticule). These
                were stripped out of the SVG basemaps because at high
                zoom the SVG-baked labels became huge (font-size 26 in
                a 2424×2424 viewbox -- fine at zoom 1, but at zoom 3
                a 40px-tall "Shackleton" eats half the map). Now they
                live here as React DOM, positioned via the same zoom/pan
                math as the icon overlay, with font-size that stays
                visually constant by COUNTER-SCALING with zoom (so at
                zoom 2× the label renders at half its base size in the
                un-transformed layer, which then doesn't get transformed
                so it stays at the same on-screen size). Crater labels
                only show above zoom 1.2× -- at the wide view they
                clutter the map. Graticule lines stay visible always
                but use a lower opacity. */}
            <div style={{
              position:"absolute", inset:0,
              pointerEvents:"none",
              fontFamily:"'Bricolage Grotesque', system-ui, sans-serif",
              transition: viewport.autoFit ? "opacity 0.3s ease" : "none",
            }}>
              {(() => {
                const z = viewport.zoom;
                // Canonical zoom-aware screen position (same as icon overlay
                // and basemap inner wrapper). Center is (50,50)*(1-z) and we
                // subtract the pan-scaled offset, plus the (x/W) * 100 * z
                // term for the asset's position on the map.
                const xPct = (x) => 50 * (1 - z) - (viewport.panX / W) * 100 * z + (x / W) * 100 * z;
                const yPct = (y) => 50 * (1 - z) - (viewport.panY / H) * 100 * z + (y / H) * 100 * z;
                // Counter-scale font with zoom so the label stays roughly
                // constant on-screen size. Floor at 0.6 so at low zoom the
                // labels remain readable; cap at 1.3 so at the widest
                // zoom (0.5) we don't blow them up. Base sizes pick
                // smaller for graticule, larger for craters.
                const counterScale = Math.max(0.6, Math.min(1.3, 1 / Math.max(0.8, z)));
                const showCraters = z >= 1.15;
                return (
                  <>
                    {GRATICULE_LABELS.map((l, i) => {
                      const sx = xPct(l.x), sy = yPct(l.y);
                      if (sx < -10 || sx > 110 || sy < -10 || sy > 110) return null;
                      return (
                        <div key={`g${i}`} style={{
                          position:"absolute",
                          left: `${sx}%`, top: `${sy}%`,
                          transform: "translate(-50%, -50%)",
                          fontSize: `${13 * counterScale}px`,
                          letterSpacing: "0.08em",
                          color: "rgba(168,168,240,0.55)",
                          textShadow: "0 0 6px rgba(8,6,20,0.95), 0 0 2px rgba(8,6,20,1)",
                          fontWeight: 400,
                          whiteSpace: "nowrap",
                          transition: viewport.autoFit
                            ? "left 0.6s cubic-bezier(0.22, 1, 0.36, 1), top 0.6s cubic-bezier(0.22, 1, 0.36, 1), font-size 0.3s ease"
                            : "none",
                        }}>{l.name}</div>
                      );
                    })}
                    {showCraters && CRATER_LABELS.map((l, i) => {
                      const sx = xPct(l.x), sy = yPct(l.y);
                      if (sx < -5 || sx > 105 || sy < -5 || sy > 105) return null;
                      return (
                        <div key={`c${i}`} style={{
                          position:"absolute",
                          left: `${sx}%`, top: `${sy}%`,
                          transform: "translate(-50%, -50%)",
                          fontSize: `${12 * counterScale}px`,
                          letterSpacing: "0.05em",
                          color: "#ECEAF8",
                          textShadow: "0 0 6px rgba(8,6,20,0.95), 0 0 2px rgba(8,6,20,1), 0 1px 2px rgba(8,6,20,1)",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          opacity: Math.min(1, (z - 1.0) * 2.5),
                          transition: viewport.autoFit
                            ? "left 0.6s cubic-bezier(0.22, 1, 0.36, 1), top 0.6s cubic-bezier(0.22, 1, 0.36, 1), font-size 0.3s ease, opacity 0.3s ease"
                            : "opacity 0.3s ease, font-size 0.3s ease",
                        }}>{l.name}</div>
                      );
                    })}
                  </>
                );
              })()}
            </div>

            {/* v25: SVG-icon overlay LIFTED OUT of the zoom-transform
                wrapper. In v23/v24, the icons sat inside the wrapper that
                applied `scale(zoom)`, then each icon counter-scaled by
                `1/zoom`. Mathematically that's identity, BUT browsers
                rasterize the SVG at its intrinsic CSS pixel size, then
                the parent layer's transform stretches that raster with
                bilinear blur -- so the icons appeared progressively
                pixelated as zoom increased. By positioning the icons in
                an UN-transformed sibling container and computing each
                icon's on-screen position from the zoom/pan math
                directly, the browser rasterizes each SVG at its true
                display size every frame -- pixel-sharp at any zoom.

                Position formula: a source-coord point (x, y) on the
                W×H map maps to container percent:
                    pct_x = 50 + ((x - panX - W/2) / W) * zoom * 100
                    pct_y = 50 + ((y - panY - H/2) / H) * zoom * 100
                derived from the parent's
                  `transform: scale(zoom) translate(-panX, -panY)`
                with transform-origin center. */}
            <div style={{
              position:"absolute", inset:0,
              pointerEvents:"none",
              transition: viewport.autoFit ? "opacity 0.3s ease" : "none",
            }}>
              {[p1, p2].map((p) => {
                if (!p || p.active === false) return null;
                // v190: asset sprites now render in the OWNING TEAM's identity
                // color, Actor I teal (#28B9AE), Actor II orange (#F0902E) , 
                // matching the claim fills, mine heatmap, and zone rings. (Was
                // periwinkle / mist-blue, which read as neutral UI chrome.)
                const color = p.color || (p.id === 1 ? PLAYER1_COLOR : PLAYER2_COLOR);
                const sh = p.structureHealth || {};
                const z = viewport.zoom;
                const pxToPctX = (x) => 50 + ((x - viewport.panX - W/2) / W) * z * 100;
                const pxToPctY = (y) => 50 + ((y - viewport.panY - H/2) / H) * z * 100;
                const items = [];
                // Habitat (kind: habitat). v4 stored as p.habitat, newer code as p.habitats array
                if (p.habitat) items.push({ type:"habitat", x:p.habitat.x, y:p.habitat.y, sz:46, key:"hab",
                  health: sh.habitats?.[0] ?? 1.0,
                  power: p.habitatPower?.[0] ?? 1.0 });
                (p.habitats || []).forEach((h, i) => items.push({ type:"habitat", x:h.x, y:h.y, sz:46, key:`hab${i}`,
                  health: sh.habitats?.[i] ?? 1.0,
                  power: p.habitatPower?.[i] ?? 1.0 }));
                // Landing pad(s)
                if (p.landingPad && !(p.landingPads || []).length) items.push({ type:"pad", x:p.landingPad.x, y:p.landingPad.y, sz:42, key:"pad",
                  health: sh.landingPads?.[0] ?? 1.0 });
                (p.landingPads || []).forEach((pd, i) => items.push({ type:"pad", x:pd.x, y:pd.y, sz:42, key:`pad${i}`,
                  health: sh.landingPads?.[i] ?? 1.0 }));
                // Solar arrays
                (p.panels || []).forEach((s, i) => items.push({ type:"solar", x:s.x, y:s.y, sz:38, key:`sol${i}`,
                  health: sh.panels?.[i] ?? 1.0,
                  onRidge: s.onRidge }));
                // Reactors
                (p.reactors || []).forEach((r, i) => items.push({ type:"reactor", x:r.x, y:r.y, sz:42, key:`rea${i}`,
                  health: sh.reactors?.[i] ?? 1.0 }));
                // Primary rover
                items.push({ type:"rover", x:p.x, y:p.y, sz:48, key:"rover0",
                  health: 1.0,
                  power: p.power ?? 1.0, ice: p.ice ?? 0, status: p.status,
                  isRover: true, rIdx: 0 });
                (p.extraRovers || []).forEach((r, i) => items.push({ type:"rover", x:r.x, y:r.y, sz:46, key:`rover${i+1}`,
                  health: sh.extraRovers?.[i] ?? 1.0,
                  power: r.power ?? 1.0, ice: r.ice ?? 0, status: r.status,
                  isRover: true, rIdx: i + 1 }));
                return items.filter(it => !oppHidden(p.id - 1, it.x, it.y)).map(it => {
                  const healthPct = Math.max(0, Math.min(1, it.health ?? 1.0));
                  // v174: power is absolute (0-POWER_CAP), so the old
                  // Math.min(1, it.power) pinned every charged asset to 100%.
                  // Divide by the cap to get a real fraction.
                  const powerPct  = it.power != null ? Math.max(0, Math.min(1, it.power / POWER_CAP)) : null;
                  // v25: NO counter-scale transform on the icon. Icon
                  // size is constant in screen pixels by design (`it.sz`
                  // is already a screen-pixel value), and the icon
                  // wrapper is not inside the zoom transform, so the
                  // SVG rasterizes at intrinsic pixel size = display
                  // size every frame -- crisp at any zoom.
                  const screenX = pxToPctX(it.x);
                  const screenY = pxToPctY(it.y);
                  // Clip icons that scroll out of frame (saves rendering
                  // dozens of off-screen DOM nodes during high zoom).
                  if (screenX < -10 || screenX > 110 || screenY < -10 || screenY > 110) return null;
                  return (
                    <div key={`${p.id}-${it.key}`} style={{
                      position:"absolute",
                      left: `${screenX}%`,
                      top:  `${screenY}%`,
                      transform: "translate(-50%, -50%)",
                      transformOrigin:"center center",
                      pointerEvents:"none",
                      // v25: match the basemap zoom transition so icons
                      // glide in sync with the terrain during auto-fit
                      // zoom changes. Same easing/duration as the parent
                      // zoom-transform wrapper (above, ~line 10262).
                      transition: viewport.autoFit
                        ? "left 0.6s cubic-bezier(0.22, 1, 0.36, 1), top 0.6s cubic-bezier(0.22, 1, 0.36, 1)"
                        : "none",
                    }}>
                      {/* Health ring + power arc (SVG overlay around the icon) */}
                      <svg width={it.sz + 18} height={it.sz + 18}
                        viewBox={`0 0 ${it.sz + 18} ${it.sz + 18}`}
                        style={{ position:"absolute", left: -9, top: -9, overflow:"visible" }}>
                        {/* Outer health ring (full circumference, faint) */}
                        <circle cx={(it.sz + 18) / 2} cy={(it.sz + 18) / 2} r={(it.sz + 6) / 2}
                          fill="none" stroke="rgba(20,18,32,0.85)" strokeWidth="3.5"/>
                        {/* Health arc (top, runs from 9 o'clock CCW based on health) */}
                        {(() => {
                          const r = (it.sz + 6) / 2;
                          const cx = (it.sz + 18) / 2; const cy = (it.sz + 18) / 2;
                          const startA = -Math.PI / 2;
                          const sweep = healthPct * Math.PI * 2;
                          const endA = startA + sweep;
                          const x1 = cx + r * Math.cos(startA);
                          const y1 = cy + r * Math.sin(startA);
                          const x2 = cx + r * Math.cos(endA);
                          const y2 = cy + r * Math.sin(endA);
                          const largeArc = sweep > Math.PI ? 1 : 0;
                          const healthColor = healthPct > 0.6 ? "#9BD4B5" : healthPct > 0.3 ? "#E8C998" : "#E89BB5";
                          if (healthPct >= 0.999) {
                            return <circle cx={cx} cy={cy} r={r} fill="none" stroke={healthColor} strokeWidth="3" strokeLinecap="round"/>;
                          }
                          return <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
                            fill="none" stroke={healthColor} strokeWidth="3" strokeLinecap="round"/>;
                        })()}
                      </svg>
                      {/* The icon itself */}
                      <div style={{
                        position:"relative",
                        filter: `drop-shadow(0 2px 3px rgba(0,0,0,0.7)) drop-shadow(0 0 5px ${color}55)`,
                      }}>
                        <AssetIcon type={it.type} color={color} size={it.sz}/>
                      </div>
                      {/* Status badge for rovers */}
                      {it.isRover && (
                        <div style={{
                          position:"absolute", left:"50%", top: it.sz + 12,
                          transform:"translateX(-50%)",
                          background:"rgba(15,12,28,0.92)",
                          border: `1px solid ${color}66`,
                          borderRadius: 3, padding:"2px 7px",
                          fontFamily:"'Bricolage Grotesque',monospace", fontSize:9,
                          color: "#ECEAF8", letterSpacing:"0.06em",
                          whiteSpace:"nowrap", fontWeight:600,
                          textTransform:"uppercase",
                        }}>
                          R{it.rIdx + 1} {it.status === "mining" ? "· mining" : it.status === "moving" ? "· moving" : it.ice > 0 ? "· carrying" : ""}
                        </div>
                      )}
                      {/* Power indicator dot for reactors / solar / habs */}
                      {!it.isRover && powerPct != null && (
                        <div style={{
                          position:"absolute", right: -3, top: -3,
                          width: 9, height: 9, borderRadius:"50%",
                          background: powerPct > 0.6 ? "#9BD4B5" : powerPct > 0.3 ? "#E8C998" : "#E89BB5",
                          border:"1.5px solid rgba(15,12,28,0.85)",
                          boxShadow:`0 0 5px ${powerPct > 0.6 ? "#9BD4B5" : powerPct > 0.3 ? "#E8C998" : "#E89BB5"}`,
                        }}/>
                      )}
                    </div>
                  );
                });
              })}
            </div>
            {/* Asset detail moved to sidebar panel; see AssetDetailSidebar */}

            {/* ── Bottom-right: dynamic map legend + hover terrain readout ── */}
            {(() => {
              // Build the legend entries that are currently relevant
              const legendEntries = [];

              // PSR. The base PSR overlay (showLayers.psr) paints every PSR
              // pixel the same fuchsia (see the pre-baked psrCanvas ~line 970) , 
              // it does NOT show an amber "depleted" tint. That amber appearance
              // is produced only by the separate depletion layer
              // (showLayers.psr_depletion). v140: list the fuchsia "fresh ice"
              // swatch with the base layer, but only show the amber "depleted"
              // swatch when psr_depletion is on, since that is the only toggle
              // that actually renders the depleted coloring on the map.
              if (showLayers.psr) {
                legendEntries.push({ swatch:"psr-fresh", color:"rgba(200,50,180,0.55)", border:"rgba(220,80,200,0.6)", label:"PSR (ice)" });
              }
              if (showLayers.psr_depletion) {
                legendEntries.push({ swatch:"psr-depleted", color:"rgba(232,201,152,0.55)", border:"rgba(232,201,152,0.5)", label:"PSR (depleted)" });
              }

              // Ridge, only when the sunlit-ridge layer is on (v140: was
              // previously always drawn and so always listed).
              if (showLayers.ridge !== false) {
                legendEntries.push({ swatch:"ridge", color:"rgba(255,224,50,0.35)", border:"rgba(232,201,152,0.4)", label:"Sunlit ridge" });
              }

              // v92: slope contour bands, when overlay_slope vector overlay is on
              if (activeVectorOverlays.has("overlay_slope")) {
                legendEntries.push({ swatch:"slope-moderate", color:"rgba(255,170,0,0.55)",  border:"#FFB52E", label:"Slope 10°-25° (moderate)" });
                legendEntries.push({ swatch:"slope-steep",    color:"rgba(240,60,40,0.65)",  border:"#FF5050", label:"Slope >25° (steep)" });
              }

              // v92: comms contour region, when overlay_earth vector overlay is on
              if (activeVectorOverlays.has("overlay_earth")) {
                legendEntries.push({ swatch:"comms-contour", color:"rgba(40,80,200,0.55)", border:"rgba(64,160,255,0.8)", label:"Earth vis. < 30%" });
              }

              // v93: solar potential bands, when overlay_sun vector overlay is on
              if (activeVectorOverlays.has("overlay_sun")) {
                legendEntries.push({ swatch:"solar-50", color:"rgba(140,190,40,0.45)",  border:"#8AB828", label:"Solar > 50% illuminated" });
                legendEntries.push({ swatch:"solar-70", color:"rgba(168,224,40,0.55)",  border:"#A8E028", label:"Solar > 70% illuminated" });
                legendEntries.push({ swatch:"solar-85", color:"rgba(200,255,60,0.70)",  border:"#C8FF3C", label:"Solar > 85% (prime)" });
              }

              // Comms blackout, only when showLayers.comms_blackout is on
              if (showLayers.comms_blackout && (p1 || p2)) {
                legendEntries.push({ swatch:"blackout", color:"rgba(18,28,90,0.65)", border:"rgba(80,100,200,0.45)", label:"Comms blackout" });
              }

              // Claim regions, the on-map claim fill is only drawn when BOTH
              // players exist (computeClaims partitions PSR pixels between the
              // two; see draw ~line 1398: `showLayers.claims && p1 && p2`). With
              // only one player present nothing is painted, so v140 gates both
              // claim swatches on p1 && p2 rather than listing a lone claim that
              // never appears on the map.
              if (showLayers.claims && p1 && p2) {
                legendEntries.push({ swatch:"claim1", color:"rgba(40,185,174,0.22)", border:"rgba(40,185,174,0.55)", label:`${actorLabel(0)} claim` });
                legendEntries.push({ swatch:"claim2", color:"rgba(240,144,46,0.22)", border:"rgba(240,144,46,0.55)", label:`${actorLabel(1)} claim` });
              }

              // Mine heatmap, only list a player's "mined" swatch when that
              // player actually has mined cells. The map only paints pixels for
              // a non-empty mineMap (draw ~line 1490), so v140 checks mineMap
              // length rather than mere player existence; a player who has not
              // mined yet no longer shows a phantom mined-area swatch.
              if (showLayers.mine) {
                const mined1 = Object.keys(p1?.mineMap || {}).length;
                const mined2 = Object.keys(p2?.mineMap || {}).length;
                if (p1 && mined1 > 0) legendEntries.push({ swatch:"mine1", color:"rgba(40,185,174,0.9)", border:"rgba(40,185,174,0.6)", gradient:true, label:`${actorLabel(0)} mined` });
                if (p2 && mined2 > 0) legendEntries.push({ swatch:"mine2", color:"rgba(240,144,46,0.9)", border:"rgba(240,144,46,0.6)", gradient:true, label:`${actorLabel(1)} mined` });
              }

              // Safety zones, only when safety layer is on, AND only for asset
              // types actually present on the map. The map draws one ring per
              // placed asset (see the per-asset safety-ring loop ~line 1707), so
              // a zone type with zero placed assets draws nothing; listing it in
              // the legend showed a swatch with no matching map feature. v140:
              // gate each zone swatch on that asset type existing for either
              // player, and gate the "violation" key on both players having
              // assets (the only way a violation can occur on the map).
              if (showLayers.safety !== false && (p1 || p2)) {
                // A rover always exists for an active player (its position is
                // the player's x/y), plus any extraRovers.
                const hasAsset = (kind) => {
                  for (const p of [p1, p2]) {
                    if (!p || p.active === false) continue;
                    if (kind === "rover") {
                      if (p.x != null && p.y != null) return true;
                      if ((p.extraRovers || []).some(Boolean)) return true;
                    } else if (kind === "solar") {
                      if ((p.panels || []).some(Boolean)) return true;
                    } else if (kind === "reactor") {
                      if ((p.reactors || []).some(Boolean)) return true;
                    } else if (kind === "habitat") {
                      if ((p.habitats || []).some(Boolean)) return true;
                    } else if (kind === "pad") {
                      if (p.landingPad) return true;
                      if ((p.landingPads || []).some(Boolean)) return true;
                    }
                  }
                  return false;
                };
                if (hasAsset("rover"))   legendEntries.push({ swatch:"rover-zone",   color:"rgba(155,212,181,0.08)", border:"#9BD4B5", dash:true, label:"Rover exclusion zone" });
                if (hasAsset("solar"))   legendEntries.push({ swatch:"solar-zone",   color:"rgba(255,208,96,0.07)",  border:"#FFD060", dash:true, label:"Solar field zone" });
                if (hasAsset("pad"))     legendEntries.push({ swatch:"pad-zone",     color:"rgba(232,201,152,0.07)", border:"#E8C998", dash:false, label:"Landing pad zone" });
                if (hasAsset("habitat")) legendEntries.push({ swatch:"habitat-zone", color:"rgba(128,176,216,0.06)", border:"#80B0D8", dash:true, label:"Habitat zone" });
                if (hasAsset("reactor")) legendEntries.push({ swatch:"reactor-zone", color:"rgba(232,104,80,0.07)",  border:"#E86850", dash:true, label:"Reactor zone" });
                // Violation key: only meaningful when both players have assets,
                // since a violation is an opponent asset inside your zone.
                const playerHasAnyAsset = (p) => (
                  p && p.active !== false && (
                    p.x != null ||
                    (p.panels || []).length > 0 ||
                    (p.reactors || []).length > 0 ||
                    (p.habitats || []).length > 0 ||
                    !!p.landingPad ||
                    (p.landingPads || []).length > 0
                  )
                );
                if (playerHasAnyAsset(p1) && playerHasAnyAsset(p2)) {
                  legendEntries.push({ swatch:"violation", color:"rgba(240,60,60,0.25)", border:"rgba(255,70,60,0.9)", label:"Zone violation" });
                }
              }

              // Comsat relay range, only if any deployed
              const hasComsat = (p1?.comsats||[]).length > 0 || (p2?.comsats||[]).length > 0;
              if (hasComsat) {
                legendEntries.push({ swatch:"comsat", color:"rgba(125,216,176,0.08)", border:"rgba(125,216,176,0.5)", label:"Comsat relay range" });
              }

              // v113: cooperation overlays, only when a grid is actively shared,
              // so the glowing links on the map (v111 pooled comms, v112 shared
              // power) are named for a first-time facilitator. Colors match the
              // on-map visuals: phosphor-green for comms, amber for power.
              if (commsGridState.mode === "shared") {
                legendEntries.push({ swatch:"pooled-comms", color:"rgba(125,216,176,0.30)", border:"rgba(125,216,176,0.7)", dash:true, label:"Pooled comms (shared grid)" });
              }
              if (powerGridState.mode === "shared") {
                legendEntries.push({ swatch:"shared-power", color:"rgba(255,210,150,0.30)", border:"rgba(255,210,150,0.8)", label:"Shared power flow" });
              }

              const hoveredMapRegionKeys = (() => {
                const keys = new Set();
                if (!hover || hoveredLegendKey) return keys;
                const idx = hover.y * W + hover.x;

                // Claim regions
                if (showLayers.claims && p1 && p2 && PSR_MASK[idx]) {
                  const dx1 = hover.x - p1.x, dy1 = hover.y - p1.y;
                  const dx2 = hover.x - p2.x, dy2 = hover.y - p2.y;
                  const d1Sq = dx1*dx1 + dy1*dy1, d2Sq = dx2*dx2 + dy2*dy2;
                  const r1Sq = claimR[0]*claimR[0], r2Sq = claimR[1]*claimR[1];
                  if (d1Sq < r1Sq && d1Sq <= d2Sq) keys.add("claim1");
                  else if (d2Sq < r2Sq) keys.add("claim2");
                }

                // PSR (fresh or depleted), only when layer is on
                if (showLayers.psr && PSR_MASK[idx]) {
                  const ci = PIXEL_CRATER[idx];
                  const h = ci >= 0 ? (craterHealth[ci] ?? 1.0) : 1.0;
                  keys.add(h < 0.5 ? "psr-depleted" : "psr-fresh");
                }

                // Sunlit ridge
                if (RIDGE_MASK[idx]) keys.add("ridge");

                // Mined cells
                if (showLayers.mine) {
                  if (p1?.mineMap?.[idx]) keys.add("mine1");
                  if (p2?.mineMap?.[idx]) keys.add("mine2");
                }

                // Comms blackout, match feather zone (threshold + 0.12)
                if (showLayers.comms_blackout && (p1 || p2) && EARTH_VIS_MAP[idx] < COMMS_BLACKOUT_THRESHOLD + 0.12) {
                  keys.add("blackout");
                }

                // v92: slope contour bands (hover highlights matching legend row)
                if (activeVectorOverlays.has("overlay_slope")) {
                  const s = SLOPE_MAP[idx];
                  if (s >= 25) keys.add("slope-steep");
                  else if (s >= 10) keys.add("slope-moderate");
                }

                // v92: comms contour region
                if (activeVectorOverlays.has("overlay_earth") && EARTH_VIS_MAP[idx] < COMMS_BLACKOUT_THRESHOLD) {
                  keys.add("comms-contour");
                }

                // v93: solar potential bands
                if (activeVectorOverlays.has("overlay_sun")) {
                  const il = ILLUM_MAP[idx];
                  if (il >= 0.85)      keys.add("solar-85");
                  else if (il >= 0.70) keys.add("solar-70");
                  else if (il >= 0.50) keys.add("solar-50");
                }

                // Zone-radius features, check if cursor is inside any structure's zone
                const ZONE_SWATCH_TO_TYPE = {
                  "rover-zone": "rover", "solar-zone": "solar",
                  "pad-zone": "pad", "habitat-zone": "habitat", "reactor-zone": "reactor",
                };
                for (const [swatchKey, type] of Object.entries(ZONE_SWATCH_TO_TYPE)) {
                  const r = SAFETY_RADIUS[type];
                  if (!r) continue;
                  const rSq = r * r;
                  for (const p of [p1, p2]) {
                    if (!p || p.active === false) continue;
                    const sh = p.structureHealth || {};
                    const candidates = [];
                    if (type === "pad") {
                      if (p.landingPad) candidates.push(p.landingPad);
                      (p.landingPads || []).forEach((pt, i) => {
                        if ((sh.landingPads?.[i] ?? 1) > 0.1) candidates.push(pt);
                      });
                    } else if (type === "solar") {
                      (p.panels || []).forEach((pt, i) => {
                        if ((sh.panels?.[i] ?? 1) > 0.1) candidates.push(pt);
                      });
                    } else if (type === "reactor") {
                      (p.reactors || []).forEach((pt, i) => {
                        if ((sh.reactors?.[i] ?? 1) > 0.1) candidates.push(pt);
                      });
                    } else if (type === "habitat") {
                      (p.habitats || []).forEach((pt, i) => {
                        if ((sh.habitats?.[i] ?? 1) > 0.1) candidates.push(pt);
                      });
                    } else if (type === "rover") {
                      if (p.x != null) candidates.push({ x: p.x, y: p.y });
                      (p.extraRovers || []).forEach((er, i) => {
                        if ((sh.extraRovers?.[i] ?? 1) > 0.1) candidates.push(er);
                      });
                    }
                    for (const pt of candidates) {
                      const ddx = hover.x - pt.x, ddy = hover.y - pt.y;
                      if (ddx*ddx + ddy*ddy <= rSq) { keys.add(swatchKey); break; }
                    }
                    if (keys.has(swatchKey)) break;
                  }
                }

                // Comsat relay range
                for (const p of [p1, p2]) {
                  if (!p) continue;
                  for (const cs of (p.comsats || [])) {
                    if (!cs) continue;
                    const ddx = hover.x - cs.x, ddy = hover.y - cs.y;
                    if (ddx*ddx + ddy*ddy <= COMSAT_RELAY_RADIUS*COMSAT_RELAY_RADIUS) {
                      keys.add("comsat"); break;
                    }
                  }
                  if (keys.has("comsat")) break;
                }

                return keys;
              })();

              return (
                <div style={{
                  position:"absolute", bottom:12, right:12,
                  display:"flex", flexDirection:"column", gap:5,
                  alignItems:"flex-end",
                  pointerEvents:"none",
                  zIndex:10,
                }}>
                  {/* Tricolor composite guide, above legend, only when composite overlay active */}
                  {(vectorOverlay === "basemap_fig_composite" || activeOverlays.has("idx_composite")) && (() => {
                    const lfi  = hoverFavData?.lfi  ?? null;
                    const sofi = hoverFavData?.sofi ?? null;
                    const ifi  = hoverFavData?.ifi  ?? null;
                    // v186: normalize on the SAME [-0.3, 1] range the ExploreSidebar
                    // bars use, so a bar's fill matches the numeric index. (v185
                    // used (v+0.05)/0.85, which never reached full and clipped low
                    // values to empty.)
                    const BAR_LO = -0.3, BAR_HI = 1;
                    const norm = (v) => v == null ? null : Math.max(0, Math.min(1, (v - BAR_LO) / (BAR_HI - BAR_LO)));
                    const fmtVal = (v) => v == null ? "·" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
                    const colVal = (v) => v == null ? "#5A567A" : v < 0 ? "#E89BB5" : v >= 0.30 ? "#9BD4B5" : v >= 0.15 ? "#E8C998" : "#8B86B0";
                    // v186: the additive composite swatch, the actual color this
                    // pixel contributes to the RGB overlay. Mirrors the map's
                    // composite math (idx_composite): each channel normalized then
                    // gamma-0.85, R=land G=ops B=ice. Small on purpose.
                    const chan = (v) => {
                      const n = norm(v);
                      return n == null ? 0 : Math.round(Math.pow(n, 0.85) * 255);
                    };
                    const swR = chan(lfi), swG = chan(sofi), swB = chan(ifi);
                    const haveHover = lfi != null || sofi != null || ifi != null;
                    return (
                      <div style={{
                        background:"rgba(12,10,24,0.92)",
                        border:"1px solid rgba(168,168,240,0.22)",
                        borderRadius:5,
                        padding:"7px 9px 6px",
                        fontFamily:"'Bricolage Grotesque',monospace",
                        pointerEvents:"none",
                      }}>
                        {/* v186: tri-channel favorability shown as three RGB bars.
                            Each bar's fill = the channel's normalized value at the
                            hovered pixel; the small swatch beside the key is the
                            additive red+green+blue mix this pixel paints in the
                            composite overlay. */}
                        <div style={{ display:"flex", flexDirection:"column", gap:5, minWidth:132 }}>
                          {[["LAND", lfi, "#FF7A72", "#FF5A52"],
                            ["OPS",  sofi, "#60E880", "#54EC6A"],
                            ["ICE",  ifi,  "#64BAFF", "#3FB6FF"]].map(([lbl, v, accent, barCol]) => {
                            const f = norm(v);
                            const pct = f == null ? 0 : Math.round(f * 100);
                            return (
                              <div key={lbl} style={{ display:"flex", alignItems:"center", gap:6 }}>
                                <span style={{ color: accent, fontSize:7.5, fontWeight:800, letterSpacing:"0.06em", width:26, flexShrink:0 }}>{lbl}</span>
                                <div style={{ position:"relative", flex:1, height:8, borderRadius:2,
                                  background:"rgba(18,14,36,0.9)", border:"1px solid rgba(168,168,240,0.18)", overflow:"hidden" }}>
                                  <div style={{ position:"absolute", left:0, top:0, bottom:0, width:`${pct}%`,
                                    background:`linear-gradient(90deg, ${barCol}55, ${barCol})`,
                                    boxShadow: pct > 0 ? `0 0 4px ${barCol}88` : "none",
                                    transition:"width 0.12s linear" }} />
                                </div>
                                <span style={{ color: colVal(v), fontWeight:700, fontVariantNumeric:"tabular-nums",
                                  fontSize:9, width:30, textAlign:"right", flexShrink:0 }}>{fmtVal(v)}</span>
                              </div>
                            );
                          })}
                          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:1 }}>
                            {/* small additive-composite color chip */}
                            <div title="additive R·G·B composite" style={{
                              width:11, height:11, flexShrink:0, borderRadius:2,
                              border:"1px solid rgba(168,168,240,0.35)",
                              background: haveHover ? `rgb(${swR},${swG},${swB})` : "rgba(30,26,54,0.9)",
                              boxShadow: haveHover ? `0 0 5px rgba(${swR},${swG},${swB},0.6)` : "none",
                            }} />
                            <div style={{ fontSize:6.5, color:"#5A567A", letterSpacing:"0.04em" }}>
                              additive · <span style={{ color:"#FF7A72" }}>R land</span> · <span style={{ color:"#60E880" }}>G ops</span> · <span style={{ color:"#64BAFF" }}>B ice</span>
                            </div>
                          </div>
                        </div>
                        {hoverData && (
                          <div style={{
                            marginTop:6, paddingTop:6,
                            borderTop:"1px solid rgba(168,168,240,0.15)",
                            fontSize:9, lineHeight:1.6,
                            fontFamily:"'Bricolage Grotesque', monospace",
                          }}>
                            <div style={{ color:"#ECEAF8", fontWeight:600, fontSize:9.5, marginBottom:2, letterSpacing:"0.01em" }}>
                              {Math.abs(hoverData.lat).toFixed(2)}°S · {hoverData.lon.toFixed(1)}°E
                            </div>
                            <div style={{ display:"flex", gap:7, marginBottom:1 }}>
                              <span style={{ color: hoverData.inPSR ? "#80B0D8" : "#5A567A" }}>
                                {hoverData.inPSR ? "● PSR" : "○ non-PSR"}
                              </span>
                              {hoverData.onRidge && <span style={{ color:"#E8C998" }}>★ ridge</span>}
                            </div>
                            <div style={{ color:"#8B86B0", fontSize:8.5 }}>illum {hoverData.illum}% · ice {hoverData.ice}% · slope {hoverData.slope}°</div>
                            <div style={{ color:"#8B86B0", fontSize:8.5 }}>
                              H {hoverData.h2}% · <span style={{
                                color: hoverData.tempK < 110 ? "#80B0D8" : hoverData.tempK < 180 ? "#C0B8E8" : "#E8C998"
                              }}>{hoverData.tempK}K</span>
                              {hoverData.tempK < 110 && <span style={{ color:"#80B0D8" }}> · cold trap</span>}
                            </div>
                            <div style={{ color:"#5A567A", fontSize:7.5, marginTop:3, letterSpacing:"0.04em", fontStyle:"italic" }}>
                              LOLA · LEND · Diviner
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Dynamic map legend */}
                  <div
                    onMouseLeave={() => setHoveredLegendKey(null)}
                    style={{
                    background:"rgba(12,10,24,0.94)",
                    border:"1px solid rgba(200,196,220,0.12)",
                    borderRadius:5,
                    padding:"8px 11px 7px",
                    minWidth:162,
                    pointerEvents:"auto",
                  }}>
                    <div style={{
                      fontSize:8, letterSpacing:"0.2em", color:"#5A567A",
                      textTransform:"uppercase", marginBottom:6,
                      fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500,
                    }}>Map legend</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:3.5 }}>
                      {legendEntries.map(({ swatch, color, border, dash, gradient, label }) => {
                        const isHovered = hoveredLegendKey === swatch;
                        const isDimmed  = hoveredLegendKey && !isHovered;
                        // v45: subtler highlight when the map hover indicates
                        // this region. Doesn't dim siblings (only legend-side
                        // hover does that) so the user's eye stays on the map.
                        const isMapHinted = !hoveredLegendKey && hoveredMapRegionKeys.has(swatch);
                        return (
                        <div
                          key={swatch}
                          onMouseEnter={() => setHoveredLegendKey(swatch)}
                          style={{
                            display:"flex", alignItems:"center", gap:7,
                            padding:"2px 5px", margin:"-2px -5px",
                            borderRadius:3,
                            cursor:"pointer",
                            background: isHovered
                              ? "rgba(168,168,240,0.14)"
                              : isMapHinted
                                ? "rgba(168,168,240,0.07)"
                                : "transparent",
                            opacity: isDimmed ? 0.45 : 1,
                            transition: "background 0.12s, opacity 0.12s",
                          }}
                        >
                          <div style={{
                            width:11, height:11, flexShrink:0,
                            borderRadius:2,
                            background: gradient
                              ? `linear-gradient(90deg, ${color.replace(/[\d.]+\)$/, "0.1)")}, ${color})`
                              : color,
                            border: `1px ${dash ? "dashed" : "solid"} ${border}`,
                            boxSizing:"border-box",
                            boxShadow: isHovered
                              ? `0 0 6px ${border}`
                              : isMapHinted
                                ? `0 0 3px ${border}`
                                : "none",
                          }} />
                          <span style={{
                            fontSize:9.5,
                            color: (isHovered || isMapHinted) ? "#ECEAF8" : "#8B86B0",
                            letterSpacing:"-0.002em",
                            fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic",
                            lineHeight:1.2,
                            fontWeight: isHovered ? 500 : 400,
                          }}>{label}</span>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* Day progress bar */}
            {phase===PHASE.PLAYING && (
              <div style={{ position:"absolute", bottom:0, left:0, right:0, height:3,
                background:"rgba(0,0,0,0.6)" }}>
                <div style={{ height:"100%", width:`${(day/DAYS_PER_ROUND)*100}%`,
                  background:night?"rgba(192,184,232,0.65)":"rgba(168,168,240,0.7)",
                  transition:"width 0.15s",
                  boxShadow:night?"0 0 4px rgba(192,184,232,0.75)":"0 0 4px rgba(168,168,240,0.8)" }} />
              </div>
            )}
            {/* Autopilot resupply advisor */}
            {resupplyAdvice && (
              <div style={{
                position: "absolute", top: 8, left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(46,32,104,0.95)",
                border: `1px solid #E89BB5`,
                borderLeft: `3px solid #E89BB5`,
                borderRadius: 5, padding: "7px 14px",
                display: "flex", alignItems: "center", gap: 12,
                boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                zIndex: 6,
                maxWidth: 480,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#E89BB5",
                  boxShadow: "0 0 8px #E89BB5",
                  flexShrink: 0,
                }}/>
                <div style={{
                  fontSize: 11.5, color: "#ECEAF8",
                  fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
                  lineHeight: 1.4,
                }}>
                  <strong style={{ color: "#E89BB5", fontStyle: "normal",
                    fontFamily: "'Bricolage Grotesque',sans-serif",
                    fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
                    fontWeight: 600, marginRight: 6 }}>Autopilot</strong>
                  {resupplyAdvice.damagedCount} asset{resupplyAdvice.damagedCount > 1 ? "s" : ""} below 50% health. Order resupply?
                </div>
                <button onClick={() => buildStructure(resupplyAdvice.pi, "resupply")}
                  disabled={!resupplyAdvice.canAfford}
                  style={{
                    background: resupplyAdvice.canAfford
                      ? "linear-gradient(135deg, #E89BB540, #E89BB510)"
                      : "rgba(200,196,220,0.04)",
                    border: `1px solid ${resupplyAdvice.canAfford ? "#E89BB5" : "#5A567A"}`,
                    color: resupplyAdvice.canAfford ? "#ECEAF8" : "#5A567A",
                    borderRadius: 3, padding: "4px 10px",
                    fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
                    fontSize: 11, fontWeight: 500,
                    cursor: resupplyAdvice.canAfford ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap",
                  }}>
                  {resupplyAdvice.canAfford ? `Yes (${RESUPPLY_COST} cr)` : "Insufficient credits"}
                </button>
                <button onClick={() => setAutoPilot(false)} title="Dismiss / disable autopilot prompts"
                  style={{
                    background: "transparent", border: "none",
                    color: "#8B86B0", cursor: "pointer",
                    fontSize: 16, lineHeight: 1, padding: "0 4px",
                  }}>×</button>
              </div>
            )}
            {/* Turn indicator overlay */}
            {phase===PHASE.PLAYING && !p1Done && !p2Done && (() => {
              const viewerActor = mp ? myActor : null;
              const isYours = viewerActor === null
                ? true // solo: always your turn-ish
                : viewerActor === activeTurn;
              const color = activeTurn===0?"#A8A8F0":"#80B0D8";
              return (
                <div style={{ position:"absolute", top:8, left:8,
                  background:"rgba(20,18,32,0.92)", border:`1px solid ${color}44`,
                  borderLeft:`2px solid ${color}`,
                  borderRadius:4, padding:"5px 12px",
                  fontSize:11, color, letterSpacing:"-0.005em",
                  fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
                  fontStyle:"italic", fontWeight:400,
                  display:"flex", flexDirection:"column", gap:1,
                }}>
                  <div>{actorLabel(activeTurn)} planning</div>
                  {isYours && !placingFor && (
                    <div style={{ fontSize:9.5, color:"#8B86B0", fontWeight:300, fontFamily:"'Bricolage Grotesque',sans-serif", fontStyle:"normal", letterSpacing:"0.02em" }}>
                      Drag the arrowhead to set direction · rovers auto-return when full
                    </div>
                  )}
                </div>
              );
            })()}
            {phase===PHASE.PLAYING && (p1Done||p2Done) && !(p1Done&&p2Done) && (
              <div style={{ position:"absolute", top:8, left:8,
                background:"rgba(20,18,32,0.92)", border:"1px solid rgba(155,212,181,0.28)",
                borderLeft:"2px solid rgba(155,212,181,0.6)",
                borderRadius:4, padding:"4px 11px", fontSize:11, color:"#9BD4B5",
                letterSpacing:"-0.005em",
                fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
                fontStyle:"italic", fontWeight:400 }}>
                Actor {p1Done?"I":"II"} done
              </div>
            )}
            {/* Night indicator */}
            {night && (
              <div style={{ position:"absolute", top:8, right:8,
                background:"rgba(46,32,104,0.88)", border:"1px solid rgba(192,184,232,0.32)",
                borderRadius:4, padding:"4px 11px", fontSize:11, color:"#C0B8E8",
                letterSpacing:"-0.005em",
                fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
                fontStyle:"italic", fontWeight:400 }}>
                Lunar night
              </div>
            )}
            {/* v177: fog-of-war indicator, tells the viewer positions are
                hidden until scouted, so an empty area doesn't read as "no
                opponent". Sits just below the night chip. */}
            {fogActive && (
              <div style={{ position:"absolute", top: night ? 36 : 8, right:8,
                background:"rgba(32,52,96,0.9)", border:"1px solid rgba(128,176,216,0.4)",
                borderRadius:4, padding:"4px 11px", fontSize:11, color:"#80B0D8",
                letterSpacing:"-0.005em",
                fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
                fontStyle:"italic", fontWeight:400,
                display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:10 }}>◓</span> Fog of war, scout to reveal
              </div>
            )}
            {/* Mine heatmap legend now integrated into the unified map legend (bottom-right) */}
          </div>

          {/* Last-step event log */}
          {lastEvents.length>0 && (
            <div style={{ background:"rgba(20,18,32,0.94)", border:"1px solid rgba(200,196,220,0.08)",
              borderRadius:5, padding:"7px 12px", fontSize:10, color:"#8B86B0", lineHeight:1.8,
              fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", letterSpacing:"-0.002em" }}>
              <div style={{color:"#C0B8E8", marginBottom:3, letterSpacing:"0.22em", fontSize:8,
                textTransform:"uppercase", fontStyle:"normal",
                fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500}}>Last step</div>
              {lastEvents.slice(-4).map((ev,i) => (
                <div key={i} style={{
                  color:ev.type==="deposit"?"#9BD4B5":ev.type==="mine"?"#C0B8E8":(ev.type==="unpowered_hab"||ev.type==="deposit_blocked"||ev.type==="strand_risk"||ev.type==="stranded"||ev.type==="stranded_penalty")?"#E89BB5":ev.type==="rover_rescued"?"#9BD4B5":"#5A567A",
                  display:"flex", alignItems:"center", gap:5
                }}>
                  {ev.type==="deposit"
                    ? <>Deposited {ev.kg.toFixed(0)} kg</>
                    : ev.type==="mine"
                    ? <>Mined {ev.kg.toFixed(0)} kg</>
                    : ev.type==="unpowered_hab"
                    ? <>⚠ Hab unpowered</>
                    : "·"}
                </div>
              ))}
            </div>
          )}

          {/* History chart */}
          {history.length>0 && (
            <div style={{ background:"rgba(20,18,32,0.94)", border:"1px solid rgba(200,196,220,0.08)",
              borderRadius:5, padding:"10px 12px" }}>
              <div style={{ fontSize:9, letterSpacing:"0.22em", color:"#C0B8E8", marginBottom:8,
                paddingLeft:10, borderLeft:"2px solid #A8A8F0", textTransform:"uppercase",
                fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500 }}>
                Ice deposits per round (kg)
              </div>
              <div style={{ display:"flex", gap:2, alignItems:"flex-end", height:48 }}>
                {history.map((h,i) => {
                  let max=1; for(const x of history){const v=Math.max(x.dep1||0,x.dep2||0);if(v>max)max=v;}
                  return (
                    <div key={i} style={{display:"flex",gap:1,alignItems:"flex-end",flex:1}}>
                      <div title={`Actor I: +${h.dep1}kg`} style={{
                        flex:1, background:"linear-gradient(180deg,#A8A8F0cc,#A8A8F066)",
                        borderRadius:"2px 2px 0 0",
                        height:`${Math.max(4,((h.dep1||0)/max)*100)}%`, minHeight:2,
                        boxShadow:"0 0 4px #A8A8F044" }}/>
                      <div title={`Actor II: +${h.dep2}kg`} style={{
                        flex:1, background:"linear-gradient(180deg,#80B0D8cc,#80B0D866)",
                        borderRadius:"2px 2px 0 0",
                        height:`${Math.max(4,((h.dep2||0)/max)*100)}%`, minHeight:2,
                        boxShadow:"0 0 4px #80B0D844" }}/>
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:2,marginTop:4}}>
                {history.map((h,i) => (
                  <div key={i} style={{flex:1, textAlign:"center", fontSize:8, color:"#5A567A",
                    letterSpacing:"-0.002em",
                    fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic"}}>R{h.r}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Done overlay */}
      {phase===PHASE.DONE && p1 && p2 && (
        <div style={{
          marginTop:14, background:"rgba(20,18,32,0.96)",
          border:"1px solid rgba(200,196,220,0.14)",
          borderTop:`2px solid ${winner===1?"#A8A8F0":winner===2?"#80B0D8":"#8B86B0"}`,
          borderRadius:10, padding:"26px 34px", textAlign:"center", maxWidth:540, width:"100%",
          boxShadow:"0 0 50px rgba(0,0,0,0.6), 0 0 80px rgba(46,32,104,0.3)",
          animation:"fadeIn 0.4s ease",
        }}>
          <div style={{fontSize:8.5, letterSpacing:"0.42em", color:"#8B86B0", marginBottom:18,
            fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500,
            textTransform:"uppercase"}}>
            Exercise Debrief &middot; {durationSummaryLabel}
          </div>
          <div style={{display:"flex",gap:30,justifyContent:"center",marginBottom:18}}>
            {[p1,p2].map((p,i) => {
              const sc = i===0 ? score1 : score2;
              const col = i===0?"#A8A8F0":"#80B0D8";
              const isW = (i===0&&winner===1)||(i===1&&winner===2);
              return (
              <div key={i} style={{ position:"relative" }}>
                {isW && <div style={{ position:"absolute", top:-12, left:"50%", transform:"translateX(-50%)",
                  fontSize:14 }}>★</div>}
                <div style={{fontSize:11, fontStyle:"italic", color:col, letterSpacing:"-0.005em",
                  fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
                  marginBottom:6, fontWeight:isW?500:400}}>Actor {i===0?"I":"II"}</div>
                <div style={{fontSize:32, fontWeight:400, fontStyle:"italic", color:col, lineHeight:1.0,
                  letterSpacing:"-0.018em",
                  fontFamily:"'Spectral','Iowan Old Style',Georgia,serif", textShadow:`0 0 20px ${col}55`}}>
                  {sc.toFixed(0)}
                </div>
                <div style={{fontSize:9, color:col, opacity:0.5, letterSpacing:"-0.002em", marginTop:2,
                  fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic"}}>score</div>
                <div style={{fontSize:9.5, color:"#8B86B0", marginTop:8, lineHeight:1.7,
                  fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:400,
                  letterSpacing:"-0.002em"}}>
                  <div>{p.iceDeposited.toFixed(0)} kg ice deposited</div>
                  {!workshopMode && <div>{p.assetPts??0} asset points</div>}
                  {!workshopMode && <div>{Math.round(p.safetyViolations??0)} safety violations</div>}
                </div>
              </div>
            )})}
          </div>
          {/* Share bar */}
          <div style={{height:5,background:"rgba(200,196,220,0.06)",borderRadius:3,overflow:"hidden",
            display:"flex",marginBottom:14,boxShadow:"inset 0 1px 0 rgba(0,0,0,0.3)"}}>
            <div style={{width:`${share1*100}%`,
              background:"linear-gradient(90deg,#2E2068aa,#A8A8F0cc)",
              boxShadow:"1px 0 6px #A8A8F066"}}/>
            <div style={{flex:1,background:"linear-gradient(90deg,#80B0D8cc,#3460A8aa)"}}/>
          </div>
          <div style={{fontSize:28,fontWeight:500,letterSpacing:"-0.012em",marginBottom:6,
            fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
            fontStyle:"italic",
            color:winner===1?"#A8A8F0":winner===2?"#80B0D8":"#8B86B0",
            textShadow:winner===1?"0 0 20px #A8A8F066":winner===2?"0 0 20px #80B0D866":"none"}}>
            {winner===1?<>Actor I <span style={{fontWeight:600,fontStyle:"normal"}}>prevails</span></>
              :winner===2?<>Actor II <span style={{fontWeight:600,fontStyle:"normal"}}>prevails</span></>
              :<><span style={{fontWeight:600,fontStyle:"normal"}}>Draw</span></>}
          </div>
          <div style={{fontSize:10,color:"#5A567A",marginBottom:18,letterSpacing:"-0.002em",
            fontFamily:"'Spectral',Georgia,serif",fontStyle:"italic"}}>
            {depleted} of {CRATER_DATA.length} craters depleted · {globalDay} days elapsed
          </div>
          {/* v95: governance findings + score breakdown -- turns the scoreboard
              into a teaching debrief that explains WHY the outcome happened. */}
          {!workshopMode && (() => {
            const a = debriefAnalysis(p1, p2);
            const toneCol = { good:"#9BD4B5", bad:"#E89BB5", neutral:"#C0B8E8" };
            return (
              <div style={{ textAlign:"left", marginBottom:18 }}>
                <div style={{fontSize:8.5, letterSpacing:"0.32em", color:"#8B86B0", marginBottom:10,
                  fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500, textTransform:"uppercase",
                  textAlign:"center"}}>
                  What happened
                </div>
                {a.findings.map((f,k) => (
                  <div key={k} style={{ display:"flex", gap:9, marginBottom:8, alignItems:"flex-start" }}>
                    <div style={{ width:5, height:5, borderRadius:"50%", background:toneCol[f.tone],
                      marginTop:6, flexShrink:0, boxShadow:`0 0 6px ${toneCol[f.tone]}88` }} />
                    <div style={{ fontSize:11.5, lineHeight:1.5, color:"#C0B8E8",
                      fontFamily:"'Spectral','Iowan Old Style',Georgia,serif", letterSpacing:"-0.003em" }}>
                      {f.text}
                    </div>
                  </div>
                ))}
                {/* Two-column score breakdown */}
                <div style={{ display:"flex", gap:18, marginTop:16 }}>
                  {[a.b1, a.b2].map((bd,i) => {
                    const col = i===0?"#A8A8F0":"#80B0D8";
                    return (
                      <div key={i} style={{ flex:1 }}>
                        <div style={{fontSize:9, fontStyle:"italic", color:col, marginBottom:6,
                          fontFamily:"'Spectral',Georgia,serif", letterSpacing:"-0.005em"}}>
                          Actor {i===0?"I":"II"} · {bd.total.toFixed(0)}
                        </div>
                        {bd.terms.filter(t => Math.abs(t.value) > 0.5).map(t => (
                          <div key={t.key} style={{ display:"flex", justifyContent:"space-between",
                            fontSize:9.5, marginBottom:2, fontFamily:"'Bricolage Grotesque',sans-serif",
                            color:"#8B86B0" }}>
                            <span>{t.label}</span>
                            <span style={{ color: t.value < 0 ? "#E89BB5" : "#C0B8E8",
                              fontVariantNumeric:"tabular-nums" }}>
                              {t.value > 0 ? "+" : ""}{t.value.toFixed(0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {/* v101: surface any inject "reveals" (e.g. the dual-use surveillance
              flag turned out to be benign), teaching the intended lesson after
              the fact. Scans the mission log for fired injects that carry a
              debriefReveal, de-duplicated by inject id. */}
          {!workshopMode && (() => {
            const seen = new Set();
            const reveals = [];
            for (const e of missionLog) {
              if (e?.debriefReveal && e.injectId && !seen.has(e.injectId)) {
                seen.add(e.injectId);
                reveals.push({ id: e.injectId, label: e.label?.replace(/^INJECT · /, "") || "Inject", text: e.debriefReveal });
              }
            }
            if (reveals.length === 0) return null;
            return (
              <div style={{ textAlign:"left", margin:"4px 0 18px" }}>
                <div style={{fontSize:8.5, letterSpacing:"0.32em", color:"#8B86B0", marginBottom:10,
                  fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500, textTransform:"uppercase",
                  textAlign:"center"}}>
                  What the injects revealed
                </div>
                {reveals.map(r => (
                  <div key={r.id} style={{ display:"flex", gap:9, marginBottom:8, alignItems:"flex-start" }}>
                    <div style={{ width:5, height:5, borderRadius:"50%", background:"#80B0D8",
                      marginTop:6, flexShrink:0, boxShadow:"0 0 6px #80B0D888" }} />
                    <div style={{ fontSize:11.5, lineHeight:1.5, color:"#C0B8E8",
                      fontFamily:"'Spectral','Iowan Old Style',Georgia,serif" }}>
                      <span style={{ fontStyle:"italic", color:"#80B0D8" }}>{r.label}:</span> {r.text}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{display:"flex",gap:8,justifyContent:"center"}}>
            <button onClick={()=>setPhase(PHASE.SETTINGS)} style={{
              background:"rgba(168,168,240,0.07)", border:"1px solid rgba(168,168,240,0.28)",
              color:"#ECEAF8", borderRadius:6, padding:"10px 20px", cursor:"pointer",
              fontSize:12, letterSpacing:"-0.005em",
              fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
              fontStyle:"italic", fontWeight:400}}>
              Settings
            </button>
            <button onClick={reset} style={{
              background:"rgba(200,196,220,0.08)", border:"1px solid rgba(200,196,220,0.18)",
              color:"#C0B8E8", borderRadius:6, padding:"10px 20px", cursor:"pointer",
              fontSize:12, letterSpacing:"-0.005em",
              fontFamily:"'Spectral','Iowan Old Style',Georgia,serif",
              fontStyle:"italic", fontWeight:400}}>
              New exercise
            </button>
          </div>
        </div>
      )}

      {/* ── Mission Log Panel ─────────────────────────────────────────── */}
      <MissionLogPanel
        open={showLog}
        missionLog={missionLog}
        exportMissionData={exportMissionData}
      />

      {/* ── Analytics Panel ────────────────────────────────────────────── */}
      <AnalyticsPanel
        open={showAnalytics}
        history={history}
        totalIce1={totalIce1}
        totalIce2={totalIce2}
        depleted={depleted}
        p1={p1}
        p2={p2}
      />

      {/* ── Physics Parameters Panel ───────────────────────────────────── */}
      <PhysicsParametersPanel
        open={showParams}
        physOverrides={physOverrides}
        setPhysOverrides={setPhysOverrides}
      />

      {/* Legend */}
      <div style={{marginTop:12, display:"flex", gap:14, flexWrap:"wrap", justifyContent:"center",
        fontSize:10, color:"#8B86B0", letterSpacing:"-0.005em", paddingBottom:10,
        fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic" }}>
        {[
          {c:"rgba(5,25,35,0.9)",         l:"PSR fresh"},
          {c:"rgba(232,201,152,0.55)",    l:"PSR depleted"},
          {c:"rgba(40,185,174,0.9)",      l:"Actor I mined"},
          {c:"rgba(240,144,46,0.9)",      l:"Actor II mined"},
          {c:"rgba(192,184,232,0.25)",    l:"Claimed"},
          {c:"rgba(232,201,152,0.4)",     l:"Ridge ·  sunlit"},
        ].map(({c,l}) => (
          <div key={l} style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:9,height:9,background:c,borderRadius:1,
              border:"1px solid rgba(200,196,220,0.14)"}}/>
            {l}
          </div>
        ))}
      </div>
    </div>

    {/* v27: Keyboard shortcuts overlay -- toggled with `?` */}
    <HelpOverlay
      open={showHelp}
      onClose={() => setShowHelp(false)}
      onOpenTutorial={() => { setShowHelp(false); setShowTutorial(true); }}
    />

    {/* v84: First-time "how to play" guided tour -- toggled with `H`, auto-shown once */}
    <TutorialOverlay open={showTutorial} onClose={closeTutorial} />

    {/* v85: OLF DLA hazard framework -- derive live safety zones from a hazard input */}
    <HazardFrameworkPanel
      open={showHazard}
      onClose={() => setShowHazard(false)}
      onApply={applyHazard}
      onReset={resetHazard}
      active={hazardSnapshot !== null}
      defaultRadii={SAFETY_RADIUS}
      pixelsPerKm={PIXELS_PER_KM}
    />

    {/* v98: published map figures gallery -- toggled with `G` */}
    <FiguresGallery open={showFigures} onClose={() => setShowFigures(false)} />
  </>);
}

export default function App() {
  const mp = useMultiplayer();
  // playMode: null = lobby, "solo" = skip lobby, "mp" = lobby finished, in game
  const [playMode, setPlayMode] = useState(null);

  // Listen for the "begin workshop" event dispatched from the lobby's
  // host-side "Begin workshop" button.
  useEffect(() => {
    const handler = () => setPlayMode("mp");
    window.addEventListener("mp:start-workshop", handler);
    return () => window.removeEventListener("mp:start-workshop", handler);
  }, []);

  // If a peer joins, we drop them straight into the game (they shouldn't sit
  // on the lobby once they're in a room -- the host might already be playing).
  useEffect(() => {
    if (mp.status === "joined" && playMode === null) setPlayMode("mp");
  }, [mp.status, playMode]);

  // If the room closes (host disconnected), kick peer back to lobby.
  useEffect(() => {
    if (playMode === "mp" && mp.status === "lobby") setPlayMode(null);
    if (playMode === "mp" && mp.status === "offline") setPlayMode(null);
  }, [mp.status, playMode]);

  if (playMode === null) {
    return <LobbyScreen mp={mp} onPlaySolo={() => setPlayMode("solo")} />;
  }

  const showMpChrome = mp.status === "hosting" || mp.status === "joined";

  return (
    <>
      <div style={{
        paddingTop: showMpChrome ? 38 : 0,
        // No more pointer-events:none -- per-actor gating is fine-grained now.
      }}>
        <GameApp mp={playMode === "mp" ? mp : null} showMpChrome={showMpChrome} />
      </div>
      {showMpChrome && <ChatDrawer mp={mp} />}
    </>
  );
}
