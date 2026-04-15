/**
 * Serialization Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Serialization Layer (Layer 16 of the 25-layer architecture).
 * 
 * The Serialization Layer provides response serialization,
 * versioning, and content negotiation.
 * 
 * @module SerializationLayer
 */

export { ISerializer } from './interfaces/ISerializer';
export { Serializer } from './implementations/Serializer';
export * from './types/serialization-types';
