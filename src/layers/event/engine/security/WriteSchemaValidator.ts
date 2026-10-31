/**
 * WriteSchemaValidator — event schema enforcement at append time.
 *
 * Schema-on-read (the event-layer default) means malformed events are
 * discovered by every consumer, forever. Schema-on-WRITE flips that: an
 * event that doesn't match its declared schema is rejected at append,
 * keeping the log clean. This is the convention schema-registry-backed
 * systems (Confluent, EventStoreDB projections) enforce.
 *
 * Design: a registry of `EventSchema` per event `type`. `validate` checks:
 *
 *   - required fields present (dot-paths, `a.b.c`)
 *   - declared fields have the right runtime type
 *   - `schemaVersion` on the event doesn't exceed the schema's `maxVersion`
 *     (forward-compat gate: a too-new writer fails fast instead of writing
 *     events old consumers can't read)
 *
 * Unregistered types pass through — validation is opt-in per type, matching
 * how registries allow schemaless topics alongside governed ones.
 *
 * @module EventLayer/Engine/Security
 */

import { EngineEvent, EventSchema, EventSchemaError, SchemaValidation } from './types';

/** Dot-path field resolver (`a.b.c`) — same semantics as the repository engine. */
function getPath(row: unknown, path: string): unknown {
  if (row === null || typeof row !== 'object') return undefined;
  let cur: unknown = row;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export class WriteSchemaValidator {
  private readonly schemas = new Map<string, EventSchema>();

  /** Registers (or replaces) a schema for an event type. */
  register(schema: EventSchema): void {
    this.schemas.set(schema.eventType, schema);
  }

  unregister(eventType: string): boolean {
    return this.schemas.delete(eventType);
  }

  has(eventType: string): boolean {
    return this.schemas.has(eventType);
  }

  /**
   * Validates `event` against its registered schema. Types without a schema
   * are always valid. Returns errors instead of throwing so callers can
   * batch-report all violations, not just the first.
   */
  validate(event: EngineEvent): SchemaValidation {
    const schema = this.schemas.get(event.type);
    if (!schema) return { ok: true, errors: [] };

    const errors: string[] = [];
    const data = event.data;

    // Version gate.
    if (
      schema.maxVersion !== undefined &&
      (event.schemaVersion ?? 1) > schema.maxVersion
    ) {
      errors.push(
        `schemaVersion ${event.schemaVersion} exceeds max ${schema.maxVersion} for "${event.type}"`
      );
    }

    // Required fields.
    for (const field of schema.required ?? []) {
      const v = getPath(data, field);
      if (v === undefined || v === null) {
        errors.push(`missing required field "${field}"`);
      }
    }

    // Field types.
    for (const [field, expected] of Object.entries(schema.fields)) {
      const v = getPath(data, field);
      if (v === undefined) continue; // absent + not required → fine
      if (!matchesType(v, expected)) {
        errors.push(
          `field "${field}" expected ${expected}, got ${typeName(v)}`
        );
      }
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * Validates and throws `EventSchemaError` on failure — the write-path API
   * (fail-fast at append, before the event is committed).
   */
  assertValid(event: EngineEvent): void {
    const result = this.validate(event);
    if (!result.ok) {
      throw new EventSchemaError(event.type, result.errors);
    }
  }

  /** Validates a batch; returns only the invalid events' reports. */
  validateBatch(events: readonly EngineEvent[]): { index: number; errors: readonly string[] }[] {
    const bad: { index: number; errors: readonly string[] }[] = [];
    events.forEach((e, i) => {
      const r = this.validate(e);
      if (!r.ok) bad.push({ index: i, errors: r.errors });
    });
    return bad;
  }
}

function matchesType(v: unknown, expected: string): boolean {
  switch (expected) {
    case 'any':
      return true;
    case 'array':
      return Array.isArray(v);
    case 'date':
      return v instanceof Date || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
    case 'object':
      return typeof v === 'object' && v !== null && !Array.isArray(v);
    default:
      return typeof v === expected;
  }
}

function typeName(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (v instanceof Date) return 'date';
  return typeof v;
}
