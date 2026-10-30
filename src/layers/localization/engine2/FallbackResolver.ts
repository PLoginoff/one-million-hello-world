/**
 * Locale Fallback Resolver
 *
 * Resolves a message key for a requested locale by walking a fallback
 * chain: region-specific -> language-only -> default locale, with
 * per-key overrides that pin individual keys to a fixed locale.
 *
 * e.g. requesting `pt-BR` with default `en` tries:
 *   pt-BR -> pt -> en
 *
 * A missing key at one level continues the walk; a `KeyOverride` for
 * `(key, locale)` jumps directly to that locale's catalog (useful for
 * legal text that must always render in one language).
 *
 * Chains are built via {@link buildChain} which parses BCP-47-ish
 * `lang-REGION` tags — multi-level regions like `zh-Hant-TW` fall back
 * one subtag at a time: `zh-Hant-TW -> zh-Hant -> zh -> en`.
 *
 * @module LocalizationLayer/Engine2
 */

import { FallbackChain, KeyOverride, LocaleCatalog } from './types';

export class FallbackResolver {
  private readonly _catalogs: Map<string, Map<string, string>>;
  private readonly _overrides: Map<string, string>;
  private readonly _defaultLocale: string;

  constructor(defaultLocale: string) {
    this._catalogs = new Map();
    this._overrides = new Map();
    this._defaultLocale = defaultLocale;
  }

  /** Register (or merge into) a locale's catalog. */
  register(catalog: LocaleCatalog): void {
    let m = this._catalogs.get(catalog.locale);
    if (!m) {
      m = new Map();
      this._catalogs.set(catalog.locale, m);
    }
    for (const [k, v] of Object.entries(catalog.messages)) m.set(k, v);
  }

  /** Pin `key` to always resolve from `locale`, bypassing the chain. */
  overrideKey(override: KeyOverride): void {
    this._overrides.set(override.key, override.locale);
  }

  /** Remove a per-key override. */
  clearOverride(key: string): void {
    this._overrides.delete(key);
  }

  /**
   * Resolve `key` for `requested` locale.
   * Returns `{ value, resolvedFrom }` — `resolvedFrom` is the locale
   * that actually supplied the string (useful for "show translation
   * gaps" tooling). Null when no catalog in the chain has the key.
   */
  resolve(
    key: string,
    requested: string
  ): { value: string; resolvedFrom: string } | null {
    const pinned = this._overrides.get(key);
    const chain = pinned !== undefined ? [pinned] : buildChain(requested, this._defaultLocale).chain;
    for (const locale of chain) {
      const v = this._catalogs.get(locale)?.get(key);
      if (v !== undefined) return { value: v, resolvedFrom: locale };
    }
    return null;
  }

  /** Just the string, or `undefined` — convenience wrapper. */
  get(key: string, requested: string): string | undefined {
    return this.resolve(key, requested)?.value;
  }

  /** The resolution chain for a locale without consulting catalogs. */
  chainFor(requested: string): FallbackChain {
    return buildChain(requested, this._defaultLocale);
  }
}

/**
 * Build the fallback chain for a BCP-47-ish tag: strip subtags
 * right-to-left until the bare language, then append the default
 * (unless already present).
 *
 * `zh-Hant-TW` + default `en` -> `['zh-Hant-TW','zh-Hant','zh','en']`
 */
export function buildChain(requested: string, defaultLocale: string): FallbackChain {
  const chain: string[] = [];
  let cur: string | null = requested;
  while (cur !== null && cur.length > 0) {
    if (!chain.includes(cur)) chain.push(cur);
    const idx = cur.lastIndexOf('-');
    cur = idx > 0 ? cur.slice(0, idx) : null;
  }
  if (!chain.includes(defaultLocale)) chain.push(defaultLocale);
  return { requested, chain };
}
