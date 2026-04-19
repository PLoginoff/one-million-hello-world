/**
 * Router Service
 * 
 * Provides routing logic and route management.
 */

import { RouteEntity } from '../entities/RouteEntity';

export class RouterService {
  private routes: Map<string, RouteEntity>;

  constructor() {
    this.routes = new Map();
  }

  /**
   * Add route
   */
  addRoute(route: RouteEntity): void {
    this.routes.set(route.data.id, route);
  }

  /**
   * Remove route
   */
  removeRoute(routeId: string): void {
    this.routes.delete(routeId);
  }

  /**
   * Get route
   */
  getRoute(routeId: string): RouteEntity | undefined {
    return this.routes.get(routeId);
  }

  /**
   * Find matching route for path and method
   */
  findRoute(path: string, method: string): RouteEntity | undefined {
    const routes = Array.from(this.routes.values());
    return routes.find(route => 
      route.matchesPath(path) && 
      route.matchesMethod(method) &&
      route.isEnabled()
    );
  }

  /**
   * Get all routes
   */
  getAllRoutes(): RouteEntity[] {
    return Array.from(this.routes.values());
  }

  /**
   * Get routes by method
   */
  getRoutesByMethod(method: string): RouteEntity[] {
    return Array.from(this.routes.values()).filter(route => 
      route.data.method === method.toUpperCase()
    );
  }

  /**
   * Clear all routes
   */
  clearRoutes(): void {
    this.routes.clear();
  }

  /**
   * Get route count
   */
  getRouteCount(): number {
    return this.routes.size;
  }
}
