/**
 * Reporting Engine2 — public exports.
 *
 * Second-generation modules on top of `reports/`:
 *   - ScheduledDelivery      — cron generation + multi-channel fan-out
 *   - ReportCache            — LRU/TTL/tag-invalidated result cache
 *   - DrillNavigator         — drill-down navigation stack
 *   - ExportFormatRegistry   — versioned, immutable export formats
 *   - ReportAccessControl    — report/column/row-level access policy
 *
 * @module ReportingLayer/Engine2
 */

export { ScheduledDelivery, makeArtifact } from './ScheduledDelivery';
export type {
  GeneratedReport,
  DeliveryChannel,
  ScheduledJob,
  DeliveryStatus,
  DeliveryRecord,
  ScheduledDeliveryOptions,
} from './ScheduledDelivery';

export { ReportCache } from './ReportCache';
export type {
  CacheSetOptions,
  CacheEntryRecord,
  CacheStats,
  ReportCacheOptions,
} from './ReportCache';

export { DrillNavigator } from './DrillDownNavigator';
export type { DrillSpec, DrillNode, Crumb } from './DrillDownNavigator';

export { ExportFormatRegistry } from './ExportFormatRegistry';
export type {
  ExportSerializer,
  FormatVersionInfo,
  FormatRegistration,
  SchemaDiff,
} from './ExportFormatRegistry';

export { ReportAccessControl, MASK_VALUE } from './AccessPolicy';
export type {
  Principal,
  ReportVisibility,
  ReportPolicy,
  AccessDecision,
} from './AccessPolicy';

export { DatasetProfiler } from './DatasetProfiler';
export type {
  ColumnProfile,
  DatasetProfile,
  ProfilerOptions,
} from './DatasetProfiler';
