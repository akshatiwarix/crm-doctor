/**
 * The real boundary.
 *
 * `eslint.config.mjs` also enforces this, with an allowlist, so an editor
 * fails fast. This test reads the directory off disk and checks every import
 * with no allowlist at all, which is the version that cannot be silenced by
 * adding an entry to a config file.
 *
 * It is not tidiness. A diagnostic engine that cannot reach a network client
 * cannot emit a finding that is not a consequence of its arguments, and an
 * engine with no clock cannot emit a finding that depends on when it ran. The
 * sweep asserts the diagnosis is byte-identical across runs; this test is why
 * that assertion is possible to keep.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const engine = dirname(fileURLToPath(import.meta.url));

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sources(path);
    if (!path.endsWith(".ts")) return [];
    if (path.endsWith(".test.ts")) return [];
    return [path];
  });
}

const files = sources(engine);
const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;
const DYNAMIC = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const REQUIRE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

describe("engine purity", () => {
  it("finds the engine's source files", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it("imports zod and relative modules, and nothing else", () => {
    const offences: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const pattern of [IMPORT, DYNAMIC, REQUIRE]) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(source)) !== null) {
          const specifier = match[1];
          if (specifier === undefined) continue;
          if (specifier === "zod") continue;
          if (specifier.startsWith(".")) continue;
          offences.push(`${file.slice(engine.length + 1)} → ${specifier}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("contains no clock", () => {
    // ISO strings compared lexicographically are why this package needs no
    // date library. A `Date.now()` anywhere in here would make a finding a
    // function of when the page loaded.
    const offences: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      if (/\bDate\s*\.\s*now\b|\bnew\s+Date\b|\bperformance\s*\.\s*now\b/.test(stripped)) {
        offences.push(file.slice(engine.length + 1));
      }
    }
    expect(offences).toEqual([]);
  });

  it("touches no global that only exists in a browser or in node", () => {
    const offences: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      for (const global of ["window", "document", "localStorage", "process", "fetch("]) {
        if (source.includes(global)) offences.push(`${file.slice(engine.length + 1)} → ${global}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it("uses no randomness", () => {
    // The sweep's determinism check would catch this eventually. Catching it
    // here says which file.
    const offences = files.filter((file) =>
      readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "")
        .includes("Math.random"),
    );
    expect(offences).toEqual([]);
  });
});
