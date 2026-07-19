/**
 * Request Strategy
 *
 * Creates a new instance per request context.
 */

import { IControllerStrategy } from './IControllerStrategy';
import { ControllerEntity } from '../../domain/entities/ControllerEntity';
import { ControllerScopeValueObject } from '../../domain/value-objects/ControllerScopeValueObject';

export class RequestStrategy implements IControllerStrategy {
  private requestInstances: Map<string, Map<string, unknown>>;

  constructor() {
    this.requestInstances = new Map();
  }

  getName(): string {
    return 'REQUEST';
  }

  resolve(controller: ControllerEntity, scope: ControllerScopeValueObject, requestId?: string): unknown {
    if (!scope.isRequest()) {
      throw new Error('Request strategy requires request scope');
    }

    if (requestId === undefined || requestId === '') {
      throw new Error('Request ID is required for request scope');
    }

    let requestMap = this.requestInstances.get(requestId);
    if (requestMap === undefined) {
      requestMap = new Map();
      this.requestInstances.set(requestId, requestMap);
    }

    const existingInstance = requestMap.get(controller.data.id);
    if (existingInstance !== undefined) {
      return existingInstance;
    }

    const instance = this.createInstance(controller);
    requestMap.set(controller.data.id, instance);
    return instance;
  }

  private createInstance(_controller: ControllerEntity): unknown {
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
