/**
 * Proxy Interface
 * 
 * Defines the contract for proxy operations
 * including access control, lazy loading, and caching proxy.
 */

import { ProxyResult, ProxyConfig } from '../types/proxy-types';

/**
 * Interface for proxy operations
 */
export interface IProxy {
  /**
   * Executes operation with proxy features
   * 
   * @param operation - Operation to execute
   * @param key - Cache key
   * @returns Proxy result
   */
  execute<T>(operation: () => Promise<T>, key: string): Promise<ProxyResult<T>>;

  /**
   * Clears cache
   * 
   * @param key - Cache key
   */
  clearCache(key?: string): void;

  /**
   * Sets proxy configuration
   * 
   * @param config - Proxy configuration
   */
  setConfig(config: ProxyConfig): void;

  /**
   * Gets current proxy configuration
   * 
   * @returns Current proxy configuration
   */
  getConfig(): ProxyConfig;
}
