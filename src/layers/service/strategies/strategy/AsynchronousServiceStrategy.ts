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

  async execute(service: ServiceEntity, input: any): Promise<any> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(input);
      }, 0);
    });
  }
}
