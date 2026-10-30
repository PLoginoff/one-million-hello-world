/**
 * Domain Engine Tests
 *
 * Covers: aggregate root versioning + uncommitted event collection,
 * value-object structural equality, specification combinators +
 * failure reporting, event-sourced rehydration (ordering, gaps,
 * duplicate seq), and the greeting policy domain service.
 */

import { describe, it, expect } from 'bun:test';

import {
  AggregateRootBase,
  VersionConflictError,
  ValueObjectBase,
  structuralEquals,
  spec,
  evaluate,
  allOf,
  anyOf,
  rehydrateFromHistory,
  validateAndSortHistory,
  EventHistoryError,
  GreetingPolicyService,
  EngineDomainEvent,
  StoredEvent,
} from '../engine';

// ---------------------------------------------------------------------------
// Test aggregate: a simple event-sourced counter
// ---------------------------------------------------------------------------

class CounterAggregate extends AggregateRootBase {
  private _count = 0;

  get count(): number {
    return this._count;
  }

  increment(by = 1): void {
    this.raise('Incremented', { by });
  }

  decrement(by = 1): void {
    this.raise('Decremented', { by });
  }

  /** Convention handler for `Incremented`. */
  private whenIncremented(event: EngineDomainEvent): void {
    this._count += (event.data?.by as number) ?? 1;
  }

  private whenDecremented(event: EngineDomainEvent): void {
    this._count -= (event.data?.by as number) ?? 1;
  }
}

// ---------------------------------------------------------------------------
// Value objects
// ---------------------------------------------------------------------------

class Money extends ValueObjectBase {
  constructor(
    readonly amount: number,
    readonly currency: string
  ) {
    super();
  }
  protected getEqualityComponents(): readonly unknown[] {
    return [this.amount, this.currency];
  }
}

class Address extends ValueObjectBase {
  constructor(
    readonly street: string,
    readonly city: string,
    readonly tags: readonly string[] = []
  ) {
    super();
  }
  protected getEqualityComponents(): readonly unknown[] {
    return [this.street, this.city, this.tags];
  }
}

// ---------------------------------------------------------------------------
// Aggregate root
// ---------------------------------------------------------------------------

describe('AggregateRootBase', () => {
  it('raises events with version tracking', () => {
    const agg = new CounterAggregate('agg-1');
    agg.increment(5);
    agg.increment(3);

    expect(agg.version).toBe(2);
    expect(agg.count).toBe(8);
    expect(agg.getUncommittedEvents()).toHaveLength(2);
    expect(agg.getUncommittedEvents()[0].eventType).toBe('Incremented');
    expect(agg.getUncommittedEvents()[0].sequenceNumber).toBe(1);
  });

  it('markEventsAsCommitted drains the buffer', () => {
    const agg = new CounterAggregate('agg-1');
    agg.increment();
    agg.markEventsAsCommitted();
    expect(agg.getUncommittedEvents()).toHaveLength(0);
    // Version is unaffected by commit draining.
    expect(agg.version).toBe(1);
  });

  it('raises with custom event data', () => {
    const agg = new CounterAggregate('agg-1');
    agg.raise('Custom', { reason: 'test' });
    expect(agg.getUncommittedEvents()[0].data).toEqual({ reason: 'test' });
    expect(agg.getUncommittedEvents()[0].aggregateId).toBe('agg-1');
  });

  it('assertVersion throws on mismatch', () => {
    const agg = new CounterAggregate('agg-1');
    agg.increment();
    expect(() => agg.assertVersion(1)).not.toThrow();
    expect(() => agg.assertVersion(5)).toThrow(VersionConflictError);
  });
});

// ---------------------------------------------------------------------------
// Value object
// ---------------------------------------------------------------------------

