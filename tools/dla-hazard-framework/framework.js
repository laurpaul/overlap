/**
 * OLF DLA If/Then Toolkit, Hazard Framework
 * framework.js  v0.5
 *
 * ── Two modes ─────────────────────────────────────────────────────────────────
 *
 * 1. DUST MODE (kg/hr)
 *    Power-law formula calibrated to lunar dust transport.
 *    core = 0.5 × effective^0.55  (km), clamped [0.5, 30]
 *    buffer = core × 2.5  |  coord = core × 5.0
 *    Sources: ICES-2023-120 (Texas Tech, 2023); Li et al. Chang'E-3
 *
 * 2. MANUAL HAZARD MODE
 *    Operator defines:
 *      - Hazard type (dust, radiation, RF, thermal, ejecta, custom)
 *      - Production rate in that hazard's units
 *      - A linear ratio: X units → Y km core radius
 *      - Confidence level (pads up worst-case)
 *      - Mitigation factor (reduces effective load)
 *      - Buffer and coordination zone multipliers (default 2.5× and 5×)
 *    Formula: core = (rate / ratioInput) × ratioOutput × confidence × mitigation
 *    This is intentionally linear, the ratio IS the if/then logic.
 *
 * ── buffers.json (App.jsx simulator integration) ─────────────────────────────
 *    SAFETY_RADIUS mapping:
 *      core   → pad     (landing pads: innermost exclusion)
 *      buffer → habitat (habitats: buffer zone)
 *      buffer → rover   (rovers: buffer zone)
 *      coord  → solar   (solar panels: coordination zone)
 *    Simulator: 700px = 288.678 km → PIXELS_PER_KM ≈ 2.4248
 *
 * ── Geometry ─────────────────────────────────────────────────────────────────
 *    Circles on the lunar sphere (R = 1737.4 km). CRS: IAU:30100.
 */

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

const LUNAR_RADIUS_KM  = 1737.4;
const CIRCLE_STEPS     = 72;
const SIM_MAP_KM       = 288.678;
const SIM_W            = 700;
const SIM_PPK          = SIM_W / SIM_MAP_KM; // ≈ 2.4248 px/km

// Hazard type metadata for labels and default ratios
const HAZARD_TYPES = {
  dust:      { label: 'Dust',            unit: 'kg/hr',  defaultRatioIn: 100, defaultRatioOut: 5   },
  radiation: { label: 'Radiation',       unit: 'mSv/hr', defaultRatioIn: 10,  defaultRatioOut: 3   },
  rf:        { label: 'RF emissions',    unit: 'mW',     defaultRatioIn: 50,  defaultRatioOut: 2   },
  thermal:   { label: 'Thermal output',  unit: 'MW',     defaultRatioIn: 500, defaultRatioOut: 8   },
  ejecta:    { label: 'Ejecta / debris', unit: 'kg/hr',  defaultRatioIn: 50,  defaultRatioOut: 4   },
  custom:    { label: 'Custom',          unit: ', ',      defaultRatioIn: 100, defaultRatioOut: 5   },
};

const CONF_LABELS = { '0.10': '±10%', '0.25': '±25%', '0.50': '±50%', '1.00': 'unknown' };
const MIT_LABELS  = { '1.0': 'none', '0.6': 'partial', '0.35': 'full' };

// ── Mode state ────────────────────────────────────────────────────────────────

let currentMode = 'dust'; // 'dust' | 'manual'

function setMode(mode) {
  currentMode = mode;
  document.getElementById('modeDust').style.display   = mode === 'dust'   ? '' : 'none';
  document.getElementById('modeManual').style.display = mode === 'manual' ? '' : 'none';
  document.getElementById('btnDust').classList.toggle('active',   mode === 'dust');
  document.getElementById('btnManual').classList.toggle('active', mode === 'manual');
  update();
}

// ── Hazard type change handler ────────────────────────────────────────────────

