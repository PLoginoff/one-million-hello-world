/**
 * Snapshot Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Snapshot Layer (Layer 55 of the architecture).
 */

export { ISnapshot } from './interfaces/ISnapshot';
export { Snapshot } from './implementations/Snapshot';
export * from './implementations/HashTree';
export * from './implementations/VersionMap';
export * from './implementations/SnapshotManager';
export * from './implementations/RetentionPolicy';
export * from './types/snapshot-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';

// Engine2 (deeper capabilities)
export * from "./engine2";
