/**
 * HTTP Parser Helpers
 * 
 * Utility functions for HTTP parsing operations.
 */

export class HttpParserHelpers {
  /**
   * Split HTTP message into lines
   */
  static splitLines(data: string): string[] {
    return data.split(/\r\n|\n|\r/);
  }

  /**
   * Find empty line index (separates headers from body)
   */
  static findEmptyLine(lines: string[]): number {
    return lines.findIndex(line => line.trim() === '');
  }

  /**
   * Trim whitespace from string
   */
  static trim(str: string): string {
    return str.trim();
  }

  /**
   * Check if string is empty or whitespace only
   */
  static isEmpty(str: string): boolean {
    return !str || str.trim().length === 0;
  }

  /**
   * Parse key-value pair from string
   */
  static parseKeyValue(line: string, separator: string = ':'): {
    key: string | null;
    value: string | null;
  } {
    const index = line.indexOf(separator);
    if (index === -1) {
      return { key: null, value: null };
    }
    return {
      key: line.substring(0, index).trim(),
      value: line.substring(index + 1).trim(),
    };
  }

  /**
   * Encode URI component
   */
  static encodeURIComponent(str: string): string {
    return encodeURIComponent(str);
  }

  /**
   * Decode URI component
   */
  static decodeURIComponent(str: string): string {
    try {
      return decodeURIComponent(str);
    } catch {
      return str;
    }
  }

  /**
   * Parse query string into object
   */
  static parseQueryString(queryString: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (!queryString) return result;

    const pairs = queryString.split('&');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key) {
        result[key] = value ? this.decodeURIComponent(value) : '';
      }
    }
    return result;
  }

  /**
   * Build query string from object
   */
  static buildQueryString(params: Record<string, string>): string {
    const pairs = Object.entries(params)
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${key}=${this.encodeURIComponent(value)}`);
    return pairs.join('&');
  }

  /**
   * Parse URL into components
   */
  static parseUrl(url: string): {
    protocol?: string;
    host?: string;
    port?: string;
    path?: string;
    query?: string;
    fragment?: string;
  } {
    try {
      const urlObj = new URL(url);
      return {
        protocol: urlObj.protocol,
        host: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        query: urlObj.search.substring(1),
        fragment: urlObj.hash.substring(1),
      };
    } catch {
      const parts = url.match(/^([^:]+):\/\/([^\/:]+)(?::(\d+))?(\/[^?#]*)?(?:\?([^#]*))?(?:#(.*))?$/);
      if (!parts) {
        return {};
      }
      return {
        protocol: parts[1],
        host: parts[2],
        port: parts[3],
        path: parts[4],
        query: parts[5],
        fragment: parts[6],
      };
    }
  }

  /**
   * Format bytes to human readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Format duration to human readable string
   */
  static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
    return `${(ms / 3600000).toFixed(2)}h`;
  }

  /**
   * Clamp value between min and max
   */
  static clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Check if value is within range
   */
  static isInRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }

  /**
   * Deep clone object
   */
  static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as any;
    if (obj instanceof Map) return new Map(Array.from(obj.entries())) as any;
    if (obj instanceof Set) return new Set(Array.from(obj.values())) as any;
    if (obj instanceof Array) return obj.map(item => this.deepClone(item)) as any;
    
    const clonedObj = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = this.deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}
