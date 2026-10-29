/**
 * Localization — Message Catalogs
 *
 * A catalog is one locale's message map. Supports nested keys
 * (`errors.auth.invalid` inside `{errors:{auth:{invalid:"…"}}}` — flat and
 * nested forms interoperate), lazy loading via a `CatalogLoader`, and a
 * compiled-message cache so each template is parsed once.
 *
 * Missing keys are tracked per-locale for the MissingKeyReporter — a
 * localized "key not found" is better than a silent empty string, so the
 * engine renders `⟦key⟧` (configurable) AND records it.
 *
 * @module Localization/I18n
 */

import { compileMessage, MessageNode } from './MessageFormat';

/** Raw catalog payload — flat or nested (or mixed). */
export type CatalogData = Record<string, unknown>;

/** Loads catalog data for a locale — async so files/remote fit too. */
export type CatalogLoader = (locale: string) => Promise<CatalogData | undefined>;

/** Registry of known loaders; lazy = catalogs load on first use. */
export class CatalogRegistry {
  private readonly _loaders = new Map<string, CatalogLoader>();
  private readonly _loaded = new Map<string, MessageCatalog>();
  private readonly _pending = new Map<string, Promise<MessageCatalog | undefined>>();

  /** Register a loader (or plain data — wrapped into a sync loader). */
  register(locale: string, loaderOrData: CatalogLoader | CatalogData): void {
    const norm = locale.toLowerCase();
    if (typeof loaderOrData === 'function') {
      this._loaders.set(norm, loaderOrData);
    } else {
      this._loaders.set(norm, () => Promise.resolve(loaderOrData));
    }
  }

  hasLoader(locale: string): boolean {
    return this._loaders.has(locale.toLowerCase());
  }

  /** Locales with a loader OR already loaded. */
  available(): ReadonlyArray<string> {
    return Array.from(new Set([...this._loaders.keys(), ...this._loaded.keys()])).sort();
  }

  /** Preload — pulls the catalog now instead of first use. */
  async preload(locale: string): Promise<MessageCatalog | undefined> {
    return this.get(locale);
  }

  /** Get a catalog — lazy-loads on first access, caches the promise so
   *  concurrent callers share one load (no duplicate I/O). */
  get(locale: string): Promise<MessageCatalog | undefined> {
    const norm = locale.toLowerCase();
    const loaded = this._loaded.get(norm);
    if (loaded) return Promise.resolve(loaded);
    const pending = this._pending.get(norm);
    if (pending) return pending;
    const loader = this._loaders.get(norm);
    if (!loader) return Promise.resolve(undefined);
    const p = (async () => {
      const data = await loader(norm);
      if (data === undefined) return undefined;
      const catalog = new MessageCatalog(norm, data);
      this._loaded.set(norm, catalog);
      return catalog;
    })();
    this._pending.set(norm, p);
    return p;
  }

  /** Inject a ready-made catalog (test fixtures). */
  inject(catalog: MessageCatalog): void {
    this._loaded.set(catalog.locale.toLowerCase(), catalog);
  }

  /**
   * Sync lookup over already-loaded catalogs only — never triggers a load.
   * Used by `tSync` after `preload()` has warmed the needed locales.
   */
  getSync(locale: string): MessageCatalog | undefined {
    return this._loaded.get(locale.toLowerCase());
  }

  unload(locale: string): void {
    const norm = locale.toLowerCase();
    this._loaded.delete(norm);
    this._pending.delete(norm);
  }
}

export class MessageCatalog {
  readonly locale: string;
  private readonly _messages = new Map<string, string>();
  private readonly _compiled = new Map<string, MessageNode[]>();

  constructor(locale: string, data: CatalogData) {
    this.locale = locale;
    this._flatten(data, '');
  }

  get size(): number {
    return this._messages.size;
  }

  /** Raw template for `key`, or undefined. */
  raw(key: string): string | undefined {
    return this._messages.get(key);
  }

  /** Compiled AST for `key` — parsed once, cached. Undefined if absent. */
  compiled(key: string): MessageNode[] | undefined {
    const tpl = this._messages.get(key);
    if (tpl === undefined) return undefined;
    let ast = this._compiled.get(key);
    if (!ast) {
      ast = compileMessage(tpl).ast;
      this._compiled.set(key, ast);
    }
    return ast;
  }

  keys(): ReadonlyArray<string> {
    return Array.from(this._messages.keys()).sort();
  }

  has(key: string): boolean {
    return this._messages.has(key);
  }

  /** Merge additional messages (override layer — e.g. tenant overrides). */
  merge(data: CatalogData): void {
    this._flatten(data, '');
    // Compiled cache holds stale ASTs for overwritten keys — drop all; a
    // merge is rare and correctness beats cache micro-optimization.
    this._compiled.clear();
  }

  /** Flatten nested objects into dot-keys; leaf values must be strings. */
  private _flatten(node: CatalogData, prefix: string): void {
    for (const key of Object.keys(node)) {
      const v = node[key];
      const path = prefix === '' ? key : `${prefix}.${key}`;
      if (typeof v === 'string') {
        this._messages.set(path, v);
      } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        this._flatten(v as CatalogData, path);
      }
      // Non-string leaves (numbers, arrays) are ignored — a catalog is a
      // message map, not a config store.
    }
  }
}
