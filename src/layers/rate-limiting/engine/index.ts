/**
 * Rate-Limiting Engine — public exports.
 *
 * @module RateLimitingLayer/Engine
 */

export * from './types';
// Renamed to avoid colliding with the `SlidingWindowLog` interface in
// types/rate-limiting-types (a data shape, not the limiter class).
export { SlidingWindowLog as SlidingWindowLogLimiter } from './SlidingWindowLog';
export { QuotaBuckets } from './QuotaBuckets';
export { PenaltyEscalator } from './PenaltyEscalator';
export { TokenBucket } from './TokenBucket';
export { LimitHeaders } from './LimitHeaders';
