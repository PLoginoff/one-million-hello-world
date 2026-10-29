/**
 * Localization — CLDR-Style Plural Rules
 *
 * Cardinal plural-category functions per locale, modelled on the CLDR
 * rules (unicode.org/cldr charts). Categories: zero, one, two, few, many,
 * other — each locale uses a subset.
 *
 * Implemented locales:
 *   - en (English):  one (n=1) / other
 *   - ru (Russian):  one / few / many / other — the famously awkward one:
 *       one:  n mod 10 = 1 AND n mod 100 ≠ 11
 *       few:  n mod 10 in 2..4 AND n mod 100 not in 12..14
 *       many: n mod 10 = 0, or n mod 10 in 5..9, or n mod 100 in 11..14
 *       other: fractions (non-integers)
 *   - ja (stub):     other only (no grammatical number)
 *   - ar (stub):     zero/one/two/few/many/other — the full six-category set
 *
 * Rules operate on the *visible* number (digits as formatted), per CLDR's
 * `n`/`i`/`v`/`f`/`t` operands — for our stub purposes `n` (the number) and
 * integer-vs-fraction distinction suffice; `v` handling is noted but the
 * formatter passes formatted values through `resolveOperands`.
 *
 * @module Localization/I18n
 */

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export type PluralRuleFn = (n: number) => PluralCategory;

/** English — `one` when n == 1 (integer), else `other`. */
export const enPlural: PluralRuleFn = (n) => (n === 1 ? 'one' : 'other');

/** Russian / Ukrainian / Belarusian family — few/many split on mod 10/100. */
export const ruPlural: PluralRuleFn = (n) => {
  if (!Number.isInteger(n)) return 'other';
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
};

/** Japanese / Chinese / Korean — no grammatical number. */
export const jaPlural: PluralRuleFn = () => 'other';

/** Arabic — the full six categories (stub-accurate for integers). */
export const arPlural: PluralRuleFn = (n) => {
  if (!Number.isInteger(n)) return 'other';
  if (n === 0) return 'zero';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return 'few';
  if (mod100 >= 11 && mod100 <= 99) return 'many';
  return 'other';
};

/** French — `one` covers 0 and 1 (unlike English). */
export const frPlural: PluralRuleFn = (n) => (n >= 0 && n < 2 ? 'one' : 'other');

/** Polish — similar to Russian but `many` on 12-14 only in mod100 range. */
export const plPlural: PluralRuleFn = (n) => {
  if (!Number.isInteger(n)) return 'other';
  if (n === 1) return 'one';
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
};

/** German / Spanish / most of Western Europe — like English. */
export const dePlural: PluralRuleFn = enPlural;

const RULES: Record<string, PluralRuleFn> = {
  en: enPlural,
  ru: ruPlural,
  uk: ruPlural,
  be: ruPlural,
  ja: jaPlural,
  zh: jaPlural,
  ko: jaPlural,
  ar: arPlural,
  fr: frPlural,
  pl: plPlural,
  de: dePlural,
  es: dePlural,
  it: dePlural,
  pt: dePlural,
  nl: dePlural,
};

/**
 * Plural rule for a locale tag (`ru-RU` → `ru`). Unknown locales fall back
 * to the English two-category rule — a safe default since `other` always
 * exists and `one` only fires on exact 1.
 */
export function pluralRuleFor(locale: string): PluralRuleFn {
  const lang = locale.split(/[-_]/)[0].toLowerCase();
  return RULES[lang] ?? enPlural;
}

/** The ordered candidate categories a plural message should ideally provide. */
export function categoriesFor(locale: string): ReadonlyArray<PluralCategory> {
  const lang = locale.split(/[-_]/)[0].toLowerCase();
  switch (lang) {
    case 'ru':
    case 'uk':
    case 'be':
    case 'pl':
      return ['one', 'few', 'many', 'other'];
    case 'ar':
      return ['zero', 'one', 'two', 'few', 'many', 'other'];
    case 'ja':
    case 'zh':
    case 'ko':
      return ['other'];
    case 'fr':
      return ['one', 'other'];
    default:
      return ['one', 'other'];
  }
}
