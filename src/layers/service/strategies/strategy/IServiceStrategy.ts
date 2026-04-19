/**
 * Service Strategy Interface
 * 
 * Defines contract for different service strategies.
 */

import { ServiceEntity } from '../../domain/entities/ServiceEntity';
import { ServiceStatusValueObject } from '../../domain/value-objects/ServiceStatusValueObject';

export interface IServiceStrategy {
  /**
   * Get strategy name
   */
  getName(): string;

  /**
   * Execute service
   */
  execute(service: ServiceEntity, input: any): Promise<any>;
}
