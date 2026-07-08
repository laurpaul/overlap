// ─────────────────────────────────────────────────────────────────────────────
// Lobby UI -- host / join + role selection.
// Themed in The Both palette.
// v27 layout: two-column 16:9-optimised, left panel (header + roles + brief),
// right panel (name / connection / actions). No scrolling on a 1280×720 screen.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { defaultServerURL } from "./multiplayer";

const SEAT_LABEL = { 0: "Facilitator", 1: "Actor I", 2: "Actor II" };
const SEAT_COLOR = { 0: "var(--blue-lavender)", 1: "var(--p1)", 2: "var(--p2)" };

// ── Player briefs ──────────────────────────────────────────────────────────
const BRIEFS = {
  1: {
    name: "Actor I",
    flag: "First-mover · early arrival",
    body: (
      <>
        <p>
          You represent the <em>first-mover</em> party to deploy infrastructure
          in the Shackleton south polar region. Your early arrival affords you
          the pick of ridge-top solar exposure and the closest staging to the
          richest permanently-shadowed crater volatiles.
        </p>
        <p>
          But early-arrival advantage erodes. You'll be expected to defend
          your stake, decide whether to share grid power with Actor II when
          they appear, and weigh aggressive extraction against long-run
          crater depletion. Your decisions set the precedent for whatever
          governance regime emerges from this workshop.
        </p>
        <p style={{ color: "var(--text-mid)", fontStyle: "italic", marginTop: 10 }}>
          You control rovers, builds, and grid-sharing offers for Actor I.
          Your laptop will only show your own detailed asset state; Actor II's
          full plan is private.
        </p>
      </>
    ),
  },
  2: {
    name: "Actor II",
    flag: "Late arrival · catching up",
    body: (
      <>
        <p>
          You represent a party arriving after Actor I has already begun
          extraction. The choice prime sites may be taken; ridge-top sunlight
          near the rim is contested. You will need to decide quickly between
          a coexistence posture (request grid-share, accept reduced PSR
          access) and an assertive posture (claim contested ground, defend
          with safety zones).
        </p>
        <p>
          Watch the depletion of craters carefully. Late entry under
          aggressive first-mover extraction can leave little ice to recover.
          Cooperative regimes favour you; first-mover regimes do not.
        </p>
        <p style={{ color: "var(--text-mid)", fontStyle: "italic", marginTop: 10 }}>
          You control rovers, builds, and grid-sharing acceptance for Actor II.
          Your laptop will only show your own detailed asset state; Actor I's
          full plan is private.
        </p>
      </>
    ),
  },
  0: {
    name: "Facilitator",
    flag: "Workshop facilitator · god view",
    body: (
      <>
        <p>
          You are the workshop facilitator. Your view is unrestricted: you
          see both actors' full asset state, grid configurations, depletion
          rates, and the live mission log. You manage the pace of the
          workshop: when to pause for discussion, when to advance the next
          round, and which decision-points warrant a deeper conversation.
        </p>
        <p>
          If a participant needs help operating their actor (or stalls
          indefinitely), you can <em>override</em> them, temporarily acting as
          their actor to keep the session moving. Use sparingly; it is
          better that participants own their choices.
        </p>
        <p style={{ color: "var(--text-mid)", fontStyle: "italic", marginTop: 10 }}>
          The settings screen and physics-overrides panel are at your
          disposal. Multiple facilitators can co-observe the same room.
        </p>
      </>
    ),
  },
};

