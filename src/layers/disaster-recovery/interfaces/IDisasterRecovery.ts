/**
 * DisasterRecovery Interface
 *
 * Defines the contract for the DR drills, failover, and recovery orchestration layer.
 */

import { DisasterRecoveryResult, DisasterRecoveryContext } from '../types/disaster-recovery-types';

export interface IDisasterRecovery {
  execute(context: DisasterRecoveryContext): Promise<DisasterRecoveryResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
