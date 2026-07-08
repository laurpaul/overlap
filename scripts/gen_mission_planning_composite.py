#!/usr/bin/env python3
"""
gen_mission_planning_composite.py  (v79)

Render the south-polar data layers as a CRISP, FULLY VECTOR composite in the
"mission planning" style: bold thresholded fills + bright contour outlines +
glow, over a shaded-relief base. Everything except the relief is true SVG
vector (infinitely scalable, never pixelated); the relief is the single
embedded raster, upscaled for a clean base.

Why: the in-app overlays render as soft image-tint gradients that don't read at
a glance. This style — thresholded regions with crisp outlines, the way a real
mission-planning chart looks — makes each layer pop. Marching-squares contours
(skimage) are taken on lightly Gaussian-smoothed fields so the vector edges are
smooth, not stair-stepped off the 1212px raster.

Outputs:
  1. mission_planning_composite.svg  — full FIGURE: overlays + relief + legend,
     crater labels, graticule, north arrow, 20 km scale bar, title block.
  2. basemap_bw_overlays.svg         — bare in-app LAYER: same overlays + relief,
     no chrome, viewBox 2424 (drop-in replacement for the app basemap option).

All layers are co-registered to the sim frame (1212px, pole-centered, 0.5 km/px,
disk edge = 80 S) so they line up with PSR/illum/etc. exactly.

Usage:
  python scripts/gen_mission_planning_composite.py --maps public/maps \
      --figure out/mission_planning_composite.svg \
      --layer  public/maps/basemap_bw_overlays.svg
"""
import argparse, base64, io, os
import numpy as np
from PIL import Image, ImageOps
from scipy.ndimage import gaussian_filter, binary_closing
from skimage import measure
from skimage.measure import approximate_polygon

N = 1212                 # sim raster size
S = 2.0                  # raster px -> SVG units (viewBox 2424)
VB = int(N * S)          # 2424
CC = N / 2.0             # pole, raster px
DISK_R = CC - 1          # inscribed disk (80 S)

# ── Crater labels (sim 1212-px space; from src/sim/mapData.js) ───────────────
CRATER_LABELS = [
    ("Shackleton", 622.0, 619.0), ("de Gerlache", 515.1, 603.6),
    ("Sverdrup", 648.0, 686.7), ("Shoemaker", 687.3, 524.4),
    ("Faustini", 768.9, 588.9), ("Haworth", 619.2, 454.9),
    ("Cabeus", 426.3, 354.0), ("Nobile", 840.1, 432.7),
    ("Amundsen", 925.1, 565.7), ("Idel'son", 1088.5, 790.2),
    ("Slater", 712.1, 547.2), ("Malapert", 606.0, 296.5),
    ("Scott", 965.4, 288.0), ("Cabeus B", 232.9, 344.7),
    ("Wiechert", 692.4, 928.4), ("Kuhn", 575.5, 1042.2),
    ("Ashbrook", 125.0, 810.2), ("Hedervari", 1089.3, 555.2),
    ("Nefed'ev", 1034.3, 965.4),
]

yy, xx = np.mgrid[0:N, 0:N]
DISK = ((xx - CC) ** 2 + (yy - CC) ** 2) <= DISK_R ** 2


def load(maps, fname, invert=False):
    a = np.asarray(Image.open(os.path.join(maps, fname)).convert("L")).astype(np.float32) / 255.0
    if a.shape[0] != N:
        a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((N, N), Image.LANCZOS)).astype(np.float32) / 255.0
    return 1.0 - a if invert else a


