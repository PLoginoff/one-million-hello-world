/**
 * DeadLetter Engine2 — public exports.
 *
 * @module DeadLetterLayer/Engine2
 */

export * from './types';
export { RecordStore, RecordStateError, _resetRecordIds } from './RecordStore';
export type { StoredView } from './RecordStore';
export {
  clusterRecords,
  normalizeMessage,
  signatureOf,
  topReasons,
} from './ErrorClusters';
export type { Cluster, ClusterMember, ReasonGroupBy } from './ErrorClusters';
export { ReplayScheduler, ReplayPlanError } from './ReplayScheduler';
export type { Redeliverer } from './ReplayScheduler';
export { QuarantineRegistry, QuarantineError } from './Quarantine';
export { SizeAlertRegistry } from './SizeAlerts';
export { CrossTransfer, TransferError } from './CrossTransfer';
export { DlqAnalytics, ageHistogram, arrivalRatePerMs } from './DlqAnalytics';
export type { AgeBucket, TrendReport } from './DlqAnalytics';
export { RetentionEnforcer } from './Retention';
export type { RetentionPolicy, RetentionReport } from './Retention';
export { trendClusters } from './ClusterTrend';
export type { ClusterTrend, TrendedCluster } from './ClusterTrend';
