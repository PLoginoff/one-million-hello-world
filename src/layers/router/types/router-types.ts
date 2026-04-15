/**
 * Router Layer Types
 * 
 * This module defines all type definitions for the Router Layer,
 * including routes, parameters, and matching results.
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
}

/**
 * Route parameter definition
 */
export interface RouteParameter {
  name: string;
  type: ParameterType;
  required: boolean;
  pattern?: RegExp;
}

/**
 * Parameter types
 */
export enum ParameterType {
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  UUID = 'UUID',
}

/**
 * Route match result
 */
export interface RouteMatch {
  matched: boolean;
  route?: Route;
  parameters?: Record<string, string>;
  wildcard?: boolean;
}

/**
 * Router configuration
 */
export interface RouterConfig {
  caseSensitive: boolean;
  strictRouting: boolean;
  allowWildcards: boolean;
}
