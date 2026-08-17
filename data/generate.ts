/**
 * The corpus generator.
 *
 * This file is the written specification of every planted pathology. The test
 * suite asserts that the analyser finds what is planted here, so if the
 * planting and the finding ever disagree, one of them is wrong and the diff
 * says which. That is the only thing keeping a synthetic corpus from being a
 * circular argument.
 *
 * It runs once, via `npm run corpus`, and its output is committed. The app
 * never generates at runtime.
 *
 * Structure: generate a clean, plausible org first, then apply each pathology
 * as a named mutation pass. Reading the passes in order is reading the
 * diagnosis the console is supposed to reach.
 *
 * Everything is synthetic. Every domain ends in `.example`; no real company,
 * person or email address is described.
 */

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

/** mulberry32. Seeded, tiny, and identical across platforms — which is what
 *  makes the committed corpus reproducible from this file. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Days since 1970-01-01 → ISO date, by Howard Hinnant's civil-from-days.
 * Written out rather than reached for `Date` so the corpus does not depend on
 * the timezone of the machine that generated it.
 */
function isoFromDay(z: number): string {
  let d = z + 719468;
  const era = Math.floor(d / 146097);
  const doe = d - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const year = y + (m <= 2 ? 1 : 0);
  return `${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function dayFromIso(iso: string): number {
  const [ys, ms, ds] = iso.split("-");
  const y0 = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  const y = y0 - (m <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

// ---------------------------------------------------------------------------
// Vocabulary — all synthetic
// ---------------------------------------------------------------------------

const COUNTRIES = [
  { name: "United States", dial: "+1" },
  { name: "United Kingdom", dial: "+44" },
  { name: "France", dial: "+33" },
  { name: "Germany", dial: "+49" },
  { name: "Netherlands", dial: "+31" },
  { name: "Australia", dial: "+61" },
  { name: "India", dial: "+91" },
] as const;

const INDUSTRIES = [
  "Software",
  "Logistics",
  "Manufacturing",
  "Healthcare",
  "Financial Services",
  "Retail",
  "Education",
  "Government",
  "Energy",
  "Media",
];

const STEMS = [
  "north", "wind", "pine", "crest", "harbor", "vale", "quill", "amber", "slate",
  "cobalt", "ridge", "brook", "lantern", "meridian", "orchard", "pike", "summit",
  "tallow", "verge", "willow", "argent", "beacon", "cinder", "delta", "ember",
  "fathom", "granite", "hollow", "ivory", "juniper", "kestrel", "larch", "marrow",
  "nimbus", "onyx", "pallas", "quarry", "rowan", "sable", "thistle", "umber",
];

const SUFFIXES = ["Group", "Holdings", "Logistics", "Systems", "Partners", "Works", "Labs", "Industries", "Supply", "Collective"];

const FIRST_NAMES = [
  "Ada", "Bo", "Cai", "Dara", "Emre", "Fen", "Gita", "Halle", "Iris", "Jae",
  "Kiri", "Lior", "Maja", "Nils", "Oona", "Pax", "Quen", "Rina", "Sami", "Tova",
  "Uma", "Vin", "Wren", "Xan", "Yuki", "Zev",
];

const LAST_NAMES = [
  "Adeyemi", "Broz", "Calder", "Dumont", "Eriksen", "Fontaine", "Grieve",
  "Halloran", "Ivanov", "Jarrah", "Kowal", "Lindqvist", "Moreau", "Nakamura",
  "Okafor", "Petrov", "Quist", "Rasmussen", "Silva", "Takahashi", "Ueda",
  "Vasquez", "Wexler", "Yilmaz", "Zoric",
];

const TITLES = [
  "Head of Operations", "VP Revenue Operations", "Director of IT",
  "Procurement Manager", "Chief Financial Officer", "Operations Analyst",
  "Head of Logistics", "Plant Manager", "Marketing Director",
  "Sales Operations Lead",
];

const OWNERS = [
  "priya", "dana", "tomas", "mei", "noor", "jonas",
  "aria", "kwame", "elif", "rafa", "hana", "dmitri",
];

const OWNER_LABELS: Record<string, string> = {
  priya: "Priya R.", dana: "Dana O.", tomas: "Tomas L.", mei: "Mei C.",
  noor: "Noor A.", jonas: "Jonas B.", aria: "Aria V.", kwame: "Kwame T.",
  elif: "Elif D.", rafa: "Rafa M.", hana: "Hana S.", dmitri: "Dmitri P.",
};

const SOURCE_LABELS: Record<string, string> = {
  webinar: "Webinar form",
  "inbound-form": "Website contact form",
  outbound: "Outbound prospecting",
  conference: "Conference scan",
  partner: "Partner referral",
  "vendor-import": "Vendor list import",
};

const BATCH_LABELS: Record<string, string> = {
  "b-2024-11-vendor": "2024-11 vendor list",
  "b-2024-06-legacy": "2024-06 legacy migration",
  "b-2025-02-conference": "2025-02 conference export",
};

const RECORD_TYPES = ["standard", "legacy", "partner"];

// ---------------------------------------------------------------------------
// Shapes (plain JSON — validated by the engine's schema on the way back in)
// ---------------------------------------------------------------------------

interface Rec {
  id: string;
  object: "account" | "contact";
  accountId: string | null;
  fields: Record<string, string | null>;
  provenance: {
    ownerId: string;
    sourceId: string;
    importBatchId: string | null;
    recordType: string;
    createdAt: string;
    lastModifiedAt: string;
  };
}

const ACCOUNT_FIELDS = [
  { id: "name", object: "account", label: "Account name", kind: "text" },
  { id: "domain", object: "account", label: "Website", kind: "url" },
  { id: "industry", object: "account", label: "Industry", kind: "picklist" },
  { id: "country", object: "account", label: "Country", kind: "picklist" },
  { id: "phone", object: "account", label: "Phone", kind: "phone" },
  { id: "employees", object: "account", label: "Employees", kind: "number" },
  { id: "revenue", object: "account", label: "Annual revenue", kind: "number" },
  { id: "firstTouchAt", object: "account", label: "First touch", kind: "date" },
  { id: "lastActivityAt", object: "account", label: "Last activity", kind: "date" },
];

const CONTACT_FIELDS = [
  { id: "name", object: "contact", label: "Full name", kind: "text" },
  { id: "email", object: "contact", label: "Email", kind: "email" },
  // `Unknown` is a real picklist default in real CRMs, and it is the reason
  // "title is 96% complete" is a sentence nobody should believe.
  { id: "title", object: "contact", label: "Job title", kind: "text", declaredDefault: "Unknown" },
  { id: "phone", object: "contact", label: "Phone", kind: "phone" },
  { id: "country", object: "contact", label: "Country", kind: "picklist" },
];

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

interface Spec {
  id: string;
  name: string;
  seed: number;
  /** source id → how many accounts it produced */
  sources: Record<string, number>;
  contactsPerAccount: [number, number];
  /** Whether to apply the eight pathologies or only the base noise. */
  pathologies: boolean;
}

const DAY0 = dayFromIso("2024-01-01");
const DAY_SPAN = dayFromIso("2025-12-20") - DAY0;

export function generate(spec: Spec) {
  const random = rng(spec.seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)] as T;
  const chance = (p: number) => random() < p;
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));

  const accounts: Rec[] = [];
  const contacts: Rec[] = [];
  let n = 0;

  // -- base org ------------------------------------------------------------
  for (const [sourceId, count] of Object.entries(spec.sources)) {
    for (let i = 0; i < count; i++) {
      n++;
      const created = DAY0 + Math.floor(random() * DAY_SPAN);
      const country = pick(COUNTRIES);
      const employees = pick([int(3, 49), int(50, 999), int(1000, 40000)]);
      const revenueBand =
        employees < 50 ? int(200_000, 4_500_000)
        : employees < 1000 ? int(6_000_000, 90_000_000)
        : int(120_000_000, 4_000_000_000);
      // Three stems rather than two: with two, birthday collisions give a few
      // hundred accidentally-repeated names in 2,400 draws, and a repeated
      // value stops being a signal worth queueing for a second opinion.
      const stem = pick(STEMS);
      const stem2 = pick(STEMS);
      const stem3 = pick(STEMS);
      const name = `${stem[0]?.toUpperCase()}${stem.slice(1)}${stem2}${stem3} ${pick(SUFFIXES)}`;
      const domain = `${stem}${stem2}${stem3}.example`;

      // Batches are assigned by source so an import batch is a real subset of
      // a real acquisition channel, the way it is in a live CRM.
      const batch =
        sourceId === "vendor-import" && created < dayFromIso("2024-12-01") ? "b-2024-11-vendor"
        : sourceId === "conference" && created >= dayFromIso("2025-02-01") && created < dayFromIso("2025-03-01") ? "b-2025-02-conference"
        : null;

      const recordType =
        sourceId === "partner" ? "partner"
        : created < dayFromIso("2024-07-01") && chance(0.55) ? "legacy"
        : "standard";

      const firstTouch = created + int(0, 20);
      accounts.push({
        id: `a${n}`,
        object: "account",
        accountId: null,
        fields: {
          name,
          domain: chance(0.02) ? null : domain,
          // 4% base absence. Every field carries some; the analyser has to
          // separate the background from the incident.
          industry: chance(0.04) ? null : pick(INDUSTRIES),
          country: chance(0.03) ? null : country.name,
          phone: chance(0.05) ? null : `${country.dial} ${int(1000, 9999)} ${int(100000, 999999)}`,
          employees: chance(0.06) ? null : String(employees),
          // PATHOLOGY 5 — the field nobody filled. 44%, drawn independently of
          // every dimension, so no cohort can explain it. Expect PERVASIVE.
          revenue: chance(0.44) ? null : String(revenueBand),
          firstTouchAt: isoFromDay(firstTouch),
          lastActivityAt: isoFromDay(firstTouch + int(1, 300)),
        },
        provenance: {
          ownerId: pick(OWNERS),
          sourceId,
          importBatchId: batch,
          recordType,
          createdAt: isoFromDay(created),
          lastModifiedAt: isoFromDay(created + int(0, 400)),
        },
      });
    }
  }

  // Contacts hang off accounts and inherit their provenance channel, because
  // in a real CRM a contact arrives through the same door as its account.
  let c = 0;
  for (const account of accounts) {
    const howMany = int(spec.contactsPerAccount[0], spec.contactsPerAccount[1]);
    for (let i = 0; i < howMany; i++) {
      c++;
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const domain = account.fields.domain ?? "unlinked.example";
      const created = dayFromIso(account.provenance.createdAt) + int(0, 60);
      contacts.push({
        id: `c${c}`,
        object: "contact",
        accountId: account.id,
        fields: {
          name: `${first} ${last}`,
          email: chance(0.03)
            ? `${first.toLowerCase()}.${last.toLowerCase()}@mailbox.example`
            : `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`,
          // PATHOLOGY 5b — a declared picklist default at an anomalous share.
          // 58% `Unknown` is what makes "title is 96% populated" a lie, and it
          // is flat across cohorts, so it is PERVASIVE too.
          title: chance(0.58) ? "Unknown" : pick(TITLES),
          phone: chance(0.3) ? null : `+1 ${int(200, 989)} ${int(1000000, 9999999)}`,
          country: chance(0.08) ? null : account.fields.country ?? null,
        },
        provenance: {
          ...account.provenance,
          createdAt: isoFromDay(created),
          lastModifiedAt: isoFromDay(created + int(0, 300)),
        },
      });
    }
  }

  if (spec.pathologies) {
    applyPathologies(accounts, contacts, random);
  }

  const records = [...accounts, ...contacts];
  const usedOwners = new Set(records.map((r) => r.provenance.ownerId));
  const usedSources = new Set(records.map((r) => r.provenance.sourceId));
  const usedBatches = new Set(
    records.map((r) => r.provenance.importBatchId).filter((b): b is string => b !== null),
  );

  return {
    id: spec.id,
    name: spec.name,
    users: [...usedOwners].sort().map((id) => ({ id, label: OWNER_LABELS[id] ?? id })),
    sources: [...usedSources].sort().map((id) => ({ id, label: SOURCE_LABELS[id] ?? id })),
    importBatches: [...usedBatches].sort().map((id) => ({ id, label: BATCH_LABELS[id] ?? id })),
    recordTypes: RECORD_TYPES.map((id) => ({ id, label: id[0]?.toUpperCase() + id.slice(1) })),
    fields: [...ACCOUNT_FIELDS, ...CONTACT_FIELDS],
    records,
  };
}

// ---------------------------------------------------------------------------
// The eight pathologies
// ---------------------------------------------------------------------------

function applyPathologies(accounts: Rec[], contacts: Rec[], random: () => number) {
  const chance = (p: number) => random() < p;
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)] as T;

  const STOPPED_ASKING = "2025-03-14";
  const LEAK_CLOSED = "2025-01-20";

  for (const a of accounts) {
    const p = a.provenance;

    // 1 — THE FORM THAT STOPPED ASKING.
    // Somebody edited the webinar form in March and dropped the industry
    // question. Within `source=webinar` this is a clean step: 4% before,
    // 91% after. Expect LOCALIZED + ONSET on 2025-03-14.
    if (p.sourceId === "webinar" && p.createdAt >= STOPPED_ASKING && chance(0.91)) {
      a.fields.industry = null;
    }

    // 2 — THE IMPORT THAT STAMPED.
    // One vendor list wrote the same industry on almost every row it touched.
    // The field is 100% populated inside that batch and knows nothing. Expect
    // COUNTERFEIT/batchStamp, and CHRONIC — within a batch confined to one
    // month there is no change-point to find, and claiming one would be an
    // invention.
    if (p.importBatchId === "b-2024-11-vendor" && chance(0.93)) {
      a.fields.industry = "Technology";
    }

    // 4 — THE LEAK THAT CLOSED.
    // The website form shipped with a placeholder phone default. Somebody
    // fixed it in January. Expect LOCALIZED + HEALED: this is scar tissue, not
    // a bleeding wound, and the console must not shout about it.
    if (p.sourceId === "inbound-form" && p.createdAt < LEAK_CLOSED && chance(0.65)) {
      a.fields.phone = "000-000-0000";
    }

    // 6 — THE INTEGRATION THAT OVERWROTE.
    // A migration ran once against the legacy record type with the country
    // mapping wrong and every activity date clamped to the migration day. The
    // phone numbers survived, so country and dialling code now disagree, and
    // last activity now precedes first touch.
    if (p.recordType === "legacy" && chance(0.78)) {
      const phone = a.fields.phone;
      if (phone != null && !phone.startsWith("+1")) {
        a.fields.country = "United States";
      }
      // The migration mapped `lastActivityAt` from what was actually the old
      // system's record-creation date, so last activity now sits a month
      // before first touch on every record it touched.
      a.fields.lastActivityAt = isoFromDay(dayFromIso(p.createdAt) - 30);
    }
  }

  // 3 — THE CONFOUNDED PAIR.
  // Conference scans are worked almost exclusively by one rep, so `owner` and
  // `source` are nearly the same set of records. The defect sits on both. No
  // amount of conditioning can say which one is the cause, because there are
  // fewer than twenty records outside the overlap to test with. Expect
  // CONFOUNDED — the tool naming both and declining to pick.
  const conference = accounts.filter((a) => a.provenance.sourceId === "conference");
  for (const [i, a] of conference.entries()) {
    // All but a handful of conference accounts move to Priya.
    if (i >= 12) a.provenance.ownerId = "priya";
  }
  const priyaElsewhere = accounts
    .filter((a) => a.provenance.sourceId !== "conference" && a.provenance.ownerId === "priya")
    .slice(0, 6);
  for (const a of accounts) {
    if (a.provenance.ownerId === "priya" && a.provenance.sourceId !== "conference") {
      // Everything else Priya owned goes to somebody else, leaving only a
      // handful outside the overlap.
      if (!priyaElsewhere.includes(a)) {
        a.provenance.ownerId = pick(OWNERS.filter((o) => o !== "priya"));
      }
    }
  }
  for (const a of accounts) {
    const inEither =
      a.provenance.sourceId === "conference" || a.provenance.ownerId === "priya";
    if (inEither && chance(0.7)) a.fields.employees = null;
  }

  // 7 — THE ALARMING SIX.
  // A tiny cohort with a spectacular rate. Five of six partner records owned
  // by one rep have no website. 83% is a real number and it means nothing.
  // Expect UNDERPOWERED — listed, counted separately, never a claim.
  // Everything else this rep owned moves away first, so the cohort really is
  // six records and not six plus whatever the shuffle happened to give them.
  for (const a of accounts) {
    if (a.provenance.ownerId === "dmitri") {
      a.provenance.ownerId = pick(OWNERS.filter((o) => o !== "dmitri" && o !== "priya"));
    }
  }
  const tiny = accounts.filter((a) => a.provenance.sourceId === "partner").slice(0, 6);
  for (const a of tiny) {
    a.provenance.ownerId = "dmitri";
    if (a !== tiny[5]) a.fields.domain = null;
  }

  // 8 — THE PLAUSIBLE FAKE.
  // Names that pass every deterministic family: no sentinel matches exactly,
  // no keyboard run, no reserved token, no format shift. A human reads them in
  // half a second. Only the model's second opinion catches these, and if the
  // key is unset the console says so rather than pretending they are clean.
  const PLAUSIBLE = [
    "Nick's Sandbox Co",
    "ACME (DO NOT USE)",
    "Copy of Harbor Systems",
    "Company Name Here",
    "New Account 4",
    "zzz old — merge me",
    "Demo Account (internal)",
    "My Test Company Ltd",
    "Duplicate of Vale Works",
    "Placeholder Industries",
  ];
  const fakeTargets = accounts.filter((_, i) => i % 97 === 5).slice(0, 24);
  for (const [i, a] of fakeTargets.entries()) {
    a.fields.name = PLAUSIBLE[i % PLAUSIBLE.length] ?? "New Account";
  }

  // 9 — ORPHANS FROM THE LEGACY MIGRATION.
  // The migration dropped the account link on a slice of the contacts it
  // moved. Concentrated in one batch, so it localises cleanly.
  const legacyContacts = contacts.filter(
    (c) => c.provenance.recordType === "legacy",
  );
  for (const [i, c] of legacyContacts.entries()) {
    if (i % 9 === 0) c.accountId = i % 18 === 0 ? null : "a999999";
  }

  // Background counterfeit noise, so the deterministic families are not each
  // demonstrated by exactly one pathology and nothing else.
  for (const a of accounts) {
    if (chance(0.012)) a.fields.name = pick(["n/a", "test", "asdfgh", "---", "xxx"]);
    if (chance(0.008)) a.fields.domain = "example.com";
  }
  for (const ct of contacts) {
    if (chance(0.01)) ct.fields.email = "noreply@" + (ct.fields.email?.split("@")[1] ?? "x.example");
    if (chance(0.006)) ct.fields.phone = "555-0100";
  }
}

// ---------------------------------------------------------------------------
// The two patients
// ---------------------------------------------------------------------------

export const NORTHWIND: Spec = {
  id: "northwind",
  name: "Northwind Logistics",
  seed: 20260817,
  sources: {
    webinar: 420,
    "inbound-form": 620,
    outbound: 520,
    conference: 355,
    partner: 205,
    "vendor-import": 280,
  },
  contactsPerAccount: [0, 3],
  pathologies: true,
};

/**
 * The small patient exists to show the tool declining. Almost every cohort
 * here falls under the support floor, so almost every elevation is reported as
 * a non-claim. A hygiene product that produces the same confident output on
 * three hundred records as on three thousand is not measuring anything.
 */
export const PINECREST: Spec = {
  id: "pinecrest",
  name: "Pinecrest Supply",
  seed: 71349,
  sources: {
    "inbound-form": 120,
    outbound: 95,
    conference: 55,
    partner: 50,
  },
  contactsPerAccount: [0, 2],
  pathologies: false,
};
