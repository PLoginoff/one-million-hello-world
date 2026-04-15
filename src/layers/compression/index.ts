/**
 * Compression Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Compression Layer (Layer 17 of the 25-layer architecture).
 * 
 * The Compression Layer provides Gzip, Brotli,
 * and dynamic compression.
 * 
 * @module CompressionLayer
 */

export { ICompressor } from './interfaces/ICompressor';
export { Compressor } from './implementations/Compressor';
export * from './types/compression-types';
