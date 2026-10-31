/**
 * Compliance Export Scheduler
 *
 * Manages GDPR-style data-export requests (Art. 15 access / Art. 20
 * portability) against the audit store with SLA tracking:
 *
 *  - **Lifecycle.** pending → processing → ready → delivered, with
 *     `expired` (SLA breach) and `cancelled` terminal branches. Every
 *     transition is logged on the request — audits of the audit
 *     system.
 *
 *  - **SLA tracking.** Each request carries an absolute deadline
 *     (default 30 days, the GDPR one-month rule). `slaReport()`
 *     surfaces at-risk requests before breach; `tick()` sweeps
 *     pending/processing requests past deadline into `expired`.
 *
 *  - **Assembly.** `assemble()` collects the subject's records from
 *     a caller-supplied query function (so it works over `AuditStore`,
 *     compacted segments, or a search index), seals them into an
 *     `ExportBundle` with a canonical-JSON checksum, and transitions
 *     the request to `ready`.
 *
 * Requests are in-memory with deterministic clocks — a real adapter
 * would persist `ExportRequest`s and stream bundles to object storage.
 *
 * Complexity: submit O(1); assemble O(subject records); tick O(R).
 *
 * @module AuditLayer/Engine3
 */

import { createHash } from 'crypto';
import type { AuditRecord } from '../engine/types';
import { canonicalJson } from '../engine/HashChain';
import {
  AuditClock3,
  ExportBundle,
  ExportRequest,
  ExportRequestStatus,
  SlaReport,
  SystemAuditClock3,
} from './types3';

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Record source for bundle assembly — adapter over any store. */
export type RecordSource = (query: {
  subjectId: string;
  tenant?: string;
}) => readonly AuditRecord[];

const GDPR_SLA_MS = 30 * 24 * 60 * 60 * 1000; // one month

const VALID_TRANSITIONS: Record<ExportRequestStatus, readonly ExportRequestStatus[]> = {
  pending: ['processing', 'cancelled', 'expired'],
  processing: ['ready', 'cancelled', 'expired'],
  ready: ['delivered', 'expired', 'cancelled'],
  delivered: [],
  expired: [],
  cancelled: [],
};

export interface ExportSchedulerOptions {
  readonly clock?: AuditClock3;
  /** SLA window in ms (default 30 days, GDPR one-month). */
  readonly slaMs?: number;
  /** Warn when a pending/processing request is this close to SLA. */
  readonly warningMs?: number;
  readonly idGen?: () => string;
}

let defaultReqSeq = 0;

export class ComplianceExportScheduler {
  private readonly clock: AuditClock3;
  private readonly slaMs: number;
  private readonly warningMs: number;
  private readonly idGen: () => string;
  private readonly requests = new Map<string, ExportRequest>();
  private readonly bundles = new Map<string, ExportBundle>();

  constructor(
    private readonly source: RecordSource,
    options: ExportSchedulerOptions = {}
  ) {
    this.clock = options.clock ?? new SystemAuditClock3();
    this.slaMs = options.slaMs ?? GDPR_SLA_MS;
    if (this.slaMs <= 0) throw new Error('slaMs must be positive');
    this.warningMs = options.warningMs ?? 7 * 24 * 60 * 60 * 1000;
    this.idGen = options.idGen ?? (() => `dsr-${++defaultReqSeq}`);
  }

  /** Accept a new export request. */
  submit(subjectId: string, opts: { tenant?: string; slaMs?: number } = {}): ExportRequest {
    if (!subjectId) throw new Error('subjectId is required');
    const now = this.clock.now();
    const sla = opts.slaMs ?? this.slaMs;
    const req: ExportRequest = {
      id: this.idGen(),
      subjectId,
      tenant: opts.tenant,
      createdAt: now,
      slaDeadline: now + sla,
      status: 'pending',
      history: [{ from: 'none', to: 'pending', at: now }],
      recordIds: [],
    };
    this.requests.set(req.id, req);
    return req;
  }

  /** Begin assembling — pending → processing. */
  startProcessing(id: string): ExportRequest {
    return this.transition(id, 'processing');
  }

