// ── FiguresGallery ──────────────────────────────────────────────────────────
//
// A reference gallery of the published, true-vector map figures from the OLF
// "Geology writes the rules" work: the topographic base, the three favorability
// indices (LFI/SOFI/IFI), their RGB composite, the illumination/clear view, the
// asset-level safety-zone (governance) plate, the 16-layer stack, and the
// three-panel mission-record validation (LCROSS / IM-2 Athena / Artemis III).
//
// These are static published plates, distinct from the sim's LIVE computed
// layers (which respond to depletion, rovers, and analysis in real time). They
// live here as the canonical reference a facilitator can pull up mid-workshop
// to anchor the discussion in the real geology, then close and return to play.
//
// Figures are SVG served from /figures and shown in an <img> (vector-crisp at
// any size). Clicking a card opens it full-size with click-to-zoom. The files
// are loaded on demand, so the gallery costs nothing until opened.
//
// Brand: Spectral + Bricolage, The Both palette, no em dashes.

import { useState, useEffect } from "react";

export const FIGURES = [
  { key: "fig_topo",      title: "Topography",            sub: "South-polar shaded-relief contours",            accent: "#C8C4DC" },
  { key: "fig_lfi",       title: "LFI · Landing",         sub: "Where a lander can touch down without breaking", accent: "#E63B2E" },
  { key: "fig_sofi",      title: "SOFI · Surface Ops",    sub: "Where a system can stay alive and productive",   accent: "#5DCAA5" },
  { key: "fig_ifi",       title: "IFI · Ice",             sub: "Where the water ice is in usable form",          accent: "#6E7BE8" },
  { key: "fig_composite", title: "Composite",             sub: "The three indices blended; no site wins all",    accent: "#A8A8F0" },
  { key: "fig_clear",     title: "Illumination",          sub: "Sustained sunlight vs permanent shadow",         accent: "#E8D81C" },
  { key: "fig_gov",       title: "Asset-level safety zones", sub: "Keep-out radii and a designated lunar area",  accent: "#EF9F27" },
  { key: "fig_misszoom",  title: "Real geology, real outcomes", sub: "LCROSS · IM-2 Athena · Artemis III",       accent: "#80B0D8" },
  { key: "fig_layers16",  title: "Sixteen layers",        sub: "Every data layer the indices are built from",    accent: "#C0B8E8" },
];

const SRC = (key) => `/figures/${key}.svg`;

function FigureCard({ fig, onOpen }) {
  return (
    <button
      onClick={() => onOpen(fig)}
      style={{
        position: "relative", textAlign: "left", cursor: "pointer",
        background: "rgba(20,18,32,0.6)", border: "1px solid var(--border-soft, rgba(200,196,220,0.14))",
        borderRadius: 8, padding: 0, overflow: "hidden", width: "100%",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: fig.accent }} />
      <div style={{ aspectRatio: "1 / 1", background: "#0a0814", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img src={SRC(fig.key)} alt={fig.title} loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      </div>
      <div style={{ padding: "8px 10px 9px 12px" }}>
        <div style={{ fontFamily: "var(--serif, 'Spectral', Georgia, serif)", fontStyle: "italic",
          fontSize: 14, color: fig.accent, lineHeight: 1.1, marginBottom: 3 }}>{fig.title}</div>
        <div style={{ fontFamily: "var(--sans, 'Bricolage Grotesque', sans-serif)", fontSize: 9.5,
          color: "#8B86B0", lineHeight: 1.35, letterSpacing: "0.01em" }}>{fig.sub}</div>
      </div>
    </button>
  );
}

function FigureViewer({ fig, onClose }) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => { setZoom(1); }, [fig]);
  if (!fig) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2200, background: "rgba(8,7,20,0.94)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <span style={{ fontFamily: "var(--serif, 'Spectral', Georgia, serif)", fontStyle: "italic",
          fontSize: 22, color: fig.accent }}>{fig.title}</span>
        <span style={{ fontFamily: "var(--sans, 'Bricolage Grotesque', sans-serif)", fontSize: 11,
          color: "#8B86B0" }}>{fig.sub}</span>
      </div>
      <div
        onClick={(e) => { e.stopPropagation(); setZoom(z => z >= 3 ? 1 : z + 1); }}
        style={{ flex: 1, minHeight: 0, width: "100%", maxWidth: 900, display: "flex",
          alignItems: "center", justifyContent: "center", overflow: "auto", cursor: zoom < 3 ? "zoom-in" : "zoom-out" }}
      >
        <img src={SRC(fig.key)} alt={fig.title}
          style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? "100%" : "none",
            height: "auto", objectFit: "contain", display: "block", transition: "width 0.2s ease" }} />
      </div>
      <div style={{ marginTop: 10, fontFamily: "var(--sans, 'Bricolage Grotesque', sans-serif)",
        fontSize: 10, color: "#5A567A", letterSpacing: "0.04em" }}>
        Click image to zoom ({zoom}×) · click outside to close
      </div>
    </div>
  );
}

export function FiguresGallery({ open, onClose }) {
  const [active, setActive] = useState(null);
  useEffect(() => { if (!open) setActive(null); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (active) { setActive(null); e.stopPropagation(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, active]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2150, background: "rgba(20,18,32,0.82)",
        backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: 28, overflowY: "auto" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Published map figures"
        style={{ width: 860, maxWidth: "100%", background: "rgba(32,30,64,0.97)",
          border: "1px solid var(--border-strong, rgba(168,168,240,0.35))", borderRadius: 12,
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)", padding: "24px 28px", marginTop: 8 }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <div style={{ fontFamily: "var(--sans, 'Bricolage Grotesque', sans-serif)", fontWeight: 500, fontSize: 10,
              letterSpacing: "0.16em", textTransform: "uppercase", color: "#80B0D8" }}>
              Open Lunar · Geology writes the rules
            </div>
            <h2 style={{ margin: "4px 0 0", fontFamily: "var(--serif, 'Spectral', Georgia, serif)", fontWeight: 600,
              fontStyle: "italic", fontSize: 24, color: "#ECEAF8" }}>Published map figures</h2>
          </div>
          <button onClick={onClose} aria-label="Close figures gallery"
            style={{ background: "none", border: "none", color: "#8B86B0", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <p style={{ margin: "8px 0 18px", fontFamily: "var(--serif, 'Spectral', Georgia, serif)", fontSize: 13,
          lineHeight: 1.5, color: "#8B86B0", maxWidth: 640 }}>
          The canonical, true-vector plates behind the live map. Each favorability index weights the same terrain
          differently, and no single site maximizes all three. Open any figure to study it full-size.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {FIGURES.map((f) => <FigureCard key={f.key} fig={f} onOpen={setActive} />)}
        </div>
      </div>
      <FigureViewer fig={active} onClose={() => setActive(null)} />
    </div>
  );
}
