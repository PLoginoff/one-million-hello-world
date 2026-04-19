/**
 * Service Entity
 * 
 * Represents a service with metadata.
 */

export interface ServiceData {
  id: string;
  name: string;
  version: string;
  dependencies?: string[];
  enabled: boolean;
  createdAt: number;
}

export class ServiceEntity {
  readonly data: ServiceData;

  private constructor(data: ServiceData) {
    this.data = { ...data };
  }

  /**
   * Create service entity
   */
  static create(data: ServiceData): ServiceEntity {
    return new ServiceEntity(data);
  }

  /**
   * Create service with basic info
   */
  static createBasic(id: string, name: string, version: string): ServiceEntity {
    return new ServiceEntity({
      id,
      name,
      version,
      dependencies: [],
      enabled: true,
      createdAt: Date.now(),
    });
  }

  /**
   * Enable service
   */
  enable(): ServiceEntity {
    return new ServiceEntity({ ...this.data, enabled: true });
  }

  /**
   * Disable service
   */
  disable(): ServiceEntity {
    return new ServiceEntity({ ...this.data, enabled: false });
  }

  /**
   * Add dependency
   */
  addDependency(dependency: string): ServiceEntity {
    const dependencies = this.data.dependencies || [];
    return new ServiceEntity({
      ...this.data,
      dependencies: [...dependencies, dependency],
    });
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.data.enabled;
  }

  /**
   * Check if service has dependency
   */
  hasDependency(dependency: string): boolean {
    return this.data.dependencies?.includes(dependency) || false;
  }

  /**
   * Clone the entity
   */
  clone(): ServiceEntity {
    return new ServiceEntity({ ...this.data });
  }

  /**
   * Convert to plain object
   */
  toObject(): ServiceData {
    return { ...this.data };
  }

  /**
   * Check if two services are equal
   */
  equals(other: ServiceEntity): boolean {
    return this.data.id === other.data.id;
  }
}
