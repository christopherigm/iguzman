/**
 * Client-side mirror of the Django password policy.
 *
 * The API remains the authority - `validate_password` runs on every password
 * write. This module reproduces the rules that can be evaluated in the browser
 * so the form can guide the user before a round-trip, and maps the API's
 * rejection messages back onto translation keys when it cannot.
 *
 * `CommonPasswordValidator` is deliberately absent: it tests against a
 * 20,000-entry word list that is not worth shipping to the client. A common
 * password satisfies every rule here and is rejected by the API on submit -
 * `mapPasswordErrors` turns that response into a message.
 *
 * Keep in sync with `AUTH_PASSWORD_VALIDATORS` in the Django settings.
 */

/** Mirrors `MinimumLengthValidator(min_length=8)`. */
export const PASSWORD_MIN_LENGTH = 8;

/** Mirrors `UserAttributeSimilarityValidator(max_similarity=0.7)`. */
const MAX_SIMILARITY = 0.7;

export type PasswordRuleId = "minLength" | "notNumeric" | "notSimilar";

export interface PasswordRule {
  id: PasswordRuleId;
  satisfied: boolean;
}

/** The user attributes Django compares a password against. */
export interface PasswordUserAttributes {
  email?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Port of Python's `difflib.SequenceMatcher.quick_ratio` - an upper bound on
 * the true ratio, derived from the character multiset intersection. Django's
 * similarity validator compares against exactly this value, so an approximation
 * here would make the two layers disagree around the 0.7 boundary.
 */
function quickRatio(a: string, b: string): number {
  const aChars = [...a];
  const bChars = [...b];
  const total = aChars.length + bChars.length;
  if (total === 0) return 1;

  const bCounts = new Map<string, number>();
  for (const ch of bChars) bCounts.set(ch, (bCounts.get(ch) ?? 0) + 1);

  const available = new Map<string, number>();
  let matches = 0;
  for (const ch of aChars) {
    const remaining = available.get(ch) ?? bCounts.get(ch) ?? 0;
    available.set(ch, remaining - 1);
    if (remaining > 0) matches += 1;
  }
  return (2 * matches) / total;
}

/**
 * Port of Django's `exceeds_maximum_length_ratio`. When the password dwarfs the
 * attribute, `quick_ratio` cannot reach `max_similarity`, so the comparison is
 * skipped rather than computed.
 */
function exceedsMaximumLengthRatio(
  passwordLength: number,
  valueLength: number,
): boolean {
  return (
    passwordLength >= 10 * valueLength &&
    valueLength < (MAX_SIMILARITY / 2) * passwordLength
  );
}

/**
 * Django compares the password against each attribute *and* each of its
 * word-like components, so `chris` is caught via `chris.guzman@example.com`.
 * The username is derived from the email, so comparing the email covers both.
 */
function isTooSimilar(
  password: string,
  attributes: PasswordUserAttributes,
): boolean {
  const lowered = password.toLowerCase();
  const passwordLength = [...lowered].length;

  for (const attribute of [
    attributes.email,
    attributes.firstName,
    attributes.lastName,
  ]) {
    if (!attribute) continue;
    const value = attribute.toLowerCase();
    // `\W+` in Python's re is Unicode-aware; the ASCII-only JS `\W` is not.
    for (const part of [...value.split(/[^\p{L}\p{N}_]+/u), value]) {
      if (!part) continue;
      if (exceedsMaximumLengthRatio(passwordLength, [...part].length)) continue;
      if (quickRatio(lowered, part) >= MAX_SIMILARITY) return true;
    }
  }
  return false;
}

/** Mirrors `NumericPasswordValidator` (Python's `str.isdigit`). */
function isEntirelyNumeric(password: string): boolean {
  return password.length > 0 && /^\p{Nd}+$/u.test(password);
}

/**
 * Evaluate every browser-checkable rule. Returns one entry per rule so the UI
 * can render a live checklist rather than a single pass/fail.
 */
export function checkPassword(
  password: string,
  attributes: PasswordUserAttributes = {},
): PasswordRule[] {
  return [
    { id: "minLength", satisfied: [...password].length >= PASSWORD_MIN_LENGTH },
    { id: "notNumeric", satisfied: !isEntirelyNumeric(password) },
    { id: "notSimilar", satisfied: !isTooSimilar(password, attributes) },
  ];
}

/** True when every browser-checkable rule passes. The API still has final say. */
export function isPasswordValid(
  password: string,
  attributes: PasswordUserAttributes = {},
): boolean {
  return checkPassword(password, attributes).every((rule) => rule.satisfied);
}

// ── Mapping the API's rejection messages ──────────────────────────────────────

export type PasswordErrorKey =
  | "errorTooShort"
  | "errorTooCommon"
  | "errorEntirelyNumeric"
  | "errorTooSimilar";

/**
 * A rejection reason resolved to a translation key, or - when Django said
 * something we don't recognise - the server's own text. Falling back to the raw
 * message keeps a reworded or newly-configured validator readable (in English)
 * instead of collapsing it into a useless generic error.
 */
export type PasswordErrorMessage =
  | { translated: true; key: PasswordErrorKey; values?: { count: number } }
  | { translated: false; text: string };

/**
 * DRF renders validator messages, not codes, so matching is by text. Each
 * pattern is anchored to survive an unrelated validator being added later.
 */
const DJANGO_MESSAGES: {
  pattern: RegExp;
  key: PasswordErrorKey;
  values?: (match: RegExpMatchArray) => { count: number };
}[] = [
  {
    pattern:
      /^This password is too short\. It must contain at least (\d+) characters?\.$/,
    key: "errorTooShort",
    values: (match) => ({ count: Number(match[1]) }),
  },
  { pattern: /^This password is too common\.$/, key: "errorTooCommon" },
  {
    pattern: /^This password is entirely numeric\.$/,
    key: "errorEntirelyNumeric",
  },
  {
    pattern: /^The password is too similar to the .+\.$/,
    key: "errorTooSimilar",
  },
];

function mapPasswordError(message: string): PasswordErrorMessage {
  for (const { pattern, key, values } of DJANGO_MESSAGES) {
    const match = message.match(pattern);
    if (match) {
      return values
        ? { translated: true, key, values: values(match) }
        : { translated: true, key };
    }
  }
  return { translated: false, text: message };
}

/** Pull a DRF field's errors out of a 400 body, tolerating string or array. */
export function extractFieldErrors(data: unknown, field: string): string[] {
  if (!data || typeof data !== "object") return [];
  const raw = (data as Record<string, unknown>)[field];
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw))
    return raw.filter((item): item is string => typeof item === "string");
  return [];
}

/**
 * Turn a 400 response body into renderable password errors. `field` is the DRF
 * field name - `password` on sign-up, `new_password` on change/reset.
 */
export function mapPasswordErrors(
  data: unknown,
  field = "password",
): PasswordErrorMessage[] {
  return extractFieldErrors(data, field).map(mapPasswordError);
}
