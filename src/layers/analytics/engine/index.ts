/**
 * Analytics Engine — public exports.
 *
 * @module AnalyticsLayer/Engine
 */

export * from './types';
export { FunnelAnalyzer } from './FunnelAnalyzer';
export { CohortRetention } from './CohortRetention';
export { SessionStitcher } from './SessionStitcher';
export type { Session, SessionStitcherOptions } from './SessionStitcher';
export { MetricRollup, bucketize, canonicalizeTags } from './MetricRollup';