function onHazardTypeChange() {
  const type = document.getElementById('hazardType').value;
  const meta = HAZARD_TYPES[type];

  const isCustom = type === 'custom';
  document.getElementById('customHazardNameField').style.display = isCustom ? '' : 'none';
  document.getElementById('customHazardUnitField').style.display = isCustom ? '' : 'none';

  const unit = isCustom
    ? (document.getElementById('customHazardUnit').value.trim() || ', ')
    : meta.unit;

  document.getElementById('hazardUnitLabel').textContent = `(${unit})`;
  document.getElementById('ratioUnitLabel').textContent  = unit;

  // Apply default ratio values for this hazard type
  if (!isCustom) {
    document.getElementById('ratioInput').value  = meta.defaultRatioIn;
    document.getElementById('ratioOutput').value = meta.defaultRatioOut;
  }

  updateRatioExamples();
  update();
}

function updateRatioExamples() {
  const ri   = parseFloat(document.getElementById('ratioInput').value)  || 1;
  const ro   = parseFloat(document.getElementById('ratioOutput').value) || 1;
  const type = document.getElementById('hazardType').value;
  const isCustom = type === 'custom';
  const unit = isCustom
    ? (document.getElementById('customHazardUnit').value.trim() || ', ')
    : HAZARD_TYPES[type].unit;

  const eg1val = ri * 2;
  const eg2val = ri / 2;

  document.getElementById('ratioEg1').textContent  = eg1val;
  document.getElementById('ratioEg1u').textContent = unit;
  document.getElementById('ratioEg1r').textContent = (ro * 2).toFixed(2);
  document.getElementById('ratioEg2').textContent  = eg2val;
  document.getElementById('ratioEg2u').textContent = unit;
  document.getElementById('ratioEg2r').textContent = (ro / 2).toFixed(2);
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

function circlePolygon(centerLat, centerLon, radiusKm, steps) {
  const coords = [];
  const angularRadius = radiusKm / LUNAR_RADIUS_KM;
  const lat = toRad(centerLat);
  const lon = toRad(centerLon);
  for (let i = 0; i <= steps; i++) {
    const bearing = toRad((i * 360) / steps);
    const pLat = Math.asin(
      Math.sin(lat) * Math.cos(angularRadius) +
      Math.cos(lat) * Math.sin(angularRadius) * Math.cos(bearing)
    );
    const pLon = lon + Math.atan2(
      Math.sin(bearing) * Math.sin(angularRadius) * Math.cos(lat),
      Math.cos(angularRadius) - Math.sin(lat) * Math.sin(pLat)
    );
    coords.push([parseFloat(toDeg(pLon).toFixed(6)), parseFloat(toDeg(pLat).toFixed(6))]);
  }
  coords.push(coords[0]);
  return coords;
}

// ── Radius computation: DUST mode ─────────────────────────────────────────────

/**
 * Power-law scaling for dust. Placeholder coefficients.
 * core = 0.5 × effective^0.55, clamped [0.5, 30] km
 */
function computeDustRadii(dustKgHr, confidence, mitigationFactor) {
  const worstCase = dustKgHr * (1 + confidence);
  const effective = worstCase * mitigationFactor;
  const core   = parseFloat(Math.min(30, Math.max(0.5, 0.5 * Math.pow(effective, 0.55))).toFixed(2));
  const buffer = parseFloat((core * 2.5).toFixed(2));
  const coord  = parseFloat((core * 5.0).toFixed(2));
  return { core, buffer, coord, worstCase, effective };
}

// ── Radius computation: MANUAL mode ──────────────────────────────────────────

/**
 * Linear ratio-based radius.
 * core = (value / ratioInput) × ratioOutput × (1 + confidence) × mitigation
 * Buffer and coord are user-defined multipliers of core.
 */
function computeManualRadii(value, confidence, mitigationFactor, ratioIn, ratioOut, bufMult, coordMult) {
  const worstCase = value * (1 + confidence);
  const effective = worstCase * mitigationFactor;
  const core   = parseFloat(Math.max(0.1, (effective / ratioIn) * ratioOut).toFixed(2));
  const buffer = parseFloat((core * bufMult).toFixed(2));
  const coord  = parseFloat((core * coordMult).toFixed(2));
  return { core, buffer, coord, worstCase, effective };
}

// ── Hazard classification ─────────────────────────────────────────────────────

function classifyHazard(core) {
  if (core < 2)  return { cls: 'low',    text: 'Low hazard, standard notification sufficient' };
  if (core < 8)  return { cls: 'medium', text: 'Moderate hazard, coordination zone required' };
  return                { cls: 'high',   text: 'High hazard, full exclusion and buffer zones required' };
}

// ── buffers.json builder ──────────────────────────────────────────────────────

function buildBuffersJSON(core, buffer, coord, meta) {
  const toPixels = (km) => parseFloat((km * SIM_PPK).toFixed(3));
  return {
    _meta: {
      schema:      'OLF-DLA-buffers-v1',
      description: 'Safety radii for lunar simulator (App.jsx). Load via bufferLoader.js.',
      generated:   new Date().toISOString(),
      framework:   'Open Lunar Foundation, DLA Hazard Framework v0.5',
      site:        meta.siteName || null,
      coordinates: { lat: meta.lat, lon: meta.lon },
      input_mode:  meta.inputMode,
      hazard_type: meta.hazardType || 'dust',
      simulator: {
        map_km:        SIM_MAP_KM,
        canvas_px:     SIM_W,
        pixels_per_km: parseFloat(SIM_PPK.toFixed(4)),
        note:          'Multiply km values by pixels_per_km to get pixel radii',
      },
    },
    zones_km: { core, buffer, coordination: coord },
    // Pre-converted pixel values, inject directly into App.jsx SAFETY_RADIUS
    SAFETY_RADIUS: {
      pad:     toPixels(core),
      habitat: toPixels(buffer),
      rover:   toPixels(buffer),
      solar:   toPixels(coord),
    },
    mapping: {
      pad:     { zone: 'core',         km: core,   px: toPixels(core),   rationale: 'Landing pads: innermost exclusion' },
      habitat: { zone: 'buffer',       km: buffer, px: toPixels(buffer), rationale: 'Habitats: buffer zone' },
      rover:   { zone: 'buffer',       km: buffer, px: toPixels(buffer), rationale: 'Rovers: buffer zone' },
      solar:   { zone: 'coordination', km: coord,  px: toPixels(coord),  rationale: 'Solar panels: coordination zone' },
    },
  };
}

// ── GeoJSON builder ───────────────────────────────────────────────────────────

function buildGeoJSON({ lat, lon, siteName, core, buffer, coord, inputsBlock }) {
  return {
    type: 'FeatureCollection',
    properties: {
      framework: 'Open Lunar Foundation, DLA Hazard Framework',
      version:   '0.5',
      generated: new Date().toISOString(),
      body:      'Moon',
      crs:       'IAU:30100',
      site:      { name: siteName || null, latitude: lat, longitude: lon },
      inputs:    inputsBlock,
    },
    features: [
      {
        type: 'Feature',
        properties: {
          zone: 'coordination', label: 'Coordination zone, notification required',
          radius_km: coord, fill: '#2471a3', 'fill-opacity': 0.12, stroke: '#2471a3', 'stroke-width': 1.5,
        },
        geometry: { type: 'Polygon', coordinates: [circlePolygon(lat, lon, coord, CIRCLE_STEPS)] },
      },
      {
        type: 'Feature',
        properties: {
          zone: 'buffer', label: 'Buffer zone, restricted operations',
          radius_km: buffer, fill: '#d4820a', 'fill-opacity': 0.20, stroke: '#d4820a', 'stroke-width': 1.5,
        },
        geometry: { type: 'Polygon', coordinates: [circlePolygon(lat, lon, buffer, CIRCLE_STEPS)] },
      },
      {
        type: 'Feature',
        properties: {
          zone: 'core', label: 'Core exclusion zone, no entry',
          radius_km: core, fill: '#c0392b', 'fill-opacity': 0.30, stroke: '#c0392b', 'stroke-width': 2,
        },
        geometry: { type: 'Polygon', coordinates: [circlePolygon(lat, lon, core, CIRCLE_STEPS)] },
      },
      {
        type: 'Feature',
        properties: { zone: 'site', label: siteName || 'Hazard source site' },
        geometry:   { type: 'Point', coordinates: [lon, lat] },
      },
    ],
  };
}

// ── UI update ─────────────────────────────────────────────────────────────────

let currentGeoJSON     = null;
let currentBuffersJSON = null;

function update() {
  const lat      = parseFloat(document.getElementById('siteLat').value)  || 0;
  const lon      = parseFloat(document.getElementById('siteLon').value)  || 0;
  const siteName = document.getElementById('siteName').value.trim();

  let core, buffer, coord, worstCase, effective, inputsBlock, hazardType;

  // ── DUST MODE ──
  if (currentMode === 'dust') {
    const dust       = parseInt(document.getElementById('dustRate').value, 10);
    const confidence = parseFloat(document.getElementById('dustConfidence').value);
    const mitigation = parseFloat(document.getElementById('dustMitigation').value);
    document.getElementById('dustRateVal').textContent = dust;

    ({ core, buffer, coord, worstCase, effective } = computeDustRadii(dust, confidence, mitigation));
    hazardType = 'dust';

    inputsBlock = {
      mode:             'dust',
      dust_rate_kg_hr:  dust,
      confidence:       CONF_LABELS[String(confidence)] || String(confidence),
      mitigation:       MIT_LABELS[String(mitigation)]  || String(mitigation),
      worst_case_kg_hr: Math.round(worstCase),
      effective_kg_hr:  Math.round(effective),
      formula:          'core = 0.5 × effective^0.55 km (coefficients pending calibration)',
    };

    const confLabel = CONF_LABELS[String(confidence)] || String(confidence);
    document.getElementById('traceInput').textContent     = `${dust} kg/hr`;
    document.getElementById('traceAdjusted').textContent  = `${Math.round(worstCase)} kg/hr (conf ${confLabel})`;
    document.getElementById('traceMitigated').textContent = `${Math.round(effective)} kg/hr effective`;

  // ── MANUAL MODE ──
  } else {
    const type       = document.getElementById('hazardType').value;
    const isCustom   = type === 'custom';
    const meta       = HAZARD_TYPES[type] || HAZARD_TYPES.custom;
    const unit       = isCustom
      ? (document.getElementById('customHazardUnit').value.trim() || ', ')
      : meta.unit;
    const typeName   = isCustom
      ? (document.getElementById('customHazardName').value.trim() || 'Custom')
      : meta.label;

    const value      = parseFloat(document.getElementById('hazardValue').value) || 0;
    const confidence = parseFloat(document.getElementById('manualConfidence').value);
    const mitigation = parseFloat(document.getElementById('manualMitigation').value);
    const ratioIn    = parseFloat(document.getElementById('ratioInput').value)  || 1;
    const ratioOut   = parseFloat(document.getElementById('ratioOutput').value) || 1;
    const bufMult    = parseFloat(document.getElementById('bufferMult').value)  || 2.5;
    const coordMult  = parseFloat(document.getElementById('coordMult').value)   || 5.0;

    ({ core, buffer, coord, worstCase, effective } = computeManualRadii(
      value, confidence, mitigation, ratioIn, ratioOut, bufMult, coordMult
    ));
    hazardType = type;

    const confLabel = CONF_LABELS[String(confidence)] || String(confidence);
    inputsBlock = {
      mode:               'manual',
      hazard_type:        typeName,
      hazard_unit:        unit,
      value:              value,
      confidence:         confLabel,
      mitigation:         MIT_LABELS[String(mitigation)] || String(mitigation),
      worst_case:         parseFloat(worstCase.toFixed(4)),
      effective:          parseFloat(effective.toFixed(4)),
      ratio:              `${ratioIn} ${unit} → ${ratioOut} km core (linear)`,
      buffer_multiplier:  bufMult,
      coord_multiplier:   coordMult,
    };

    document.getElementById('traceInput').textContent     = `${value} ${unit}`;
    document.getElementById('traceAdjusted').textContent  = `${worstCase.toFixed(3)} ${unit} (conf ${confLabel})`;
    document.getElementById('traceMitigated').textContent = `${effective.toFixed(3)} ${unit} effective`;

    updateRatioExamples();
  }

  // ── Shared UI updates ──

  document.getElementById('coreRadius').textContent   = core.toFixed(2);
  document.getElementById('bufferRadius').textContent = buffer.toFixed(2);
  document.getElementById('coordRadius').textContent  = coord.toFixed(2);

  // Zone bar
  const total = coord;
  const coreW = (core   / total * 100).toFixed(1);
  const bufW  = ((buffer - core)  / total * 100).toFixed(1);
  const cooW  = ((coord  - buffer) / total * 100).toFixed(1);
  const bc = document.getElementById('barCore');
  const bb = document.getElementById('barBuffer');
  const bk = document.getElementById('barCoord');
  bc.style.width = coreW + '%'; bc.textContent = parseFloat(coreW) > 8 ? 'Core'         : '';
  bb.style.width = bufW  + '%'; bb.textContent = parseFloat(bufW)  > 8 ? 'Buffer'       : '';
  bk.style.width = cooW  + '%'; bk.textContent = parseFloat(cooW)  > 8 ? 'Coordination' : '';

  // Outcome
  const hazard    = classifyHazard(core);
  const outcomeEl = document.getElementById('outcomeNode');
  outcomeEl.className = `outcome ${hazard.cls}`;
  document.getElementById('outcomeText').textContent = hazard.text;

  // GeoJSON
  currentGeoJSON = buildGeoJSON({ lat, lon, siteName, core, buffer, coord, inputsBlock });
  document.getElementById('geojsonOutput').textContent = JSON.stringify(currentGeoJSON, null, 2);

  // buffers.json
  currentBuffersJSON = buildBuffersJSON(core, buffer, coord, {
    siteName, lat, lon, inputMode: currentMode, hazardType,
  });
  document.getElementById('buffersOutput').textContent = JSON.stringify(currentBuffersJSON, null, 2);
}

// ── Export helpers ────────────────────────────────────────────────────────────

function triggerDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function copyText(text, btnId, label) {
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById(btnId);
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
}

function copyGeoJSON()    { if (currentGeoJSON)     copyText(JSON.stringify(currentGeoJSON, null, 2),     'copyBtn',        'Copy'); }
function copyBuffers()    { if (currentBuffersJSON)  copyText(JSON.stringify(currentBuffersJSON, null, 2), 'copyBuffersBtn', 'Copy'); }

function downloadGeoJSON() {
  if (!currentGeoJSON) return;
  const slug = (document.getElementById('siteName').value.trim() || 'hazard_zones')
    .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  triggerDownload(JSON.stringify(currentGeoJSON, null, 2), `${slug}.geojson`, 'application/geo+json');
}

function downloadBuffers() {
  if (!currentBuffersJSON) return;
  triggerDownload(JSON.stringify(currentBuffersJSON, null, 2), 'buffers.json', 'application/json');
}

// ── Event listeners ───────────────────────────────────────────────────────────

const watchIds = [
  'dustRate', 'dustConfidence', 'dustMitigation',
  'hazardType', 'hazardValue', 'customHazardName', 'customHazardUnit',
  'manualConfidence', 'manualMitigation',
  'ratioInput', 'ratioOutput', 'bufferMult', 'coordMult',
  'siteLat', 'siteLon', 'siteName',
];

watchIds.forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input',  update);
    el.addEventListener('change', update);
  }
});

update();
