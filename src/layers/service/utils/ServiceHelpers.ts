/**
 * Service Helpers
 * 
 * Utility functions for service operations.
 */

export class ServiceHelpers {
  /**
   * Validate service ID
   */
  static validateServiceId(id: string): boolean {
    return typeof id === 'string' && id.length > 0;
  }

  /**
   * Validate service name
   */
  static validateServiceName(name: string): boolean {
    return typeof name === 'string' && name.length > 0;
  }

  /**
   * Validate version
   */
  static validateVersion(version: string): boolean {
    const versionRegex = /^\d+\.\d+\.\d+$/;
    return typeof version === 'string' && versionRegex.test(version);
  }

  /**
   * Generate service ID from name
   */
  static generateServiceId(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  /**
   * Parse version to major, minor, patch
   */
  static parseVersion(version: string): { major: number; minor: number; patch: number } | null {
    if (!this.validateVersion(version)) {
      return null;
    }
    const [major, minor, patch] = version.split('.').map(Number);
    return { major, minor, patch };
  }

  /**
   * Compare versions
   */
  static compareVersions(v1: string, v2: string): number {
    const parsedV1 = this.parseVersion(v1);
    const parsedV2 = this.parseVersion(v2);

    if (!parsedV1 || !parsedV2) {
      return 0;
    }

    if (parsedV1.major !== parsedV2.major) {
      return parsedV1.major - parsedV2.major;
    }
    if (parsedV1.minor !== parsedV2.minor) {
      return parsedV1.minor - parsedV2.minor;
    }
    return parsedV1.patch - parsedV2.patch;
  }
}
