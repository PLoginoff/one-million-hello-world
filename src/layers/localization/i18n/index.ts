/**
 * Localization — public exports.
 */

export {
  pluralRuleFor,
  categoriesFor,
  enPlural,
  ruPlural,
  jaPlural,
  arPlural,
  frPlural,
  plPlural,
  dePlural,
} from './PluralRules';
export type { PluralCategory, PluralRuleFn } from './PluralRules';
export { compileMessage, formatMessage, MessageParseError } from './MessageFormat';
export type { MessageNode, MessageArgs, MessageValue, FormatContext } from './MessageFormat';
export { parseAcceptLanguage, fallbackChain, negotiate } from './LocaleNegotiator';
export type { LocaleCandidate } from './LocaleNegotiator';
export { MessageCatalog, CatalogRegistry } from './MessageCatalog';
export type { CatalogData, CatalogLoader } from './MessageCatalog';
export { evaluateCatalogLookup, evaluateFrom } from './MessageLookup';
export type { LookupHit } from './MessageLookup';
export { PseudoLocalizer } from './PseudoLocalizer';
export type { PseudoOptions } from './PseudoLocalizer';
export { I18nEngine, MissingKeyReporter } from './I18nEngine';
export type { I18nEngineOptions, MissingKeyEntry, I18nClock } from './I18nEngine';
export { Localizer, TranslationMemory } from './Localizer';
export type { MemoryEntry } from './Localizer';
