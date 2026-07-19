/**
 * Validation Helpers
 *
 * Utility functions for validation operations.
 */

export class ValidationHelpers {
  /**
   * Check if value is empty
   */
  static isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
    return false;
  }

  /**
   * Trim string value
   */
  static trim(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.trim();
    }
    return value;
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate URL format
   */
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate phone number format (basic)
   */
  static isValidPhone(phone: string): boolean {
    const phoneRegex = /^\+?[\d\s-()]+$/;
    return phoneRegex.test(phone);
  }

  /**
   * Validate UUID format
   */
  static isValidUuid(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Validate date string
   */
  static isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

  /**
   * Sanitize string input
   */
  static sanitizeString(input: string): string {
    return input.replace(/[<>]/g, '');
  }

  /**
   * Check if string contains only alphanumeric characters
   */
  static isAlphanumeric(value: string): boolean {
    return /^[a-zA-Z0-9]+$/.test(value);
  }

  /**
   * Check if string contains only numeric characters
   */
  static isNumeric(value: string): boolean {
    return /^[0-9]+$/.test(value);
  }

  /**
   * Check if string contains only alphabetic characters
   */
  static isAlpha(value: string): boolean {
    return /^[a-zA-Z]+$/.test(value);
  }

  /**
   * Convert string to safe number
   */
  static toNumber(value: unknown): number | null {
    const num = Number(value);
    return isNaN(num) ? null : num;
  }

  /**
   * Convert string to safe boolean
   */
  static toBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes') return true;
      if (lower === 'false' || lower === '0' || lower === 'no') return false;
    }
    return null;
  }

  /**
   * Deep clone object
   */
  static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj)) as T;
  }

  /**
   * Get nested property value
   */
  static getNestedValue(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) => {
      if (current !== null && current !== undefined) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  /**
   * Set nested property value
   */
  static setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce<Record<string, unknown>>((current, key) => {
      const nested = current[key];
      if (nested === undefined || nested === null || typeof nested !== 'object' || Array.isArray(nested)) {
        current[key] = {};
      }
      return current[key] as Record<string, unknown>;
    }, obj);
    if (lastKey !== undefined) {
      target[lastKey] = value;
    }
  }
}
