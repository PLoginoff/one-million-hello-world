/**
 * Default Controller Strategy
 *
 * Default strategy that delegates to a transient strategy
 * while providing sensible defaults for controller resolution.
 */

import { IControllerStrategy } from './IControllerStrategy';
import { TransientStrategy } from './TransientStrategy';
import { ControllerEntity } from '../../domain/entities/ControllerEntity';
import { ControllerScopeValueObject } from '../../domain/value-objects/ControllerScopeValueObject';

export class DefaultControllerStrategy implements IControllerStrategy {
  private readonly _delegate: TransientStrategy;

  constructor() {
    this._delegate = new TransientStrategy();
  }

  getName(): string {
    return 'DEFAULT';
  }

  resolve(controller: ControllerEntity, scope: ControllerScopeValueObject): unknown {
    if (!controller.isEnabled()) {
      throw new Error(`Controller '${controller.data.id}' is disabled`);
    }
    return this._delegate.resolve(controller, scope);
  }
}
