/**
 * Controller Entity
 * 
 * Represents a controller with metadata.
 */

export interface ControllerData {
  id: string;
  name: string;
  basePath: string;
  handlers: string[];
  enabled: boolean;
  middleware?: string[];
  createdAt: number;
}

export class ControllerEntity {
  readonly data: ControllerData;

  private constructor(data: ControllerData) {
    this.data = { ...data };
  }

  /**
   * Create controller entity
   */
  static create(data: ControllerData): ControllerEntity {
    return new ControllerEntity(data);
  }

  /**
   * Create controller with basic info
   */
  static createBasic(id: string, name: string, basePath: string): ControllerEntity {
    return new ControllerEntity({
      id,
      name,
      basePath,
      handlers: [],
      enabled: true,
      createdAt: Date.now(),
    });
  }

  /**
   * Enable controller
   */
  enable(): ControllerEntity {
    return new ControllerEntity({ ...this.data, enabled: true });
  }

  /**
   * Disable controller
   */
  disable(): ControllerEntity {
    return new ControllerEntity({ ...this.data, enabled: false });
  }

  /**
   * Add handler
   */
  addHandler(handler: string): ControllerEntity {
    return new ControllerEntity({
      ...this.data,
      handlers: [...this.data.handlers, handler],
    });
  }

  /**
   * Add middleware
   */
  addMiddleware(middleware: string): ControllerEntity {
    const middlewareList = this.data.middleware || [];
    return new ControllerEntity({
      ...this.data,
      middleware: [...middlewareList, middleware],
    });
  }

  /**
   * Check if controller is enabled
   */
  isEnabled(): boolean {
    return this.data.enabled;
  }

  /**
   * Check if controller has handler
   */
  hasHandler(handler: string): boolean {
    return this.data.handlers.includes(handler);
  }

  /**
   * Clone the entity
   */
  clone(): ControllerEntity {
    return new ControllerEntity({ ...this.data });
  }

  /**
   * Convert to plain object
   */
  toObject(): ControllerData {
    return { ...this.data };
  }

  /**
   * Check if two controllers are equal
   */
  equals(other: ControllerEntity): boolean {
    return this.data.id === other.data.id;
  }
}
