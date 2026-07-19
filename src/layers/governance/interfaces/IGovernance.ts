/**
 * Governance Interface
 *
 * Defines the contract for the Policies, compliance rules, and audit governance layer.
 */

import { GovernanceResult, GovernanceContext } from '../types/governance-types';

export interface IGovernance {
  execute(context: GovernanceContext): Promise<GovernanceResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
