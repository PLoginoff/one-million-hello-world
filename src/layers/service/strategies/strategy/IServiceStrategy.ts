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
   * Execute service
   */
  execute(service: ServiceEntity, input: unknown): Promise<unknown>;
}
