/**
 * Compression Validation Service
 * 
 * Domain service for validating compression operations and configurations.
 * Provides validation logic for compression algorithms, thresholds, and results.
 */

import { CompressionAlgorithm } from '../value-objects/CompressionAlgorithm';
import { CompressionThreshold } from '../value-objects/CompressionThreshold';
import { CompressionResultEntity } from '../entities/CompressionResult';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

export class CompressionValidationService {
  /**
   * Validate compression algorithm
   */
  validateAlgorithm(algorithm: CompressionAlgorithm): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!algorithm.getName() || algorithm.getName().trim().length === 0) {
      errors.push({
        field: 'name',
        message: 'Algorithm name is required',
        code: 'ALGORITHM_NAME_REQUIRED',
      });
    }

    if (algorithm.getSupportedFormats().length === 0) {
      errors.push({
        field: 'supportedFormats',
        message: 'At least one supported format is required',
        code: 'SUPPORTED_FORMATS_REQUIRED',
      });
    }

    if (algorithm.getDefaultLevel() < algorithm.getMinLevel()) {
      errors.push({
        field: 'defaultLevel',
        message: 'Default level must be greater than or equal to min level',
        code: 'INVALID_DEFAULT_LEVEL',
      });
    }

    if (algorithm.getDefaultLevel() > algorithm.getMaxLevel()) {
      errors.push({
        field: 'defaultLevel',
        message: 'Default level must be less than or equal to max level',
        code: 'INVALID_DEFAULT_LEVEL',
      });
    }

    if (algorithm.isLossy()) {
      warnings.push({
        field: 'type',
        message: 'Lossy compression may result in data loss',
        code: 'LOSSY_COMPRESSION',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate compression threshold
   */
  validateThreshold(threshold: CompressionThreshold): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (threshold.getMinSize() < 0) {
      errors.push({
        field: 'minSize',
        message: 'Min size must be non-negative',
        code: 'INVALID_MIN_SIZE',
      });
    }

    if (threshold.getMaxSize() < threshold.getMinSize()) {
      errors.push({
        field: 'maxSize',
        message: 'Max size must be greater than or equal to min size',
        code: 'INVALID_MAX_SIZE',
      });
    }

    if (threshold.getMinCompressionRatio() <= 0 || threshold.getMinCompressionRatio() > 1) {
      errors.push({
        field: 'minCompressionRatio',
        message: 'Min compression ratio must be between 0 and 1',
        code: 'INVALID_COMPRESSION_RATIO',
      });
    }

    if (threshold.getMaxCompressionTime() <= 0) {
      errors.push({
        field: 'maxCompressionTime',
        message: 'Max compression time must be positive',
        code: 'INVALID_COMPRESSION_TIME',
      });
    }

    if (threshold.getMinSize() < 1024) {
      warnings.push({
        field: 'minSize',
        message: 'Min size is very small, may not benefit from compression',
        code: 'SMALL_MIN_SIZE',
      });
    }

    if (threshold.getMaxCompressionTime() > 5000) {
      warnings.push({
        field: 'maxCompressionTime',
        message: 'Max compression time is very high, may impact performance',
        code: 'HIGH_COMPRESSION_TIME',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate compression result
   */
  validateCompressionResult(result: CompressionResultEntity): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (result.originalSize <= 0) {
      errors.push({
        field: 'originalSize',
        message: 'Original size must be positive',
        code: 'INVALID_ORIGINAL_SIZE',
      });
    }

    if (result.compressedSize < 0) {
      errors.push({
        field: 'compressedSize',
        message: 'Compressed size cannot be negative',
        code: 'INVALID_COMPRESSED_SIZE',
      });
    }

    if (result.compressedSize > result.originalSize) {
      warnings.push({
        field: 'compressedSize',
        message: 'Compressed size is larger than original size',
        code: 'INEFFICIENT_COMPRESSION',
      });
    }

    if (!result.algorithm || result.algorithm.trim().length === 0) {
      errors.push({
        field: 'algorithm',
        message: 'Algorithm name is required',
        code: 'ALGORITHM_REQUIRED',
      });
    }

    if (result.compressionRatio <= 0 || result.compressionRatio > 1) {
      errors.push({
        field: 'compressionRatio',
        message: 'Compression ratio must be between 0 and 1',
        code: 'INVALID_COMPRESSION_RATIO',
      });
    }

    if (result.getCompressionTime() < 0) {
      errors.push({
        field: 'compressionTime',
        message: 'Compression time cannot be negative',
        code: 'INVALID_COMPRESSION_TIME',
      });
    }

    if (!result.isEffective()) {
      warnings.push({
        field: 'compressionRatio',
        message: 'Compression was not effective',
        code: 'INEFFECTIVE_COMPRESSION',
      });
    }

    if (result.getCompressionTime() > 1000) {
      warnings.push({
        field: 'compressionTime',
        message: 'Compression time is high',
        code: 'SLOW_COMPRESSION',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate compression input
   */
  validateCompressionInput(data: Uint8Array, algorithm: CompressionAlgorithm): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!data || data.length === 0) {
      errors.push({
        field: 'data',
        message: 'Input data is required',
        code: 'INPUT_DATA_REQUIRED',
      });
    }

    if (data.length < 1024) {
      warnings.push({
        field: 'data',
        message: 'Input data is very small, compression may not be beneficial',
        code: 'SMALL_INPUT_DATA',
      });
    }

    if (algorithm.isLossy()) {
      warnings.push({
        field: 'algorithm',
        message: 'Using lossy compression algorithm',
        code: 'LOSSY_ALGORITHM',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
