/**
 * Parse Metrics Value Object
 * 
 * Represents parsing metrics with aggregation capabilities.
 */

export class ParseMetricsValueObject {
  readonly parseStartTime: number;
  readonly parseEndTime: number;
  readonly parseDuration: number;
  readonly headerParseTime: number;
  readonly bodyParseTime: number;
  readonly validationTime: number;
  readonly memoryUsage: number;

  private constructor(
    parseStartTime: number,
    parseEndTime: number,
    headerParseTime: number,
    bodyParseTime: number,
    validationTime: number,
    memoryUsage: number
  ) {
    this.parseStartTime = parseStartTime;
    this.parseEndTime = parseEndTime;
    this.parseDuration = parseEndTime - parseStartTime;
    this.headerParseTime = headerParseTime;
    this.bodyParseTime = bodyParseTime;
    this.validationTime = validationTime;
    this.memoryUsage = memoryUsage;
  }

  /**
   * Create parse metrics value object
   */
  static create(
    parseStartTime: number,
    parseEndTime: number,
    headerParseTime: number,
    bodyParseTime: number,
    validationTime: number,
    memoryUsage: number
  ): ParseMetricsValueObject {
    return new ParseMetricsValueObject(
      parseStartTime,
      parseEndTime,
      headerParseTime,
      bodyParseTime,
      validationTime,
      memoryUsage
    );
  }

  /**
   * Create empty metrics
   */
  static empty(): ParseMetricsValueObject {
    const now = Date.now();
    return new ParseMetricsValueObject(now, now, 0, 0, 0, 0);
  }

  /**
   * Get percentage of time spent parsing headers
   */
  getHeaderParsePercentage(): number {
    if (this.parseDuration === 0) return 0;
    return (this.headerParseTime / this.parseDuration) * 100;
  }

  /**
   * Get percentage of time spent parsing body
   */
  getBodyParsePercentage(): number {
    if (this.parseDuration === 0) return 0;
    return (this.bodyParseTime / this.parseDuration) * 100;
  }

  /**
   * Get percentage of time spent validating
   */
  getValidationPercentage(): number {
    if (this.parseDuration === 0) return 0;
    return (this.validationTime / this.parseDuration) * 100;
  }

  /**
   * Check if parsing was fast (< 10ms)
   */
  isFast(): boolean {
    return this.parseDuration < 10;
  }

  /**
   * Check if parsing was slow (> 100ms)
   */
  isSlow(): boolean {
    return this.parseDuration > 100;
  }

  /**
   * Check if memory usage is high (> 1MB)
   */
  isHighMemoryUsage(): boolean {
    return this.memoryUsage > 1024 * 1024;
  }

  /**
   * Clone the value object
   */
  clone(): ParseMetricsValueObject {
    return new ParseMetricsValueObject(
      this.parseStartTime,
      this.parseEndTime,
      this.headerParseTime,
      this.bodyParseTime,
      this.validationTime,
      this.memoryUsage
    );
  }

  /**
   * Convert to plain object
   */
  toObject(): {
    parseStartTime: number;
    parseEndTime: number;
    parseDuration: number;
    headerParseTime: number;
    bodyParseTime: number;
    validationTime: number;
    memoryUsage: number;
    headerParsePercentage: number;
    bodyParsePercentage: number;
    validationPercentage: number;
  } {
    return {
      parseStartTime: this.parseStartTime,
      parseEndTime: this.parseEndTime,
      parseDuration: this.parseDuration,
      headerParseTime: this.headerParseTime,
      bodyParseTime: this.bodyParseTime,
      validationTime: this.validationTime,
      memoryUsage: this.memoryUsage,
      headerParsePercentage: this.getHeaderParsePercentage(),
      bodyParsePercentage: this.getBodyParsePercentage(),
      validationPercentage: this.getValidationPercentage(),
    };
  }

  /**
   * Check if two metrics are equal
   */
  equals(other: ParseMetricsValueObject): boolean {
    return (
      this.parseStartTime === other.parseStartTime &&
      this.parseEndTime === other.parseEndTime &&
      this.headerParseTime === other.headerParseTime &&
      this.bodyParseTime === other.bodyParseTime &&
      this.validationTime === other.validationTime &&
      this.memoryUsage === other.memoryUsage
    );
  }
}
