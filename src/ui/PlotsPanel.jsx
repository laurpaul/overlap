// ── PlotsPanel ──────────────────────────────────────────────────────────────
//
// The Analysis Plots collapsible panel: renders a stack of PlotCanvas blocks
// for each plot definition, with Separate-plots and Export-PNG buttons per
// plot. Lives at the top of the layout, above the canvas.
//
// Props:
//   open -- visibility toggle (panel hidden when false)
//   onClose -- close button handler
//   plotDefinitions -- array of { id, title, series } from buildPlotDefinitions
//   plotCanvasRefs -- { current: { [plotId]: HTMLCanvasElement } }
//   separatePlotsOpen -- { [plotId]: bool } (per-plot toggle for the
//                       per-series breakout)
//   setSeparatePlotsOpen -- toggle setter (functional update)
//   downloadCanvasPng -- (canvas, filename) => void
//   exportAllPlots -- () => void (downloads PNGs for every plot at once)
//   buildSeparatePlot -- (plot, series, idx) => plotDef (builds the per-series
//                       breakout plot from a single series of a parent plot)
//   PlotCanvas -- the per-plot canvas renderer component
//   sourceLabel -- "replay frames" or "live timeline" (display only)

export function PlotsPanel({
  open, onClose,
  plotDefinitions,
  plotCanvasRefs,
  separatePlotsOpen, setSeparatePlotsOpen,
  downloadCanvasPng, exportAllPlots,
  buildSeparatePlot,
  PlotCanvas,
  sourceLabel,
}) {
  if (!open) return null;
  return (
    <div style={{
      width: "100%", maxWidth: 980, marginBottom: 10,
      background: "rgba(3,7,18,0.98)", border: "1px solid rgba(200,196,220,0.12)",
      borderRadius: 10, padding: "14px 16px", boxShadow: "0 0 40px rgba(0,0,0,0.45)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div>
          <div style={{
            fontSize: 9, letterSpacing: "0.22em", color: "#C0B8E8",
            paddingLeft: 10, borderLeft: "2px solid #A8A8F0", textTransform: "uppercase",
            fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 500,
          }}>Analysis Plots</div>
          <div style={{
            fontSize: 10, color: "#8B86B0", marginTop: 6, lineHeight: 1.6,
            fontFamily: "'Spectral',Georgia,serif", fontStyle: "italic",
            paddingLeft: 10, letterSpacing: "-0.002em",
          }}>
            Source: {sourceLabel}. Each plot can be exported as PNG.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={exportAllPlots} style={{
            background: "rgba(192,184,232,0.12)", border: "1px solid rgba(192,184,232,0.35)",
            color: "#ECEAF8", borderRadius: 6, padding: "8px 14px", cursor: "pointer",
            fontSize: 12, fontFamily: "'Spectral',Georgia,serif",
            fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.005em",
          }}>Export all PNGs</button>
          <button onClick={onClose} style={{
            background: "rgba(200,196,220,0.06)", border: "1px solid rgba(200,196,220,0.14)",
            color: "#C0B8E8", borderRadius: 6, padding: "8px 14px", cursor: "pointer",
            fontSize: 12, fontFamily: "'Spectral',Georgia,serif",
            fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.005em",
          }}>Close</button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "70vh", overflowY: "auto", paddingRight: 4 }}>
        {plotDefinitions.map(plot => (
          <div key={plot.id} style={{
            background: "rgba(200,196,220,0.04)", border: "1px solid rgba(200,196,220,0.08)",
            borderRadius: 10, padding: "12px 12px 14px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{
                fontSize: 13, color: "#ECEAF8", letterSpacing: "-0.005em",
                fontFamily: "'Spectral','Iowan Old Style',Georgia,serif",
                fontStyle: "italic", fontWeight: 400,
              }}>{plot.title}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setSeparatePlotsOpen(prev => ({ ...prev, [plot.id]: !prev[plot.id] }))} style={{
                  background: "rgba(200,196,220,0.06)", border: "1px solid rgba(200,196,220,0.12)",
                  color: "#C0B8E8", borderRadius: 5, padding: "5px 10px", cursor: "pointer",
                  fontSize: 10, fontFamily: "'Spectral',Georgia,serif",
                  fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.005em",
                }}>{separatePlotsOpen[plot.id] ? "Hide separate plots" : "Separate plots"}</button>
                <button onClick={() => downloadCanvasPng(plotCanvasRefs.current[plot.id], `${plot.id}.png`)} style={{
                  background: "rgba(200,196,220,0.06)", border: "1px solid rgba(200,196,220,0.12)",
                  color: "#C0B8E8", borderRadius: 5, padding: "5px 10px", cursor: "pointer",
                  fontSize: 10, fontFamily: "'Spectral',Georgia,serif",
                  fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.005em",
                }}>Export PNG</button>
              </div>
            </div>
            <PlotCanvas plot={plot} />
            {separatePlotsOpen[plot.id] && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                {plot.series.map((series, idx) => {
                  const singlePlot = buildSeparatePlot(plot, series, idx);
                  return (
                    <div key={singlePlot.id} style={{
                      background: "rgba(200,196,220,0.04)", border: "1px solid rgba(200,196,220,0.08)",
                      borderRadius: 8, padding: "10px 10px 12px",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{
                          fontSize: 11, color: "#ECEAF8", letterSpacing: "-0.005em",
                          fontFamily: "'Spectral','Iowan Old Style',Georgia,serif",
                          fontStyle: "italic", fontWeight: 400,
                        }}>{series.label}</div>
                        <button onClick={() => downloadCanvasPng(plotCanvasRefs.current[singlePlot.id], `${singlePlot.id}.png`)} style={{
                          background: "rgba(200,196,220,0.06)", border: "1px solid rgba(200,196,220,0.12)",
                          color: "#C0B8E8", borderRadius: 5, padding: "5px 9px", cursor: "pointer",
                          fontSize: 10, fontFamily: "'Spectral',Georgia,serif",
                          fontStyle: "italic", fontWeight: 400, letterSpacing: "-0.005em",
                        }}>Export PNG</button>
                      </div>
                      <PlotCanvas plot={singlePlot} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
