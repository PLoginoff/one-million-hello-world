/**
 * Router Layer Types
 * 
 * This module defines all type definitions for the Router Layer,
 * including routes, parameters, matching results, and advanced routing features.
 */

/**
 * HTTP method
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
  TRACE = 'TRACE',
  CONNECT = 'CONNECT',
}

/**
 * Route priority levels
 */
export enum RoutePriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Route status
 */
export enum RouteStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
  DEPRECATED = 'DEPRECATED',
}

/**
 * Parameter types
 */
export enum ParameterType {
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  UUID = 'UUID',
  EMAIL = 'EMAIL',
  DATE = 'DATE',
  JSON = 'JSON',
  ARRAY = 'ARRAY',
}

/**
 * Middleware execution order
 */
export enum MiddlewareOrder {
  BEFORE = 'BEFORE',
  AFTER = 'AFTER',
  BOTH = 'BOTH',
}

/**
 * Route caching strategy
 */
export enum CacheStrategy {
  NONE = 'NONE',
  MEMORY = 'MEMORY',
  REDIS = 'REDIS',
  CUSTOM = 'CUSTOM',
}

/**
 * Rate limit scope
 */
export enum RateLimitScope {
  GLOBAL = 'GLOBAL',
  ROUTE = 'ROUTE',
  USER = 'USER',
  IP = 'IP',
}

/**
 * Route definition
 */
export interface Route {
  method: HttpMethod;
  path: string;
  handler: string;
  middleware?: string[];
  parameters?: RouteParameter[];
  priority?: RoutePriority;
  status?: RouteStatus;
  cache?: CacheStrategy;
  rateLimit?: RateLimitScope;
  tags?: string[];
  description?: string;
  version?: string;
  group?: string;
}

/**
 * Route parameter definition
 */
export interface RouteParameter {
  name: string;
  type: ParameterType;
  required: boolean;
  pattern?: RegExp;
  defaultValue?: any;
  description?: string;
  validator?: (value: any) => boolean;
}

/**
 * Route match result
 */
export interface RouteMatch {
  matched: boolean;
  route?: Route;
  parameters?: Record<string, string>;
  wildcard?: boolean;
  matchedSegments?: string[];
  matchedPattern?: string;
  matchTime?: number;
}

/**
 * Router configuration
 */
export interface RouterConfig {
  caseSensitive: boolean;
  strictRouting: boolean;
  allowWildcards: boolean;
  enableCaching: boolean;
  cacheTTL: number;
  enableMetrics: boolean;
  enableLogging: boolean;
  maxRoutes: number;
  defaultPriority: RoutePriority;
  defaultCache: CacheStrategy;
}

/**
 * Route group definition
 */
export interface RouteGroup {
  name: string;
  prefix: string;
  middleware?: string[];
  routes: Route[];
  priority?: RoutePriority;
  cache?: CacheStrategy;
  rateLimit?: RateLimitScope;
}

/**
 * Route statistics
 */
export interface RouteStatistics {
  totalRoutes: number;
  activeRoutes: number;
  disabledRoutes: number;
  deprecatedRoutes: number;
  totalMatches: number;
  totalMisses: number;
  averageMatchTime: number;
  routesByMethod: Record<HttpMethod, number>;
  routesByPriority: Record<RoutePriority, number>;
}

/**
 * Route filter criteria
 */
export interface RouteFilter {
  method?: HttpMethod;
  path?: string;
  pathPattern?: string;
  priority?: RoutePriority;
  status?: RouteStatus;
  tags?: string[];
  group?: string;
  version?: string;
  limit?: number;
}

/**
 * Middleware definition
 */
export interface MiddlewareDefinition {
  name: string;
  order: MiddlewareOrder;
  handler: string;
  enabled: boolean;
  routes?: string[];
  groups?: string[];
}

/**
 * Cache entry
 */
export interface CacheEntry {
  key: string;
  route: RouteMatch;
  timestamp: number;
  ttl: number;
}

/**
 * Route validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  path: string;
  field: string;
  message: string;
  code: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  path: string;
  field: string;
  message: string;
  code: string;
}

/**
 * Route metadata
 */
export interface RouteMetadata {
  path: string;
  method: HttpMethod;
  handler: string;
  parameters: RouteParameter[];
  middleware: string[];
  tags: string[];
  description: string;
  version: string;
  group: string;
  createdAt: number;
  updatedAt: number;
}
