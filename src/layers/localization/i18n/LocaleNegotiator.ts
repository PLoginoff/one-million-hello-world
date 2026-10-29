/**
 * Localization — Locale Negotiation + Fallback Chain
 *
 * Two responsibilities:
 *
 *   1. Accept-Language parsing (RFC 7231 §5.3.5): `fr-CA, fr;q=0.9,
 *      en;q=0.8, *;q=0.1` → ordered candidate list honoring q-values,
 *      malformed entries skipped, ties keep header order.
 *   2. Fallback resolution: for a desired locale produce the lookup chain
 *      `fr-CA → fr → default`, then pick the first with a loaded catalog.
 *
 * @module Localization/I18n
 */

export interface LocaleCandidate {
  /** Raw tag as written (`fr-CA`). */
  readonly tag: string;
  /** Lowercased BCP-47-ish normalized tag (`fr-ca`). */
  readonly normalized: string;
  /** Quality value 0..1 (default 1). */
  readonly q: number;
  /** Original header position (stable sort tiebreak). */
  readonly index: number;
}

const TAG_RE = /^[a-zA-Z]{1,8}(?:-[a-zA-Z0-9]{1,8})*$/;

/** Parse an Accept-Language header into descending-q candidates. */
export function parseAcceptLanguage(header: string): LocaleCandidate[] {
  const candidates: LocaleCandidate[] = [];
  const parts = header.split(',');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (part === '') continue;
    const [tagRaw, ...params] = part.split(';');
    const tag = tagRaw.trim();
    if (tag !== '*' && !TAG_RE.test(tag)) continue; // skip malformed
    let q = 1;
    for (const p of params) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/.exec(p);
      if (m) {
        const parsed = Number(m[1]);
        q = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
      }
    }
    if (q === 0) continue; // q=0 means "not acceptable"
    candidates.push({ tag, normalized: tag.toLowerCase(), q, index: i });
  }
  // Stable descending-q sort — JS sort is stable, so equal q keeps header order.
  candidates.sort((a, b) => b.q - a.q);
  return candidates;
}

/**
 * Fallback chain for a locale: most-specific → least-specific → default.
 *   `zh-Hant-TW` → `zh-hant-tw`, `zh-hant`, `zh`, then `defaultLocale`.
 * The default appears last (and only once).
 */
export function fallbackChain(locale: string, defaultLocale = 'en'): string[] {
  const norm = locale.toLowerCase();
  const chain: string[] = [norm];
  const segs = norm.split('-');
  while (segs.length > 1) {
    segs.pop();
    chain.push(segs.join('-'));
  }
  const def = defaultLocale.toLowerCase();
  if (!chain.includes(def)) chain.push(def);
  return chain;
}

/**
 * Pick the best available locale for an Accept-Language header.
 * For each candidate (in q order) we walk its fallback chain and return the
 * first entry present in `available`. `*` matches the default (or first
 * available when no default). Returns undefined when nothing matches —
 * the caller decides whether to 406 or serve the default anyway.
 */
export function negotiate(
  acceptLanguageHeader: string,
  available: ReadonlyArray<string>,
  defaultLocale = 'en'
): string | undefined {
  const availSet = new Set(available.map((a) => a.toLowerCase()));
  const candidates = parseAcceptLanguage(acceptLanguageHeader);
  for (const c of candidates) {
    if (c.tag === '*') {
      if (availSet.has(defaultLocale.toLowerCase())) return defaultLocale.toLowerCase();
      return available[0]?.toLowerCase();
    }
    for (const tag of fallbackChain(c.normalized, defaultLocale)) {
      if (availSet.has(tag)) return tag;
    }
  }
  return undefined;
}
