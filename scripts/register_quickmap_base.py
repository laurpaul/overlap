#!/usr/bin/env python3
"""
register_quickmap_base.py  (v78)

Register a QuickMap LROC south-polar export into the sandbox's sim frame so the
basemap is pixel-aligned to the PSR mask / illumination / all derived layers.

WHY THIS EXISTS
---------------
QuickMap exports come georeferenced (a .vrt sidecar) but in their *own* extent
and aspect ratio. The v77 quickmap export was a wide 2:1 rectangle covering
x in [-668.4, 668.4] km and y in [-335.2, 335.2] km at 0.8 km/px. The sim
frame, by contrast, is a SQUARE 1212x1212 grid, pole at (606,606), 0.5 km/px,
with the disk edge at 80 deg S (+/- 303 km). Dropped in raw, the export was
squished into the square and the PSRs (which are registered to the 80 deg S
square frame) no longer lined up.

This script does the deterministic affine reprojection from the export's VRT
geotransform into the sim frame, so no overlay (PSR, illum, ice, slope, ...)
ever has to be re-derived. Both frames are polar-stereographic, pole-centered,
0 deg E up / 90 deg E right -- so it is a pure scale+crop, no rotation.

Verified against craters.json: Shackleton lands at the pole, and
Shoemaker / Haworth / Faustini / de Gerlache / Sverdrup / Cabeus / Amundsen
all land on their craters; mean basemap luminance under the PSR mask drops to
~45 vs ~98 global (PSRs sit in the dark crater floors).

USAGE
-----
    python scripts/register_quickmap_base.py \
        --src public/maps/source/quickmap_lroc_raw.png \
        --out public/maps/basemap_quickmap.jpg

The VRT geotransform is read from the matching .vrt next to --src if present;
otherwise the v77 export transform below is used as the default.
"""
import argparse
import os
import re
import numpy as np
from PIL import Image

# Sim frame (must match src/sim/constants.js: W,H,POLE_PX,MAP_KM_PER_PX)
W = H = 1212
POLE = 606.0
M_PER_PX = 0.5 * 1000.0  # 0.5 km/px -> m/px

# Default geotransform = v77 QuickMap export (ox, px, _, oy, _, py)
DEFAULT_GT = (-668399.9999999999, 799.9999999999999, 0,
              335199.99999999994, 0, -799.9999999999999)


def read_gt(vrt_path):
    if vrt_path and os.path.exists(vrt_path):
        txt = open(vrt_path).read()
        m = re.search(r"<GeoTransform>([^<]+)</GeoTransform>", txt)
        if m:
            return tuple(float(v) for v in m.group(1).split(","))
    return DEFAULT_GT


def register(src, out, vrt=None, quality=92):
    nb = np.array(Image.open(src).convert("RGB")).astype(np.float32)
    nh, nw = nb.shape[:2]
    ox, px, _, oy, _, py = read_gt(vrt or os.path.splitext(src)[0] + ".vrt")

    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    proj_x = (xs - POLE) * M_PER_PX
    proj_y = -(ys - POLE) * M_PER_PX          # sim +y is up (toward 0 deg E)
    col = (proj_x - ox) / px
    row = (proj_y - oy) / py

    c0 = np.floor(col).astype(int)
    r0 = np.floor(row).astype(int)
    fc = (col - c0)[..., None]
    fr = (row - r0)[..., None]

    def s(rr, cc):
        return nb[np.clip(rr, 0, nh - 1), np.clip(cc, 0, nw - 1)]

    top = s(r0, c0) * (1 - fc) + s(r0, c0 + 1) * fc
    bot = s(r0 + 1, c0) * (1 - fc) + s(r0 + 1, c0 + 1) * fc
    img = (top * (1 - fr) + bot * fr)
    oob = (col < 0) | (col > nw - 1) | (row < 0) | (row > nh - 1)
    img[oob] = 0

    Image.fromarray(img.astype(np.uint8)).save(out, quality=quality, subsampling=0)
    print(f"wrote {out}  ({W}x{H}, oob px={int(oob.sum())})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="public/maps/source/quickmap_lroc_raw.png")
    ap.add_argument("--out", default="public/maps/basemap_quickmap.jpg")
    ap.add_argument("--vrt", default=None)
    args = ap.parse_args()
    register(args.src, args.out, args.vrt)
