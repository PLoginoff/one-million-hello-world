/**
 * Route Entity
 * 
 * Represents a route with metadata.
 */

export interface RouteData {
  id: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  handler: string;
  middleware?: string[];
  enabled: boolean;
  priority: number;
  createdAt: number;
}

export class RouteEntity {
  readonly data: RouteData;

  private constructor(data: RouteData) {
    this.data = { ...data };
  }

  /**
   * Create route entity
   */
  static create(data: RouteData): RouteEntity {
    return new RouteEntity(data);
  }

  /**
   * Create GET route
   */
  static get(id: string, path: string, handler: string): RouteEntity {
    return new RouteEntity({
      id,
      path,
      method: 'GET',
      handler,
      enabled: true,
      priority: 0,
      createdAt: Date.now(),
    });
  }

  /**
   * Create POST route
   */
  static post(id: string, path: string, handler: string): RouteEntity {
    return new RouteEntity({
      id,
      path,
      method: 'POST',
      handler,
      enabled: true,
      priority: 0,
      createdAt: Date.now(),
    });
  }

  /**
   * Create PUT route
   */
  static put(id: string, path: string, handler: string): RouteEntity {
    return new RouteEntity({
      id,
      path,
      method: 'PUT',
      handler,
      enabled: true,
      priority: 0,
      createdAt: Date.now(),
    });
  }

  /**
   * Create DELETE route
   */
  static delete(id: string, path: string, handler: string): RouteEntity {
    return new RouteEntity({
      id,
      path,
      method: 'DELETE',
      handler,
      enabled: true,
      priority: 0,
      createdAt: Date.now(),
    });
  }

  /**
   * Enable route
   */
  enable(): RouteEntity {
    return new RouteEntity({ ...this.data, enabled: true });
  }

  /**
   * Disable route
   */
  disable(): RouteEntity {
    return new RouteEntity({ ...this.data, enabled: false });
  }

  /**
   * Set priority
   */
  setPriority(priority: number): RouteEntity {
    return new RouteEntity({ ...this.data, priority });
  }

  /**
   * Add middleware
   */
  addMiddleware(middleware: string): RouteEntity {
    const middlewareList = this.data.middleware || [];
    return new RouteEntity({ ...this.data, middleware: [...middlewareList, middleware] });
  }

  /**
   * Check if route matches path
   */
  matchesPath(requestPath: string): boolean {
    return this.data.path === requestPath || this.matchPattern(requestPath);
  }

  /**
   * Check if route matches method
   */
  matchesMethod(requestMethod: string): boolean {
    return this.data.method === requestMethod.toUpperCase();
  }

  private matchPattern(requestPath: string): boolean {
    const pattern = this.data.path.replace(/:\w+/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(requestPath);
  }

  /**
   * Clone the entity
   */
  clone(): RouteEntity {
    return new RouteEntity({ ...this.data });
  }

  /**
   * Convert to plain object
   */
  toObject(): RouteData {
    return { ...this.data };
  }

  /**
   * Check if two routes are equal
   */
  equals(other: RouteEntity): boolean {
    return this.data.id === other.data.id;
  }
}
