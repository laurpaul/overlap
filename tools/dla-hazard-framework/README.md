# Lunar Radius Framework
**Open Lunar Foundation, DLA If/Then Toolkit v0.5**

An interactive browser-based tool for computing operational exclusion zones from lunar surface hazard inputs. Built to support the Designated Lunar Areas (DLA) governance framework.

**Live tool:** [aaronmac24.github.io/lunar-radius-framework](https://aaronmac24.github.io/lunar-radius-framework)

---

## What it does

Given a hazard type and production rate, the tool computes three concentric operational zones and exports them as GeoJSON (for GIS tools) or `buffers.json` (for direct integration with the OLF lunar simulator).

### Two input modes

**Dust (kg/hr)**
Uses a power-law formula calibrated to lunar dust transport literature. Inputs: dust production rate, confidence level, and mitigation factor.

**Manual hazard**
For any hazard type, radiation (mSv/hr), RF emissions (mW), thermal output (MW), ejecta, or custom. The operator defines a linear ratio (`X units → Y km core radius`) and zone multipliers. The ratio is the if/then logic itself.

### Three output zones

| Zone | Default multiplier | Meaning |
|---|---|---|
| Core | 1× | No entry |
| Buffer | 2.5× core | Restricted operations |
| Coordination | 5× core | Notification required |

Zone multipliers are editable in manual mode.

---

## Outputs

### GeoJSON
A `FeatureCollection` with four features: coordination, buffer, and core polygons (outer-to-inner) plus a source site point. Polygons are geodetically projected on the lunar sphere (R = 1737.4 km). Compatible with QGIS, Felt, geojson.io, and any standard GIS tool.

**CRS:** IAU:30100 (selenographic lat/lon)

Each feature carries `fill`, `fill-opacity`, `stroke`, and `stroke-width` properties for out-of-the-box styling. The top-level `properties` block includes all inputs and metadata for full reproducibility.

### buffers.json
Exports computed radii in the exact schema expected by the OLF lunar simulator (`App.jsx`). Includes both km values and pre-converted pixel values (based on the simulator's 700px = 288.678 km coordinate space).

See [`SIMULATOR_PATCH.md`](SIMULATOR_PATCH.md) for the one-time `App.jsx` loader snippet.

---

## Running locally

No build step required. Open `index.html` directly or serve with:

```bash
# Python 3
python -m http.server 8000

# Node
npx serve .
```

---

## Formula notes

**Dust mode**, power-law scaling:
```
worst_case  = dust_rate × (1 + confidence_fraction)
effective   = worst_case × mitigation_factor
core_radius = 0.5 × effective^0.55  [km]  (min 0.5, max 30)
```
Coefficients (`0.5`, `0.55`) are placeholders pending calibration against lunar dust transport models. These are the values to update once empirical data from mission operators is available.

**Manual mode**, linear ratio:
```
worst_case  = value × (1 + confidence_fraction)
effective   = worst_case × mitigation_factor
core_radius = (effective / ratio_input) × ratio_output  [km]
buffer      = core × buffer_multiplier
coord       = core × coord_multiplier
```

---

## File structure

```
lunar-radius-framework/
├── index.html          Application shell and markup
├── style.css           Dark-theme stylesheet (Syne + Space Mono)
├── framework.js        All computation and UI logic
├── SIMULATOR_PATCH.md  App.jsx integration instructions
└── README.md           This file
```


---

## Part of the OLF DLA project

This tool is one component of the Open Lunar Foundation's Designated Lunar Areas governance research. The DLA framework establishes defined zones on the lunar surface with associated governance rules to enable coordinated, non-conflicting multi-actor operations.

Related work: OLF Field Guide (Tiballi, Sept 2025) · Artemis Accords Safe Zone Working Discussions · OLF Lunar Commons Platform
