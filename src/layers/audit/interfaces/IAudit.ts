/**
 * Audit Interface
 *
 * Defines the contract for the Audit logging and compliance tracking layer.
 */

import { AuditResult, AuditContext } from '../types/audit-types';

export interface IAudit {
  /**
   * Execute the audit operation
   */
  execute(context: AuditContext): Promise<AuditResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
