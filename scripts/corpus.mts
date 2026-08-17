/**
 * `npm run corpus` — regenerate the committed corpora.
 *
 * The output is committed and the app imports it directly. Generating at
 * runtime would make the corpus a function of when the page loaded, and every
 * finding would inherit that.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generate, NORTHWIND, PINECREST } from "../data/generate";
import { parsePatient } from "../lib/diagnose/schema";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "data", "patients");
mkdirSync(out, { recursive: true });

for (const spec of [NORTHWIND, PINECREST]) {
  const patient = generate(spec);
  // Parse before writing: a corpus that cannot survive the trust boundary
  // should fail here, loudly, rather than at import time in a browser.
  const validated = parsePatient(patient);
  const path = join(out, `${spec.id}.json`);
  writeFileSync(path, JSON.stringify(patient) + "\n");

  const accounts = validated.records.filter((r) => r.object === "account").length;
  const contacts = validated.records.length - accounts;
  console.log(
    `${spec.id.padEnd(10)} ${String(accounts).padStart(5)} accounts  ${String(contacts).padStart(5)} contacts`,
  );
}
