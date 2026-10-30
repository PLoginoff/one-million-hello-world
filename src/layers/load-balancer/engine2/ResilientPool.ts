/**
 * ResilientPool — composes outlier detection, slow-start, queueing,
 * stickiness, and metrics into one routable pool.
 *
 * Selection algorithm: *weighted rendezvous* — each eligible candidate
 * scores `rendezvousHash(requestKey, id) / effectiveWeight`? No — we use
 * weighted random (Efraimidis–Spirakis, O(n)): each candidate draws
 * `u^(1/w)` with `u ~ Uniform(0,1)` and the max wins. This is a fair
 * weighted lottery in a single pass with no expanded wheel, which also
 * makes slow-start weight changes take effect immediately.
 *
 * Request lifecycle:
 *   route()        → pick backend (sticky-aware, ejected excluded, or
 *                    queued if `queueWhenAllBusy`)
 *   report()       → success/failure feeds OutlierDetector + metrics;
 *                    threshold trips move backend to `ejected` and clear
 *                    its queue
 *   tick()         → expired ejections transition to `ramping` (slow
 *                    start begins); elapsed ramps transition to `active`
 *
 * @module LoadBalancerLayer/Engine2
 */

import { Backend2, BackendSnapshot, BackendState, LbClock2, RouteDecision, SystemLbClock2 } from './types';
import { OutlierDetector, OutlierDetectorOptions } from './OutlierDetector';
import { SlowStart, SlowStartOptions } from './SlowStart';
import { RequestQueue, RequestQueueOptions } from './RequestQueue';
import { SessionPersistence, SessionPersistenceOptions } from './SessionPersistence';
import { BackendMetrics, BackendMetricsOptions } from './BackendMetrics';

export interface ResilientPoolOptions {
  outlier?: OutlierDetectorOptions;
  slowStart?: SlowStartOptions;
  queue?: RequestQueueOptions;
  session?: SessionPersistenceOptions;
  metrics?: BackendMetricsOptions;
  /** RNG for the weighted lottery (injectable for tests). */
  rng?: () => number;
  clock?: LbClock2;
}

interface Member {
  backend: Backend2;
  state: BackendState;
}

export class ResilientPool<T = unknown> {
  private readonly _members = new Map<string, Member>();
  private readonly _rng: () => number;
  private readonly _clock: LbClock2;

  readonly outlier: OutlierDetector;
  readonly slowStart: SlowStart;
  readonly queue: RequestQueue<T>;
  readonly sessions: SessionPersistence | null;
  readonly metrics: BackendMetrics;

  constructor(backends: Backend2[] = [], opts: ResilientPoolOptions = {}) {
    this._clock = opts.clock ?? new SystemLbClock2();
    this._rng = opts.rng ?? Math.random;
    const clock = this._clock;
    this.outlier = new OutlierDetector({ ...opts.outlier, clock });
    this.slowStart = new SlowStart({ ...opts.slowStart, clock });
    this.queue = new RequestQueue<T>({ ...opts.queue, clock });
    this.sessions = opts.session ? new SessionPersistence({ ...opts.session, clock }) : null;
    this.metrics = new BackendMetrics({ ...opts.metrics, clock });
    for (const b of backends) this.add(b);
  }

  /** Add a backend; it enters via slow-start unless windowMs is 0. */
  add(backend: Backend2, opts: { ramp?: boolean } = {}): void {
    this._members.set(backend.id, { backend, state: 'active' });
    this.outlier.track(backend);
    this.metrics.track(backend.id);
    if (opts.ramp ?? false) {
      this.slowStart.startRamp(backend.id);
      this._member(backend.id).state = 'ramping';
    }
  }

  remove(backendId: string): boolean {
    const had = this._members.delete(backendId);
    if (had) {
      this.outlier.untrack(backendId);
      this.metrics.untrack(backendId);
      this.queue.clear(backendId);
      this.sessions?.unbindBackend(backendId);
    }
    return had;
  }

  /** Mark draining: no new routes, but queued/inflight may finish. */
  drain(backendId: string): void {
    const m = this._members.get(backendId);
    if (m) m.state = 'draining';
    this.sessions?.unbindBackend(backendId);
  }

