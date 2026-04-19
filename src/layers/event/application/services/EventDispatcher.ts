/**
 * EventDispatcher - Application Service
 * 
 * Dispatches events to registered handlers with middleware support.
 * Coordinates event flow with policies and error handling.
 */

import { IEventDispatcher, DispatchOptions, DispatchMiddleware, DispatchResult } from '../interfaces';
import { IEventHandlerRegistry } from '../interfaces';
import { IEventBus } from '../../core/interfaces';
import { Event } from '../../domain/entities/Event';

export class EventDispatcher implements IEventDispatcher {
  private _registry: IEventHandlerRegistry;
  private _eventBus: IEventBus;
  private _middleware: DispatchMiddleware[];

  constructor(registry: IEventHandlerRegistry, eventBus: IEventBus) {
    this._registry = registry;
    this._eventBus = eventBus;
    this._middleware = [];
  }

  async dispatch<T>(event: Event<T>, options: DispatchOptions = {}): Promise<DispatchResult> {
    const startTime = performance.now();
    const asyncMode = options.async ?? false;
    const timeout = options.timeout;

    const registrations = this._registry.getByPriority(event.type.value);
    const handlersExecuted = registrations.length;
    let handlersSucceeded = 0;
    let handlersFailed = 0;
    const errors: Error[] = [];

    const executeHandler = async (registration: any): Promise<void> => {
      try {
        if (timeout) {
          await this._executeWithTimeout(registration.handler, event, timeout);
        } else {
          await registration.handler(event);
        }
        handlersSucceeded++;
      } catch (error) {
        handlersFailed++;
        errors.push(error as Error);
        
        if (options.retryOnFailure && options.maxRetries) {
          await this._retryHandler(registration.handler, event, options.maxRetries);
        }
      }
    };

    try {
      await this._executeWithMiddleware(event, async () => {
        if (asyncMode) {
          await Promise.all(registrations.map(executeHandler));
        } else {
          for (const registration of registrations) {
            await executeHandler(registration);
          }
        }
      });
    } catch (error) {
      errors.push(error as Error);
    }

    const executionTime = performance.now() - startTime;

    return {
      success: handlersFailed === 0,
      eventId: event.id.value,
      eventType: event.type.value,
      handlersExecuted,
      handlersSucceeded,
      handlersFailed,
      executionTime,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async dispatchBatch<T>(events: Event<T>[], options?: DispatchOptions): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];

    for (const event of events) {
      const result = await this.dispatch(event, options);
      results.push(result);
    }

    return results;
  }

  addMiddleware(middleware: DispatchMiddleware): void {
    this._middleware.push(middleware);
  }

  removeMiddleware(middleware: DispatchMiddleware): void {
    const index = this._middleware.indexOf(middleware);
    if (index !== -1) {
      this._middleware.splice(index, 1);
    }
  }

  private async _executeWithMiddleware(
    event: Event,
    finalHandler: () => Promise<void>
  ): Promise<void> {
    let index = 0;

    const next = async (): Promise<void> => {
      if (index < this._middleware.length) {
        const middleware = this._middleware[index++];
        await middleware(event, next);
      } else {
        await finalHandler();
      }
    };

    await next();
  }

  private async _executeWithTimeout<T>(
    handler: (event: T) => void | Promise<void>,
    event: T,
    timeout: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Handler execution timed out after ${timeout}ms`));
      }, timeout);

      Promise.resolve(handler(event))
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async _retryHandler<T>(
    handler: (event: T) => void | Promise<void>,
    event: T,
    maxRetries: number
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await handler(event);
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        await this._delay(100 * attempt);
      }
    }
  }

  private _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
