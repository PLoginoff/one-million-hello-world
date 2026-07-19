/**
 * Billing Interface
 *
 * Defines the contract for the Usage metering, plan limits, and invoicing layer.
 */

import { BillingResult, BillingContext } from '../types/billing-types';

export interface IBilling {
  execute(context: BillingContext): Promise<BillingResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
