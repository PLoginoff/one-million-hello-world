/**
 * Router Interface
 * 
 * Defines the contract for routing operations
 * including route matching, parameter extraction, and wildcards.
 */

import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  Route,
  RouteMatch,
  RouterConfig,
  HttpMethod,
} from '../types/router-types';

/**
 * Interface for routing operations
 */
export interface IRouter {
  /**
   * Registers a new route
   * 
   * @param route - Route definition to register
   */
  registerRoute(route: Route): void;

  /**
   * Matches a request to a registered route
   * 
   * @param request - HTTP request to match
   * @returns Route match result
   */
  match(request: HttpRequest): RouteMatch;

  /**
   * Gets all registered routes
   * 
   * @returns Array of registered routes
   */
  getRoutes(): Route[];

  /**
   * Removes a route by path and method
   * 
   * @param method - HTTP method
   * @param path - Route path
   */
  removeRoute(method: HttpMethod, path: string): void;

  /**
   * Clears all registered routes
   */
  clearRoutes(): void;

  /**
   * Sets router configuration
   * 
   * @param config - Router configuration
   */
  setConfig(config: RouterConfig): void;

  /**
   * Gets current router configuration
   * 
   * @returns Current router configuration
   */
  getConfig(): RouterConfig;
}
