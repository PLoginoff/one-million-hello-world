/**
 * Translation Quality Scorer
 *
 * Scores a locale catalog against a reference catalog, detecting the
 * issues that break UIs:
 * - `missing` — key exists in reference but not in the locale,
 * - `placeholder-mismatch` — the locale's message references a different
 *   set of `{placeholders}` than the reference (runtime substitution
 *   would produce `undefined` or leave raw tokens),
 * - `empty` — key present but blank,
 * - `untranslated` — locale text is byte-identical to the reference
 *   (suspicious for non-proper-noun strings; often a copy-paste gap).
 *
 * Score = fraction of reference keys with zero issues, weighted so a
 * `missing` or `placeholder-mismatch` counts fully while `untranslated`
 * counts half — an untranslated string still renders correctly, a
 * missing one does not.
 *
 * @module LocalizationLayer/Engine2
 */

import { LocaleCatalog, QualityIssue, QualityReport } from './types';

/** Extract `{placeholder}` names from a message, sorted for comparison. */
export function placeholdersOf(message: string): string[] {
  const out: string[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    out.push(m[1]!);
  }
  return out.sort();
}

export class QualityScorer {
  /**
   * Score `catalog` against `reference` (typically the default locale).
   */
  score(catalog: LocaleCatalog, reference: LocaleCatalog): QualityReport {
    const issues: QualityIssue[] = [];
    let weightedHits = 0;
    const total = Object.keys(reference.messages).length;

    for (const [key, refText] of Object.entries(reference.messages)) {
      const text = catalog.messages[key];
      if (text === undefined) {
        issues.push({ key, locale: catalog.locale, kind: 'missing', detail: `key absent in ${catalog.locale}` });
        weightedHits += 1;
        continue;
      }
      if (text.trim().length === 0) {
        issues.push({ key, locale: catalog.locale, kind: 'empty', detail: 'message is blank' });
        weightedHits += 1;
        continue;
      }
      const refPh = placeholdersOf(refText);
      const locPh = placeholdersOf(text);
      if (refPh.join('') !== locPh.join('')) {
        issues.push({
          key,
          locale: catalog.locale,
          kind: 'placeholder-mismatch',
          detail: `reference {${refPh.join('},{')}} vs locale {${locPh.join('},{')}}`,
        });
        weightedHits += 1;
        continue;
      }
      if (text === refText && catalog.locale !== reference.locale) {
        issues.push({
          key,
          locale: catalog.locale,
          kind: 'untranslated',
          detail: 'identical to reference',
        });
        weightedHits += 0.5;
      }
    }

    const score = total === 0 ? 1 : 1 - weightedHits / total;
    return { locale: catalog.locale, referenceLocale: reference.locale, score, issues };
  }

  /**
   * Score every registered non-reference catalog. Catalogs are provided
   * as a list — the reference is identified by `referenceLocale`.
   */
  scoreAll(catalogs: readonly LocaleCatalog[], referenceLocale: string): QualityReport[] {
    const ref = catalogs.find((c) => c.locale === referenceLocale);
    if (!ref) throw new Error(`Reference catalog not present: ${referenceLocale}`);
    return catalogs
      .filter((c) => c.locale !== referenceLocale)
      .map((c) => this.score(c, ref));
  }
}
