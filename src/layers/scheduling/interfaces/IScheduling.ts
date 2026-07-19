/**
 * Scheduling Interface
 *
 * Defines the contract for the Cron-based and event-driven job scheduling layer.
 */

import { SchedulingResult, SchedulingContext } from '../types/scheduling-types';

export interface IScheduling {
  execute(context: SchedulingContext): Promise<SchedulingResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
