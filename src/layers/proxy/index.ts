/**
 * Proxy Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Proxy Layer (Layer 23 of the 25-layer architecture).
 * 
 * The Proxy Layer provides access control,
 * lazy loading, and caching proxy.
 * 
 * @module ProxyLayer
 */

export { IProxy } from './interfaces/IProxy';
export { Proxy } from './implementations/Proxy';
export * from './types/proxy-types';
