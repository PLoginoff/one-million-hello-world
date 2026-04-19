/**
 * String Utilities
 * 
 * Utility functions for string manipulation.
 */

export class StringUtils {
  /**
   * Converts string to camelCase
   */
  static toCamelCase(str: string): string {
    return str
      .replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
      .replace(/^(.)/, c => c.toLowerCase());
  }

  /**
   * Converts string to PascalCase
   */
  static toPascalCase(str: string): string {
    return str
      .replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
      .replace(/^(.)/, c => c.toUpperCase());
  }

  /**
   * Converts string to kebab-case
   */
  static toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  /**
   * Converts string to snake_case
   */
  static toSnakeCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
  }

  /**
   * Capitalizes first letter
   */
  static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Converts string to lowercase
   */
  static lowercase(str: string): string {
    return str.toLowerCase();
  }

  /**
   * Converts string to uppercase
   */
  static uppercase(str: string): string {
    return str.toUpperCase();
  }

  /**
   * Truncates string to specified length
   */
  static truncate(str: string, length: number, suffix: string = '...'): string {
    if (str.length <= length) {
      return str;
    }
    return str.slice(0, length - suffix.length) + suffix;
  }

  /**
   * Pads string on the left
   */
  static padLeft(str: string, length: number, char: string = ' '): string {
    return str.padStart(length, char);
  }

  /**
   * Pads string on the right
   */
  static padRight(str: string, length: number, char: string = ' '): string {
    return str.padEnd(length, char);
  }

  /**
   * Removes whitespace from both ends
   */
  static trim(str: string): string {
    return str.trim();
  }

  /**
   * Removes whitespace from left
   */
  static trimLeft(str: string): string {
    return str.trimLeft();
  }

  /**
   * Removes whitespace from right
   */
  static trimRight(str: string): string {
    return str.trimRight();
  }

  /**
   * Replaces all occurrences
   */
  static replaceAll(str: string, search: string, replacement: string): string {
    return str.split(search).join(replacement);
  }

  /**
   * Reverses string
   */
  static reverse(str: string): string {
    return str.split('').reverse().join('');
  }

  /**
   * Counts occurrences of substring
   */
  static count(str: string, substring: string): number {
    return str.split(substring).length - 1;
  }

  /**
   * Checks if string contains substring
   */
  static contains(str: string, substring: string): boolean {
    return str.includes(substring);
  }

  /**
   * Checks if string starts with prefix
   */
  static startsWith(str: string, prefix: string): boolean {
    return str.startsWith(prefix);
  }

  /**
   * Checks if string ends with suffix
   */
  static endsWith(str: string, suffix: string): boolean {
    return str.endsWith(suffix);
  }

  /**
   * Splits string by delimiter
   */
  static split(str: string, delimiter: string): string[] {
    return str.split(delimiter);
  }

  /**
   * Joins array of strings
   */
  static join(strings: string[], delimiter: string): string {
    return strings.join(delimiter);
  }

  /**
   * Repeats string n times
   */
  static repeat(str: string, count: number): string {
    return str.repeat(count);
  }

  /**
   * Removes all whitespace
   */
  static removeWhitespace(str: string): string {
    return str.replace(/\s/g, '');
  }

  /**
   * Converts string to slug
   */
  static slugify(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Escapes HTML special characters
   */
  static escapeHtml(str: string): string {
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return str.replace(/[&<>"']/g, char => htmlEntities[char]);
  }

  /**
   * Unescapes HTML special characters
   */
  static unescapeHtml(str: string): string {
    const htmlEntities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
    };
    return str.replace(/&(amp|lt|gt|quot|#39);/g, entity => htmlEntities[entity]);
  }

  /**
   * Checks if string is empty or whitespace
   */
  static isBlank(str: string): boolean {
    return str.trim().length === 0;
  }

  /**
   * Checks if string is not empty and not whitespace
   */
  static isNotBlank(str: string): boolean {
    return !this.isBlank(str);
  }

  /**
   * Generates random string
   */
  static random(length: number = 16): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generates UUID v4
   */
  static uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
