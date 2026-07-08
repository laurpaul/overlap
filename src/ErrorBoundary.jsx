import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, showDetails: false };
  }
  componentDidCatch(error, info) {
    this.setState({ error, info });
    console.error("[ErrorBoundary] Render crash:", error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;

    // Two audiences: a workshop participant who needs reassurance and
    // a "back to safety" button, and the facilitator or developer who
    // needs the stack to debug. Default view is calm and minimal;
    // technical details are behind a disclosure so the participant
    // isn't staring at a wall of stack-trace text mid-session.
    const { showDetails, error, info } = this.state;
    return (
      <div style={{
        position: "fixed", inset: 0,
        background: "linear-gradient(135deg, #141220 0%, #201E40 100%)",
        color: "#ECEAF8",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 32, fontFamily: "'Spectral', Georgia, serif",
        zIndex: 9999,
      }}>
        <div style={{
          maxWidth: 560,
          background: "rgba(20,18,40,0.85)",
          border: "1px solid rgba(168,168,240,0.28)",
          borderLeft: "3px solid #A8A8F0",
          borderRadius: 8,
          padding: "32px 36px",
          boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
        }}>
          <div style={{
            fontSize: 10, letterSpacing: "0.24em", color: "#A8A8F0",
            fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 500,
            textTransform: "uppercase", marginBottom: 14,
          }}>
            Something glitched
          </div>
          <h2 style={{
            fontSize: 26, fontStyle: "italic", fontWeight: 300,
            color: "#ECEAF8", margin: "0 0 14px 0", letterSpacing: "-0.01em",
          }}>
            The simulation hit an unexpected state.
          </h2>
          <p style={{
            color: "#C0B8E8", fontSize: 15, lineHeight: 1.55,
            margin: "0 0 20px 0",
          }}>
            Your session and mission log are still intact. Click <em>resume</em> below
            to keep going. If this keeps happening on the same action, let your
            facilitator know. The error report below will help diagnose it.
          </p>
          <div style={{ fontSize: 10, color: "#3A3658", marginBottom: 14, fontFamily: "'Bricolage Grotesque', sans-serif" }}>
            v2.7.67
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => this.setState({ error: null, info: null, showDetails: false })}
              style={{
                background: "linear-gradient(180deg, rgba(168,168,240,0.22), rgba(168,168,240,0.08))",
                border: "1px solid rgba(168,168,240,0.55)",
                color: "#ECEAF8",
                fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 500,
                fontSize: 13, letterSpacing: "0.05em",
                padding: "10px 22px", borderRadius: 5, cursor: "pointer",
              }}
            >
              Resume session
            </button>
            <button
              onClick={() => this.setState({ showDetails: !showDetails })}
              style={{
                background: "transparent",
                border: "1px solid rgba(200,196,220,0.18)",
                color: "#8B86B0",
                fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 12,
                padding: "10px 16px", borderRadius: 5, cursor: "pointer",
              }}
            >
              {showDetails ? "Hide details" : "Show technical details"}
            </button>
          </div>

          {showDetails && (
            <div style={{
              marginTop: 22, paddingTop: 18,
              borderTop: "1px solid rgba(200,196,220,0.10)",
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            }}>
              <div style={{
                fontSize: 9, letterSpacing: "0.2em", color: "#5A567A",
                fontFamily: "'Bricolage Grotesque', sans-serif",
                textTransform: "uppercase", marginBottom: 8,
              }}>
                Error
              </div>
              <pre style={{
                color: "#E89BB5", fontSize: 12, lineHeight: 1.5,
                margin: "0 0 14px 0", whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>{error?.toString()}</pre>
              <div style={{
                fontSize: 9, letterSpacing: "0.2em", color: "#5A567A",
                fontFamily: "'Bricolage Grotesque', sans-serif",
                textTransform: "uppercase", marginBottom: 8,
              }}>
                Component stack
              </div>
              <pre style={{
                color: "#8B86B0", fontSize: 11, lineHeight: 1.5,
                margin: 0, whiteSpace: "pre-wrap",
                maxHeight: 180, overflowY: "auto",
              }}>{info?.componentStack || "(unavailable)"}</pre>
            </div>
          )}
        </div>
      </div>
    );
  }
}

