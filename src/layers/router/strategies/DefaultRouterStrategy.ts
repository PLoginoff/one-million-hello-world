/**
 * Default Router Strategy
 *
 * Base implementation of the router strategy using sequential route matching.
 * This strategy evaluates routes in order and returns the first match.
 *
 * @module RouterLayer/Strategies
 */

import { IRouterStrategy, RouterStrategyContext, RouterStrategyResult } from './IRouterStrategy';

/**
 * Default router strategy implementation.
 *
 * Uses simple sequential matching for route resolution.
 * Suitable for small to medium route sets where simplicity is preferred.
 */
export class DefaultRouterStrategy implements IRouterStrategy {
  readonly name = 'default-router';
  readonly priority = 10;

  private readonly routes: Array<{
    method: string;
    path: string;
    handler: string;
    middleware: string[];
    pattern: RegExp;
    paramNames: string[];
  }> = [];

  private executionCount = 0;

  /**
   * Create a new DefaultRouterStrategy.
   *
   * @param routes - Optional initial routes to register
   */
  constructor(
    routes: Array<{
      method: string;
      path: string;
      handler: string;
      middleware?: string[];
    }> = []
  ) {
    for (const route of routes) {
      this.addRoute(route);
    }
  }

  /**
   * Add a route to the strategy.
   *
   * @param route - The route to add
   */
  addRoute(route: { method: string; path: string; handler: string; middleware?: string[] }): void {
    const { pattern, paramNames } = this.pathToRegex(route.path);
    this.routes.push({
      method: route.method.toUpperCase(),
      path: route.path,
      handler: route.handler,
      middleware: route.middleware ?? [],
      pattern,
      paramNames,
    });
  }

  /**
   * Convert a path pattern to a regular expression.
   *
   * @param path - The path pattern (e.g., "/users/:id")
   * @returns Object containing the regex and parameter names
   */
  private pathToRegex(path: string): { pattern: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];
    const regexPattern = path
      .replace(/\/+/g, '/')
      .replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      })
      .replace(/\*/g, '.*');

    return {
      pattern: new RegExp(`^${regexPattern}$`),
      paramNames,
    };
  }

  /**
   * Check if this strategy can handle the given context.
   *
   * @param context - The routing context to evaluate
   * @returns True if the context has a valid method and path
   */
  canHandle(context: RouterStrategyContext): boolean {
    return (
      typeof context.method === 'string' &&
      context.method.length > 0 &&
      typeof context.path === 'string' &&
      context.path.length > 0
    );
  }

  /**
   * Execute the routing strategy.
   *
   * Performs sequential route matching against registered routes.
   *
   * @param context - The routing context
   * @returns Promise resolving to the routing result
   */
  async execute(context: RouterStrategyContext): Promise<RouterStrategyResult> {
    const startTime = Date.now();
    this.executionCount++;

    if (!this.canHandle(context)) {
      return {
        success: false,
        error: {
          code: 'INVALID_CONTEXT',
          message: 'Invalid routing context: method and path are required',
        },
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          routesEvaluated: 0,
        },
      };
    }

    const method = context.method.toUpperCase();
    let routesEvaluated = 0;

    for (const route of this.routes) {
      routesEvaluated++;

      if (route.method !== method && route.method !== '*') {
        continue;
      }

      const match = context.path.match(route.pattern);
      if (match) {
        const parameters: Record<string, string> = {};
        for (let i = 0; i < route.paramNames.length; i++) {
          parameters[route.paramNames[i]] = match[i + 1];
        }

        return {
          success: true,
          route: {
            handler: route.handler,
            parameters,
            middleware: route.middleware,
          },
          metadata: {
            strategyName: this.name,
            executionTimeMs: Date.now() - startTime,
            routesEvaluated,
          },
        };
      }
    }

    return {
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `No route found for ${method} ${context.path}`,
      },
      metadata: {
        strategyName: this.name,
        executionTimeMs: Date.now() - startTime,
        routesEvaluated,
      },
    };
  }

  /**
   * Get the number of times this strategy has been executed.
   *
   * @returns Execution count
   */
  getExecutionCount(): number {
    return this.executionCount;
  }

  /**
   * Get all registered routes.
   *
   * @returns Array of registered routes
   */
  getRoutes(): Array<{
    method: string;
    path: string;
    handler: string;
    middleware: string[];
  }> {
    return this.routes.map((r) => ({
      method: r.method,
      path: r.path,
      handler: r.handler,
      middleware: r.middleware,
    }));
  }

  /**
   * Clear all registered routes.
   */
  clearRoutes(): void {
    this.routes.length = 0;
  }
}
