/**
 * HTTP Header Entity
 * 
 * Represents a single HTTP header with validation and parsing capabilities.
 */

export class HttpHeaderEntity {
  readonly name: string;
  readonly value: string;
  readonly normalized: string;

  private constructor(name: string, value: string) {
    this.validateName(name);
    this.validateValue(value);

    this.name = name;
    this.value = value;
    this.normalized = name.toLowerCase();
  }

  /**
   * Create HTTP header entity
   */
  static create(name: string, value: string): HttpHeaderEntity {
    return new HttpHeaderEntity(name, value);
  }

  /**
   * Create from raw header line
   */
  static fromLine(line: string): HttpHeaderEntity {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid header format: ${line}`);
    }

    const name = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    if (!name) {
      throw new Error('Header name cannot be empty');
    }

    return new HttpHeaderEntity(name, value);
  }

  /**
   * Get normalized name (lowercase)
   */
  getNormalized(): string {
    return this.normalized;
  }

  /**
   * Check if header matches a name (case-insensitive)
   */
  matches(name: string): boolean {
    return this.normalized === name.toLowerCase();
  }

  /**
   * Check if header contains a value
   */
  contains(search: string): boolean {
    return this.value.toLowerCase().includes(search.toLowerCase());
  }

  /**
   * Get header value as integer
   */
  asInt(): number | null {
    const parsed = parseInt(this.value, 10);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Get header value as boolean
   */
  asBoolean(): boolean {
    return this.value.toLowerCase() === 'true' || this.value === '1';
  }

  /**
   * Get header value as comma-separated list
   */
  asList(): string[] {
    return this.value.split(',').map(item => item.trim()).filter(item => item.length > 0);
  }

  /**
   * Get header value as key-value pairs (for semicolon-separated values)
   */
  asKeyValuePairs(): Map<string, string> {
    const pairs = new Map<string, string>();
    const parts = this.value.split(';');
    
    for (const part of parts) {
      const [key, value] = part.split('=').map(s => s.trim());
      if (key) {
        pairs.set(key, value || '');
      }
    }
    
    return pairs;
  }

  /**
   * Clone the header entity
   */
  clone(): HttpHeaderEntity {
    return new HttpHeaderEntity(this.name, this.value);
  }

  /**
   * Convert to string
   */
  toString(): string {
    return `${this.name}: ${this.value}`;
  }

  /**
   * Convert to raw header line
   */
  toRaw(): string {
    return `${this.name}: ${this.value}\r\n`;
  }

  /**
   * Check if two headers are equal (case-insensitive name)
   */
  equals(other: HttpHeaderEntity): boolean {
    return this.normalized === other.normalized && this.value === other.value;
  }

  private validateName(name: string): void {
    if (!name || name.length === 0) {
      throw new Error('Header name cannot be empty');
    }

    if (name.length > 128) {
      throw new Error('Header name cannot exceed 128 characters');
    }

    // Check for invalid characters
    const invalidChars = /[\x00-\x1F\x7F()<>@,;:\\"[\]{}]/;
    if (invalidChars.test(name)) {
      throw new Error(`Header name contains invalid characters: ${name}`);
    }
  }

  private validateValue(value: string): void {
    if (value.length > 8192) {
      throw new Error('Header value cannot exceed 8192 characters');
    }

    // Check for invalid control characters (except tab)
    const invalidChars = /[\x00-\x08\x0A-\x1F\x7F]/;
    if (invalidChars.test(value)) {
      throw new Error('Header value contains invalid control characters');
    }
  }
}
