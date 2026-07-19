/**
 * ApiVersioning Interface
 *
 * Defines the contract for the API version negotiation and deprecation management layer.
 */

import { ApiVersioningResult, ApiVersioningContext } from '../types/api-versioning-types';

export interface IApiVersioning {
  execute(context: ApiVersioningContext): Promise<ApiVersioningResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
