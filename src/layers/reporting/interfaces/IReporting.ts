/**
 * Reporting Interface
 *
 * Defines the contract for the Report generation and export in multiple formats layer.
 */

import { ReportingResult, ReportingContext } from '../types/reporting-types';

export interface IReporting {
  execute(context: ReportingContext): Promise<ReportingResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
