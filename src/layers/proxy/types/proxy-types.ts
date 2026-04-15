/**
 * Proxy Layer Types
 * 
 * This module defines all type definitions for the Proxy Layer,
 * including access control, lazy loading, and caching proxy.
 */

/**
 * Proxy result
 */
export interface ProxyResult<T> {
  success: boolean;
  data?: T;
  fromCache: boolean;
  error?: string;
}

/**
 * Proxy configuration
 */
export interface ProxyConfig {
  enableAccessControl: boolean;
  enableLazyLoading: boolean;
  enableCaching: boolean;
}
