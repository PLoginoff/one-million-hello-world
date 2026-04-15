/**
 * Decorator Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Decorator Layer (Layer 24 of the 25-layer architecture).
 * 
 * The Decorator Layer provides runtime decoration
 * and cross-cutting concerns.
 * 
 * @module DecoratorLayer
 */

export { IDecorator } from './interfaces/IDecorator';
export { Decorator } from './implementations/Decorator';
export * from './types/decorator-types';