  /**
   * Assemble the bundle from the record source and mark ready.
   * Transitions pending → processing → ready in one call when the
   * request was still pending.
   */
  assemble(id: string): ExportBundle {
    const req = this.requests.get(id);
    if (!req) throw new Error(`unknown request ${id}`);
    if (req.status === 'pending') this.transition(id, 'processing');
    if (req.status !== 'processing') {
      throw new Error(`cannot assemble request in status ${req.status}`);
    }
    if (this.clock.now() > req.slaDeadline) {
      this.transition(id, 'expired', 'SLA breached during assembly');
      throw new Error(`request ${id} expired before assembly completed`);
    }

    const records = this.source({ subjectId: req.subjectId, tenant: req.tenant });
    const bundle: ExportBundle = {
      requestId: id,
      subjectId: req.subjectId,
      assembledAt: this.clock.now(),
      records,
      checksum: sha256Hex(canonicalJson(records.map((r) => r.id))),
    };
    this.bundles.set(id, bundle);
    req.recordIds = records.map((r) => r.id);
    const now = this.clock.now();
    this.transition(id, 'ready');
    req.readyAt = now;
    return bundle;
  }

  /** Mark a ready bundle as handed to the requester. */
  deliver(id: string): ExportRequest {
    return this.transition(id, 'delivered');
  }

  /** Withdraw a request (subject cancels or DPO rejects). */
  cancel(id: string, reason?: string): ExportRequest {
    return this.transition(id, 'cancelled', reason);
  }

  /**
   * SLA sweep: move pending/processing requests past their deadline
   * to `expired`. Call on a timer or before each report. Returns the
   * ids expired this tick.
   */
  tick(now?: number): readonly string[] {
    const t = now ?? this.clock.now();
    const expired: string[] = [];
    for (const req of this.requests.values()) {
      if ((req.status === 'pending' || req.status === 'processing') && t > req.slaDeadline) {
        this.transition(req.id, 'expired', 'SLA deadline passed');
        expired.push(req.id);
      }
    }
    return expired;
  }

  /** SLA dashboard: counts per status plus the at-risk list. */
  slaReport(): SlaReport {
    const now = this.clock.now();
    const counts = { pending: 0, processing: 0, ready: 0, delivered: 0, expired: 0 };
    const atRisk: ExportRequest[] = [];
    for (const req of this.requests.values()) {
      switch (req.status) {
        case 'pending':
          counts.pending++;
          break;
        case 'processing':
          counts.processing++;
          break;
        case 'ready':
          counts.ready++;
          break;
        case 'delivered':
          counts.delivered++;
          break;
        case 'expired':
          counts.expired++;
          break;
        case 'cancelled':
          break;
      }
      if (
        (req.status === 'pending' || req.status === 'processing') &&
        req.slaDeadline - now <= this.warningMs
      ) {
        atRisk.push(req);
      }
    }
    return { ...counts, atRisk: atRisk.sort((a, b) => a.slaDeadline - b.slaDeadline) };
  }

  /** Fetch a request. */
  get(id: string): ExportRequest | undefined {
    return this.requests.get(id);
  }

  /** Fetch the assembled bundle for a ready request. */
  bundle(id: string): ExportBundle | undefined {
    return this.bundles.get(id);
  }

  /** Verify a bundle's checksum — integrity check before delivery. */
  verifyBundle(id: string): boolean {
    const b = this.bundles.get(id);
    if (!b) return false;
    return b.checksum === sha256Hex(canonicalJson(b.records.map((r) => r.id)));
  }

  /** All requests, newest first. */
  list(): readonly ExportRequest[] {
    return [...this.requests.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  private transition(id: string, to: ExportRequestStatus, reason?: string): ExportRequest {
    const req = this.requests.get(id);
    if (!req) throw new Error(`unknown request ${id}`);
    const allowed = VALID_TRANSITIONS[req.status];
    if (!allowed.includes(to)) {
      throw new Error(`invalid transition ${req.status} → ${to}`);
    }
    const from = req.status;
    req.status = to;
    req.history.push({ from, to, at: this.clock.now(), reason });
    return req;
  }
}
