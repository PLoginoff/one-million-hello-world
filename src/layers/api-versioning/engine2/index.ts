/**
 * API Versioning Engine2 — public exports.
 *
 * @module ApiVersioningLayer/Engine2
 */

export * from './types';
export { VersionLifecycleManager } from './VersionLifecycleManager';
export type { LifecycleManagerOptions } from './VersionLifecycleManager';
export { VersionUsageTracker } from './VersionUsageTracker';
export { BreakingChangeDetector } from './BreakingChangeDetector';
export { VersionedRateLimiter } from './VersionedRateLimiter';
export { MigrationGuideGenerator } from './MigrationGuideGenerator';
export type { EndpointSchema, MigrationGuide, MigrationStep } from './MigrationGuideGenerator';
