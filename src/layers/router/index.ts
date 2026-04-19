/**
 * Router Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Router Layer (Layer 7 of the 25-layer architecture).
 * 
 * The Router Layer provides route matching, parameter extraction,
 * and wildcard support.
 * 
 * @module RouterLayer
 */

export { IRouter } from './interfaces/IRouter';
export { Router } from './implementations/Router';
export * from './types/router-types';

export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './statistics';
export * from './factories';
export * from './utils';
