/**
 * Localization — Request-Scoped Localizer + Translation Memory
 *
 * `Localizer` binds an I18nEngine + a resolved locale + request-level
 * context args into a one-method facade: `l.t('key')`. Created once per
 * request (after `negotiateLocale`), so handlers don't thread the locale
 * through every call — the request-scoped equivalent of TenantContext.
 *
 * `TranslationMemory`: a learned map of source-string → known target
 * translations per locale. Powers:
 *   - consistency checks (the same English source always translating the
 *     same way),
 *   - auto-suggest for translators ("you translated 'Save' as 'Сохранить'
 *     14 times — use that"),
 *   - detecting drift (a new translation that differs from memory).
 *
 * @module Localization/I18n
 */

import { I18nEngine } from './I18nEngine';
import { MessageArgs } from './MessageFormat';

export class Localizer {
  private readonly _engine: I18nEngine;
  readonly locale: string;
  private readonly _baseArgs: MessageArgs;

  constructor(engine: I18nEngine, locale: string, baseArgs: MessageArgs = {}) {
    this._engine = engine;
    this.locale = locale.toLowerCase();
    this._baseArgs = baseArgs;
  }

  /** Translate in the bound locale; `args` merge over request-level base args. */
  async t(key: string, args: MessageArgs = {}): Promise<string> {
    return this._engine.t(key, { ...this._baseArgs, ...args }, this.locale);
  }

  /** Sync variant (preloaded catalogs only). */
  tSync(key: string, args: MessageArgs = {}): string {
    return this._engine.tSync(key, { ...this._baseArgs, ...args }, this.locale);
  }

  /** Child localizer with additional base args (e.g. tenant name). */
  extend(extraArgs: MessageArgs): Localizer {
    return new Localizer(this._engine, this.locale, { ...this._baseArgs, ...extraArgs });
  }
}

/** A memory entry: one observed source → target pair per locale. */
export interface MemoryEntry {
  readonly source: string;
  readonly target: string;
  readonly locale: string;
  /** Times this exact pair was observed. */
  readonly hits: number;
}

export class TranslationMemory {
  // locale → normalizedSource → entry
  private readonly _mem = new Map<string, Map<string, { source: string; target: string; hits: number }>>();

  /** Learn a translation pair. */
  learn(locale: string, source: string, target: string): void {
    const norm = locale.toLowerCase();
    let m = this._mem.get(norm);
    if (!m) {
      m = new Map();
      this._mem.set(norm, m);
    }
    const key = this._norm(source);
    const e = m.get(key);
    if (e && e.target === target) {
      e.hits++;
    } else {
      m.set(key, { source, target, hits: 1 });
    }
  }

  /**
   * Suggest a translation for `source` in `locale` — the most-hit learned
   * target, or undefined when memory has nothing.
   */
  suggest(locale: string, source: string): string | undefined {
    const m = this._mem.get(locale.toLowerCase());
    if (!m) return undefined;
    const e = m.get(this._norm(source));
    return e?.target;
  }

  /**
   * Consistency check: does `target` match the remembered translation of
   * `source`? Returns the memory entry when it *differs* (a drift signal).
   */
  check(locale: string, source: string, target: string): MemoryEntry | undefined {
    const m = this._mem.get(locale.toLowerCase());
    const e = m?.get(this._norm(source));
    if (!e) return undefined;
    return e.target === target ? undefined : { source, target: e.target, locale: locale.toLowerCase(), hits: e.hits };
  }

  /** All learned entries for a locale, most-hit first. */
  entries(locale: string): MemoryEntry[] {
    const m = this._mem.get(locale.toLowerCase());
    if (!m) return [];
    return Array.from(m.values())
      .map((e) => ({ source: e.source, target: e.target, locale: locale.toLowerCase(), hits: e.hits }))
      .sort((a, b) => b.hits - a.hits);
  }

  private _norm(s: string): string {
    return s.trim().replace(/\s+/g, ' ').toLowerCase();
  }
}
