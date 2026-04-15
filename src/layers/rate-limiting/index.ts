/**
 * Rate Limiting Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Rate Limiting Layer (Layer 4 of the 25-layer architecture).
 * 
 * The Rate Limiting Layer provides IP-based, user-based, and API key-based
 * rate limiting with multiple strategies.
 * 
 * @module RateLimitingLayer
 */

export { IRateLimiter } from './interfaces/IRateLimiter';
export { RateLimiter } from './implementations/RateLimiter';
export * from './types/rate-limiting-types';
