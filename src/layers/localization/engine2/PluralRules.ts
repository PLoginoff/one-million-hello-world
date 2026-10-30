/**
 * CLDR Plural Rules — edge-case implementations.
 *
 * Implements the CLDR plural-category selection rules for locales whose
 * rules go beyond the simple English one/other — specifically the
 * complex cases called out for edge testing:
 *
 * - **Russian/Slavic** (`ru`, `uk`, `be`, `hr`, `sr`, `bs`): one/few/many
 *   driven by `n mod 10` and `n mod 100` — the famous 1/2-4/5+ rule
 *   with the 11-14 teens exception.
 * - **Arabic** (`ar`): all six categories — zero/two are explicit,
 *   one is exact, few=3-10, many=11-99, other=100+.
 * - **Polish** (`pl`): like Russian but with an extra twist — `few`
 *   requires a non-integer check.
 * - **French** (`fr`): zero is folded into `one` (0 and 1 both singular).
 * - **Japanese/Chinese/Korean/Vietnamese**: `other` only — no plural
 *   categories at all.
 * - **English-like** (default): one when n == 1, else other.
 *
 * The implementation works on the operands CLDR defines — n (absolute
 * value), i (integer digits), v (visible fraction digits), f (fraction
 * digits) — so decimals behave per spec (e.g. 1.5 in Russian is `other`,
 * not `one`).
 *
 * @module LocalizationLayer/Engine2
 */

import { PluralCategory, PluralForms } from './types';

/** CLDR plural operands for a number. */
interface Operands {
  /** Absolute value. */
  n: number;
  /** Integer digits of n. */
  i: number;
  /** Visible fraction digits WITH trailing zeros (e.g. "1.20" -> v=2). */
  v: number;
  /** Fraction digits as an integer (e.g. "1.20" -> f=20). */
  f: number;
}

/**
 * Extract CLDR operands from a number. Fraction precision is read from
 * the number's own decimal representation (up to 6 dp), preserving
 * trailing-zero semantics close enough for the rules used here.
 */
function operands(n: number): Operands {
  const abs = Math.abs(n);
  const i = Math.floor(abs);
  const str = abs.toString();
  const dot = str.indexOf('.');
  const frac = dot >= 0 ? str.slice(dot + 1) : '';
  return { n: abs, i, v: frac.length, f: frac.length > 0 ? parseInt(frac, 10) : 0 };
}

/** Select the CLDR plural category for `n` in `locale`. */
export function pluralCategory(n: number, locale: string): PluralCategory {
  const lang = locale.split('-')[0]!.toLowerCase();
  const op = operands(n);
  switch (lang) {
    case 'ru':
    case 'uk':
    case 'be':
    case 'hr':
    case 'sr':
    case 'bs':
      return slavic(op);
    case 'pl':
      return polish(op);
    case 'ar':
      return arabic(op);
    case 'fr':
      return french(op);
    case 'ja':
    case 'ko':
    case 'zh':
    case 'vi':
    case 'th':
    case 'id':
    case 'ms':
      return 'other';
    default:
      return englishLike(op);
  }
}

/**
 * Russian-family rule (CLDR):
 *   one:  v=0 && i%10==1 && i%100!=11
 *   few:  v=0 && i%10 in 2..4 && i%100 not in 12..14
 *   many: v=0 && (i%10==0 || i%10 in 5..9 || i%100 in 11..14)
 *   other: decimals, 0, and anything else
 */
function slavic(op: Operands): PluralCategory {
  if (op.v !== 0) return 'other';
  const mod10 = op.i % 10;
  const mod100 = op.i % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  if (mod10 === 0 || (mod10 >= 5 && mod10 <= 9) || (mod100 >= 11 && mod100 <= 14)) {
    return 'many';
  }
  return 'other';
}

/**
 * Polish (CLDR):
 *   one:  i==1 && v==0
 *   few:  v=0 && i%10 in 2..4 && i%100 not in 12..14
 *   many: v=0 && (i!=1) && (i%10 in 0..1 || i%10 in 5..9 || i%100 in 12..14)
 *   other: decimals
 */
function polish(op: Operands): PluralCategory {
  if (op.v !== 0) return 'other';
  const mod10 = op.i % 10;
  const mod100 = op.i % 100;
  if (op.i === 1) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  if (
    op.i !== 1 &&
    (mod10 === 0 || mod10 === 1 || (mod10 >= 5 && mod10 <= 9) || (mod100 >= 12 && mod100 <= 14))
  ) {
    return 'many';
  }
  return 'other';
}

/**
 * Arabic (CLDR) — the only common language using all six categories:
 *   zero: n==0      one: n==1      two: n==2
 *   few:  n%100 in 3..10
 *   many: n%100 in 11..99
 *   other: everything else (incl. 100+, decimals)
 */
function arabic(op: Operands): PluralCategory {
  if (op.n === 0) return 'zero';
  if (op.n === 1) return 'one';
  if (op.n === 2) return 'two';
  const mod100 = op.n % 100;
  if (mod100 >= 3 && mod100 <= 10) return 'few';
  if (mod100 >= 11 && mod100 <= 99) return 'many';
  return 'other';
}

/** French: 0 and 1 are both singular; decimals take `other` per CLDR. */
function french(op: Operands): PluralCategory {
  if (op.v !== 0) return 'other';
  return op.i === 0 || op.i === 1 ? 'one' : 'other';
}

/** English-like default: exactly 1 is singular. */
function englishLike(op: Operands): PluralCategory {
  return op.i === 1 && op.v === 0 ? 'one' : 'other';
}

/**
 * Format a pluralised message: pick the right form from `forms` for
 * `n` in `locale`, then substitute `{count}` (and `{n}`) tokens.
 *
 * Falls back to `other` when the required category's form is absent —
 * per CLDR guidance every form set MUST provide `other`.
 */
export function formatPlural(
  forms: PluralForms,
  n: number,
  locale: string
): string {
  const cat = pluralCategory(n, locale);
  const template = forms[cat] ?? forms.other;
  return template.replace(/\{(count|n)\}/g, String(n));
}
