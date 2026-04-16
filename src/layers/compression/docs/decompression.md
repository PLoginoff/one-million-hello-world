# Decompression

## Overview
The Compression Layer implements decompression with algorithm-specific decompression, error handling, format validation, and data integrity.

## Decompression Engine

### Decompression Engine
```typescript
class DecompressionEngine {
  private selector: AlgorithmSelector;
  
  constructor(selector: AlgorithmSelector) {
    this.selector = selector;
  }
  
  decompress(data: Buffer, algorithm: CompressionAlgorithm): Buffer {
    const compressor = this.selector.select(algorithm);
    return compressor.decompress(data);
  }
  
  decompressAuto(data: Buffer): Buffer {
    // Auto-detect algorithm from data
    const algorithm = this.detectAlgorithm(data);
    return this.decompress(data, algorithm);
  }
  
  private detectAlgorithm(data: Buffer): CompressionAlgorithm {
    if (data[0] === 0x1f && data[1] === 0x8b) {
      return CompressionAlgorithm.GZIP;
    }
    
    if (data[0] === 0x81) {
      return CompressionAlgorithm.BROTLI;
    }
    
    return CompressionAlgorithm.NONE;
  }
}
```

## Error Handling

### Decompression Errors
```typescript
class DecompressionError extends Error {
  constructor(
    message: string,
    public algorithm?: CompressionAlgorithm,
    public cause?: Error
  ) {
    super(message);
    this.name = 'DecompressionError';
  }
}

class ValidationError extends Error {
  constructor(message: string, public data: Buffer) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

### Error Handler
```typescript
class DecompressionErrorHandler {
  handleDecompressionError(error: Error, algorithm: CompressionAlgorithm): DecompressionError {
    if (error instanceof DecompressionError) {
      return error;
    }
    
    return new DecompressionError(
      `Decompression failed for algorithm ${algorithm}`,
      algorithm,
      error
    );
  }
  
  validateFormat(data: Buffer, algorithm: CompressionAlgorithm): void {
    switch (algorithm) {
      case CompressionAlgorithm.GZIP:
        if (data[0] !== 0x1f || data[1] !== 0x8b) {
          throw new ValidationError('Invalid Gzip format', data);
        }
        break;
      case CompressionAlgorithm.BROTLI:
        if (data[0] !== 0x81) {
          throw new ValidationError('Invalid Brotli format', data);
        }
        break;
    }
  }
}
```

## Best Practices

### Decompression Guidelines
- Validate format before decompression
- Handle decompression errors gracefully
- Auto-detect algorithm when possible
- Monitor decompression performance
