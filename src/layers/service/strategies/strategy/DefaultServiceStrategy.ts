/**
 * Default Service Strategy
 *
 * Default strategy that validates the service is enabled
 * before delegating execution to a synchronous strategy.
 */

import { IServiceStrategy } from './IServiceStrategy';
import { SynchronousServiceStrategy } from './SynchronousServiceStrategy';
import { ServiceEntity } from '../../domain/entities/ServiceEntity';

export class DefaultServiceStrategy implements IServiceStrategy {
  private readonly _delegate: SynchronousServiceStrategy;

  constructor() {
    this._delegate = new SynchronousServiceStrategy();
  }

  getName(): string {
    return 'DEFAULT';
  }

  async execute(service: ServiceEntity, input: unknown): Promise<unknown> {
    if (!service.isEnabled()) {
      throw new Error(`Service '${service.data.id}' is disabled`);
    }
    return this._delegate.execute(service, input);
  }
}