export function LobbyScreen({ mp, onPlaySolo }) {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [serverURL, setServerURLLocal] = useState(mp.serverURL || defaultServerURL());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chosenRole, setChosenRole] = useState(null); // 1 | 2 | 0 | null

  // v110: do NOT auto-connect to the relay on mount. Solo play (the common
  // case, and what a new visitor tries first) does not need the multiplayer
  // server, and eagerly opening a socket here spammed the console with
  // WebSocket connection errors whenever the relay was not running. The
  // connection is now established lazily by mp.host()/mp.join() when the user
  // actually chooses a multiplayer action.
  useEffect(() => {
    mp.setServerURL(serverURL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inRoom = mp.status === "hosting" || mp.status === "joined";

  return (
    <div style={S.wrap}>
      <div style={S.starsLayer} />

      <div style={S.outerCard}>
        {/* ── LEFT PANEL: brand + roles + brief ─────────────────────────── */}
        <div style={S.leftPanel}>
          <header style={S.header}>
            <div style={S.eyebrow}>OPEN LUNAR FOUNDATION · MULTIPLAYER</div>
            <h1 style={S.title}>
              <span style={S.titleItal}>Lunar</span> Policy Sandbox
            </h1>
            <div style={S.subtitle}>
              Multiple laptops, one shared workshop. Pick a role, then host a
              new session or join an existing one with a 4-character code.
            </div>
          </header>

          {!inRoom && (
            <>
              <div style={S.sectionLabel}>CHOOSE YOUR ROLE</div>
              <div style={S.roleGrid}>
                {[1, 2, 0].map((r) => {
                  const active = chosenRole === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setChosenRole(r)}
                      style={{
                        ...S.roleCard,
                        borderColor: active ? SEAT_COLOR[r] : "var(--border-soft)",
                        background: active
                          ? `linear-gradient(135deg, ${SEAT_COLOR[r]}22 0%, ${SEAT_COLOR[r]}08 100%)`
                          : "var(--bg-elevated)",
                        boxShadow: active ? `0 0 16px ${SEAT_COLOR[r]}33, inset 0 1px 0 rgba(236,234,248,0.05)` : "none",
                      }}
                    >
                      <div style={{
                        fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em",
                        color: active ? SEAT_COLOR[r] : "var(--text-mid)",
                        marginBottom: 6,
                      }}>{r === 0 ? "FACILITATOR" : `ACTOR ${"I".repeat(r)}`}</div>
                      <div style={{
                        fontFamily: "var(--serif)", fontSize: 14, fontWeight: 500,
                        color: active ? "var(--text-hi)" : "var(--text-bright)",
                        fontStyle: "italic", marginBottom: 4,
                      }}>{SEAT_LABEL[r]}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-mid)", lineHeight: 1.45 }}>
                        {r === 1 && "First-mover. Pick of prime sites, defends precedent."}
                        {r === 2 && "Late arrival. Cooperates or contests."}
                        {r === 0 && "God view. Drives pacing, can override actors."}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Role brief, always visible in left panel when role is chosen */}
              {chosenRole !== null && (
                <RoleBrief role={chosenRole} />
              )}

              {/* Abstract, always visible */}
              <div style={{
                marginTop: 14,
                borderTop: "1px solid var(--border-faint)",
                paddingTop: 12,
              }}>
                <div style={{
                  fontFamily: "var(--sans)", fontSize: 10, letterSpacing: "0.18em",
                  color: "var(--text-mid)", fontWeight: 500, textTransform: "uppercase",
                  marginBottom: 10,
                }}>Abstract</div>
                <div style={{
                  fontFamily: "var(--serif)", fontSize: 12.5, color: "var(--text-bright)",
                  lineHeight: 1.65, fontWeight: 300,
                }}>
                  <p style={{ marginBottom: 9 }}>
                    The lunar south pole's permanently shadowed regions hold the most
                    accessible water ice in the inner solar system, and the next decade
                    of missions will arrive faster than the governance frameworks meant
                    to mediate their interactions.
                  </p>
                  <p style={{ marginBottom: 9 }}>
                    This sandbox lets workshop participants explore how{" "}
                    <span style={{ fontStyle: "normal", fontWeight: 500, color: "var(--text-hi)" }}>Designated Lunar Area</span>{" "}
                    policy regimes shape outcomes when two stakeholders share a crater
                    system: safety buffers, shared power grids, asymmetric arrival timing,
                    and the{" "}
                    <span style={{ fontStyle: "normal", fontWeight: 500, color: "var(--text-hi)" }}>if/then</span>{" "}
                    decision toolkit at the heart of the Open Lunar fellowship work.
                  </p>
                  <p style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 10,
                    paddingTop: 10, borderTop: "1px solid var(--border-faint)" }}>
                    Built on LOLA topography, Mazarico illumination data, and the Cannon &amp; Britt
                    volatile distribution.
                  </p>
                </div>
              </div>
            </>
          )}

          {inRoom && <RoomBrief mp={mp} />}
        </div>

        {/* ── DIVIDER ────────────────────────────────────────────────────── */}
        <div style={S.panelDivider} />

        {/* ── RIGHT PANEL: name / status / actions ──────────────────────── */}
        <div style={S.rightPanel}>
          {!inRoom && (
            <>
              <FieldRow label="Your name">
                <input
                  style={S.input}
                  value={name}
                  placeholder="Your name"
                  onChange={(e) => setName(e.target.value)}
                  maxLength={32}
                />
              </FieldRow>

              <div style={S.statusLine}>
                <StatusDot status={mp.status} />
                <span style={{ marginLeft: 8 }}>{statusText(mp.status, serverURL)}</span>
                {mp.status === "error" && (
                  <button style={S.linkBtn} onClick={() => mp.connect(serverURL)}>Retry</button>
                )}
              </div>

              {mp.errorMsg && <div style={S.errorBox}>{mp.errorMsg}</div>}

              {chosenRole === null && (
                <div style={S.helperNote}>← Pick a role to enable hosting or joining.</div>
              )}

              <div style={S.actionStack}>
                <button
                  style={{
                    ...S.primaryBtn,
                    opacity: chosenRole === null ? 0.45 : 1,
                    cursor: chosenRole === null ? "not-allowed" : "pointer",
                  }}
                  disabled={(mp.status !== "lobby" && mp.status !== "offline") || chosenRole === null}
                  onClick={() => mp.host(name || "Host", chosenRole)}
                >
                  <div style={S.btnTitle}>Host a workshop</div>
                  <div style={S.btnSubtitle}>
                    Your laptop runs the simulation. You'll get a 4-character
                    code to share with peers on this Wi-Fi.
                  </div>
                </button>

                <div style={S.joinBlock}>
                  <input
                    style={{ ...S.input, ...S.codeInput }}
                    value={joinCode}
                    placeholder="CODE"
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={4}
                  />
                  <button
                    style={{
                      ...S.primaryBtn,
                      ...S.secondaryBtn,
                      opacity: chosenRole === null ? 0.45 : 1,
                      cursor: chosenRole === null ? "not-allowed" : "pointer",
                    }}
                    disabled={(mp.status !== "lobby" && mp.status !== "offline") || joinCode.length !== 4 || chosenRole === null}
                    onClick={() => mp.join(joinCode, name || "Peer", chosenRole)}
                  >
                    <div style={S.btnTitle}>Join with code</div>
                    <div style={S.btnSubtitle}>
                      Enter the 4-character code shown on the host's screen.
                    </div>
                  </button>
                </div>
              </div>

              <div style={S.divider}>
                <span style={S.dividerLine} />
                <span style={S.dividerLabel}>or</span>
                <span style={S.dividerLine} />
              </div>

              <button style={S.ghostBtn} onClick={onPlaySolo}>
                Continue solo · skip the lobby
              </button>

              <div style={S.advancedToggle}>
                <button style={S.linkBtnInline} onClick={() => setShowAdvanced((v) => !v)}>
                  {showAdvanced ? "Hide" : "Show"} relay settings
                </button>
              </div>
              {showAdvanced && (
                <FieldRow label="Relay server URL">
                  <input
                    style={S.input}
                    value={serverURL}
                    onChange={(e) => setServerURLLocal(e.target.value)}
                    onBlur={() => {
                      mp.setServerURL(serverURL);
                      mp.connect(serverURL);
                    }}
                  />
                  <div style={S.advHint}>
                    Defaults to the host you opened this from, port 8787.
                  </div>
                </FieldRow>
              )}
            </>
          )}

          {inRoom && <RoomPanel mp={mp} />}
        </div>
      </div>

      <footer style={S.footer}>
        Built on LunarAreasESPL · Vic Paulson, Open Lunar Foundation Fellowship 2026
      </footer>
    </div>
  );
}

