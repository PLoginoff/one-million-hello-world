/**
 * Synchronous Service Strategy
 * 
 * Executes service synchronously.
 */

import { IServiceStrategy } from './IServiceStrategy';
import { ServiceEntity } from '../../domain/entities/ServiceEntity';

export class SynchronousServiceStrategy implements IServiceStrategy {
  getName(): string {
    return 'SYNCHRONOUS';
  }

  async execute(service: ServiceEntity, input: any): Promise<any> {
    return input;
  }
}
