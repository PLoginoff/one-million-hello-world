/**
 * Compliance Control Mapping Engine
 *
 * Maps compliance controls (SOC2, ISO 27001, GDPR articles, …) to their
 * supporting evidence and derives an assessment status per control:
 *
 *  - no evidence                       → not-assessed
 *  - all evidence stale (expired)      → non-compliant
 *  - fresh evidence below threshold    → partial
 *  - fresh evidence >= threshold       → compliant
 *
 * "Fresh" means `validUntil` is null or in the future — staleness is
 * evaluated against the injected clock so assessments are reproducible.
 *
 * Coverage reporting aggregates per framework prefix (the part of
 * `frameworkRef` before '-'), e.g. all 'SOC2-*' controls.
 *
 * @module GovernanceLayer/Engines
 */

import {
  ComplianceControl,
  ControlAssessment,
  ControlStatus,
  Evidence,
  IClock,
  SystemClock,
} from './types';

export interface CoverageReport {
  framework: string;
  totalControls: number;
  byStatus: Record<ControlStatus, number>;
  /** compliant / total as a percentage. */
  compliancePct: number;
}

export class ComplianceControlEngine {
  private readonly _controls: Map<string, ComplianceControl>;
  private readonly _evidence: Map<string, Evidence>;
  /** Fresh-evidence count needed for 'compliant'. */
  private _requiredEvidence: number;
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock(), requiredEvidence: number = 1) {
    this._controls = new Map();
    this._evidence = new Map();
    this._requiredEvidence = requiredEvidence;
    this._clock = clock;
  }

  setRequiredEvidence(n: number): void {
    if (n < 1) throw new Error('requiredEvidence must be >= 1');
    this._requiredEvidence = n;
  }

  registerControl(control: Omit<ComplianceControl, 'status' | 'evidenceIds' | 'lastAssessedAt'>): ComplianceControl {
    const c: ComplianceControl = {
      ...control,
      status: ControlStatus.NotAssessed,
      evidenceIds: [],
      lastAssessedAt: null,
    };
    this._controls.set(c.id, c);
    return c;
  }

  /** Attach evidence to a control. Returns the stored evidence record. */
  addEvidence(controlId: string, ev: Omit<Evidence, 'id' | 'controlId' | 'collectedAt'>): Evidence {
    const control = this._requireControl(controlId);
    const evidence: Evidence = {
      id: `ev-${this._evidence.size + 1}-${controlId}`,
      controlId,
      title: ev.title,
      reference: ev.reference,
      collectedAt: this._clock.now(),
      validUntil: ev.validUntil,
    };
    this._evidence.set(evidence.id, evidence);
    control.evidenceIds.push(evidence.id);
    return evidence;
  }

  removeEvidence(evidenceId: string): boolean {
    const ev = this._evidence.get(evidenceId);
    if (!ev) return false;
    const control = this._controls.get(ev.controlId);
    if (control) {
      control.evidenceIds = control.evidenceIds.filter((id) => id !== evidenceId);
    }
    return this._evidence.delete(evidenceId);
  }

  /**
   * Recompute a control's status from its evidence freshness, persist the
   * result, and return the assessment.
   */
  assess(controlId: string): ControlAssessment {
    const control = this._requireControl(controlId);
    const now = this._clock.now();

    let fresh = 0;
    let stale = 0;
    for (const evId of control.evidenceIds) {
      const ev = this._evidence.get(evId);
      if (!ev) continue;
      if (ev.validUntil === null || ev.validUntil > now) fresh++;
      else stale++;
    }

    let status: ControlStatus;
    const total = fresh + stale;
    if (total === 0) status = ControlStatus.NotAssessed;
    else if (fresh === 0) status = ControlStatus.NonCompliant;
    else if (fresh < this._requiredEvidence) status = ControlStatus.Partial;
    else status = ControlStatus.Compliant;

    control.status = status;
    control.lastAssessedAt = now;

    return {
      controlId,
      frameworkRef: control.frameworkRef,
      status,
      evidenceCount: total,
      freshEvidenceCount: fresh,
      staleEvidenceCount: stale,
    };
  }

  /** Assess every control; returns assessments in registration order. */
  assessAll(): ControlAssessment[] {
    return [...this._controls.keys()].map((id) => this.assess(id));
  }

  /**
   * Framework coverage report. `framework` is the ref prefix before '-'
   * (e.g. 'SOC2'). Assesses controls lazily if never assessed.
   */
  coverage(framework: string): CoverageReport {
    const controls = [...this._controls.values()].filter((c) =>
      c.frameworkRef.startsWith(`${framework}-`)
    );
    const byStatus: Record<ControlStatus, number> = {
      [ControlStatus.Compliant]: 0,
      [ControlStatus.Partial]: 0,
      [ControlStatus.NonCompliant]: 0,
      [ControlStatus.NotAssessed]: 0,
    };
    for (const c of controls) {
      const a = this.assess(c.id);
      byStatus[a.status]++;
    }
    const total = controls.length;
    return {
      framework,
      totalControls: total,
      byStatus,
      compliancePct: total === 0 ? 0 : (byStatus[ControlStatus.Compliant] / total) * 100,
    };
  }

  /** All distinct framework prefixes present. */
  frameworks(): string[] {
    const set = new Set<string>();
    for (const c of this._controls.values()) {
      const idx = c.frameworkRef.indexOf('-');
      set.add(idx === -1 ? c.frameworkRef : c.frameworkRef.slice(0, idx));
    }
    return [...set].sort();
  }

  getControl(controlId: string): ComplianceControl | null {
    return this._controls.get(controlId) ?? null;
  }

  getEvidence(evidenceId: string): Evidence | null {
    return this._evidence.get(evidenceId) ?? null;
  }

  private _requireControl(controlId: string): ComplianceControl {
    const c = this._controls.get(controlId);
    if (!c) throw new Error(`Unknown control: ${controlId}`);
    return c;
  }
}
