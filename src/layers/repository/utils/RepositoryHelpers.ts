/**
 * Repository Helpers
 * 
 * Utility functions for repository operations.
 */

export class RepositoryHelpers {
  /**
   * Validate repository ID
   */
  static validateRepositoryId(id: string): boolean {
    return typeof id === 'string' && id.length > 0;
  }

  /**
   * Validate repository name
   */
  static validateRepositoryName(name: string): boolean {
    return typeof name === 'string' && name.length > 0;
  }

  /**
   * Validate connection string
   */
  static validateConnectionString(connectionString: string): boolean {
    return typeof connectionString === 'string' && connectionString.length > 0;
  }

  /**
   * Generate repository ID from name
   */
  static generateRepositoryId(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  /**
   * Build connection string
   */
  static buildConnectionString(host: string, port: number, database: string): string {
    return `${host}:${port}/${database}`;
  }

  /**
   * Parse connection string
   */
  static parseConnectionString(connectionString: string): { host: string; port: number; database: string } | null {
    const match = connectionString.match(/^([^:]+):(\d+)\/(.+)$/);
    if (!match) {
      return null;
    }
    return {
      host: match[1],
      port: parseInt(match[2], 10),
      database: match[3],
    };
  }
}
