/**
 * Compression Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Compression Layer (Layer 17 of the 25-layer architecture).
 *
 * The Compression Layer provides Gzip, Brotli,
 * and dynamic compression with Clean Architecture.
 *
 * @module CompressionLayer
 */

// Legacy exports (backward compatibility)
export { ICompressor } from './interfaces/ICompressor';
export { Compressor } from './implementations/Compressor';
export * from './types/compression-types';

// New Clean Architecture exports

// Domain Layer
export { CompressionResultEntity } from './domain/entities/CompressionResult';
export { CompressionMetadata, CompressionMetadataData } from './domain/value-objects/CompressionMetadata';
export { CompressionAlgorithm, CompressionAlgorithmData } from './domain/value-objects/CompressionAlgorithm';
export { CompressionThreshold, CompressionThresholdData } from './domain/value-objects/CompressionThreshold';
export {
  CompressionValidationService,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './domain/services/CompressionValidationService';

// Configuration Layer
export { CompressionDefaults, CompressionConfigDefaults } from './configuration/defaults/CompressionDefaults';
export { CompressionConfigBuilder, CompressionConfig } from './configuration/builders/CompressionConfigBuilder';
export {
  CompressionConfigValidator,
  ConfigValidationResult,
  ConfigValidationError,
  ConfigValidationWarning,
} from './configuration/validators/CompressionConfigValidator';

// Real compression algorithms (replaces simulated codecs)
export {
  BitWriter,
  BitReader,
  HuffmanCodec,
  LzssCodec,
  LzssFixedCodec,
  LzMatchFinder,
  RleCodec,
  DeltaCodec,
  zigzagEncode,
  zigzagDecode,
  writeVarint,
  readVarint,
  CodecHarness,
  SampleDatasets,
  RealCodecCompressor,
  MinHeap,
  buildFrequencyTable,
  buildTree,
  computeCodeLengths,
  generateCanonicalCodes,
  serializeCodeLengths,
  deserializeCodeLengths,
  CanonicalDecoder,
  MAX_CODE_LENGTH,
  DEFAULT_WINDOW_SIZE,
  DEFAULT_MIN_MATCH,
  DEFAULT_MAX_MATCH,
  DEFAULT_MAX_CHAIN,
  ESCAPE,
  MIN_RUN,
  MAX_RUN,
} from './algorithms';
export type {
  HuffmanEncoded,
  HuffmanNode,
  CanonicalCode,
  LzToken,
  LzssEncoded,
  LzMatch,
  RleEncoded,
  DeltaEncoded,
  IByteCodec,
  CodecBenchmark,
  InputProfile,
  HarnessReport,
} from './algorithms';
