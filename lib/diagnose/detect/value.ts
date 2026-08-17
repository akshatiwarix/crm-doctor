/**
 * Value primitives shared by the detectors.
 *
 * `isBlank` is the single definition of absence in this package. Whitespace,
 * an empty string and `null` are the same thing — a CRM that stores `" "` has
 * not collected anything, and treating that as populated is the first way a
 * completeness number starts lying.
 */

export function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isBlank(value: string | null | undefined): value is null {
  return value === null || value === undefined || value.trim() === "";
}

/** Digits only, for comparing phone-shaped strings written five ways. */
export function digits(value: string): string {
  return value.replace(/\D/g, "");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_LIKE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;

/**
 * What a string *looks* like, independent of the field it was found in. The
 * field-shift family is the disagreement between this and the declared kind.
 */
export function shapeOf(value: string): "email" | "phone" | "url" | null {
  const trimmed = value.trim();
  if (EMAIL.test(trimmed)) return "email";
  // A phone is mostly digits with punctuation people actually type. Requiring
  // that non-digits be phone punctuation is what stops "Acme 2024" matching.
  const d = digits(trimmed);
  if (d.length >= 7 && d.length <= 15 && /^[+()\-.\s\d]+$/.test(trimmed)) {
    return "phone";
  }
  if (URL_LIKE.test(trimmed) && trimmed.includes(".")) return "url";
  return null;
}

const KEYBOARD_ROWS = [
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "1234567890",
];

/** A run of four or more adjacent keys. `asdf`, `qwer`, `1234`. */
export function hasKeyboardRun(value: string): boolean {
  const v = normalize(value).replace(/[^a-z0-9]/g, "");
  if (v.length < 4) return false;
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i + 4 <= row.length; i++) {
      const run = row.slice(i, i + 4);
      if (v.includes(run) || v.includes([...run].reverse().join(""))) return true;
    }
  }
  return false;
}

export function isSingleRepeatedCharacter(value: string): boolean {
  const v = normalize(value).replace(/\s/g, "");
  return v.length >= 2 && new Set(v).size === 1;
}

/**
 * Five or more letters with no vowel and no `y`. Real words and real company
 * names have one; `xzkqrt` does not. The length floor is what keeps acronyms
 * and short real names out.
 */
export function isUnpronounceable(value: string): boolean {
  const v = normalize(value).replace(/[^a-z]/g, "");
  return v.length >= 5 && !/[aeiouy]/.test(v);
}

export function isAllPunctuation(value: string): boolean {
  const v = value.trim();
  return v.length > 0 && !/[a-z0-9]/i.test(v);
}
