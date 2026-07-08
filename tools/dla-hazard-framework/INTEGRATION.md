# DLA Hazard Framework · vendored standalone tool

This folder is Aaron Mackey's **Lunar Radius Framework** (OLF DLA If/Then
Toolkit v0.5), included unchanged for provenance and for the GIS / GeoJSON
workflow it supports. Original: `aaronmac24.github.io/lunar-radius-framework`.

## How it relates to the sandbox

As of sandbox v85, the framework's **computation** is ported natively into the
simulator at `src/sim/hazardZones.js`, and surfaced in the app through the
**DLA zones** panel (toolbar, or press `Z`). You no longer need the standalone
tool to drive the sim's safety zones, but it remains useful for:

- producing **GeoJSON** for QGIS / Felt / geojson.io, and
- generating a `buffers.json` scenario file to hand to a colleague who then
  imports it into the sandbox.

## Important: the SIMULATOR_PATCH.md instructions are superseded

`SIMULATOR_PATCH.md` was written against an older **700 px** build of the
simulator, where `SAFETY_RADIUS` was defined inline in `App.jsx` and pixel
values were baked at 700 px / 288.678 km ≈ **2.4248 px/km**.

This sandbox is **1212 px / 606 km = 2 px/km**, and `SAFETY_RADIUS` lives in
`src/sim/constants.js`. So the patch's copy-paste loader does **not** apply, and
the baked pixel values in any `buffers.json` would be ~21% off here.

The native integration handles this correctly: it reads zone radii in
**kilometres** (scale-independent physical truth) and reprojects them with the
sandbox's own `PIXELS_PER_KM`. Import a `buffers.json` via the DLA zones panel
and the km values are used; the legacy pixels are ignored.

## Running the standalone tool

No build step. Open `index.html`, or:

```bash
python -m http.server 8000
```
