/**
 * Localization — I18n Engine
 *
 * The public facade:
 *
 *   t('cart.items', { n: 3 }, 'ru-RU')  →  "3 товара"
 *
 * Pipeline for a translate call:
 *   1. Resolve the effective locale: explicit arg > negotiated > default.
 *   2. Walk the fallback chain (`ru-ru → ru → en`) taking the first
 *      catalog that HAS the key (fallback is per-key, not per-locale — a
 *      catalog missing one key doesn't abort that locale entirely).
 *   3. Evaluate the compiled message with args + locale plural rules.
 *   4. Total miss: record in MissingKeyReporter, render `⟦key⟧`.
 *
 * Also here: `negotiateLocale(header)` → best available locale;
 * `pseudo()` → pseudo-localized render for tests; `reporter` → missing-key
 * stats for translators.
 *
 * @module Localization/I18n
 */

import { CatalogLoader, CatalogRegistry, CatalogData } from './MessageCatalog';
import { evaluateCatalogLookup, evaluateFrom } from './MessageLookup';
import { negotiate, parseAcceptLanguage, fallbackChain } from './LocaleNegotiator';
import { compileMessage, MessageArgs } from './MessageFormat';
import { categoriesFor } from './PluralRules';
import { PseudoLocalizer } from './PseudoLocalizer';

/** Injectable clock — epoch ms. */
export type I18nClock = () => number;

export interface MissingKeyEntry {
  readonly key: string;
  readonly locale: string;
  readonly count: number;
  readonly firstSeen: number;
  readonly lastSeen: number;
}

/** Accumulates missing-key hits per (locale, key) for translator reports. */
export class MissingKeyReporter {
  private readonly _clock: I18nClock;
  private readonly _entries = new Map<string, MissingKeyEntry>();

  constructor(clock: I18nClock = Date.now) {
    this._clock = clock;
  }

  record(key: string, locale: string): void {
    const id = `${locale} ${key}`;
    const e = this._entries.get(id);
    const now = this._clock();
    if (e) {
      this._entries.set(id, { ...e, count: e.count + 1, lastSeen: now });
    } else {
      this._entries.set(id, { key, locale, count: 1, firstSeen: now, lastSeen: now });
    }
  }

  /** All missing entries, sorted by frequency. */
  report(): MissingKeyEntry[] {
    return Array.from(this._entries.values()).sort((a, b) => b.count - a.count);
  }

  /** Missing keys for one locale. */
  forLocale(locale: string): MissingKeyEntry[] {
    return this.report().filter((e) => e.locale === locale.toLowerCase());
  }

  /**
   * Coverage matrix: keys present in `referenceKeys` (usually the default
   * locale's key set) vs each catalog — what still needs translation.
   */
  coverage(
    referenceKeys: ReadonlyArray<string>,
    catalogs: ReadonlyArray<{ locale: string; has(key: string): boolean }>
  ): Record<string, { missing: string[]; percent: number }> {
    const out: Record<string, { missing: string[]; percent: number }> = {};
    for (const cat of catalogs) {
      const missing = referenceKeys.filter((k) => !cat.has(k));
      out[cat.locale] = {
        missing,
        percent: referenceKeys.length === 0 ? 100 : Math.round(((referenceKeys.length - missing.length) / referenceKeys.length) * 1000) / 10,
      };
    }
    return out;
  }

  clear(): void {
    this._entries.clear();
  }
}

export interface I18nEngineOptions {
  /** Default/fallback locale (default 'en'). */
  readonly defaultLocale?: string;
  /** Marker rendered for a missing key (default `⟦key⟧`). */
  readonly missingMarker?: (key: string, locale: string) => string;
  readonly clock?: I18nClock;
  readonly pseudo?: PseudoLocalizer;
}

export class I18nEngine {
  private readonly _registry = new CatalogRegistry();
  private readonly _defaultLocale: string;
  private readonly _missingMarker: (key: string, locale: string) => string;
  private readonly _reporter: MissingKeyReporter;
  private readonly _pseudo: PseudoLocalizer;

  constructor(options: I18nEngineOptions = {}) {
    this._defaultLocale = (options.defaultLocale ?? 'en').toLowerCase();
    this._missingMarker = options.missingMarker ?? ((key) => `⟦${key}⟧`);
    this._reporter = new MissingKeyReporter(options.clock);
    this._pseudo = options.pseudo ?? new PseudoLocalizer();
  }

  get defaultLocale(): string {
    return this._defaultLocale;
  }

  get registry(): CatalogRegistry {
    return this._registry;
  }

  get reporter(): MissingKeyReporter {
    return this._reporter;
  }

  /** Register a catalog (data or lazy loader). */
  registerCatalog(locale: string, dataOrLoader: CatalogData | CatalogLoader): void {
    this._registry.register(locale, dataOrLoader);
  }

  /** Warm a locale (lazy load now). */
  async preload(locale: string): Promise<void> {
    await this._registry.preload(locale.toLowerCase());
  }

  /** Available locales (registered loaders + loaded catalogs). */
  locales(): ReadonlyArray<string> {
    return this._registry.available();
  }

  /**
   * Translate `key` (async — may lazy-load catalogs).
   * Locale resolution: explicit `locale` arg → `defaultLocale`.
   */
  async t(key: string, args: MessageArgs = {}, locale?: string): Promise<string> {
    const wanted = (locale ?? this._defaultLocale).toLowerCase();
    const found = await evaluateCatalogLookup(this._registry, key, wanted, this._defaultLocale);
    if (found === undefined) {
      this._reporter.record(key, wanted);
      return this._missingMarker(key, wanted);
    }
    return found.render(args);
  }

  /**
   * Sync translate — only already-loaded catalogs are consulted. Use when
   * `preload()` has run (e.g. inside a render path that can't await).
   */
  tSync(key: string, args: MessageArgs = {}, locale?: string): string {
    const wanted = (locale ?? this._defaultLocale).toLowerCase();
    for (const loc of fallbackChain(wanted, this._defaultLocale)) {
      const catalog = this._registry.getSync(loc);
      if (catalog) {
        const rendered = evaluateFrom(catalog, key, wanted, args);
        if (rendered !== undefined) return rendered;
      }
    }
    this._reporter.record(key, wanted);
    return this._missingMarker(key, wanted);
  }

  /** Pick the best locale for an Accept-Language header. */
  negotiateLocale(acceptLanguage: string): string | undefined {
    return negotiate(acceptLanguage, this.locales(), this._defaultLocale);
  }

  /** Parsed candidates of an Accept-Language header (for inspection). */
  parseLocales(acceptLanguage: string) {
    return parseAcceptLanguage(acceptLanguage);
  }

  /**
   * Pseudo-localized render of a key — used in tests to verify that a UI
   * actually went through the catalog (a hardcoded string won't pseudo).
   */
  async pseudo(key: string, args: MessageArgs = {}, locale?: string): Promise<string> {
    const wanted = (locale ?? this._defaultLocale).toLowerCase();
    const found = await evaluateCatalogLookup(this._registry, key, wanted, this._defaultLocale);
    if (found === undefined) {
      this._reporter.record(key, wanted);
      return this._missingMarker(key, wanted);
    }
    const pseudoTpl = this._pseudo.transformTemplate(found.template);
    return compileMessage(pseudoTpl).format(args, { locale: wanted });
  }

  /** Plural categories a locale's messages should provide. */
  expectedCategories(locale: string): ReadonlyArray<string> {
    return categoriesFor(locale);
  }
}
