/**
 * Localization — Fallback Chain Lookup
 *
 * Resolves a key through a locale's fallback chain. Extracted from the
 * engine so both the async (`t`) and sync (`tSync`) paths share one chain
 * walk, and so catalogs can be probed without full evaluation.
 *
 * @module Localization/I18n
 */

import { CatalogRegistry, MessageCatalog } from './MessageCatalog';
import { compileMessage, MessageArgs, formatMessage } from './MessageFormat';
import { fallbackChain } from './LocaleNegotiator';
import { pluralRuleFor } from './PluralRules';

export interface LookupHit {
  /** Locale whose catalog actually supplied the message. */
  readonly locale: string;
  /** Raw template (pre-format). */
  readonly template: string;
  /** Evaluate with args → final string. */
  render(args: MessageArgs): string;
}

/**
 * Async lookup — walks `chain` (computed from `wanted → default`) and
 * returns the first catalog containing `key`. Undefined on total miss.
 */
export async function evaluateCatalogLookup(
  registry: CatalogRegistry,
  key: string,
  wanted: string,
  defaultLocale: string
): Promise<LookupHit | undefined> {
  for (const loc of fallbackChain(wanted, defaultLocale)) {
    const catalog = await registry.get(loc);
    if (catalog?.has(key)) {
      return hit(catalog, key, wanted);
    }
  }
  return undefined;
}

/** Sync lookup over an already-loaded catalog. */
export function evaluateFrom(
  catalog: MessageCatalog,
  key: string,
  wanted: string,
  args: MessageArgs
): string | undefined {
  const tpl = catalog.raw(key);
  if (tpl === undefined) return undefined;
  return formatMessage(tpl, args, wanted);
}

function hit(catalog: MessageCatalog, key: string, wanted: string): LookupHit {
  const template = catalog.raw(key) as string;
  return {
    locale: catalog.locale,
    template,
    render: (args) => formatMessage(template, args, wanted),
  };
}

export { pluralRuleFor };