// ── Role brief (no dismiss button, always visible while role is selected) ──
function RoleBrief({ role }) {
  const b = BRIEFS[role];
  if (!b) return null;
  return (
    <div style={{
      marginTop: 16,
      padding: "16px 18px",
      background: "var(--bg-elevated)",
      border: `1px solid ${SEAT_COLOR[role]}55`,
      borderLeft: `3px solid ${SEAT_COLOR[role]}`,
      borderRadius: 4,
      animation: "fadeIn 0.25s ease-out",
      flex: 1,
      overflow: "auto",
    }}>
      <div style={{
        fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em",
        color: SEAT_COLOR[role], fontWeight: 600, marginBottom: 6,
      }}>PARTICIPANT BRIEF</div>
      <div style={{
        fontFamily: "var(--serif)", fontSize: 15, fontWeight: 500,
        color: "var(--text-hi)", fontStyle: "italic", marginBottom: 10,
      }}>
        {b.name}{" "}
        <span style={{ color: "var(--text-mid)", fontWeight: 300, fontSize: 12 }}>
          · {b.flag}
        </span>
      </div>
      <div style={{
        fontFamily: "var(--serif)", fontSize: 12.5, color: "var(--text-bright)",
        lineHeight: 1.65, fontWeight: 300,
      }}>
        {b.body}
      </div>
    </div>
  );
}

