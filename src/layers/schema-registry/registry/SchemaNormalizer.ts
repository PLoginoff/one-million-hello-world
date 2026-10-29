/**
 * SchemaNormalizer — flatten schema documents for comparison and
 * codegen-style consumers.
 *
 * Two passes:
 *
 *  1. `resolveReferences`: inlines named-type string references using a
 *    provided type table (subject:version -> schema). Detects cycles
 *    via a resolution stack and reports them rather than recursing
 *    forever.
 *
 *  2. `flatten`: produces a normalized record tree where every nested
 *    record/enum is hoisted into a `definitions` map and referenced by
 *    a stable synthetic name — the shape you'd hand to a code
 *    generator or a schema diff viewer.
 *
 * Both are pure functions over schema JSON.
 *
 * @module SchemaRegistry/Registry
 */

import { isObject } from './SchemaModel';
import { RegistryError, SchemaRegistryErrorCode, SchemaReference } from './types';

/** Lookup table for named types: name -> schema document. */
export type TypeTable = Map<string, unknown> | ((name: string) => unknown | undefined);

function lookup(table: TypeTable, name: string): unknown | undefined {
  return table instanceof Map ? table.get(name) : table(name);
}

export class SchemaNormalizer {
  /**
   * Inline every named-type reference resolvable via `table`.
   * Primitive names pass through; unknown names throw REFERENCE_NOT_FOUND
   * unless `allowUnresolved` is set (they're left as strings).
   */
  static resolveReferences(schema: unknown, table: TypeTable, allowUnresolved = false): unknown {
    const resolving = new Set<string>();
    // Only field `type` positions hold type descriptors — other object
    // keys carry metadata (name, default, doc) that must pass through.
    const resolveType = (t: unknown): unknown => {
      if (typeof t === 'string') {
        if (PRIMITIVE.has(t)) return t;
        if (resolving.has(t)) {
          throw new RegistryError(
            SchemaRegistryErrorCode.CIRCULAR_REFERENCE,
            `circular named-type reference: ${t}`
          );
        }
        const def = lookup(table, t);
        if (def === undefined) {
          if (allowUnresolved) return t;
          throw new RegistryError(
            SchemaRegistryErrorCode.REFERENCE_NOT_FOUND,
            `unresolved named type '${t}'`
          );
        }
        resolving.add(t);
        try {
          return resolveType(def);
        } finally {
          resolving.delete(t);
        }
      }
      if (Array.isArray(t)) return t.map(resolveType);
      if (isObject(t)) return walk(t);
      return t;
    };
    const walk = (node: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === 'type' && (typeof v === 'string' && !KEYWORDS.has(v) || typeof v !== 'string')) {
          out[k] = resolveType(v);
        } else if (k === 'fields' && Array.isArray(v)) {
          out[k] = v.map((f) => (isObject(f) ? { ...f, type: resolveType(f['type']) } : f));
        } else if (k === 'items' || k === 'values') {
          out[k] = resolveType(v);
        } else {
          out[k] = v;
        }
      }
      return out;
    };
    if (typeof schema === 'string' || Array.isArray(schema)) return resolveType(schema);
    if (isObject(schema)) return walk(schema);
    return schema;
  }

  /**
   * Flatten a schema: hoist every named nested record/enum into a
   * definitions map; the root remains a record whose field types
   * reference definition names.
   */
  static flatten(schema: unknown): { root: unknown; definitions: Record<string, unknown> } {
    const defs: Record<string, unknown> = {};
    const go = (node: unknown, insideField: boolean): unknown => {
      if (Array.isArray(node)) return node.map((n) => go(n, insideField));
      if (isObject(node)) {
        const t = node['type'];
        if ((t === 'record' || t === 'enum') && insideField && typeof node['name'] === 'string') {
          const name = node['name'] as string;
          if (!(name in defs)) {
            // Register name BEFORE recursing to break self-reference
            defs[name] = { type: t, name };
            defs[name] = go(node, false);
          }
          return name;
        }
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node)) {
          out[k] = k === 'fields' && Array.isArray(v)
            ? v.map((f) => (isObject(f) ? { ...f, type: go(f['type'], true) } : f))
            : go(v, insideField);
        }
        return out;
      }
      return node;
    };
    const root = go(schema, false);
    return { root, definitions: defs };
  }

  /**
   * Extract SchemaReference declarations implied by named-type usage:
   * the names a schema references that are neither primitives nor
   * locally defined — useful when importing schemas authored elsewhere.
   */
  static impliedReferences(schema: unknown): string[] {
    const defined = new Set<string>();
    const used = new Set<string>();
    const useType = (t: unknown): void => {
      if (typeof t === 'string') {
        if (!PRIMITIVE.has(t) && !KEYWORDS.has(t)) used.add(t);
        return;
      }
      if (Array.isArray(t)) {
        t.forEach(useType);
        return;
      }
      if (isObject(t)) walk(t);
    };
    const walk = (node: Record<string, unknown>): void => {
      const t = node['type'];
      if ((t === 'record' || t === 'enum') && typeof node['name'] === 'string') {
        defined.add(node['name'] as string);
      }
      for (const [k, v] of Object.entries(node)) {
        if ((k === 'type' && (typeof v !== 'string' || !KEYWORDS.has(v))) || k === 'items' || k === 'values') {
          useType(v);
        } else if (k === 'fields' && Array.isArray(v)) {
          for (const f of v) if (isObject(f)) useType(f['type']);
        }
      }
    };
    if (isObject(schema)) walk(schema);
    else useType(schema);
    return [...used].filter((n) => !defined.has(n)).sort();
  }
}

const PRIMITIVE: ReadonlySet<string> = new Set([
  'null', 'boolean', 'int', 'long', 'float', 'double', 'string', 'bytes',
]);

/** Complex-type keywords that appear in `type` position but aren't refs. */
const KEYWORDS: ReadonlySet<string> = new Set(['record', 'enum', 'array', 'map', 'fixed']);

/** Reference helper: build a TypeTable from subject:version lookups. */
export function typeTableFromRefs(
  refs: SchemaReference[],
  resolve: (subject: string, version: number) => unknown
): TypeTable {
  const m = new Map<string, unknown>();
  for (const r of refs) m.set(r.name, resolve(r.subject, r.version));
  return m;
}
