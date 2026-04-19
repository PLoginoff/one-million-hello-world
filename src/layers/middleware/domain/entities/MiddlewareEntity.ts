/**
 * Middleware Entity
 * 
 * Represents a middleware with execution metadata.
 */

export interface MiddlewareData {
  id: string;
  name: string;
  type: 'request' | 'response' | 'error' | 'global';
  priority: number;
  enabled: boolean;
  path?: string;
  method?: string;
  createdAt: number;
}

export class MiddlewareEntity {
  readonly data: MiddlewareData;

  private constructor(data: MiddlewareData) {
    this.data = { ...data };
  }

  /**
   * Create middleware entity
   */
  static create(data: MiddlewareData): MiddlewareEntity {
    return new MiddlewareEntity(data);
  }

  /**
   * Create request middleware
   */
  static createRequest(
    id: string,
    name: string,
    priority: number = 0
  ): MiddlewareEntity {
    return new MiddlewareEntity({
      id,
      name,
      type: 'request',
      priority,
      enabled: true,
      createdAt: Date.now(),
    });
  }

  /**
   * Create response middleware
   */
  static createResponse(
    id: string,
    name: string,
    priority: number = 0
  ): MiddlewareEntity {
    return new MiddlewareEntity({
      id,
      name,
      type: 'response',
      priority,
      enabled: true,
      createdAt: Date.now(),
    });
  }

  /**
   * Create error middleware
   */
  static createError(
    id: string,
    name: string,
    priority: number = 0
  ): MiddlewareEntity {
    return new MiddlewareEntity({
      id,
      name,
      type: 'error',
      priority,
      enabled: true,
      createdAt: Date.now(),
    });
  }

  /**
   * Create global middleware
   */
  static createGlobal(
    id: string,
    name: string,
    priority: number = 0
  ): MiddlewareEntity {
    return new MiddlewareEntity({
      id,
      name,
      type: 'global',
      priority,
      enabled: true,
      createdAt: Date.now(),
    });
  }

  /**
   * Enable middleware
   */
  enable(): MiddlewareEntity {
    return new MiddlewareEntity({ ...this.data, enabled: true });
  }

  /**
   * Disable middleware
   */
  disable(): MiddlewareEntity {
    return new MiddlewareEntity({ ...this.data, enabled: false });
  }

  /**
   * Set priority
   */
  setPriority(priority: number): MiddlewareEntity {
    return new MiddlewareEntity({ ...this.data, priority });
  }

  /**
   * Set path filter
   */
  setPath(path: string): MiddlewareEntity {
    return new MiddlewareEntity({ ...this.data, path });
  }

  /**
   * Set method filter
   */
  setMethod(method: string): MiddlewareEntity {
    return new MiddlewareEntity({ ...this.data, method });
  }

  /**
   * Check if middleware is enabled
   */
  isEnabled(): boolean {
    return this.data.enabled;
  }

  /**
   * Check if middleware matches path
   */
  matchesPath(requestPath: string): boolean {
    if (!this.data.path) return true;
    return requestPath.startsWith(this.data.path);
  }

  /**
   * Check if middleware matches method
   */
  matchesMethod(requestMethod: string): boolean {
    if (!this.data.method) return true;
    return requestMethod.toLowerCase() === this.data.method.toLowerCase();
  }

  /**
   * Clone the entity
   */
  clone(): MiddlewareEntity {
    return new MiddlewareEntity({ ...this.data });
  }

  /**
   * Convert to plain object
   */
  toObject(): MiddlewareData {
    return { ...this.data };
  }

  /**
   * Check if two middlewares are equal
   */
  equals(other: MiddlewareEntity): boolean {
    return this.data.id === other.data.id;
  }
}
