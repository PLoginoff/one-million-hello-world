/**
 * Logging Middleware Strategy
 */

import { IMiddlewareStrategy } from './IMiddlewareStrategy';
import { MiddlewareContextEntity } from '../../domain/entities/MiddlewareContextEntity';

export interface IMiddlewareLogger {
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}

export class LoggingMiddlewareStrategy implements IMiddlewareStrategy {
  private readonly _logger: IMiddlewareLogger;
  private readonly _level: string;

  constructor(logger: IMiddlewareLogger, level: string = 'info') {
    this._logger = logger;
    this._level = level;
  }

  getName(): string {
    return 'LOGGING';
  }

  async execute(context: MiddlewareContextEntity): Promise<MiddlewareContextEntity> {
    const start = Date.now();
    this._logger.log(this._level, 'middleware:request', {
      timestamp: context.data.timestamp,
    });

    const elapsed = Date.now() - start;
    this._logger.log(this._level, 'middleware:response', {
      elapsedMs: elapsed,
    });

    return Promise.resolve(context);
  }
}
