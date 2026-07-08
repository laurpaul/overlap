import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from skimage import measure

SIZE = 1212                      # match sandbox W/H
src = Image.open("/home/claude/sandbox-v94/public/maps/basemap_topo_bw.jpg").convert("L")
# Downsample to a working grid for smooth, simplifiable contours
GRID = 606
small = np.asarray(src.resize((GRID, GRID), Image.LANCZOS), dtype=np.float32)
sm = gaussian_filter(small, sigma=7)
sm = (sm - sm.min()) / (sm.max() - sm.min())   # 0..1

scale = SIZE / GRID              # grid -> svg coords
R = SIZE / 2                     # disk radius
CX = CY = SIZE / 2

def in_disk(x, y, margin=2):
    return (x-CX)**2 + (y-CY)**2 <= (R-margin)**2

# Elevation bands: filled regions between successive levels, dark->light by height.
N_BANDS = 9
band_levels = np.linspace(0.0, 1.0, N_BANDS+1)
# Dark navy palette: low = near black, high = faint slate. Matches the reference.
def band_fill(t):
    # t in 0..1 (band height). interpolate between #0a0a16 and #3a3a52
    lo = np.array([10,10,22]); hi = np.array([74,74,90])
    c = (lo + (hi-lo)*t).astype(int)
    return f"#{c[0]:02x}{c[1]:02x}{c[2]:02x}"

def contour_paths(field, level):
    out = []
    for c in measure.find_contours(field, level):
        if len(c) < 12: continue
        # simplify
        c = measure.approximate_polygon(c, tolerance=0.7)
        if len(c) < 4: continue
        out.append(c)
    return out

parts = []
parts.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">')
# clip to disk
parts.append(f'<defs><clipPath id="disk"><circle cx="{CX}" cy="{CY}" r="{R-1}"/></clipPath></defs>')
parts.append(f'<g clip-path="url(#disk)">')
# base fill (lowest)
parts.append(f'<rect x="0" y="0" width="{SIZE}" height="{SIZE}" fill="{band_fill(0)}"/>')

# Filled bands: for each level draw all regions above it in progressively lighter fill.
# We approximate banding by stacking filled contour polygons from low to high.
band_count = 0
for i, lv in enumerate(band_levels[1:-1], start=1):
    t = i / (N_BANDS)
    fill = band_fill(t)
    paths = contour_paths(sm, lv)
    d = []
    for c in paths:
        pts = [(y*scale, x*scale) for x, y in c]  # note: find_contours returns (row,col)=(y,x)
        seg = "M" + " L".join(f"{px:.1f},{py:.1f}" for px,py in pts) + " Z"
        d.append(seg)
        band_count += 1
    if d:
        parts.append(f'<path d="{" ".join(d)}" fill="{fill}" fill-rule="evenodd" opacity="0.9"/>')

# Contour STROKES on top (the white-ish lines), at more levels for detail.
line_levels = np.linspace(0.08, 0.95, 16)
line_count = 0
for lv in line_levels:
    paths = contour_paths(sm, lv)
    d = []
    for c in paths:
        pts = [(y*scale, x*scale) for x, y in c]
        seg = "M" + " L".join(f"{px:.1f},{py:.1f}" for px,py in pts)
        d.append(seg)
        line_count += 1
    if d:
        parts.append(f'<path d="{" ".join(d)}" fill="none" stroke="#c8c4dc" stroke-width="0.6" opacity="0.32"/>')

parts.append('</g>')
# subtle disk edge
parts.append(f'<circle cx="{CX}" cy="{CY}" r="{R-1}" fill="none" stroke="#3a3a52" stroke-width="1.5" opacity="0.5"/>')
parts.append('</svg>')

svg = "\n".join(parts)
open("/home/claude/sandbox-v94/public/maps/basemap_topo_vector.svg","w").write(svg)
import os
print("bands:", band_count, "lines:", line_count)
print("SVG size:", os.path.getsize("/home/claude/sandbox-v94/public/maps/basemap_topo_vector.svg")//1024, "KB")