def contours_d(field, level, sigma=2.4, close=True, clip_disk=True, outside=None,
               min_area=0.0, simplify=1.0):
    """SVG path `d` for the iso-level contours of a smoothed field.
    simplify: Douglas-Peucker tolerance (px) for clean vector lines.
    min_area: drop contour loops below this enclosed area (px^2) to denoise."""
    f = gaussian_filter(field.astype(np.float32), sigma) if sigma else field.astype(np.float32)
    if clip_disk:
        f = f.copy()
        f[~DISK] = outside if outside is not None else f.min()
    segs = []
    for c in measure.find_contours(f, level):
        if simplify:
            c = approximate_polygon(c, simplify)
        if len(c) < 4:
            continue
        if min_area > 0:
            x, y = c[:, 1], c[:, 0]
            area = 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
            if area < min_area:
                continue
        pts = [f"{col * S:.1f} {row * S:.1f}" for row, col in c]
        d = "M" + "L".join(pts)
        if close:
            d += "Z"
        segs.append(d)
    return " ".join(segs)


def topo_base(maps, relief="basemap_quickmap.jpg", n_levels=16, sigma=4.5):
    """Vectorized topographic base from the real, registered LROC relief.
    Now reads as clear terrain: muted posterized grey relief bands (painter's,
    so elevation form is visible) under bolder/brighter contour lines (every 4th
    an 'index' contour). Fully vector; greys stay muted so overlays still pop."""
    r = np.asarray(Image.open(os.path.join(maps, relief)).convert("L").resize((N, N), Image.LANCZOS)).astype(np.float32)
    f = gaussian_filter(r, sigma)
    fn = f.copy(); fn[~DISK] = np.nan
    lo, hi = np.nanpercentile(fn, 2), np.nanpercentile(fn, 98)
    ff = np.where(DISK, f, lo - 1e4)
    levels = np.linspace(lo, hi, n_levels)
    out = ['<g clip-path="url(#disk)">',
           f'<rect x="0" y="0" width="{VB}" height="{VB}" fill="#0c0b16"/>']
    # Posterized relief fills (ascending = painter's; brighter = higher relief)
    for i, lv in enumerate(levels):
        t = i / (n_levels - 1)
        g = int(round(18 + t * 92))                 # 18..110 grey ramp, muted
        col = f"#{g:02x}{g:02x}{min(255, g + 10):02x}"  # faint cool tint
        segs = []
        for c in measure.find_contours(ff, lv):
            c = approximate_polygon(c, 1.2)
            if len(c) < 4:
                continue
            segs.append("M" + "L".join(f"{cx * S:.1f} {cy * S:.1f}" for cy, cx in c) + "Z")
        if segs:
            out.append(f'<path d="{" ".join(segs)}" fill="{col}" fill-rule="evenodd"/>')
    # Contour lines on top (bolder + brighter than v80)
    for i, lv in enumerate(levels):
        index = (i % 4 == 0)
        segs = []
        for c in measure.find_contours(ff, lv):
            c = approximate_polygon(c, 1.2)
            if len(c) < 4:
                continue
            segs.append("M" + "L".join(f"{cx * S:.1f} {cy * S:.1f}" for cy, cx in c))
        if not segs:
            continue
        d = " ".join(segs)
        if index:
            out.append(f'<path d="{d}" fill="none" stroke="#E4E0F2" stroke-opacity="0.7" stroke-width="1.7"/>')
        else:
            out.append(f'<path d="{d}" fill="none" stroke="#B4AFD4" stroke-opacity="0.42" stroke-width="1.0"/>')
    out.append("</g>")
    return "\n".join(out)


