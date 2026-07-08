#!/usr/bin/env python3
"""
Register the real QuickMap south-polar illumination export into the sandbox
frame, using geometry MEASURED from the export's own graticule overlay.
Deterministic -- no blind fitting.

Measured geometry (public/maps/source/quickmap_illum_graticule.png):
    pole (crosshair center) : (746, 396)
    scale                   : 12.9 px / degree co-latitude (linear polar;
                              verified against the 60 S and 70 S circles)
    80 S circle radius      : 129 px

Sandbox frame: pole -> (606,606); 80 S -> r=590 (59 px/deg); 1212x1212.

For each sandbox pixel: co-latitude + azimuth -> QuickMap radius (scale
ratio) -> sample source. Graticule (2 cardinal lines + concentric circles +
crosshair) is removed GEOMETRICALLY -- we know exactly where the lines are,
so we mask those pixels and inpaint from neighbours. This is robust where a
colour threshold failed (the crosshair is dim and golden-tinted over relief).

PROVENANCE: this QuickMap layer is shaded-relief illumination -- real,
correctly georeferenced LROC data, but not a Mazarico annual integral.
Labelled "LROC south-polar illumination (QuickMap)" in the UI. To upgrade
to a true Mazarico average-illumination product later, swap the source and
keep this same registration math.

Usage:
    python3 scripts/process_quickmap_illum.py            # writes annual_illum.jpg
    python3 scripts/process_quickmap_illum.py --dry-run  # preview PNG only
"""
import argparse, os
import numpy as np
from PIL import Image
try:
    from scipy import ndimage
except ImportError:
    raise SystemExit("Needs scipy: pip install scipy")

# Measured QuickMap geometry
QM_POLE_X, QM_POLE_Y = 746.0, 396.0
QM_PX_PER_DEG = 12.9
# Sandbox geometry
W = H = 1212
SB_POLE = 606.0
SB_EDGE_R = 590.0
SB_PX_PER_DEG = SB_EDGE_R / 10.0

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MAPS_DIR = os.path.join(PROJECT_ROOT, "public", "maps")
SOURCE = os.path.join(MAPS_DIR, "source", "quickmap_illum_graticule.png")


def graticule_mask(imgW, imgH):
    """Geometric graticule mask in the SOURCE image. We know the lines:
      - vertical line through the pole (x = QM_POLE_X)
      - horizontal line through the pole (y = QM_POLE_Y)
      - concentric circles at 60/70/80 S (radii = colat * scale)
    Mask a few px around each. Robust to colour/brightness variation."""
    ys, xs = np.mgrid[0:imgH, 0:imgW].astype(float)
    dx, dy = xs - QM_POLE_X, ys - QM_POLE_Y
    r = np.sqrt(dx * dx + dy * dy)
    HALF = 3.0  # half-width of each line in px
    m = (np.abs(dx) <= HALF) | (np.abs(dy) <= HALF)
    for lat in (60.0, 70.0, 80.0):
        rr = (90.0 - lat) * QM_PX_PER_DEG
        m |= np.abs(r - rr) <= HALF
    return m


def inpaint(gray, mask, iters=8):
    filled = gray.copy(); filled[mask] = 0
    known = (~mask) & (gray > 0); fillmask = mask.copy()
    for _ in range(iters):
        blur = ndimage.uniform_filter(filled, size=5)
        cnt = ndimage.uniform_filter(known.astype(float), size=5)
        vals = np.where(cnt > 0, blur / np.maximum(cnt, 1e-6), 0)
        need = fillmask & (filled == 0)
        filled[need] = vals[need]; known = filled > 0
    return filled


def register(clean, imgW, imgH):
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    dx, dy = xs - SB_POLE, ys - SB_POLE
    r_sb = np.sqrt(dx * dx + dy * dy); az = np.arctan2(dy, dx)
    colat = r_sb / SB_PX_PER_DEG
    r_qm = colat * QM_PX_PER_DEG
    qx = QM_POLE_X + r_qm * np.cos(az); qy = QM_POLE_Y + r_qm * np.sin(az)
    inside = (r_sb <= SB_EDGE_R) & (qx >= 0) & (qx < imgW) & (qy >= 0) & (qy < imgH)
    # bilinear sample for smoothness
    qx0 = np.clip(np.floor(qx).astype(int), 0, imgW - 1)
    qy0 = np.clip(np.floor(qy).astype(int), 0, imgH - 1)
    qx1 = np.clip(qx0 + 1, 0, imgW - 1); qy1 = np.clip(qy0 + 1, 0, imgH - 1)
    fx = np.clip(qx - qx0, 0, 1); fy = np.clip(qy - qy0, 0, 1)
    top = clean[qy0, qx0] * (1 - fx) + clean[qy0, qx1] * fx
    bot = clean[qy1, qx0] * (1 - fx) + clean[qy1, qx1] * fx
    samp = top * (1 - fy) + bot * fy
    out = np.zeros((H, W), dtype=np.float32)
    out[inside] = samp[inside]
    return out, r_sb


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not os.path.exists(SOURCE):
        raise SystemExit(f"Source not found: {SOURCE}")
    arr = np.asarray(Image.open(SOURCE).convert("RGB")).astype(np.float32)
    imgH, imgW = arr.shape[:2]
    gray = arr.mean(axis=2)
    print(f"Source {imgW}x{imgH}; pole ({QM_POLE_X:.0f},{QM_POLE_Y:.0f}), {QM_PX_PER_DEG} px/deg")

    gmask = graticule_mask(imgW, imgH)
    print(f"Graticule pixels to inpaint (geometric): {int(gmask.sum())}")
    clean = inpaint(gray, gmask)

    illum, r_sb = register(clean, imgW, imgH)
    inside = r_sb <= SB_EDGE_R + 2
    vals = illum[r_sb <= SB_EDGE_R]
    lo, hi = np.percentile(vals, 1), np.percentile(vals, 99)
    norm = np.clip((illum - lo) / max(1e-6, hi - lo), 0.0, 1.0) * inside

    if args.dry_run:
        out = os.path.join(MAPS_DIR, "annual_illum_PREVIEW.png")
        Image.fromarray((norm * 255).astype(np.uint8)).save(out)
        print(f"DRY RUN -> {out}"); return

    out = os.path.join(MAPS_DIR, "annual_illum.jpg")
    g = Image.fromarray((norm * 255).astype(np.uint8), mode="L")
    Image.merge("RGB", (g, g, g)).save(out, quality=92, optimize=True)
    print(f"Wrote {out} (REAL LROC data, graticule-registered)")


if __name__ == "__main__":
    main()
