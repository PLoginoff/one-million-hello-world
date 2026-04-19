/**
 * Request Strategy
 * 
 * Creates a new instance per request context.
 */

import { IControllerStrategy } from './IControllerStrategy';
import { ControllerEntity } from '../../domain/entities/ControllerEntity';
import { ControllerScopeValueObject } from '../../domain/value-objects/ControllerScopeValueObject';

export class RequestStrategy implements IControllerStrategy {
  private requestInstances: Map<string, Map<string, any>>;

  constructor() {
    this.requestInstances = new Map();
  }

  getName(): string {
    return 'REQUEST';
  }

  resolve(controller: ControllerEntity, scope: ControllerScopeValueObject, requestId?: string): any {
    if (!scope.isRequest()) {
      throw new Error('Request strategy requires request scope');
    }

    if (!requestId) {
      throw new Error('Request ID is required for request scope');
    }

    let requestMap = this.requestInstances.get(requestId);
    if (!requestMap) {
      requestMap = new Map();
      this.requestInstances.set(requestId, requestMap);
    }

    const existingInstance = requestMap.get(controller.data.id);
    if (existingInstance) {
      return existingInstance;
    }

    const instance = this.createInstance(controller);
    requestMap.set(controller.data.id, instance);
    return instance;
  }

  private createInstance(controller: ControllerEntity): any {
    return {};
  }

  /**
   * Clear instances for a specific request
   */
  clearRequest(requestId: string): void {
    this.requestInstances.delete(requestId);
  }

  /**
   * Clear all instances
   */
  clear(): void {
    this.requestInstances.clear();
  }
}
