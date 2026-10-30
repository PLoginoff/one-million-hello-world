/**
 * Search Engine — public exports.
 *
 * @module SearchLayer/Engine
 */

export * from './types';
export {
  SymSpellIndex,
  deletes,
  damerauLevenshteinBounded,
} from './SymSpellIndex';
export { AutocompleteIndex } from './AutocompleteIndex';
export { QueryUnderstanding } from './QueryUnderstanding';
export type { QueryUnderstandingOptions } from './QueryUnderstanding';
export { LearningToRank, DEFAULT_WEIGHTS } from './LearningToRank';
