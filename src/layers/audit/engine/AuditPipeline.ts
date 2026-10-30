/**
 * Audit Pipeline
 *
 * Facade that wires the components into one write path:
 *
 *   capture(event) -> seal with hash chain -> append to store
 *                  -> feed anomaly detector -> return sealed record
 *
 * and the read paths: query, integrity verification, retention sweeps,
 * exports and compliance report generation.
 *
 * @module AuditLayer/Engine
 */

import {
  AuditEventInput,
  AuditRecord,
  AuditQuery,
  AuditQueryResult,
  AuditClock,
  SystemAuditClock,
  IdGenerator,
  IntegrityReport,
  AnomalyListener,
  RetentionPolicy,
  SEVERITY_ORDER,
  AuditSeverity,
} from './types';
import { AuditStore } from './AuditStore';
import { RetentionManager, RetentionSweepResult } from './RetentionManager';
import { AnomalyDetector, AnomalyDetectorConfig } from './AnomalyDetector';
import { exportRecords, AuditExportFormat, contentTypeFor } from './AuditExporter';

export interface AuditPipelineConfig {
  readonly clock?: AuditClock;
  readonly ids?: IdGenerator;
  readonly retention?: RetentionPolicy;
  readonly anomaly?: Partial<AnomalyDetectorConfig>;
}

/** A compliance summary for a time window. */
export interface ComplianceReport {
  readonly generatedAt: number;
  readonly fromMs: number;
  readonly toMs: number;
  readonly totalEvents: number;
  readonly byOutcome: Record<string, number>;
  readonly bySeverity: Record<string, number>;
  readonly topActors: Array<{ actor: string; count: number }>;
  readonly topActions: Array<{ action: string; count: number }>;
  readonly integrity: IntegrityReport;
  /** Tip hash at report time — anchor for external notarization. */
  readonly tipHash: string;
}

export class AuditPipeline {
  readonly store: AuditStore;
  readonly retention: RetentionManager;
  readonly anomalies: AnomalyDetector;

  private _clock: AuditClock;

  constructor(config?: AuditPipelineConfig) {
    this._clock = config?.clock ?? new SystemAuditClock();
    this.store = new AuditStore({ clock: this._clock, ids: config?.ids });
    this.retention = new RetentionManager(this.store, config?.retention, this._clock);
    this.anomalies = new AnomalyDetector(config?.anomaly, this._clock);
  }

  /**
   * Capture an event: seal, append, feed the anomaly detector.
   * Returns the immutable record.
   */
  capture(input: AuditEventInput): AuditRecord {
    const record = this.store.append(input, 'hot');
    this.anomalies.observe(record);
    return record;
  }

  /** Subscribe to anomaly signals. */
  onAnomaly(listener: AnomalyListener): void {
    this.anomalies.onAnomaly(listener);
  }

  /** Query records. */
  query(q: AuditQuery): AuditQueryResult {
    return this.store.query(q);
  }

  /** Verify the whole chain. */
  verifyIntegrity(): IntegrityReport {
    return this.store.verifyIntegrity();
  }

  /** Run a retention sweep. */
  sweepRetention(): RetentionSweepResult {
    return this.retention.sweep();
  }

  /** Export records matching a query. */
  export(
    q: AuditQuery,
    format: AuditExportFormat
  ): { body: string; contentType: string; count: number } {
    const { records } = this.store.query(q);
    return {
      body: exportRecords(records, format),
      contentType: contentTypeFor(format),
      count: records.length,
    };
  }

  /**
   * Build a compliance report over a time window.
   * Aggregations are single-pass O(#window records).
   */
  complianceReport(fromMs: number, toMs: number): ComplianceReport {
    const { records } = this.store.query({ fromMs, toMs });
    const byOutcome: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const actorCount = new Map<string, number>();
    const actionCount = new Map<string, number>();

    for (const r of records) {
      byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1;
      bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
      actorCount.set(r.actor, (actorCount.get(r.actor) ?? 0) + 1);
      actionCount.set(r.action, (actionCount.get(r.action) ?? 0) + 1);
    }

    return {
      generatedAt: this._clock.now(),
      fromMs,
      toMs,
      totalEvents: records.length,
      byOutcome,
      bySeverity,
      topActors: [...actorCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([actor, count]) => ({ actor, count })),
      topActions: [...actionCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([action, count]) => ({ action, count })),
      integrity: this.store.verifyIntegrity(),
      tipHash: this.store.tipHash,
    };
  }

  /** Severity-filtered convenience query for dashboards. */
  since(minSeverity: AuditSeverity, fromMs: number): AuditQueryResult {
    return this.store.query({ minSeverity, fromMs });
  }
}
