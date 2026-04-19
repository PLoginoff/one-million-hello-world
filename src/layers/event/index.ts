/**
 * Event Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Event Layer with 8-layer architecture.
 * 
 * Architecture Layers:
 * 1. Domain Layer - Core business entities and value objects
 * 2. Core Layer - Event bus implementation and core logic
 * 3. Infrastructure Layer - External concerns and persistence
 * 4. Application Layer - Application-specific services
 * 5. Utils Layer - Utility classes
 * 6. Monitoring Layer - Observability and logging
 * 7. Configuration Layer - Configuration management
 * 8. Testing Layer - Testing utilities
 * 
 * @module EventLayer
 */

// Domain Layer
export * from './domain';

// Core Layer
export * from './core';

// Infrastructure Layer
export * from './infrastructure';

// Application Layer
export * from './application';

// Utils Layer
export * from './utils';

// Monitoring Layer
export * from './monitoring';

// Configuration Layer
export * from './configuration';

// Testing Layer
export * from './testing';
