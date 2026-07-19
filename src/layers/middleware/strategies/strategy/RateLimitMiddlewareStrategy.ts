/**
 * Rate Limit Middleware Strategy
 */

import { IMiddlewareStrategy } from './IMiddlewareStrategy';
import { MiddlewareContextEntity } from '../../domain/entities/MiddlewareContextEntity';

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

export class RateLimitMiddlewareStrategy implements IMiddlewareStrategy {
  private readonly _options: RateLimitOptions;
  private _requests: Map<number, number[]>;
  private _allowed: number;
  private _rejected: number;

  constructor(options: RateLimitOptions) {
    this._options = options;
    this._requests = new Map();
    this._allowed = 0;
    this._rejected = 0;
  }

  getName(): string {
    return 'RATE_LIMIT';
  }

  async execute(context: MiddlewareContextEntity): Promise<MiddlewareContextEntity> {
    const key = context.data.timestamp;
    const now = Date.now();
    const windowStart = now - this._options.windowMs;

    const timestamps = this._requests.get(key) ?? [];
    const recent = timestamps.filter((t) => t > windowStart);

    if (recent.length >= this._options.maxRequests) {
      this._rejected++;
      const rejected = context
        .setMetadata('rateLimited', true)
        .setMetadata('retryAfterMs', this._options.windowMs - (now - recent[0]));
      return Promise.resolve(rejected);
    }

    recent.push(now);
    this._requests.set(key, recent);
    this._allowed++;

    const allowed = context
      .setMetadata('rateLimitRemaining', this._options.maxRequests - recent.length)
      .setMetadata('rateLimitLimit', this._options.maxRequests);
    return Promise.resolve(allowed);
  }

  getAllowedCount(): number {
    return this._allowed;
  }

  getRejectedCount(): number {
    return this._rejected;
  }

  reset(): void {
    this._requests.clear();
    this._allowed = 0;
    this._rejected = 0;
  }
}
