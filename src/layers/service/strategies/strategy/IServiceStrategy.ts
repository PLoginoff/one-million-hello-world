/**
 * Service Strategy Interface
 *
 * Defines contract for different service strategies.
 */

import { ServiceEntity } from '../../domain/entities/ServiceEntity';

export interface IServiceStrategy {
  /**
   * Get strategy name
   */
  getName(): string;

  /**
   * Get strategy priority (higher values = higher priority)
   */
  getPriority(): number;

  /**
   * Execute service
   */
  execute(service: ServiceEntity, input: unknown): Promise<unknown>;
}
