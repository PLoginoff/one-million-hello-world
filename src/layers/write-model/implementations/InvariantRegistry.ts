/**
 * InvariantRegistry — declarative invariant enforcement for aggregates.
 *
 * An invariant is a predicate over aggregate state that must hold AFTER
 * every event application. Invariants run in two phases:
 *
 *   1. Pre-emit:  checked before `raise()` — catches invalid command
 *      arguments before they become events.
 *   2. Post-emit: checked after `applyEvent()` — catches state
 *      transitions that violate business rules.
 *
 * The registry stores named invariants per (aggregateType, eventType?)
 * pair. Global invariants (no eventType) run on every event; typed
 * invariants only run for the events they care about.
 *
 * Example:
 *   registry.register('account', inv => inv
 *     .check('balance-non-negative', s => s.balance >= 0,
 *            'balance must not go negative')
 *     .on('account.withdrawn')
 *       .check('withdraw-limit', (s, e) => e.data.amount <= 10000,
 *              'withdraw exceeds per-transaction limit')
 *   );
 *
 * @module WriteModelLayer/Implementations
 */

import type { DomainEvent } from './AggregateRoot';

// ------------------------------------------------------------------ types

/** Severity of an invariant violation. */
export type InvariantSeverity = 'error' | 'warning';

/** One named invariant. */
export interface Invariant<TState = unknown> {
  readonly name: string;
  /** Optional event-type scope — undefined = applies to all events. */
  readonly eventType?: string;
  /** Phase: 'pre' runs before event emission, 'post' after application. */
  readonly phase: 'pre' | 'post';
  readonly severity: InvariantSeverity;
  /** Human-readable failure message. */
  readonly message: string;
  /** Predicate: returns true iff the invariant holds. */
  readonly holds: (state: TState, event?: DomainEvent) => boolean;
}

/** One violation record produced by `checkAll`. */
export interface InvariantViolation {
  readonly invariantName: string;
  readonly message: string;
  readonly severity: InvariantSeverity;
  readonly eventType?: string;
}

export class InvariantViolationException extends Error {
  readonly violations: readonly InvariantViolation[];
  constructor(violations: readonly InvariantViolation[]) {
    super(
      `Invariant violations: ` +
        violations.map((v) => `[${v.severity}] ${v.invariantName}: ${v.message}`).join('; '),
    );
    this.name = 'InvariantViolationException';
    this.violations = violations;
  }
}

// ---------------------------------------------------------------- builder

/** Fluent builder for registering a batch of invariants. */
export class InvariantBuilder<TState = unknown> {
  private readonly _registry: InvariantRegistry;
  private readonly _aggregateType: string;
  private _scopeEventType?: string;
  private _scopePhase: 'pre' | 'post' = 'post';
  private _scopeSeverity: InvariantSeverity = 'error';

  constructor(registry: InvariantRegistry, aggregateType: string) {
    this._registry = registry;
    this._aggregateType = aggregateType;
  }

  /** Subsequent checks apply only to this event type. */
  on(eventType: string): this {
    this._scopeEventType = eventType;
    return this;
  }

  /** Subsequent checks apply to all event types. */
  globally(): this {
    this._scopeEventType = undefined;
    return this;
  }

  /** Subsequent checks run before event emission. */
  preEmit(): this {
    this._scopePhase = 'pre';
    return this;
  }

  /** Subsequent checks run after event application. */
  postEmit(): this {
    this._scopePhase = 'post';
    return this;
  }

  /** Subsequent checks produce warnings (non-blocking). */
  asWarning(): this {
    this._scopeSeverity = 'warning';
    return this;
  }

  /** Subsequent checks produce errors (blocking). */
  asError(): this {
    this._scopeSeverity = 'error';
    return this;
  }

  /** Register an invariant. */
  check(
    name: string,
    holds: (state: TState, event?: DomainEvent) => boolean,
    message: string,
  ): this {
    this._registry._add<TState>(this._aggregateType, {
      name,
      eventType: this._scopeEventType,
      phase: this._scopePhase,
      severity: this._scopeSeverity,
      message,
      holds,
    });
    return this;
  }
}

// ---------------------------------------------------------------- registry

export class InvariantRegistry {
  private readonly _byAggregate = new Map<string, Invariant[]>();

  /** Begin a fluent registration block for an aggregate type. */
  register<TState>(aggregateType: string, configure: (b: InvariantBuilder<TState>) => void): this {
    const builder = new InvariantBuilder<TState>(this, aggregateType);
    configure(builder);
    return this;
  }

  /** Direct (non-fluent) registration. */
  _add<TState>(aggregateType: string, invariant: Invariant<TState>): void {
    let list = this._byAggregate.get(aggregateType);
    if (!list) {
      list = [];
      this._byAggregate.set(aggregateType, list);
    }
    list.push(invariant as Invariant);
  }

  /** Registered invariants for an aggregate type. */
  forAggregate(aggregateType: string): readonly Invariant[] {
    return this._byAggregate.get(aggregateType) ?? [];
  }

  /**
   * Check all applicable invariants against a state + optional event.
   * `phase` filters to 'pre' or 'post' checks.
   */
  checkAll<TState>(
    aggregateType: string,
    state: TState,
    phase: 'pre' | 'post',
    event?: DomainEvent,
  ): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    for (const inv of this.forAggregate(aggregateType)) {
      if (inv.phase !== phase) continue;
      if (inv.eventType !== undefined && inv.eventType !== event?.type) continue;
      let holds = false;
      try {
        holds = (inv.holds as (s: unknown, e?: DomainEvent) => boolean)(state, event);
      } catch {
        holds = false; // a throwing predicate = violated invariant
      }
      if (!holds) {
        violations.push({
          invariantName: inv.name,
          message: inv.message,
          severity: inv.severity,
          eventType: event?.type,
        });
      }
    }
    return violations;
  }

  /**
   * Throw on error-severity violations; return warning violations.
   * Typical call: after `applyEvent`, run `enforcePost` on the new state.
   */
  enforce<TState>(
    aggregateType: string,
    state: TState,
    phase: 'pre' | 'post',
    event?: DomainEvent,
  ): InvariantViolation[] {
    const violations = this.checkAll(aggregateType, state, phase, event);
    const errors = violations.filter((v) => v.severity === 'error');
    if (errors.length > 0) {
      throw new InvariantViolationException(errors);
    }
    return violations.filter((v) => v.severity === 'warning');
  }
}
