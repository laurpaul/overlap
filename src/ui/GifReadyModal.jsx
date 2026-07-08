// ── GifReadyModal ───────────────────────────────────────────────────────────
//
// Always-visible explicit download modal for the mission-GIF export.
// The browser's silent auto-click sometimes fails (Safari, security-locked
// Chrome, permission prompts), so this presents an explicit anchor the user
// clicks themselves. Works in every browser, every time.
//
// Props:
//   gifReady    -- { url, filename, size } or null
//   setGifReady -- setter; called with null to dismiss

import { useEffect } from "react";

export function GifReadyModal({ gifReady, setGifReady }) {
  // v27: belt-and-suspenders cleanup. The `dismiss` handler revokes the
  // blob URL on every user-initiated close (button, click-outside, post-
  // download timeout). But if the modal unmounts for any other reason
  // (parent re-render that drops it, route change in a future routed
  // build, hot-reload during dev), the blob URL would leak. This effect
  // catches that case by revoking the current URL on unmount or when
  // the URL changes. The dismiss path also still revokes explicitly so
  // the cleanup is idempotent (double-revoke is a silent no-op).
  useEffect(() => {
    if (!gifReady?.url) return;
    const url = gifReady.url;
    return () => { try { URL.revokeObjectURL(url); } catch {} };
  }, [gifReady?.url]);

  if (!gifReady) return null;

  const dismiss = () => {
    try { URL.revokeObjectURL(gifReady.url); } catch {}
    setGifReady(null);
  };

  return (
    <div
      onClick={(e) => {
        // Click outside the card to dismiss (revoke the blob URL).
        if (e.target === e.currentTarget) dismiss();
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(8,6,20,0.85)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Bricolage Grotesque',sans-serif",
      }}
    >
      <div style={{
        background: "linear-gradient(135deg, #1A1830 0%, #0F0C1E 100%)",
        border: "1.5px solid rgba(232,201,152,0.45)",
        borderRadius: 8,
        padding: "32px 36px 28px",
        maxWidth: 480,
        boxShadow: "0 24px 70px rgba(0,0,0,0.7), 0 0 30px rgba(232,201,152,0.15)",
        color: "#ECEAF8",
      }}>
        <div style={{
          fontSize: 10, letterSpacing: "0.22em", color: "#E8C998",
          fontWeight: 600, marginBottom: 8,
        }}>
          GIF EXPORT READY
        </div>
        <div style={{
          fontSize: 22, fontFamily: "'Spectral',Georgia,serif",
          fontStyle: "italic", fontWeight: 500, marginBottom: 16,
          color: "#ECEAF8", letterSpacing: "-0.01em",
        }}>
          Your mission GIF is ready to download
        </div>
        <div style={{
          fontSize: 13, color: "#C0B8E8", lineHeight: 1.55, marginBottom: 18,
        }}>
          Your browser may have already started the download automatically.
          If not, click the button below to save the file.
        </div>
        <div style={{
          background: "rgba(168,168,240,0.08)",
          border: "1px solid rgba(168,168,240,0.2)",
          borderRadius: 4, padding: "10px 14px", marginBottom: 22,
          fontSize: 12, color: "#A8A8F0",
          fontFamily: "monospace",
          display: "flex", justifyContent: "space-between",
        }}>
          <span>{gifReady.filename}</span>
          <span style={{ color: "#8B86B0" }}>{(gifReady.size / 1024).toFixed(0)} KB</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <a
            href={gifReady.url}
            download={gifReady.filename}
            onClick={() => {
              // Auto-dismiss after they click the explicit download.
              setTimeout(dismiss, 1200);
            }}
            style={{
              flex: 1, textAlign: "center",
              background: "linear-gradient(135deg, rgba(232,201,152,0.25), rgba(232,201,152,0.10))",
              border: "1px solid rgba(232,201,152,0.6)",
              color: "#FFE8C0", borderRadius: 5,
              padding: "12px 18px", cursor: "pointer",
              fontSize: 13, fontFamily: "'Bricolage Grotesque',sans-serif",
              fontWeight: 700, letterSpacing: "0.05em",
              textDecoration: "none",
              boxShadow: "0 0 16px rgba(232,201,152,0.25)",
            }}
          >
            DOWNLOAD GIF
          </a>
          <button
            onClick={dismiss}
            style={{
              background: "transparent",
              border: "1px solid rgba(200,196,220,0.2)",
              color: "#8B86B0", borderRadius: 5,
              padding: "12px 18px", cursor: "pointer",
              fontSize: 13, fontFamily: "'Bricolage Grotesque',sans-serif",
              fontWeight: 500,
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
