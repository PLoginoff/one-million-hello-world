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

  getPriority(): number {
    return 10;
  }

  async execute(service: ServiceEntity, input: unknown): Promise<unknown> {
    return Promise.resolve(input);
  }
}
