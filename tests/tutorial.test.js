// Tutorial content tests. The tour copy is the first thing a new workshop
// participant reads, so we validate it the way we validate the sim core:
// structurally, in isolation, with no DOM. These assert that every step is
// well-formed and that the copy obeys the project's voice rules (no em dashes,
// no "--" double-hyphens leaking from code comments into player-facing text).

import { test } from "node:test";
import assert from "node:assert/strict";

import { TUTORIAL_STEPS, TUTORIAL_STORAGE_KEY } from "../src/ui/tutorialContent.js";

test("tutorial: has a sensible number of steps", () => {
  assert.ok(TUTORIAL_STEPS.length >= 5 && TUTORIAL_STEPS.length <= 12,
    `expected 5-12 steps, got ${TUTORIAL_STEPS.length}`);
});

test("tutorial: storage key is a stable, versioned string", () => {
  assert.equal(typeof TUTORIAL_STORAGE_KEY, "string");
  assert.match(TUTORIAL_STORAGE_KEY, /^lps_tutorial_seen_v\d+$/);
});

test("tutorial: every step is well-formed", () => {
  for (const s of TUTORIAL_STEPS) {
    assert.ok(s.id && typeof s.id === "string", `step missing id: ${JSON.stringify(s)}`);
    assert.ok(s.glyph && typeof s.glyph === "string", `step ${s.id} missing glyph`);
    assert.ok(s.kicker && typeof s.kicker === "string", `step ${s.id} missing kicker`);
    assert.ok(s.title && typeof s.title === "string", `step ${s.id} missing title`);
    assert.ok(Array.isArray(s.body) && s.body.length >= 1, `step ${s.id} needs body paragraphs`);
    for (const p of s.body) {
      assert.ok(typeof p === "string" && p.trim().length > 0, `step ${s.id} has empty paragraph`);
    }
  }
});

test("tutorial: step ids are unique", () => {
  const ids = TUTORIAL_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate step ids");
});

test("tutorial: visible copy contains no em dashes (brand voice rule)", () => {
  for (const s of TUTORIAL_STEPS) {
    const strings = [s.kicker, s.title, ...s.body];
    if (s.formula) for (const row of s.formula) strings.push(...row.slice(1)); // skip sign glyph
    for (const str of strings) {
      assert.ok(!str.includes("\u2014"), `step ${s.id} copy contains an em dash: "${str}"`);
      assert.ok(!str.includes(" -- "), `step ${s.id} copy contains a "--" double hyphen: "${str}"`);
    }
  }
});

test("tutorial: the scoring step exposes the four score terms", () => {
  const score = TUTORIAL_STEPS.find((s) => s.id === "score");
  assert.ok(score, "no scoring step found");
  assert.ok(Array.isArray(score.formula) && score.formula.length === 4,
    "scoring step should list the four score terms");
  const signs = score.formula.map((r) => r[0]);
  assert.deepEqual(signs, ["+", "+", "+", "\u2212"],
    "scoring signs should be three additions and one subtraction");
});
