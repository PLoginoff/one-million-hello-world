/**
 * Repository Entity
 * 
 * Represents a repository with metadata.
 */

export interface RepositoryData {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  createdAt: number;
}

export class RepositoryEntity {
  readonly data: RepositoryData;

  private constructor(data: RepositoryData) {
    this.data = { ...data };
  }

  /**
   * Create repository entity
   */
  static create(data: RepositoryData): RepositoryEntity {
    return new RepositoryEntity(data);
  }

  /**
   * Create repository with basic info
   */
  static createBasic(id: string, name: string, type: string): RepositoryEntity {
    return new RepositoryEntity({
      id,
      name,
      type,
      enabled: true,
      createdAt: Date.now(),
    });
  }

  /**
   * Enable repository
   */
  enable(): RepositoryEntity {
    return new RepositoryEntity({ ...this.data, enabled: true });
  }

  /**
   * Disable repository
   */
  disable(): RepositoryEntity {
    return new RepositoryEntity({ ...this.data, enabled: false });
  }

  /**
   * Check if repository is enabled
   */
  isEnabled(): boolean {
    return this.data.enabled;
  }

  /**
   * Clone the entity
   */
  clone(): RepositoryEntity {
    return new RepositoryEntity({ ...this.data });
  }

  /**
   * Convert to plain object
   */
  toObject(): RepositoryData {
    return { ...this.data };
  }

  /**
   * Check if two repositories are equal
   */
  equals(other: RepositoryEntity): boolean {
    return this.data.id === other.data.id;
  }
}
