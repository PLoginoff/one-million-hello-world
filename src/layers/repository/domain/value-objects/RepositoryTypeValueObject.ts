/**
 * Repository Type Value Object
 * 
 * Represents repository type.
 */

export enum RepositoryType {
  SQL = 'sql',
  NOSQL = 'nosql',
  FILE = 'file',
  MEMORY = 'memory',
  CACHE = 'cache',
}

export class RepositoryTypeValueObject {
  readonly type: RepositoryType;

  private constructor(type: RepositoryType) {
    this.type = type;
  }

  /**
   * Create SQL type
   */
  static sql(): RepositoryTypeValueObject {
    return new RepositoryTypeValueObject(RepositoryType.SQL);
  }

  /**
   * Create NoSQL type
   */
  static nosql(): RepositoryTypeValueObject {
    return new RepositoryTypeValueObject(RepositoryType.NOSQL);
  }

  /**
   * Create file type
   */
  static file(): RepositoryTypeValueObject {
    return new RepositoryTypeValueObject(RepositoryType.FILE);
  }

  /**
   * Create memory type
   */
  static memory(): RepositoryTypeValueObject {
    return new RepositoryTypeValueObject(RepositoryType.MEMORY);
  }

  /**
   * Create cache type
   */
  static cache(): RepositoryTypeValueObject {
    return new RepositoryTypeValueObject(RepositoryType.CACHE);
  }

  /**
   * Check if type is SQL
   */
  isSql(): boolean {
    return this.type === RepositoryType.SQL;
  }

  /**
   * Check if type is NoSQL
   */
  isNosql(): boolean {
    return this.type === RepositoryType.NOSQL;
  }

  /**
   * Check if type is persistent
   */
  isPersistent(): boolean {
    return [RepositoryType.SQL, RepositoryType.NOSQL, RepositoryType.FILE].includes(this.type);
  }

  /**
   * Clone the value object
   */
  clone(): RepositoryTypeValueObject {
    return new RepositoryTypeValueObject(this.type);
  }

  /**
   * Convert to string
   */
  toString(): string {
    return this.type;
  }

  /**
   * Check if two types are equal
   */
  equals(other: RepositoryTypeValueObject): boolean {
    return this.type === other.type;
  }
}
