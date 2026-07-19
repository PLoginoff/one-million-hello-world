/**
 * MultiTenancy Interface
 *
 * Defines the contract for the Multi-tenant context and isolation strategies layer.
 */

import { MultiTenancyResult, MultiTenancyContext } from '../types/multi-tenancy-types';

export interface IMultiTenancy {
  execute(context: MultiTenancyContext): Promise<MultiTenancyResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