  /**
   * Pick a backend for one request.
   *
   * @param key   stable request key for the weighted lottery (sticky
   *              resolve uses cookie/sessionKey/identity instead)
   * @param hints stickiness hints forwarded to SessionPersistence
   */
  route(
    key: string,
    hints: { cookie?: string; sessionKey?: string; identity?: string; queueWhenAllBusy?: boolean } = {}
  ): RouteDecision | null {
    const candidates = this._eligible();
    if (candidates.length === 0) return null;

    // 1. Sticky override: an existing affinity pins the choice.
    if (this.sessions && (hints.cookie || hints.sessionKey || hints.identity)) {
      const sticky = this.sessions.resolve(hints, candidates.map((m) => m.backend));
      if (sticky) {
        const m = this._members.get(sticky.backendId);
        if (m && m.state !== 'draining') {
          return {
            backend: m.backend,
            effectiveWeight: this.slowStart.effectiveWeight(m.backend),
            sticky: true,
            queued: false,
          };
        }
      }
    }

    // 2. Weighted lottery over eligible members.
    const m = this._pickWeighted(candidates);
    if (!m) return null;

    // 3. Optionally queue instead of dispatching when saturated.
    const inflight = this.metrics.snapshot(m.backend.id)?.inflight ?? 0;
    if (hints.queueWhenAllBusy && inflight >= m.backend.baseWeight * 8) {
      const enq = this.queue.enqueue(m.backend.id, key, undefined as T);
      if (enq.ok) {
        return {
          backend: m.backend,
          effectiveWeight: this.slowStart.effectiveWeight(m.backend),
          sticky: false,
          queued: true,
        };
      }
      return null; // queue full — caller should fail over
    }

    // Remember identity bindings for future stickiness.
    if (this.sessions && hints.sessionKey) {
      this.sessions.bind(hints.sessionKey, m.backend.id);
    }

    return {
      backend: m.backend,
      effectiveWeight: this.slowStart.effectiveWeight(m.backend),
      sticky: false,
      queued: false,
    };
  }

  /** Mint a stickiness cookie for a chosen backend (if sessions on). */
  affinityCookie(backendId: string): string | null {
    return this.sessions ? this.sessions.issueCookie(backendId) : null;
  }

  /**
   * Report the outcome of a routed request. Drives outlier detection and
   * metrics; a threshold trip ejects the backend and drops its queue.
   */
  report(backendId: string, ok: boolean, latencyMs: number): void {
    this.metrics.recordEnd(backendId, ok, latencyMs);
    if (ok) {
      this.outlier.reportSuccess(backendId);
    } else {
      const reason = this.outlier.reportFailure(backendId);
      if (reason === 'threshold') {
        const m = this._members.get(backendId);
        if (m) m.state = 'ejected';
        this.queue.clear(backendId);
        this.sessions?.unbindBackend(backendId);
      }
    }
  }

  /** Call recordStart on the metrics for a dispatched request. */
  recordStart(backendId: string): void {
    this.metrics.recordStart(backendId);
  }

  /**
   * Advance pool state: expire ejections → ramping, finish ramps →
   * active, prune expired queue items and session bindings.
   */
  tick(): { recovered: string[]; rampFinished: string[] } {
    const recovered: string[] = [];
    const rampFinished: string[] = [];
    for (const [id, m] of this._members) {
      if (m.state === 'ejected' && this.outlier.takeRecoveryEligible(id)) {
        m.state = 'ramping';
        this.slowStart.startRamp(id);
        recovered.push(id);
      } else if (m.state === 'ramping' && !this.slowStart.isRamping(id)) {
        m.state = 'active';
        rampFinished.push(id);
      }
    }
    this.queue.sweepExpired();
    this.sessions?.sweep();
    return { recovered, rampFinished };
  }

  /** Live snapshot of every member. */
  snapshot(): BackendSnapshot[] {
    const out: BackendSnapshot[] = [];
    for (const [id, m] of this._members) {
      // Lazily reflect ejection state even before tick() runs.
      let state = m.state;
      if (state !== 'draining' && this.outlier.isEjected(id)) state = 'ejected';
      out.push({
        id,
        state,
        effectiveWeight: this.slowStart.effectiveWeight(m.backend),
        consecutiveFailures: this.outlier.consecutiveFailures(id),
        inflight: this.metrics.snapshot(id)?.inflight ?? 0,
        queueDepth: this.queue.depth(id),
        ejectedUntilMs: this.outlier.ejectedUntil(id),
      });
    }
    return out;
  }

  get size(): number {
    return this._members.size;
  }

  /* ---------------------------------------------------------------- */

  /** Members allowed to receive *new* traffic right now. */
  private _eligible(): Member[] {
    const out: Member[] = [];
    for (const [id, m] of this._members) {
      if (m.state === 'draining') continue;
      if (m.state === 'ejected') {
        // Ejection may have lapsed without tick(); let slow-start decide.
        if (this.outlier.isEjected(id)) continue;
        m.state = 'ramping';
        this.slowStart.startRamp(id);
      }
      out.push(m);
    }
    return out;
  }

  private _member(id: string): Member {
    const m = this._members.get(id);
    if (!m) throw new Error(`unknown backend: ${id}`);
    return m;
  }

  /**
   * Efraimidis–Spirakis weighted sampling without replacement (k=1):
   * each candidate draws u ∈ (0,1), computes key = u^(1/w); argmax wins.
   * Equivalent to drawing from the weighted distribution in O(n) with
   * O(1) extra space — no wheel rebuild when weights change (slow-start
   * friendly).
   */
  private _pickWeighted(candidates: Member[]): Member | null {
    let best: Member | null = null;
    let bestKey = -Infinity;
    for (const m of candidates) {
      const w = this.slowStart.effectiveWeight(m.backend);
      let u = this._rng();
      if (u <= 0) u = Number.EPSILON; // log(0) guard
      const key = Math.log(u) / w; // ln(u^(1/w)) = ln(u)/w — compare in log space
      if (key > bestKey) {
        bestKey = key;
        best = m;
      }
    }
    return best;
  }
}
