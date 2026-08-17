/**
 * The corpora, parsed at import.
 *
 * `parsePatient` runs here rather than at the call site so a malformed corpus
 * fails the build. A diagnostic tool that boots on bad data and reports
 * confidently is the thing this repo is about.
 */

import { parsePatient } from "@/lib/diagnose/schema";
import type { Patient } from "@/lib/diagnose/types";
import northwindJson from "./patients/northwind.json";
import pinecrestJson from "./patients/pinecrest.json";

export const northwind: Patient = parsePatient(northwindJson);
export const pinecrest: Patient = parsePatient(pinecrestJson);

export const patients: readonly Patient[] = [northwind, pinecrest];

export function patientById(id: string): Patient {
  return patients.find((p) => p.id === id) ?? northwind;
}

export { registries } from "./registries";
