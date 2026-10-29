/**
 * Asynchronous Service Strategy
 *
 * Executes service asynchronously.
 */

import { IServiceStrategy } from './IServiceStrategy';
import { ServiceEntity } from '../../domain/entities/ServiceEntity';

export class AsynchronousServiceStrategy implements IServiceStrategy {
  getName(): string {
    return 'ASYNCHRONOUS';
  }

  getPriority(): number {
    return 20;
  }

  async execute(service: ServiceEntity, input: unknown): Promise<unknown> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(input);
      }, 0);
    });
  }
}
