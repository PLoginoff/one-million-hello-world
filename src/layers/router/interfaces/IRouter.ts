/**
 * Router Interface
 * 
 * Defines the contract for routing operations
 * including route matching, parameter extraction, wildcards,
 * route groups, caching, statistics, and advanced filtering.
 */

import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  Route,
  RouteMatch,
  RouterConfig,
  HttpMethod,
  RouteGroup,
  RouteStatistics,
  RouteFilter,
  MiddlewareDefinition,
  ValidationResult,
  RouteMetadata,
  RouteStatus,
  RoutePriority,
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

  /**
   * Registers a route group
   * 
   * @param group - Route group definition
   */
  registerRouteGroup(group: RouteGroup): void;

  /**
   * Removes a route group by name
   * 
   * @param name - Route group name
   */
  removeRouteGroup(name: string): void;

  /**
   * Gets all registered route groups
   * 
   * @returns Array of registered route groups
   */
  getRouteGroups(): RouteGroup[];

  /**
   * Gets routes filtered by criteria
   * 
   * @param filter - Route filter criteria
   * @returns Array of filtered routes
   */
  getFilteredRoutes(filter: RouteFilter): Route[];

  /**
   * Gets a route by path and method
   * 
   * @param method - HTTP method
   * @param path - Route path
   * @returns Route or undefined
   */
  getRoute(method: HttpMethod, path: string): Route | undefined;

  /**
   * Updates a route
   * 
   * @param method - HTTP method
   * @param path - Route path
   * @param updates - Route updates
   */
  updateRoute(method: HttpMethod, path: string, updates: Partial<Route>): void;

  /**
   * Enables a route
   * 
   * @param method - HTTP method
   * @param path - Route path
   */
  enableRoute(method: HttpMethod, path: string): void;

  /**
   * Disables a route
   * 
   * @param method - HTTP method
   * @param path - Route path
   */
  disableRoute(method: HttpMethod, path: string): void;

  /**
   * Sets route status
   * 
   * @param method - HTTP method
   * @param path - Route path
   * @param status - Route status
   */
  setRouteStatus(method: HttpMethod, path: string, status: RouteStatus): void;

  /**
   * Sets route priority
   * 
   * @param method - HTTP method
   * @param path - Route path
   * @param priority - Route priority
   */
  setRoutePriority(method: HttpMethod, path: string, priority: RoutePriority): void;

  /**
   * Registers middleware
   * 
   * @param middleware - Middleware definition
   */
  registerMiddleware(middleware: MiddlewareDefinition): void;

  /**
   * Removes middleware by name
   * 
   * @param name - Middleware name
   */
  removeMiddleware(name: string): void;

  /**
   * Gets all registered middleware
   * 
   * @returns Array of middleware definitions
   */
  getMiddleware(): MiddlewareDefinition[];

  /**
   * Enables middleware
   * 
   * @param name - Middleware name
   */
  enableMiddleware(name: string): void;

  /**
   * Disables middleware
   * 
   * @param name - Middleware name
   */
  disableMiddleware(name: string): void;

  /**
   * Gets route statistics
   * 
   * @returns Route statistics
   */
  getStatistics(): RouteStatistics;

  /**
   * Resets route statistics
   */
  resetStatistics(): void;

  /**
   * Validates a route
   * 
   * @param route - Route to validate
   * @returns Validation result
   */
  validateRoute(route: Route): ValidationResult;

  /**
   * Validates all registered routes
   * 
   * @returns Array of validation results
   */
  validateAllRoutes(): ValidationResult[];

  /**
   * Gets route metadata
   * 
   * @param method - HTTP method
   * @param path - Route path
   * @returns Route metadata
   */
  getRouteMetadata(method: HttpMethod, path: string): RouteMetadata | undefined;

  /**
   * Gets all route metadata
   * 
   * @returns Array of route metadata
   */
  getAllRouteMetadata(): RouteMetadata[];

  /**
   * Clears route cache
   */
  clearCache(): void;

  /**
   * Gets cache size
   * 
   * @returns Cache size
   */
  getCacheSize(): number;

  /**
   * Gets routes by tag
   * 
   * @param tag - Route tag
   * @returns Array of routes with the tag
   */
  getRoutesByTag(tag: string): Route[];

  /**
   * Gets routes by group
   * 
   * @param group - Route group name
   * @returns Array of routes in the group
   */
  getRoutesByGroup(group: string): Route[];

  /**
   * Gets routes by method
   * 
   * @param method - HTTP method
   * @returns Array of routes with the method
   */
  getRoutesByMethod(method: HttpMethod): Route[];

  /**
   * Gets routes by status
   * 
   * @param status - Route status
   * @returns Array of routes with the status
   */
  getRoutesByStatus(status: RouteStatus): Route[];

  /**
   * Gets routes by priority
   * 
   * @param priority - Route priority
   * @returns Array of routes with the priority
   */
  getRoutesByPriority(priority: RoutePriority): Route[];
}
