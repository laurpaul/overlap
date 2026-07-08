#!/usr/bin/env node
// ── Lightweight, dependency-free source check ───────────────────────────────
//
// A real linter (eslint) is the right long-term tool, but it pulls a large
// dependency tree. This zero-dependency check catches the single most common
// drift this codebase actually accumulates: unused named imports (dead imports
// left behind when a refactor removes the last use). Run with `npm run lint`.
//
// It strips comments and strings before counting usages so commented-out
// example imports and string literals don't cause false positives, then reports
// any imported name that never appears in the module body. Exits non-zero if
// anything is found, so it can gate CI later if desired.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

// Remove // line comments, /* */ block comments, and string/template literals,
// so usage counting only sees real code tokens.
function stripNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")        // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")    // line comments (avoid http://)
    .replace(/`(?:\\.|[^`\\])*`/g, "``")       // template literals
    .replace(/'(?:\\.|[^'\\])*'/g, "''")       // single-quoted strings
    .replace(/"(?:\\.|[^"\\])*"/g, '""');      // double-quoted strings
}

// Pull named imports: import { a, b as c } from "x"
function namedImports(src) {
  const re = /import\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/g;
  const names = [];
  let m;
  while ((m = re.exec(src))) {
    for (let part of m[1].split(",")) {
      part = part.replace(/\/\/.*$/, "").trim();
      if (!part) continue;
      const local = part.split(/\s+as\s+/).pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(local)) names.push(local);
    }
  }
  return names;
}

let findings = 0;
for (const file of walk(ROOT)) {
  const raw = readFileSync(file, "utf8");
  const code = stripNonCode(raw);            // strip comments/strings FIRST
  const names = namedImports(code);          // so commented-out imports are ignored
  if (!names.length) continue;
  // Body = code with the import statements themselves removed.
  const body = code.replace(/import\s*\{[^}]*\}\s*from\s*["'][^"']+["']/g, " ");
  for (const n of names) {
    const re = new RegExp("\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
    if (!re.test(body)) {
      console.log(`${file}: unused import '${n}'`);
      findings++;
    }
  }
}

if (findings) {
  console.log(`\n${findings} unused import(s) found.`);
  process.exit(1);
} else {
  console.log("lint: no unused named imports in src/.");
}
