/**
 * Logging Controller Strategy
 *
 * Decorates another strategy with logging for each resolution.
 */

import { IControllerStrategy } from './IControllerStrategy';
import { ControllerEntity } from '../../domain/entities/ControllerEntity';
import { ControllerScopeValueObject } from '../../domain/value-objects/ControllerScopeValueObject';

export interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export class LoggingControllerStrategy implements IControllerStrategy {
  private readonly _inner: IControllerStrategy;
  private readonly _logger: ILogger;
  private readonly _logPrefix: string;

  constructor(inner: IControllerStrategy, logger: ILogger, logPrefix: string = '[ControllerStrategy]') {
    this._inner = inner;
    this._logger = logger;
    this._logPrefix = logPrefix;
  }

  getName(): string {
    return `LOGGING(${this._inner.getName()})`;
  }

  resolve(controller: ControllerEntity, scope: ControllerScopeValueObject): unknown {
    const start = Date.now();
    this._logger.info(`${this._logPrefix} resolving controller`, {
      controllerId: controller.data.id,
      controllerName: controller.data.name,
      scope: scope.toString(),
    });

    try {
      const instance = this._inner.resolve(controller, scope);
      const elapsed = Date.now() - start;
      this._logger.info(`${this._logPrefix} controller resolved`, {
        controllerId: controller.data.id,
        elapsedMs: elapsed,
      });
      return instance;
    } catch (error) {
      const elapsed = Date.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      this._logger.error(`${this._logPrefix} controller resolution failed`, {
        controllerId: controller.data.id,
        elapsedMs: elapsed,
        error: message,
      });
      throw error;
    }
  }
}
