/**
 * Localization Engine2 — public exports.
 *
 * @module LocalizationLayer/Engine2
 */

export * from './types';
export { TranslationMemory, similarity, DEFAULT_FUZZY_THRESHOLD } from './TranslationMemory';
export { MockTranslator, PhrasebookTranslator, MTOrchestrator } from './MachineTranslator';
export type { OrchestratorOptions, TranslationResult } from './MachineTranslator';
export { FallbackResolver, buildChain } from './FallbackResolver';
export { pluralCategory, formatPlural } from './PluralRules';
export { QualityScorer, placeholdersOf } from './QualityScorer';