// ── Room brief shown in left panel once inside a room ──────────────────────
function RoomBrief({ mp }) {
  const youSeat = mp.you?.seat;
  const youBrief = BRIEFS[youSeat];
  if (!youBrief) return null;
  return (
    <div style={{
      marginTop: 16, flex: 1, overflow: "auto",
      padding: "16px 18px",
      background: `linear-gradient(135deg, ${SEAT_COLOR[youSeat]}18 0%, ${SEAT_COLOR[youSeat]}06 100%)`,
      border: `1px solid ${SEAT_COLOR[youSeat]}44`,
      borderLeft: `3px solid ${SEAT_COLOR[youSeat]}`,
      borderRadius: 4,
    }}>
      <div style={{
        fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em",
        color: SEAT_COLOR[youSeat], fontWeight: 600, marginBottom: 4,
      }}>YOU ARE</div>
      <div style={{
        fontFamily: "var(--serif)", fontSize: 18, fontWeight: 500,
        color: "var(--text-hi)", fontStyle: "italic", marginBottom: 10,
      }}>{youBrief.name}</div>
      <div style={{
        fontFamily: "var(--serif)", fontSize: 12.5,
        color: "var(--text-bright)", lineHeight: 1.6, fontWeight: 300,
      }}>
        {youBrief.body}
      </div>
    </div>
  );
}

// ── Room panel (right side once inside a room) ─────────────────────────────
function RoomPanel({ mp }) {
  const canReassign = (memberId) => mp.isHost || memberId === mp.you?.id;

  return (
    <div style={S.roomPanel}>
      <div style={S.codeDisplay}>
        <div style={S.codeEyebrow}>ROOM CODE</div>
        <div style={S.codeBig}>{mp.roomCode}</div>
        <div style={S.codeHint}>
          Peers join from the Vite Network URL and enter this code.
        </div>
      </div>

      <div style={S.memberList}>
        <div style={S.memberHeader}>Connected · {mp.members.length}</div>
        {mp.members.map((m) => (
          <div key={m.id} style={S.memberRow}>
            <span style={{ ...S.memberDot, background: SEAT_COLOR[m.seat] || "var(--text-dim)" }} />
            <span style={S.memberName}>
              {m.name}
              {m.id === mp.you?.id && <span style={S.youTag}> (you)</span>}
              {mp.isHost && m.id === mp.you?.id && <span style={S.hostTag}> · host</span>}
            </span>
            {canReassign(m.id) ? (
              <select
                value={m.seat}
                onChange={(e) => mp.setRole(+e.target.value, m.id === mp.you?.id ? null : m.id)}
                style={{
                  ...S.seatSelect,
                  color: SEAT_COLOR[m.seat] || "var(--text-bright)",
                  borderColor: `${SEAT_COLOR[m.seat] || "var(--border-soft)"}66`,
                }}
              >
                <option value={1}>Actor I</option>
                <option value={2}>Actor II</option>
                <option value={0}>Facilitator</option>
              </select>
            ) : (
              <span style={{ ...S.memberSeat, color: SEAT_COLOR[m.seat] || "var(--accent)" }}>
                {SEAT_LABEL[m.seat] || `Seat ${m.seat}`}
              </span>
            )}
          </div>
        ))}
        {mp.members.length < 2 && (
          <div style={S.waitingNote}>
            Waiting for {2 - mp.members.length} more participant{2 - mp.members.length === 1 ? "" : "s"}…
          </div>
        )}
      </div>

      <div style={S.roomActions}>
        {mp.isHost ? (
          <button
            style={S.primaryBtn}
            onClick={() => window.dispatchEvent(new CustomEvent("mp:start-workshop"))}
          >
            <div style={S.btnTitle}>
              Begin workshop {mp.members.length < 2 && "· solo dry-run"}
            </div>
            <div style={S.btnSubtitle}>
              Move on to the scenario settings. Peers will follow automatically.
              {mp.members.length < 2 && " You can start solo and have peers join mid-workshop."}
            </div>
          </button>
        ) : (
          <div style={S.waitingForHost}>
            <em>Waiting for the host to begin…</em>
          </div>
        )}
        <button style={S.ghostBtn} onClick={() => mp.leave()}>Leave room</button>
      </div>
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <label style={S.fieldRow}>
      <span style={S.fieldLabel}>{label}</span>
      <div style={{ width: "100%" }}>{children}</div>
    </label>
  );
}

