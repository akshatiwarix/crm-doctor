/**
 * The declared world: cohort dimensions, contradiction checks, mapping tables,
 * sentinel and reserved lists.
 *
 * All of it is data because all of it is a fact about a particular CRM rather
 * than a fact about diagnosis. The engine never names `industry` or `country`;
 * it reads these descriptors and interprets them. Adding a check is an edit
 * here, and the schema refuses any check that names a table which does not
 * exist — a check pointing at a missing table would silently never fire, which
 * is precisely the class of bug this repo exists to make visible elsewhere.
 */

import { parseRegistries } from "@/lib/diagnose/schema";

export const registries = parseRegistries({
  // Non-temporal, deliberately. Creation date is the onset axis, never a
  // cohort dimension — otherwise the same defect is reported twice wearing
  // different hats.
  dimensions: [
    { id: "owner", label: "Owner", key: "ownerId" },
    { id: "source", label: "Source", key: "sourceId" },
    { id: "batch", label: "Import batch", key: "importBatchId" },
    { id: "recordType", label: "Record type", key: "recordType" },
  ],

  checks: [
    {
      kind: "mismatch",
      id: "country-vs-phone",
      label: "Country disagrees with the dialling code",
      object: "account",
      scope: "record",
      left: { field: "country", derive: { via: "lookup", table: "country" } },
      right: { field: "phone", derive: { via: "prefix", table: "dial" } },
    },
    {
      kind: "ordering",
      id: "touch-order",
      label: "First touch after last activity",
      object: "account",
      earlier: "firstTouchAt",
      later: "lastActivityAt",
    },
    {
      kind: "band",
      id: "size-vs-revenue",
      label: "Headcount disagrees with revenue",
      object: "account",
      left: { field: "employees", table: "headcount" },
      right: { field: "revenue", table: "revenue" },
      // Everything plausible. A twelve-person company on £40m is not.
      compatible: [
        "small|low",
        "mid|low",
        "mid|mid",
        "large|mid",
        "large|high",
      ],
    },
    {
      kind: "mismatch",
      id: "contact-country-vs-account",
      label: "Contact country disagrees with its account",
      object: "contact",
      scope: "contactToAccount",
      left: { field: "country", derive: { via: "lookup", table: "country" } },
      right: { field: "country", derive: { via: "lookup", table: "country" } },
    },
    {
      kind: "mismatch",
      id: "contact-email-vs-account-domain",
      label: "Contact email is not at the account's domain",
      object: "contact",
      scope: "contactToAccount",
      left: { field: "email", derive: { via: "host" } },
      right: { field: "domain", derive: { via: "host" } },
    },
    {
      kind: "orphan",
      id: "contact-account",
      label: "Contact has a usable account",
      object: "contact",
      reference: "accountId",
    },
  ],

  tables: [
    {
      id: "country",
      entries: [
        { key: "united states", value: "US" },
        { key: "usa", value: "US" },
        { key: "united kingdom", value: "GB" },
        { key: "uk", value: "GB" },
        { key: "france", value: "FR" },
        { key: "germany", value: "DE" },
        { key: "netherlands", value: "NL" },
        { key: "australia", value: "AU" },
        { key: "india", value: "IN" },
      ],
    },
    {
      // Longest-prefix match, so `+1` and a hypothetical `+1809` can coexist.
      id: "dial",
      entries: [
        { key: "+1", value: "US" },
        { key: "+44", value: "GB" },
        { key: "+33", value: "FR" },
        { key: "+49", value: "DE" },
        { key: "+31", value: "NL" },
        { key: "+61", value: "AU" },
        { key: "+91", value: "IN" },
      ],
    },
  ],

  bands: [
    {
      id: "headcount",
      bands: [
        { min: 0, max: 49, value: "small" },
        { min: 50, max: 999, value: "mid" },
        { min: 1000, max: 10_000_000, value: "large" },
      ],
    },
    {
      id: "revenue",
      bands: [
        { min: 0, max: 5_000_000, value: "low" },
        { min: 5_000_001, max: 100_000_000, value: "mid" },
        { min: 100_000_001, max: 1_000_000_000_000, value: "high" },
      ],
    },
  ],

  // Meaningless in any field.
  sentinels: [
    "n/a",
    "na",
    "none",
    "null",
    "nil",
    "unknown",
    "tbd",
    "tba",
    "test",
    "testing",
    "do not use",
    "donotuse",
    "-",
    ".",
    "--",
    "???",
    "xxx",
    "no",
    "n.a.",
    "not available",
    "not provided",
  ],

  // Format-valid and reserved by standard. These pass every validator and
  // carry no information, which is exactly why they survive in a CRM for years.
  reserved: [
    "example.com",
    "example.org",
    "example.net",
    "test@test.com",
    "000-000-0000",
    "0000000000",
    "555-01",
    "123-456-7890",
    "1234567890",
    "noreply@",
    "no-reply@",
  ],
});
