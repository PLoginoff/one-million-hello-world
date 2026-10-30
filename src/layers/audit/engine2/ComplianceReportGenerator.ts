/**
 * Compliance Report Generator
 *
 * Maps audit records onto framework controls (SOC 2 Trust Services
 * Criteria and GDPR articles), producing an evidence-backed report:
 * each control lists the matching audit records (as evidence refs),
 * coverage status, and observed outcome failures.
 *
 * A "control mapping" declares which actions/resources satisfy which
 * control. Coverage = at least one matching event in the window.
 * Gaps = controls with zero evidence — the auditor's TODO list.
 *
 * @module AuditLayer/Engine2
 */

import type { AuditRecord } from '../engine/types';
import type { AuditStore } from '../engine/AuditStore';

export type ComplianceFramework = 'soc2' | 'gdpr';

/** A single framework control mapped to audit-event predicates. */
export interface ControlMapping {
  /** Framework control id, e.g. `CC6.1` or `art32`. */
  readonly controlId: string;
  readonly title: string;
  /** Audit `action` values (or `prefix*` globs) that evidence this control. */
  readonly actions?: readonly string[];
  /** Resource types that evidence this control. */
  readonly resourceTypes?: readonly string[];
  /** Minimum evidence records for "covered" status (default 1). */
  readonly minEvidence?: number;
}

export type ControlStatus = 'covered' | 'partial' | 'gap';

export interface ControlFinding {
  readonly controlId: string;
  readonly title: string;
  readonly status: ControlStatus;
  /** Sealed record ids backing this control — auditable trail. */
  readonly evidenceRefs: readonly string[];
  /** Count of evidence records with outcome !== 'success'. */
  readonly failuresObserved: number;
  readonly requiredEvidence: number;
}

export interface ComplianceReportV2 {
  readonly framework: ComplianceFramework;
  readonly generatedAt: number;
  readonly fromMs: number;
  readonly toMs: number;
  readonly findings: readonly ControlFinding[];
  readonly covered: number;
  readonly gaps: number;
  /** SHA-style tip hash anchoring the report to the log's chain. */
  readonly anchorHash: string;
}

function matchesPattern(action: string, pattern: string): boolean {
  if (pattern.endsWith('*')) return action.startsWith(pattern.slice(0, -1));
  return action === pattern;
}

/**
 * Default SOC 2 (Trust Services) and GDPR control mappings — the
 * predicates encode what a real audit program looks for in logs.
 */
export const DEFAULT_CONTROL_MAPPINGS: Record<ComplianceFramework, readonly ControlMapping[]> = {
  soc2: [
    {
      controlId: 'CC6.1',
      title: 'Logical access — authentication events',
      actions: ['auth.login', 'auth.logout', 'auth.mfa.*', 'auth.failed'],
      minEvidence: 1,
    },
    {
      controlId: 'CC6.2',
      title: 'Credential provisioning and revocation',
      actions: ['identity.provision', 'identity.deprovision', 'apikey.*'],
    },
    {
      controlId: 'CC6.6',
      title: 'Boundary protection — denied access attempts',
      actions: ['authz.denied', 'waf.block', 'firewall.*'],
    },
    {
      controlId: 'CC7.2',
      title: 'Security monitoring — anomaly alerts',
      actions: ['anomaly.*', 'alert.raised', 'siem.*'],
    },
    {
      controlId: 'CC7.3',
      title: 'Incident response actions',
      actions: ['incident.*', 'forensics.*'],
    },
    {
      controlId: 'A1.2',
      title: 'Availability — backup and restore operations',
      actions: ['backup.*', 'restore.*'],
      resourceTypes: ['backup', 'snapshot'],
    },
  ],
  gdpr: [
    {
      controlId: 'art15',
      title: 'Right of access — subject access requests',
      actions: ['gdpr.sar', 'data.export', 'subject.access'],
    },
    {
      controlId: 'art17',
      title: 'Right to erasure — deletion events',
      actions: ['gdpr.erase', 'user.delete', 'data.purge'],
    },
    {
      controlId: 'art30',
      title: 'Records of processing activities',
      actions: ['data.process', 'data.read', 'data.write'],
      minEvidence: 3,
    },
    {
      controlId: 'art32',
      title: 'Security of processing — encryption/key events',
      actions: ['encrypt.*', 'key.*', 'tls.*'],
    },
    {
      controlId: 'art33',
      title: 'Breach notification within 72h',
      actions: ['breach.detected', 'breach.notified', 'incident.privacy'],
    },
  ],
};

