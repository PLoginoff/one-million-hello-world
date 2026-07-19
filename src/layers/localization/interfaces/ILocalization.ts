/**
 * Localization Interface
 *
 * Defines the contract for the Internationalization and locale management layer.
 */

import { LocalizationResult, LocalizationContext } from '../types/localization-types';

export interface ILocalization {
  execute(context: LocalizationContext): Promise<LocalizationResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