def relief_image_tag(maps, relief="basemap_quickmap.jpg"):
    # Use the registered base (real LROC, co-registered to the PSR/illum frame)
    # so relief craters sit exactly under the PSR fills. Grayscale + a mild gamma
    # to deepen crater-floor shadows for the B&W mission-planning look.
    im = Image.open(os.path.join(maps, relief)).convert("L").resize((VB, VB), Image.LANCZOS)
    im = ImageOps.autocontrast(im, cutoff=2)
    arr = (np.asarray(im).astype(np.float32) / 255.0) ** 1.15
    im = Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8))
    buf = io.BytesIO(); im.save(buf, "PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return (f'<image x="0" y="0" width="{VB}" height="{VB}" clip-path="url(#disk)" '
            f'preserveAspectRatio="none" href="data:image/png;base64,{b64}"/>')


# ── Style constants ──────────────────────────────────────────────────────────
CYAN, GOLD, MAG, RED = "#40E8FF", "#FFB820", "#C060E8", "#FF4030"
BLUE, BLUE_HI = "#3460A8", "#80B0D8"   # comms-blackout fill / outline (brand instrument blue / mist)

DEFS = f"""<defs>
<clipPath id="disk"><circle cx="{VB/2}" cy="{VB/2}" r="{DISK_R*S}"/></clipPath>
<filter id="gCyan" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feFlood flood-color="{CYAN}" flood-opacity="0.7"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="gGold" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5" result="b"/><feFlood flood-color="{GOLD}" flood-opacity="0.6"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="gMag" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5" result="b"/><feFlood flood-color="{MAG}" flood-opacity="0.55"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="gBlue" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5" result="b"/><feFlood flood-color="{BLUE_HI}" flood-opacity="0.6"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<pattern id="commsHatch" width="15" height="15" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="15" height="15" fill="{BLUE}" fill-opacity="0.12"/><line x1="0" y1="0" x2="0" y2="15" stroke="{BLUE_HI}" stroke-width="2.0" stroke-opacity="0.5"/></pattern>
<filter id="gRed" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feFlood flood-color="{RED}" flood-opacity="0.7"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="textHalo"><feMorphology operator="dilate" radius="1.4" in="SourceAlpha" result="d"/><feFlood flood-color="#000" flood-opacity="0.85"/><feComposite in2="d" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>"""


def overlay_group(maps):
    """Vector topo base + the four data overlays, clipped to the disk."""
    illum = load(maps, "annual_illum.jpg")
    ev = load(maps, "earth_visibility.jpg")          # Earth (DTE) visibility, 0..1
    evinv = 1.0 - ev                                  # high = comms-poor
    slope = load(maps, "slope.jpg", invert=True) * 30.0  # degrees, 0..30
    psr = (np.asarray(Image.open(os.path.join(maps, "source/crater_psr_placed.png")).convert("L")) > 128).astype(np.float32)

    out = [topo_base(maps), '<g clip-path="url(#disk)">']

    # Comms blackout — a distinct HATCHED exclusion zone (Earth view < 30%), so
    # it reads as a limitation rather than blending with the grey terrain. Bold
    # boundary = the comms limit; dashed line = the marginal (< 45%) edge.
    out.append(f'<path d="{contours_d(evinv, 0.70, sigma=3.0, outside=0, min_area=200)}" fill="url(#commsHatch)" fill-rule="evenodd"/>')
    out.append(f'<path d="{contours_d(evinv, 0.55, sigma=3.0, outside=0, min_area=240, close=False)}" fill="none" stroke="{BLUE_HI}" stroke-opacity="0.6" stroke-width="1.5" stroke-dasharray="9 7"/>')
    out.append(f'<path d="{contours_d(evinv, 0.70, sigma=3.0, outside=0, min_area=200, close=False)}" fill="none" stroke="{BLUE_HI}" stroke-opacity="0.95" stroke-width="2.4" filter="url(#gBlue)"/>')

    # Peak of eternal light — one solid gold fill + outline + a dashed inner ring.
    out.append(f'<path d="{contours_d(illum, 0.80, sigma=3.5, outside=0, min_area=140)}" fill="{GOLD}" fill-opacity="0.24" fill-rule="evenodd"/>')
    out.append(f'<path d="{contours_d(illum, 0.80, sigma=3.5, outside=0, min_area=140, close=False)}" fill="none" stroke="{GOLD}" stroke-opacity="0.95" stroke-width="2.4" filter="url(#gGold)"/>')
    out.append(f'<path d="{contours_d(illum, 0.90, sigma=3.5, outside=0, min_area=80, close=False)}" fill="none" stroke="#FFE070" stroke-opacity="0.85" stroke-width="1.4" stroke-dasharray="9 7"/>')

    # Hazard / impassable slope >25 deg — red rings (denoised) + dashed 20 deg warning.
    out.append(f'<path d="{contours_d(slope, 20.0, sigma=1.8, outside=0, min_area=60, close=False)}" fill="none" stroke="{RED}" stroke-opacity="0.5" stroke-width="1.6" stroke-dasharray="7 6"/>')
    out.append(f'<path d="{contours_d(slope, 25.0, sigma=1.8, outside=0, min_area=40, close=False)}" fill="none" stroke="{RED}" stroke-opacity="1.0" stroke-width="2.6" filter="url(#gRed)"/>')

    # PSR — discrete bright cyan fills + outline + glow (new clean mask: light touch).
    out.append(f'<path d="{contours_d(psr, 0.5, sigma=1.0, outside=0, min_area=10)}" fill="{CYAN}" fill-opacity="0.9" fill-rule="evenodd"/>')
    out.append(f'<path d="{contours_d(psr, 0.5, sigma=1.0, outside=0, min_area=10, close=False)}" fill="none" stroke="#CFF8FF" stroke-opacity="0.95" stroke-width="1.8" filter="url(#gCyan)"/>')

    out.append("</g>")
    return "\n".join(out)


def graticule():
    cx = VB / 2
    g = ['<g stroke="#ECEAF8" fill="none" opacity="0.16">']
    g.append(f'<line x1="{cx}" y1="0" x2="{cx}" y2="{VB}" stroke-width="1"/>')
    g.append(f'<line x1="0" y1="{cx}" x2="{VB}" y2="{cx}" stroke-width="1"/>')
    R = 1737.4
    for latS in (85, 87):
        colat = 90 - latS
        r_km = 2 * R * np.tan(np.radians(colat) / 2)
        r_px = r_km / 0.5
        g.append(f'<circle cx="{cx}" cy="{cx}" r="{r_px * S:.1f}" stroke-width="1.2" stroke-dasharray="10 12"/>')
    g.append(f'<circle cx="{cx}" cy="{cx}" r="{DISK_R*S:.1f}" stroke-width="2" opacity="1" stroke="#ECEAF8"/>')
    g.append("</g>")
    return "\n".join(g)


def labels():
    out = ['<g font-family="Bricolage Grotesque, Arial, sans-serif" font-weight="700" '
           'font-size="22" fill="#ECEAF8" text-anchor="middle" filter="url(#textHalo)">']
    for name, x, y in CRATER_LABELS:
        out.append(f'<text x="{x*S:.0f}" y="{y*S:.0f}">{name}</text>')
    out.append("</g>")
    return "\n".join(out)


def legend():
    rows = [(CYAN, "PSR (permanently shadowed)"), (GOLD, "Peak of eternal light"),
            (BLUE, "Comms blackout (Earth view under 30%)"), (RED, "Hazard / impassable slope (>25 deg)")]
    x, y, w = VB - 540, 30, 510
    h = 60 + len(rows) * 46
    out = [f'<g font-family="Bricolage Grotesque, Arial, sans-serif">',
           f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="rgba(10,10,18,0.82)" stroke="#A8A8F0" stroke-opacity="0.5"/>',
           f'<text x="{x+22}" y="{y+38}" font-size="22" font-weight="700" fill="#C8C4DC" letter-spacing="3">LEGEND</text>']
    for i, (c, lab) in enumerate(rows):
        ry = y + 60 + i * 46
        if c == BLUE:   # comms blackout — hatched swatch, matching the map
            out.append(f'<rect x="{x+22}" y="{ry}" width="40" height="26" rx="4" fill="url(#commsHatch)" stroke="{BLUE_HI}"/>')
        elif c == RED:  # hazard — drawn as a ring, matching the map
            out.append(f'<rect x="{x+22}" y="{ry}" width="40" height="26" rx="4" fill="none" stroke="{RED}" stroke-width="2.4"/>')
        else:
            out.append(f'<rect x="{x+22}" y="{ry}" width="40" height="26" rx="4" fill="{c}" fill-opacity="0.85" stroke="{c}"/>')
        out.append(f'<text x="{x+76}" y="{ry+21}" font-size="22" fill="#ECEAF8">{lab}</text>')
    out.append("</g>")
    return "\n".join(out)


def north_arrow():
    return (f'<g font-family="Bricolage Grotesque, Arial, sans-serif">'
            f'<rect x="30" y="30" width="118" height="118" rx="8" fill="rgba(10,10,18,0.82)" stroke="#A8A8F0" stroke-opacity="0.5"/>'
            f'<path d="M89 46 L104 120 L89 104 L74 120 Z" fill="#ECEAF8" stroke="#A8A8F0" stroke-width="1.5"/>'
            f'<text x="89" y="142" font-size="22" font-weight="700" fill="#ECEAF8" text-anchor="middle">N</text>'
            f'<text x="30" y="186" font-size="20" fill="#8B86B0">0 lon</text></g>')


def scale_bar():
    px_per_km = (1 / 0.5) * S          # SVG units per km
    seg = 20 * px_per_km               # 20 km
    x = VB - 60 - seg; y = VB - 70
    return (f'<g font-family="Bricolage Grotesque, Arial, sans-serif">'
            f'<line x1="{x:.0f}" y1="{y}" x2="{x+seg:.0f}" y2="{y}" stroke="#ECEAF8" stroke-width="4"/>'
            f'<line x1="{x:.0f}" y1="{y-10}" x2="{x:.0f}" y2="{y+10}" stroke="#ECEAF8" stroke-width="4"/>'
            f'<line x1="{x+seg:.0f}" y1="{y-10}" x2="{x+seg:.0f}" y2="{y+10}" stroke="#ECEAF8" stroke-width="4"/>'
            f'<text x="{x+seg/2:.0f}" y="{y-16}" font-size="24" font-weight="700" fill="#ECEAF8" text-anchor="middle">20 km</text></g>')


def title_block(main="Mission planning", sub="Multi-layer composite for markup"):
    x, y = 30, VB - 250
    return (f'<g font-family="Bricolage Grotesque, Arial, sans-serif">'
            f'<rect x="{x}" y="{y}" width="470" height="200" rx="8" fill="rgba(10,10,18,0.82)" stroke="#A8A8F0" stroke-opacity="0.5"/>'
            f'<text x="{x+26}" y="{y+150}" font-family="Spectral, Georgia, serif" font-style="italic" font-size="52" font-weight="600" fill="#ECEAF8">{main}</text>'
            f'<text x="{x+26}" y="{y+182}" font-size="20" fill="#8B86B0" letter-spacing="1">{sub}</text></g>')


def build_svg(maps, mode="full"):
    """mode: 'full' = overlays+relief+chrome; 'layer' = overlays+relief, no chrome;
    'topo' = vectorized B&W topographic base only (+ chrome), no data overlays."""
    body = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB} {VB}" preserveAspectRatio="xMidYMid meet">',
            DEFS,
            f'<rect x="0" y="0" width="{VB}" height="{VB}" fill="#05050a"/>']
    if mode == "topo":
        body += [topo_base(maps), graticule(), labels(),
                 north_arrow(), scale_bar(),
                 title_block("Topography", "LROC south-polar shaded-relief contours")]
    else:
        body.append(overlay_group(maps))
        if mode == "full":
            body += [graticule(), labels(), legend(), north_arrow(), scale_bar(), title_block()]
    body.append("</svg>")
    return "\n".join(body)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--maps", default="public/maps")
    ap.add_argument("--figure", default="out/mission_planning_composite.svg")
    ap.add_argument("--layer", default="public/maps/basemap_bw_overlays.svg")
    ap.add_argument("--topo", default="out/topographic_map.svg")
    a = ap.parse_args()
    os.makedirs(os.path.dirname(a.figure) or ".", exist_ok=True)
    os.makedirs(os.path.dirname(a.topo) or ".", exist_ok=True)
    open(a.figure, "w").write(build_svg(a.maps, mode="full"));  print("wrote", a.figure)
    open(a.layer, "w").write(build_svg(a.maps, mode="layer"));  print("wrote", a.layer)
    open(a.topo, "w").write(build_svg(a.maps, mode="topo"));    print("wrote", a.topo)
