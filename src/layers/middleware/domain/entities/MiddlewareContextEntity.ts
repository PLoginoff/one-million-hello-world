/**
 * Middleware Context Entity
 * 
 * Represents context passed through middleware chain.
 */

export interface MiddlewareContextData {
  request: any;
  response: any;
  metadata: Map<string, any>;
  timestamp: number;
}

export class MiddlewareContextEntity {
  readonly data: MiddlewareContextData;

  private constructor(data: MiddlewareContextData) {
    this.data = {
      ...data,
      metadata: new Map(data.metadata),
    };
  }

  /**
   * Create middleware context
   */
  static create(request: any, response: any): MiddlewareContextEntity {
    return new MiddlewareContextEntity({
      request,
      response,
      metadata: new Map(),
      timestamp: Date.now(),
    });
  }

  /**
   * Get request
   */
  getRequest(): any {
    return this.data.request;
  }

  /**
   * Get response
   */
  getResponse(): any {
    return this.data.response;
  }

  /**
   * Set request
   */
  setRequest(request: any): MiddlewareContextEntity {
    return new MiddlewareContextEntity({ ...this.data, request });
  }

  /**
   * Set response
   */
  setResponse(response: any): MiddlewareContextEntity {
    return new MiddlewareContextEntity({ ...this.data, response });
  }

  /**
   * Get metadata value
   */
  getMetadata(key: string): any {
    return this.data.metadata.get(key);
  }

  /**
   * Set metadata value
   */
  setMetadata(key: string, value: any): MiddlewareContextEntity {
    const newMetadata = new Map(this.data.metadata);
    newMetadata.set(key, value);
    return new MiddlewareContextEntity({ ...this.data, metadata: newMetadata });
  }

  /**
   * Remove metadata value
   */
  removeMetadata(key: string): MiddlewareContextEntity {
    const newMetadata = new Map(this.data.metadata);
    newMetadata.delete(key);
    return new MiddlewareContextEntity({ ...this.data, metadata: newMetadata });
  }

  /**
   * Check if metadata key exists
   */
  hasMetadata(key: string): boolean {
    return this.data.metadata.has(key);
  }

  /**
   * Get all metadata keys
   */
  getMetadataKeys(): string[] {
    return Array.from(this.data.metadata.keys());
  }

  /**
   * Clone the entity
   */
  clone(): MiddlewareContextEntity {
    return new MiddlewareContextEntity({ ...this.data });
  }

  /**
   * Convert to plain object
   */
  toObject(): MiddlewareContextData {
    return {
      request: this.data.request,
      response: this.data.response,
      metadata: new Map(this.data.metadata),
      timestamp: this.data.timestamp,
    };
  }
}
