/**
 * Router Helpers
 * 
 * Utility functions for routing operations.
 */

export class RouterHelpers {
  /**
   * Normalize path
   */
  static normalizePath(path: string): string {
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    return path.replace(/\/+/g, '/');
  }

  /**
   * Remove trailing slash
   */
  static removeTrailingSlash(path: string): string {
    return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  }

  /**
   * Add trailing slash
   */
  static addTrailingSlash(path: string): string {
    return !path.endsWith('/') ? path + '/' : path;
  }

  /**
   * Extract path parameters
   */
  static extractParams(pattern: string, path: string): Record<string, string> {
    const params: Record<string, string> = {};
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        const paramName = patternParts[i].substring(1);
        params[paramName] = pathParts[i];
      }
    }

    return params;
  }

  /**
   * Build path with parameters
   */
  static buildPath(pattern: string, params: Record<string, string>): string {
    return pattern.replace(/:(\w+)/g, (match, key) => params[key] || match);
  }

  /**
   * Match pattern against path
   */
  static matchPattern(pattern: string, path: string): boolean {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) {
      return false;
    }

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        continue;
      }
      if (patternParts[i] !== pathParts[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Split path into segments
   */
  static splitPath(path: string): string[] {
    return path.split('/').filter(Boolean);
  }

  /**
   * Join path segments
   */
  static joinPath(...segments: string[]): string {
    return '/' + segments.filter(Boolean).join('/');
  }
}
