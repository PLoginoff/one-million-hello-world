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

export { ISerializationStrategy } from './strategies/ISerializationStrategy';
export { JSONStrategy } from './strategies/JSONStrategy';
export { XMLStrategy } from './strategies/XMLStrategy';
export { StringStrategy } from './strategies/StringStrategy';

export { IContentNegotiator } from './content-negotiation/IContentNegotiator';
export { ContentNegotiationManager } from './content-negotiation/ContentNegotiationManager';

export { IVersioningStrategy } from './versioning/IVersioningStrategy';
export { VersioningManager } from './versioning/VersioningManager';
export { WrapperVersioningStrategy } from './versioning/WrapperVersioningStrategy';
export { HeaderVersioningStrategy } from './versioning/HeaderVersioningStrategy';
export { CustomVersioningStrategy } from './versioning/CustomVersioningStrategy';

export { IValidator, ValidationResult } from './validation/IValidator';
export { TypeValidator } from './validation/TypeValidator';
export { SchemaValidator, Schema } from './validation/SchemaValidator';
export { ValidationPipeline } from './validation/ValidationPipeline';

export { SerializationErrorCode, getErrorMessage } from './errors/SerializationErrorCode';
export { SerializationError, ErrorContext } from './errors/SerializationError';

export { ISerializationPlugin } from './plugins/ISerializationPlugin';
export { PluginManager } from './plugins/PluginManager';
export { CompressionPlugin } from './plugins/CompressionPlugin';

export { HookType, HookContext, HookFunction, ErrorHookFunction, SerializationHook } from './hooks/SerializationHook';
export { HookManager } from './hooks/HookManager';
