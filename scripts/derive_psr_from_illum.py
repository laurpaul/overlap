#!/usr/bin/env python3
"""
Derive a PSR mask from the real, registered annual-illumination map.

Why: the legacy psr_mask was misregistered (its cold-trap centroid sat
~55px right / ~78px up from where the real LROC data places the pole's
shadowed regions). Now that annual_illum.jpg is real and correctly
registered (scripts/process_quickmap_illum.py), we re-derive the PSR mask
FROM it so the two layers agree and the game logic operates on real
cold-trap positions.

Method: PSRs are the persistently-shadowed (lowest-illumination) regions.
Threshold the dark tail of the illumination map inside the 80 S disk, drop
sub-6px noise specks (matching extractCratersFromPSR's own filter), and
write a clean binary PNG.

CAVEAT: this is an illumination-threshold proxy for PSRs, not an official
PSR polygon set. It is far better-registered than the legacy mask but is
inferred from the shaded-relief illumination. To upgrade, register the
QuickMap PSR layer directly with the same geometry in
process_quickmap_illum.py.

Output: public/maps/psr_mask_clean.png  (overwrites the graticule-cleaned
legacy version; mapData.js already points here).
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

W = H = 1212
SB_POLE = 606.0
SB_EDGE_R = 590.0
DARK_PCT = 8.0   # darkest 8% of in-disk illumination -> PSR candidate

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MAPS_DIR = os.path.join(PROJECT_ROOT, "public", "maps")


def main():
    illum_path = os.path.join(MAPS_DIR, "annual_illum.jpg")
    illum = np.asarray(Image.open(illum_path).convert("L")).astype(float)

    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    r = np.sqrt((xs - SB_POLE) ** 2 + (ys - SB_POLE) ** 2)
    inside = r <= SB_EDGE_R

    thresh = np.percentile(illum[inside], DARK_PCT)
    cand = (illum < thresh) & inside

    # Remove the faint crosshair residue: thin axis-aligned artifacts. Open
    # with a small structuring element to break 1-2px-wide lines, which a
    # real PSR (compact blob) survives but a thin line does not.
    opened = ndimage.binary_opening(cand, structure=np.ones((2, 2)))

    # Morphological opening (erode 3 + dilate 3) to break thin JPEG-artifact
    # bridges that connect neighbouring crater PSRs. JPEG compression creates
    # dark halos around high-contrast crater-floor edges; at the 8th-percentile
    # threshold those halos can bridge adjacent craters (observed: Haworth and
    # Shoemaker merged into one component). Eroding by 3px removes connections
    # narrower than ~6px while preserving the solid cores of real PSRs.
    struct = ndimage.generate_binary_structure(2, 1)
    opened = ndimage.binary_erosion(opened, structure=struct, iterations=3)
    opened = ndimage.binary_dilation(opened, structure=struct, iterations=3)

    # Drop sub-6px specks (matches extractCratersFromPSR's component filter).
    lab, n = ndimage.label(opened, structure=[[0, 1, 0], [1, 1, 1], [0, 1, 0]])
    sizes = ndimage.sum(opened, lab, range(1, n + 1))
    keep = np.zeros_like(opened)
    for i, s in enumerate(sizes, start=1):
        if s >= 6:
            keep |= (lab == i)

    # PSR pixels are bright (255) in the mask convention; everything else 0.
    out = np.where(keep, 255, 0).astype(np.uint8)

    # Report sanity: PSR centroid offset from pole (should be near 0 now).
    pys, pxs = np.where(keep)
    if len(pxs):
        print(f"Derived PSR: {int(keep.sum())} px ({100*keep.sum()/inside.sum():.1f}% of disk), "
              f"{int((sizes>=6).sum())} components")
        print(f"  Centroid offset from pole: "
              f"({pxs.mean()-SB_POLE:.0f}, {pys.mean()-SB_POLE:.0f}) "
              f"[legacy mask was (+55, -78)]")

    out_path = os.path.join(MAPS_DIR, "psr_mask_clean.png")
    Image.fromarray(out, mode="L").save(out_path)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
