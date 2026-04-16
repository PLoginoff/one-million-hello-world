# Compression Algorithms

## Overview
The Compression Layer implements multiple compression algorithms including Gzip (simulated), Brotli (simulated), and no compression option with configurable default algorithm.

## Algorithm Definition

### Compression Algorithm
```typescript
enum CompressionAlgorithm {
  GZIP = 'gzip',
  BROTLI = 'brotli',
  NONE = 'none'
}

interface CompressionResult {
  data: Buffer;
  algorithm: CompressionAlgorithm;
  originalSize: number;
  compressedSize: number;
  ratio: number;
}
```

### Gzip Compressor (Simulated)
```typescript
class GzipCompressor {
  compress(data: Buffer): CompressionResult {
    // Simulated compression - in production, use zlib
    const compressed = this.simulateGzip(data);
    
    return {
      data: compressed,
      algorithm: CompressionAlgorithm.GZIP,
      originalSize: data.length,
      compressedSize: compressed.length,
      ratio: data.length / compressed.length
    };
  }
  
  decompress(data: Buffer): Buffer {
    // Simulated decompression - in production, use zlib
    return this.simulateGunzip(data);
  }
  
  private simulateGzip(data: Buffer): Buffer {
    // Simple simulation - in production, replace with real Gzip
    const header = Buffer.from([0x1f, 0x8b]);
    return Buffer.concat([header, data]);
  }
  
  private simulateGunzip(data: Buffer): Buffer {
    // Simple simulation - in production, replace with real Gunzip
    if (data[0] === 0x1f && data[1] === 0x8b) {
      return data.slice(2);
    }
    return data;
  }
}
```

### Brotli Compressor (Simulated)
```typescript
class BrotliCompressor {
  compress(data: Buffer): CompressionResult {
    // Simulated compression - in production, use iltorb
    const compressed = this.simulateBrotli(data);
    
    return {
      data: compressed,
      algorithm: CompressionAlgorithm.BROTLI,
      originalSize: data.length,
      compressedSize: compressed.length,
      ratio: data.length / compressed.length
    };
  }
  
  decompress(data: Buffer): Buffer {
    // Simulated decompression - in production, use iltorb
    return this.simulateBrotliDecompress(data);
  }
  
  private simulateBrotli(data: Buffer): Buffer {
    // Simple simulation - in production, replace with real Brotli
    const header = Buffer.from([0x81]);
    return Buffer.concat([header, data]);
  }
  
  private simulateBrotliDecompress(data: Buffer): Buffer {
    // Simple simulation - in production, replace with real Brotli decompression
    if (data[0] === 0x81) {
      return data.slice(1);
    }
    return data;
  }
}
```

### No Compression
```typescript
class NoOpCompressor {
  compress(data: Buffer): CompressionResult {
    return {
      data: Buffer.from(data),
      algorithm: CompressionAlgorithm.NONE,
      originalSize: data.length,
      compressedSize: data.length,
      ratio: 1.0
    };
  }
  
  decompress(data: Buffer): Buffer {
    return Buffer.from(data);
  }
}
```

## Algorithm Selector

### Algorithm Selector
```typescript
class AlgorithmSelector {
  private defaultAlgorithm: CompressionAlgorithm;
  private algorithms: Map<CompressionAlgorithm, any>;
  
  constructor(defaultAlgorithm: CompressionAlgorithm) {
    this.defaultAlgorithm = defaultAlgorithm;
    this.algorithms = new Map([
      [CompressionAlgorithm.GZIP, new GzipCompressor()],
      [CompressionAlgorithm.BROTLI, new BrotliCompressor()],
      [CompressionAlgorithm.NONE, new NoOpCompressor()]
    ]);
  }
  
  select(algorithm?: CompressionAlgorithm): any {
    const selected = algorithm || this.defaultAlgorithm;
    return this.algorithms.get(selected);
  }
  
  setDefault(algorithm: CompressionAlgorithm): void {
    this.defaultAlgorithm = algorithm;
  }
  
  getDefault(): CompressionAlgorithm {
    return this.defaultAlgorithm;
  }
}
```

## Best Practices

### Algorithm Guidelines
- Use Gzip for general purpose compression
- Use Brotli for better compression ratio
- Use None for already compressed data
- Monitor compression ratios
- Document algorithm limitations

### Performance Considerations
- Monitor compression time
- Use appropriate algorithm for data size
- Cache compression results when possible
- Consider CPU overhead
