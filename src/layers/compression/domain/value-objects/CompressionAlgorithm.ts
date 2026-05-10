/**
 * Compression Algorithm Value Object
 * 
 * Represents compression algorithm configuration.
 * Immutable value object for algorithm management.
 */

export interface CompressionAlgorithmData {
  name: string;
  type: 'lossless' | 'lossy';
  defaultLevel: number;
  minLevel: number;
  maxLevel: number;
  supportedFormats: string[];
  description: string;
}

export class CompressionAlgorithm {
  readonly data: CompressionAlgorithmData;

  constructor(data: CompressionAlgorithmData) {
    this._validateAlgorithm(data);
    this.data = { ...data };
  }

  /**
   * Get algorithm name
   */
  getName(): string {
    return this.data.name;
  }

  /**
   * Get algorithm type
   */
  getType(): 'lossless' | 'lossy' {
    return this.data.type;
  }

  /**
   * Get default compression level
   */
  getDefaultLevel(): number {
    return this.data.defaultLevel;
  }

  /**
   * Get minimum compression level
   */
  getMinLevel(): number {
    return this.data.minLevel;
  }

  /**
   * Get maximum compression level
   */
  getMaxLevel(): number {
    return this.data.maxLevel;
  }

  /**
   * Get supported formats
   */
  getSupportedFormats(): string[] {
    return [...this.data.supportedFormats];
  }

  /**
   * Get description
   */
  getDescription(): string {
    return this.data.description;
  }

  /**
   * Check if format is supported
   */
  supportsFormat(format: string): boolean {
    return this.data.supportedFormats.includes(format.toLowerCase());
  }

  /**
   * Check if level is valid
   */
  isValidLevel(level: number): boolean {
    return level >= this.data.minLevel && level <= this.data.maxLevel;
  }

  /**
   * Check if algorithm is lossless
   */
  isLossless(): boolean {
    return this.data.type === 'lossless';
  }

  /**
   * Check if algorithm is lossy
   */
  isLossy(): boolean {
    return this.data.type === 'lossy';
  }

  /**
   * Create Gzip algorithm
   */
  static createGzip(): CompressionAlgorithm {
    return new CompressionAlgorithm({
      name: 'gzip',
      type: 'lossless',
      defaultLevel: 6,
      minLevel: 1,
      maxLevel: 9,
      supportedFormats: ['gz', 'gzip'],
      description: 'Gzip compression algorithm',
    });
  }

  /**
   * Create Brotli algorithm
   */
  static createBrotli(): CompressionAlgorithm {
    return new CompressionAlgorithm({
      name: 'brotli',
      type: 'lossless',
      defaultLevel: 4,
      minLevel: 0,
      maxLevel: 11,
      supportedFormats: ['br', 'brotli'],
      description: 'Brotli compression algorithm',
    });
  }

  /**
   * Create Deflate algorithm
   */
  static createDeflate(): CompressionAlgorithm {
    return new CompressionAlgorithm({
      name: 'deflate',
      type: 'lossless',
      defaultLevel: 6,
      minLevel: 1,
      maxLevel: 9,
      supportedFormats: ['deflate', 'zz'],
      description: 'Deflate compression algorithm',
    });
  }

  /**
   * Create Zlib algorithm
   */
  static createZlib(): CompressionAlgorithm {
    return new CompressionAlgorithm({
      name: 'zlib',
      type: 'lossless',
      defaultLevel: 6,
      minLevel: 1,
      maxLevel: 9,
      supportedFormats: ['zlib'],
      description: 'Zlib compression algorithm',
    });
  }

  private _validateAlgorithm(data: CompressionAlgorithmData): void {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Algorithm name is required');
    }

    if (data.type !== 'lossless' && data.type !== 'lossy') {
      throw new Error('Algorithm type must be lossless or lossy');
    }

    if (data.defaultLevel < data.minLevel || data.defaultLevel > data.maxLevel) {
      throw new Error('Default level must be between min and max level');
    }

    if (data.minLevel < 0) {
      throw new Error('Min level must be non-negative');
    }

    if (data.maxLevel < data.minLevel) {
      throw new Error('Max level must be greater than or equal to min level');
    }

    if (!data.supportedFormats || data.supportedFormats.length === 0) {
      throw new Error('At least one supported format is required');
    }
  }
}
