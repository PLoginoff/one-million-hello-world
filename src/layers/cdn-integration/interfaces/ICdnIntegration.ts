/**
 * CdnIntegration Interface
 *
 * Defines the contract for the CDN purge, invalidation, and cache management layer.
 */

import { CdnIntegrationResult, CdnIntegrationContext } from '../types/cdn-integration-types';

export interface ICdnIntegration {
  execute(context: CdnIntegrationContext): Promise<CdnIntegrationResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
