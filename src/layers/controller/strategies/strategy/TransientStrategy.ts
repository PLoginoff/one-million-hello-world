/**
 * Transient Strategy
 * 
 * Creates a new instance for each request.
 */

import { IControllerStrategy } from './IControllerStrategy';
import { ControllerEntity } from '../../domain/entities/ControllerEntity';
import { ControllerScopeValueObject } from '../../domain/value-objects/ControllerScopeValueObject';

export class TransientStrategy implements IControllerStrategy {
  getName(): string {
    return 'TRANSIENT';
  }

  resolve(controller: ControllerEntity, scope: ControllerScopeValueObject): any {
    if (!scope.isTransient()) {
      throw new Error('Transient strategy requires transient scope');
    }

    return this.createInstance(controller);
  }

  private createInstance(controller: ControllerEntity): any {
    return {};
  }
}