export interface ComplianceGeneratorOptions {
  /** Custom mappings per framework; defaults used when omitted. */
  readonly mappings?: Partial<Record<ComplianceFramework, readonly ControlMapping[]>>;
  /** Max evidence refs kept per control (report stays compact). */
  readonly maxEvidenceRefs?: number;
  readonly clock?: { now(): number };
}

export class ComplianceReportGenerator {
  private readonly _mappings: Record<ComplianceFramework, readonly ControlMapping[]>;
  private readonly _maxRefs: number;
  private readonly _clock: { now(): number };

  constructor(options?: ComplianceGeneratorOptions) {
    this._mappings = {
      soc2: options?.mappings?.soc2 ?? DEFAULT_CONTROL_MAPPINGS.soc2,
      gdpr: options?.mappings?.gdpr ?? DEFAULT_CONTROL_MAPPINGS.gdpr,
    };
    this._maxRefs = options?.maxEvidenceRefs ?? 25;
    this._clock = options?.clock ?? { now: () => Date.now() };
  }

  /**
   * Generate a report for `framework` over the records visible via
   * `records` (already filtered to the window) or by querying `store`.
   */
  generate(
    framework: ComplianceFramework,
    source: AuditStore | readonly AuditRecord[],
    window?: { fromMs?: number; toMs?: number }
  ): ComplianceReportV2 {
    const records = this.collect(source, window);
    const findings: ControlFinding[] = [];

    for (const control of this._mappings[framework]) {
      const required = control.minEvidence ?? 1;
      const hits = records.filter((r) => this.evidences(control, r));
      const refs = hits.slice(0, this._maxRefs).map((r) => r.id);
      const failures = hits.filter((r) => r.outcome !== 'success').length;
      const status: ControlStatus =
        hits.length === 0 ? 'gap' : hits.length < required ? 'partial' : 'covered';
      findings.push({
        controlId: control.controlId,
        title: control.title,
        status,
        evidenceRefs: refs,
        failuresObserved: failures,
        requiredEvidence: required,
      });
    }

    return {
      framework,
      generatedAt: this._clock.now(),
      fromMs: window?.fromMs ?? 0,
      toMs: window?.toMs ?? this._clock.now(),
      findings,
      covered: findings.filter((f) => f.status === 'covered').length,
      gaps: findings.filter((f) => f.status === 'gap').length,
      anchorHash: records.length > 0 ? records[records.length - 1].hash : 'GENESIS',
    };
  }

  /** Render the report as plain text — auditor friendly. */
  renderText(report: ComplianceReportV2): string {
    const lines: string[] = [
      `COMPLIANCE REPORT — ${report.framework.toUpperCase()}`,
      `Generated: ${new Date(report.generatedAt).toISOString()}`,
      `Window: ${new Date(report.fromMs).toISOString()} .. ${new Date(report.toMs).toISOString()}`,
      `Anchor: ${report.anchorHash}`,
      `Coverage: ${report.covered}/${report.findings.length} controls covered, ${report.gaps} gaps`,
      '',
    ];
    for (const f of report.findings) {
      lines.push(`[${f.status.toUpperCase().padEnd(7)}] ${f.controlId} — ${f.title}`);
      lines.push(`          evidence=${f.evidenceRefs.length}/${f.requiredEvidence} failures=${f.failuresObserved}`);
      for (const ref of f.evidenceRefs.slice(0, 5)) {
        lines.push(`            · ${ref}`);
      }
    }
    return lines.join('\n');
  }

  private evidences(control: ControlMapping, r: AuditRecord): boolean {
    const actionHit =
      control.actions !== undefined &&
      control.actions.some((p) => matchesPattern(r.action, p));
    const typeHit =
      control.resourceTypes !== undefined &&
      r.resourceType !== undefined &&
      control.resourceTypes.includes(r.resourceType);
    // At least one predicate must be defined; all defined predicates OR.
    if (control.actions === undefined && control.resourceTypes === undefined) return false;
    return actionHit || typeHit;
  }

  private collect(
    source: AuditStore | readonly AuditRecord[],
    window?: { fromMs?: number; toMs?: number }
  ): readonly AuditRecord[] {
    if (typeof (source as AuditStore).query !== 'function') {
      return (source as readonly AuditRecord[]).filter(
        (r) =>
          (window?.fromMs === undefined || r.timestamp >= window.fromMs) &&
          (window?.toMs === undefined || r.timestamp <= window.toMs)
      );
    }
    const result = (source as AuditStore).query({
      fromMs: window?.fromMs,
      toMs: window?.toMs,
      limit: 1_000_000,
    });
    return result.records;
  }
}
