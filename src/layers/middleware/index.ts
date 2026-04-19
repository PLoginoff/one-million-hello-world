/**
 * Middleware Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Middleware Layer (Layer 6 of the 25-layer architecture).
 * 
 * The Middleware Layer provides logging, metrics, tracing,
 * and correlation ID management.
 * 
 * @module MiddlewareLayer
 */

export { IMiddlewareManager } from './interfaces/IMiddlewareManager';
export { MiddlewareManager } from './implementations/MiddlewareManager';
export * from './types/middleware-types';

export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './statistics';
export * from './factories';
export * from './utils';
