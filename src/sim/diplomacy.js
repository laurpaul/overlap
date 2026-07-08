// ── Diplomacy session ("Conference of Parties") ─────────────────────────────
//
// A timed, talk-only pause layered on top of the PLAYING phase. While a session
// is live the day clock and the facilitator's wall-clock round timer freeze and
// actors negotiate (deals, easements, zone resizes, grid sharing) through the
// existing negotiation panel, the whole point is to FORCE the interaction the
// exercise is built to teach. You can otherwise win the sandbox without ever
// talking to anyone; a convened session stops the clock and puts everyone at
// the table.
//
// This module is pure: timing + label helpers only. App.jsx owns the session
// state and the React effects that pause the sim and auto-end the session.

export const DIPLOMACY_DEFAULT_MS = 180_000; // 3-minute default session
export const DIPLOMACY_MIN_MS     = 30_000;  // floor so a session is meaningful
export const DIPLOMACY_MAX_MS     = 1_800_000; // 30-minute ceiling

// Create a session record. `convenedBy` is 0 | 1 (an actor moved to convene) or
// "facilitator" (the chair called the room to session).
export function conveneSession(round, opts = {}) {
  const {
    durationMs = DIPLOMACY_DEFAULT_MS,
    convenedBy = "facilitator",
    now = Date.now(),
  } = opts;
  const ms = Math.max(DIPLOMACY_MIN_MS, Math.min(DIPLOMACY_MAX_MS, durationMs));
  return {
    round,
    convenedBy,
    startedAt: now,
    until: now + ms,
    durationMs: ms,
    ended: false,
  };
}

// Whether a session is currently in effect (exists, not ended, time remaining).
export function sessionActive(session, now = Date.now()) {
  return !!session && !session.ended && session.until > now;
}

// Milliseconds left in the session (0 if none / ended / elapsed).
export function sessionTimeLeftMs(session, now = Date.now()) {
  if (!session || session.ended) return 0;
  return Math.max(0, session.until - now);
}

// Fraction of the session already elapsed, 0..1, for a progress ring/bar.
export function sessionProgress(session, now = Date.now()) {
  if (!session || !session.durationMs) return 1;
  const elapsed = now - session.startedAt;
  return Math.max(0, Math.min(1, elapsed / session.durationMs));
}

// "M:SS" countdown string from a millisecond remainder.
export function formatSessionClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Display name of whoever convened the session.
export function sessionConvenerLabel(session, nameFor = defaultNameFor) {
  if (!session) return "";
  if (session.convenedBy === 0 || session.convenedBy === 1) return nameFor(session.convenedBy);
  return "Facilitator";
}

function defaultNameFor(i) {
  return `Actor ${i === 0 ? "I" : "II"}`;
}

// Auto-convene cadence: given the round just STARTED and a cadence N (rounds),
// should a session open? N <= 0 disables it. Round 1 never auto-convenes (the
// game needs to get going first); after that, every Nth round triggers.
export function shouldAutoConvene(round, everyNRounds) {
  const n = Math.floor(everyNRounds || 0);
  if (n <= 0) return false;
  if (round <= 1) return false;
  return (round - 1) % n === 0;
}

// "Force interaction" gate: with `required` on, the exercise expects at least
// one session to have been held. Returns whether that's satisfied, DONE can
// surface a gentle note if not.
export function interactionSatisfied(sessionsHeld, required) {
  if (!required) return true;
  return (sessionsHeld || 0) >= 1;
}