function StatusDot({ status }) {
  const color =
    status === "lobby" ? "var(--success)" :
    status === "connecting" ? "var(--warning)" :
    status === "hosting" || status === "joined" ? "var(--periwinkle)" :
    status === "error" ? "var(--danger)" :
    "var(--text-dim)";
  return (
    <span style={{
      display: "inline-block",
      width: 8, height: 8, borderRadius: "50%",
      background: color, boxShadow: `0 0 8px ${color}`,
    }} />
  );
}

function statusText(status, url) {
  switch (status) {
    case "offline": return "Not connected to relay.";
    case "connecting": return `Connecting to ${url}…`;
    case "lobby": return `Connected to ${url}.`;
    case "hosting": return "Hosting · workshop room open.";
    case "joined": return "Joined the workshop.";
    case "error": return "Could not reach the relay.";
    default: return status;
  }
}

const S = {
  // ── Outer shell ───────────────────────────────────────────────────────────
  wrap: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 32px",
    position: "relative",
    overflow: "hidden",
  },
  starsLayer: {
    position: "absolute", inset: 0, pointerEvents: "none",
    backgroundImage: `
      radial-gradient(1px 1px at 12% 22%, rgba(236,234,248,0.85), transparent),
      radial-gradient(1.5px 1.5px at 78% 18%, rgba(168,168,240,0.7), transparent),
      radial-gradient(1px 1px at 33% 75%, rgba(200,196,220,0.7), transparent),
      radial-gradient(1px 1px at 88% 60%, rgba(236,234,248,0.65), transparent),
      radial-gradient(1.5px 1.5px at 56% 38%, rgba(168,168,240,0.55), transparent),
      radial-gradient(1px 1px at 22% 92%, rgba(236,234,248,0.5), transparent)
    `,
    backgroundSize: "100% 100%", opacity: 0.85,
  },

  // ── Two-column card ───────────────────────────────────────────────────────
  outerCard: {
    position: "relative",
    width: "min(1200px, 96vw)",
    // Aim for ~16:9 feel: fixed height relative to width, capped so it fits
    // comfortably on a 720p screen without scrolling.
    maxHeight: "calc(100vh - 80px)",
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    background: "var(--bg-panel)",
    border: "1px solid var(--border-soft)",
    borderRadius: 6,
    backdropFilter: "blur(12px)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(236,234,248,0.06)",
    overflow: "hidden",
  },

  // ── Left panel ────────────────────────────────────────────────────────────
  leftPanel: {
    padding: "40px 44px 36px",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    minWidth: 0,
  },

  // ── Vertical divider ──────────────────────────────────────────────────────
  panelDivider: {
    width: 1,
    background: "var(--border-soft)",
    margin: "32px 0",
    alignSelf: "stretch",
    flex: "0 0 1px",
  },

  // ── Right panel ───────────────────────────────────────────────────────────
  rightPanel: {
    padding: "40px 44px 36px",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    minWidth: 0,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: { marginBottom: 24 },
  eyebrow: {
    fontFamily: "var(--sans)", fontSize: 10, letterSpacing: "0.22em",
    color: "var(--text-mid)", fontWeight: 500, marginBottom: 12,
  },
  title: {
    fontFamily: "var(--serif)", fontSize: 38, fontWeight: 300,
    lineHeight: 1.05, color: "var(--text-hi)",
    letterSpacing: "-0.01em", marginBottom: 12,
  },
  titleItal: { fontStyle: "italic", fontWeight: 300, color: "var(--periwinkle)" },
  subtitle: {
    fontFamily: "var(--serif)", fontSize: 13.5, fontStyle: "italic",
    fontWeight: 300, color: "var(--text-bright)",
    lineHeight: 1.55,
  },

  // ── Role grid ─────────────────────────────────────────────────────────────
  sectionLabel: {
    fontFamily: "var(--sans)", fontSize: 10, letterSpacing: "0.18em",
    color: "var(--text-mid)", fontWeight: 500, marginBottom: 10,
  },
  roleGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10,
  },
  roleCard: {
    padding: "13px 13px 12px", borderRadius: 4,
    border: "1px solid var(--border-soft)", cursor: "pointer",
    textAlign: "left", color: "var(--text-bright)",
    transition: "all 0.18s", background: "var(--bg-elevated)",
  },

  // ── Right panel fields ────────────────────────────────────────────────────
  fieldRow: {
    display: "flex", flexDirection: "column", gap: 6, marginBottom: 14,
  },
  fieldLabel: {
    fontFamily: "var(--sans)", fontSize: 10.5, letterSpacing: "0.14em",
    color: "var(--text-mid)", fontWeight: 500, textTransform: "uppercase",
  },
  input: {
    width: "100%", padding: "10px 14px", boxSizing: "border-box",
    background: "var(--bg-elevated)", border: "1px solid var(--border-soft)",
    borderRadius: 4, color: "var(--text-hi)", fontSize: 14,
    fontFamily: "var(--sans)", fontWeight: 400, outline: "none",
    transition: "border-color 0.15s",
  },
  codeInput: {
    fontFamily: "var(--mono)", fontWeight: 600,
    letterSpacing: "0.32em", textAlign: "center",
    fontSize: 20, textTransform: "uppercase",
    width: 100, flex: "0 0 100px",
  },

  // ── Status ────────────────────────────────────────────────────────────────
  statusLine: {
    display: "flex", alignItems: "center",
    fontSize: 11.5, color: "var(--text-bright)",
    marginBottom: 12, fontFamily: "var(--sans)",
  },
  errorBox: {
    padding: "10px 14px", background: "var(--danger-soft)",
    border: "1px solid rgba(232,155,181,0.35)", borderRadius: 4,
    color: "var(--danger)", fontSize: 12.5,
    fontFamily: "var(--sans)", marginBottom: 14,
  },
  helperNote: {
    fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 12,
    color: "var(--text-mid)", marginBottom: 12,
  },

  // ── Action buttons ────────────────────────────────────────────────────────
  actionStack: { display: "flex", flexDirection: "column", gap: 12 },
  joinBlock: { display: "flex", gap: 10, alignItems: "stretch" },
  primaryBtn: {
    flex: 1,
    background: "linear-gradient(135deg, rgba(46,32,104,0.5) 0%, rgba(52,96,168,0.32) 100%)",
    border: "1px solid var(--border-strong)", color: "var(--text-hi)",
    padding: "14px 18px", borderRadius: 4, cursor: "pointer",
    textAlign: "left", transition: "all 0.18s",
  },
  secondaryBtn: {
    background: "linear-gradient(135deg, rgba(52,96,168,0.32) 0%, rgba(128,176,216,0.18) 100%)",
  },
  btnTitle: {
    fontFamily: "var(--serif)", fontSize: 14, fontWeight: 500,
    color: "var(--text-hi)", marginBottom: 3,
  },
  btnSubtitle: {
    fontFamily: "var(--sans)", fontSize: 11, fontWeight: 300,
    color: "var(--text-bright)", lineHeight: 1.5,
  },

  // ── Divider + solo ────────────────────────────────────────────────────────
  divider: {
    margin: "20px 0 14px", display: "flex", alignItems: "center", gap: 10,
  },
  dividerLine: {
    flex: 1, height: 1, background: "var(--border-faint)",
  },
  dividerLabel: {
    fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 12,
    color: "var(--text-mid)", flex: "0 0 auto",
  },
  ghostBtn: {
    width: "100%", background: "transparent",
    border: "1px solid var(--border-soft)", color: "var(--text-bright)",
    padding: "10px 16px", borderRadius: 4, cursor: "pointer",
    fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 400,
    letterSpacing: "0.04em",
  },

  // ── Misc ──────────────────────────────────────────────────────────────────
  linkBtn: {
    marginLeft: 10, background: "transparent", border: "none",
    color: "var(--periwinkle)", textDecoration: "underline",
    cursor: "pointer", fontSize: 12, fontFamily: "var(--sans)",
  },
  linkBtnInline: {
    background: "transparent", border: "none",
    color: "var(--text-mid)", cursor: "pointer",
    fontSize: 11, fontFamily: "var(--sans)", fontStyle: "italic", padding: 0,
  },
  advancedToggle: { marginTop: 16, textAlign: "center" },
  advHint: {
    fontSize: 10.5, color: "var(--text-dim)", marginTop: 6,
    fontFamily: "var(--serif)", fontStyle: "italic",
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    marginTop: 18, fontSize: 10.5, color: "var(--text-dim)",
    fontFamily: "var(--serif)", fontStyle: "italic",
    letterSpacing: "0.02em", position: "relative",
  },

  // ── Room panel (right side, in-room state) ─────────────────────────────
  roomPanel: { display: "flex", flexDirection: "column", gap: 16 },
  codeDisplay: {
    textAlign: "center", padding: "20px",
    background: "var(--bg-elevated)", border: "1px solid var(--border-soft)",
    borderRadius: 6,
  },
  codeEyebrow: {
    fontSize: 10, letterSpacing: "0.22em", color: "var(--text-mid)",
    fontWeight: 500, marginBottom: 8, fontFamily: "var(--sans)",
  },
  codeBig: {
    fontFamily: "var(--mono)", fontWeight: 700, fontSize: 48,
    letterSpacing: "0.18em", color: "var(--periwinkle)",
    textShadow: "0 0 24px rgba(168,168,240,0.45)", marginBottom: 8,
  },
  codeHint: {
    fontSize: 11.5, color: "var(--text-bright)",
    fontFamily: "var(--serif)", fontStyle: "italic", lineHeight: 1.5,
  },
  memberList: { display: "flex", flexDirection: "column", gap: 8 },
  memberHeader: {
    fontSize: 10, letterSpacing: "0.22em", color: "var(--text-mid)",
    fontWeight: 500, fontFamily: "var(--sans)", marginBottom: 4,
  },
  memberRow: {
    display: "flex", alignItems: "center", padding: "9px 14px",
    background: "var(--bg-elevated)", border: "1px solid var(--border-faint)",
    borderRadius: 4, gap: 10,
  },
  memberDot: { width: 8, height: 8, borderRadius: "50%", flex: "0 0 auto" },
  memberName: { flex: 1, fontFamily: "var(--sans)", fontSize: 13, color: "var(--text-hi)" },
  youTag: {
    color: "var(--text-mid)", fontStyle: "italic",
    fontFamily: "var(--serif)", fontSize: 11, marginLeft: 2,
  },
  hostTag: {
    color: "var(--blue-lavender)", fontStyle: "italic",
    fontFamily: "var(--serif)", fontSize: 11, marginLeft: 2,
  },
  memberSeat: {
    fontFamily: "var(--sans)", fontSize: 11,
    letterSpacing: "0.1em", fontWeight: 500,
  },
  seatSelect: {
    background: "var(--bg-panel-solid)",
    border: "1px solid var(--border-soft)",
    borderRadius: 3, padding: "4px 8px",
    fontFamily: "var(--sans)", fontSize: 11, fontWeight: 500,
    cursor: "pointer", outline: "none",
  },
  waitingNote: {
    fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 12,
    color: "var(--text-mid)", textAlign: "center", padding: "8px 0",
  },
  roomActions: { display: "flex", flexDirection: "column", gap: 10 },
  waitingForHost: {
    padding: "16px 14px", background: "var(--bg-elevated)",
    border: "1px solid var(--border-faint)", borderRadius: 4,
    textAlign: "center", color: "var(--text-bright)",
    fontFamily: "var(--serif)", fontSize: 13.5,
  },
};