describe('ValueObjectBase', () => {
  it('structural equality on scalar fields', () => {
    expect(new Money(10, 'USD').equals(new Money(10, 'USD'))).toBe(true);
    expect(new Money(10, 'USD').equals(new Money(20, 'USD'))).toBe(false);
    expect(new Money(10, 'USD').equals(new Money(10, 'EUR'))).toBe(false);
  });

  it('structural equality with array fields (order-sensitive)', () => {
    expect(new Address('1 Main', 'SF', ['a', 'b']).equals(new Address('1 Main', 'SF', ['a', 'b']))).toBe(true);
    expect(new Address('1 Main', 'SF', ['a', 'b']).equals(new Address('1 Main', 'SF', ['b', 'a']))).toBe(false);
    expect(new Address('1 Main', 'SF').equals(new Address('1 Main', 'SF', ['a']))).toBe(false);
  });

  it('type check prevents cross-type equality', () => {
    // Same components, different class — never equal.
    class FakeMoney extends ValueObjectBase {
      constructor(
        readonly amount: number,
        readonly currency: string
      ) {
        super();
      }
      protected getEqualityComponents(): readonly unknown[] {
        return [this.amount, this.currency];
      }
    }
    expect(new Money(10, 'USD').equals(new FakeMoney(10, 'USD'))).toBe(false);
  });

  it('structuralEquals handles plain objects and Dates', () => {
    expect(structuralEquals({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(structuralEquals(new Date(100), new Date(100))).toBe(true);
    expect(structuralEquals(new Date(100), new Date(200))).toBe(false);
    expect(structuralEquals([1, [2]], [1, [2]])).toBe(true);
    expect(structuralEquals({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Specification pattern
// ---------------------------------------------------------------------------

describe('Specification pattern', () => {
  interface User {
    age: number;
    email: string;
    verified: boolean;
  }

  const adult = spec<User>('adult', (u) => u.age >= 18);
  const hasEmail = spec<User>('has-email', (u) => u.email.length > 0);
  const verified = spec<User>('verified', (u) => u.verified);

  const user: User = { age: 16, email: '', verified: false };
  const good: User = { age: 30, email: 'a@b.co', verified: true };

  it('leaf specs evaluate', () => {
    expect(adult.isSatisfiedBy(user)).toBe(false);
    expect(hasEmail.isSatisfiedBy(user)).toBe(false);
    expect(verified.isSatisfiedBy(user)).toBe(false);
    expect(adult.isSatisfiedBy(good)).toBe(true);
  });

  it('and() composes', () => {
    const combined = adult.and(hasEmail);
    expect(combined.isSatisfiedBy(user)).toBe(false);
    expect(combined.isSatisfiedBy(good)).toBe(true);
  });

  it('or() composes', () => {
    const relaxed = adult.or(verified);
    expect(relaxed.isSatisfiedBy({ age: 16, email: 'x', verified: true })).toBe(true);
    expect(relaxed.isSatisfiedBy({ age: 10, email: 'x', verified: false })).toBe(false);
  });

  it('not() negates', () => {
    const notAdult = adult.not();
    expect(notAdult.isSatisfiedBy(user)).toBe(true);
    expect(notAdult.isSatisfiedBy(good)).toBe(false);
  });

  it('evaluate() reports failing leaf names', () => {
    const combined = adult.and(hasEmail).and(verified);
    const report = evaluate(combined, user);
    expect(report.satisfied).toBe(false);
    expect(report.failures).toEqual(['adult', 'has-email', 'verified']);
  });

  it('evaluate() on or() reports all failing branches when whole OR fails', () => {
    const combined = adult.or(verified);
    const report = evaluate(combined, { age: 10, email: 'x', verified: false });
    expect(report.satisfied).toBe(false);
    expect(report.failures).toEqual(['adult', 'verified']);
  });

  it('allOf / anyOf helpers', () => {
    const strict = allOf(adult, hasEmail, verified);
    const lenient = anyOf(adult, verified);
    expect(strict.isSatisfiedBy(good)).toBe(true);
    expect(lenient.isSatisfiedBy({ age: 10, email: '', verified: false })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Event-sourced rehydration
// ---------------------------------------------------------------------------

function ev(seq: number, type: string, data?: Record<string, unknown>): StoredEvent {
  return {
    eventId: `evt-${seq}`,
    aggregateId: 'agg-1',
    eventType: type,
    sequenceNumber: seq,
    occurredAt: new Date(1_000_000 + seq),
    data,
  };
}

describe('event-sourced rehydration', () => {
  it('rebuilds aggregate state from ordered history', () => {
    const agg = new CounterAggregate('agg-1');
    const history = [ev(1, 'Incremented', { by: 5 }), ev(2, 'Incremented', { by: 3 }), ev(3, 'Decremented', { by: 2 })];

    const result = rehydrateFromHistory(agg, history);
    expect(result.aggregate.count).toBe(6);
    expect(result.version).toBe(3);
    expect(result.eventsApplied).toBe(3);
    // Rehydration doesn't produce new uncommitted events.
    expect(agg.getUncommittedEvents()).toHaveLength(0);
  });

  it('sorts out-of-order history before applying', () => {
    const agg = new CounterAggregate('agg-1');
    const history = [ev(3, 'Decremented', { by: 1 }), ev(1, 'Incremented', { by: 10 }), ev(2, 'Incremented', { by: 5 })];
    rehydrateFromHistory(agg, history);
    expect(agg.count).toBe(14);
  });

  it('rejects duplicate sequence numbers', () => {
    expect(() => validateAndSortHistory([ev(1, 'A'), ev(1, 'B')])).toThrow(EventHistoryError);
  });

  it('rejects gaps in history', () => {
    expect(() => validateAndSortHistory([ev(1, 'A'), ev(3, 'B')])).toThrow(EventHistoryError);
  });

  it('supports an explicit handler table', () => {
    class ManualAgg extends AggregateRootBase {
      total = 0;
    }
    const agg = new ManualAgg('agg-1');
    rehydrateFromHistory(agg, [ev(1, 'Add', { v: 7 }), ev(2, 'Add', { v: 3 })], {
      Add: (a, e) => {
        a.total += (e.data?.v as number) ?? 0;
      },
    });
    expect(agg.total).toBe(10);
    expect(agg.version).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Greeting policy
// ---------------------------------------------------------------------------

describe('GreetingPolicyService', () => {
  const service = new GreetingPolicyService();

  it('allows supported languages with formatted output', () => {
    const result = service.evaluate({ language: 'es', name: 'Ana' });
    expect(result.allowed).toBe(true);
    expect(result.formattedMessage).toBe('¡Hola, Ana!');
  });

  it('defaults name to "world"', () => {
    const result = service.evaluate({ language: 'en' });
    expect(result.formattedMessage).toBe('Hello, world!');
  });

  it('rejects unsupported languages', () => {
    const result = service.evaluate({ language: 'xx' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('language-supported');
  });

  it('rejects empty or oversized names', () => {
    expect(service.evaluate({ language: 'en', name: '' }).allowed).toBe(false);
    expect(service.evaluate({ language: 'en', name: 'x'.repeat(101) }).allowed).toBe(false);
  });

  it('keeps an audit trail', () => {
    const svc = new GreetingPolicyService();
    svc.evaluate({ language: 'en' });
    svc.evaluate({ language: 'xx' });
    const trail = svc.auditTrail();
    expect(trail).toHaveLength(2);
    expect(trail[0].allowed).toBe(true);
    expect(trail[1].allowed).toBe(false);
    expect(trail[1].reason).toBeDefined();
  });
});
