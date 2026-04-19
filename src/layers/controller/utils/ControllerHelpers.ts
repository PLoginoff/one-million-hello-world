/**
 * Controller Helpers
 * 
 * Utility functions for controller operations.
 */

export class ControllerHelpers {
  /**
   * Normalize base path
   */
  static normalizeBasePath(path: string): string {
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
   * Validate controller ID
   */
  static validateControllerId(id: string): boolean {
    return typeof id === 'string' && id.length > 0;
  }

  /**
   * Validate controller name
   */
  static validateControllerName(name: string): boolean {
    return typeof name === 'string' && name.length > 0;
  }

  /**
   * Validate handler name
   */
  static validateHandlerName(handler: string): boolean {
    return typeof handler === 'string' && handler.length > 0;
  }

  /**
   * Generate controller ID from name
   */
  static generateControllerId(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  /**
   * Check if base path is valid
   */
  static isValidBasePath(path: string): boolean {
    return typeof path === 'string' && path.length > 0;
  }
}
