/**
 * Singleton Strategy
 * 
 * Creates and reuses a single instance per controller.
 */

import { IControllerStrategy } from './IControllerStrategy';
import { ControllerEntity } from '../../domain/entities/ControllerEntity';
import { ControllerScopeValueObject } from '../../domain/value-objects/ControllerScopeValueObject';

export class SingletonStrategy implements IControllerStrategy {
  private instances: Map<string, any>;

  constructor() {
    this.instances = new Map();
  }

  getName(): string {
    return 'SINGLETON';
  }

  resolve(controller: ControllerEntity, scope: ControllerScopeValueObject): any {
    if (!scope.isSingleton()) {
      throw new Error('Singleton strategy requires singleton scope');
    }

    const existingInstance = this.instances.get(controller.data.id);
    if (existingInstance) {
      return existingInstance;
    }

    const instance = this.createInstance(controller);
    this.instances.set(controller.data.id, instance);
    return instance;
  }

  private createInstance(controller: ControllerEntity): any {
    return {};
  }

  /**
   * Clear all instances
   */
  clear(): void {
    this.instances.clear();
  }
}
