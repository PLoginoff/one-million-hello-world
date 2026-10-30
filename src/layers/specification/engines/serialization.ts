/**
 * Spec serialization — SpecNode ↔ JSON, and spec rehydration through
 * a `SpecRegistry`.
 *
 * Like the query-object serializer, the only non-JSON values inside a
 * SpecNode are `Date` and `RegExp` operands; both are tagged
 * (`{ $date: iso }`, `{ $regex: { source, flags } }`) for lossless
 * round-tripping.
 *
 * `specFromNode` reconstructs live specs:
 *   - leaf nodes → the matching CommonSpecs class,
 *   - logic/not → composite specs over reconstructed children,
 *   - custom nodes → looked up in the caller-provided registry; an
 *     unregistered name throws rather than silently building a spec
 *     that evaluates wrong.
 *
 * @module Specification/Engines
 */

import { Specification, AndSpec, OrSpec, NotSpec } from './Specification';
import {
  Between,
  Contains,
  EndsWith,
  Equal,
  GreaterThan,
  GreaterThanOrEqual,
  In,
  IsNotNull,
  IsNull,
  LessThan,
  LessThanOrEqual,
  Matches,
  NotEqual,
  NotIn,
  StartsWith,
} from './CommonSpecs';
import {
  ISpecification,
  SpecFactory,
  SpecLeaf,
  SpecNode,
  SpecOp,
} from './types';

type Row = Record<string, unknown>;

const DATE_TAG = '$date';
const REGEX_TAG = '$regex';

function encodeValue(v: unknown): unknown {
  if (v instanceof Date) return { [DATE_TAG]: v.toISOString() };
  if (v instanceof RegExp) return { [REGEX_TAG]: { source: v.source, flags: v.flags } };
  if (Array.isArray(v)) return v.map(encodeValue);
  return v;
}

function decodeValue(v: unknown): unknown {
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o[DATE_TAG] === 'string') return new Date(o[DATE_TAG]);
    const rx = o[REGEX_TAG];
    if (typeof rx === 'object' && rx !== null) {
      const r = rx as Record<string, unknown>;
      if (typeof r.source === 'string' && typeof r.flags === 'string') {
        return new RegExp(r.source, r.flags);
      }
    }
  }
  if (Array.isArray(v)) return v.map(decodeValue);
  return v;
}

/** Serialize a spec's node tree to a JSON-safe structure. */
export function serializeNode(node: SpecNode): SpecNode {
  switch (node.kind) {
    case 'leaf':
      return { ...node, value: encodeValue(node.value), value2: encodeValue(node.value2) };
    case 'logic':
      return { ...node, children: node.children.map(serializeNode) };
    case 'not':
      return { ...node, child: serializeNode(node.child) };
    case 'custom':
      return { ...node, params: encodeParams(node.params) };
  }
}

function encodeParams(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) out[k] = encodeValue(v);
  return out;
}

/** Decode the tagged literals produced by {@link serializeNode}. */
export function deserializeNode(node: SpecNode): SpecNode {
  switch (node.kind) {
    case 'leaf':
      return { ...node, value: decodeValue(node.value), value2: decodeValue(node.value2) };
    case 'logic':
      return { ...node, children: node.children.map(deserializeNode) };
    case 'not':
      return { ...node, child: deserializeNode(node.child) };
    case 'custom': {
      const params: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node.params)) params[k] = decodeValue(v);
      return { ...node, params };
    }
  }
}

/** Serialize a spec (via its node) to a JSON string. */
export function specToJson<T>(spec: ISpecification<T>): string {
  return JSON.stringify(serializeNode(spec.toNode()));
}

/** Registry: custom-spec-name → factory. */
export class SpecRegistry<T = Row> {
  private readonly _factories = new Map<string, SpecFactory<T>>();

  register(name: string, factory: SpecFactory<T>): this {
    this._factories.set(name, factory);
    return this;
  }

  resolve(name: string): SpecFactory<T> | undefined {
    return this._factories.get(name);
  }
}

/**
 * Rebuild a live spec from a (decoded) node tree. Custom nodes require
 * a matching registry entry.
 */
export function specFromNode<T = Row>(node: SpecNode, registry?: SpecRegistry<T>): ISpecification<T> {
  switch (node.kind) {
    case 'leaf':
      return leafToSpec<T>(node);
    case 'logic': {
      const children = node.children.map((c) => specFromNode(c, registry));
      const first = children[0];
      if (first === undefined) {
        throw new RangeError(`cannot rehydrate empty ${node.op} node`);
      }
      let acc = first;
      for (const c of children.slice(1)) {
        acc = node.op === 'and' ? new AndSpec<T>(acc, c) : new OrSpec<T>(acc, c);
      }
      return acc;
    }
    case 'not':
      return new NotSpec<T>(specFromNode(node.child, registry));
    case 'custom': {
      const factory = registry?.resolve(node.spec);
      if (!factory) {
        throw new Error(
          `no factory registered for custom spec '${node.spec}' — ` +
            'register one via SpecRegistry before deserializing'
        );
      }
      return factory(node.params);
    }
  }
}

/** Parse JSON back into a live spec. */
export function specFromJson<T = Row>(json: string, registry?: SpecRegistry<T>): ISpecification<T> {
  const raw = JSON.parse(json) as unknown;
  if (typeof raw !== 'object' || raw === null || typeof (raw as { kind?: unknown }).kind !== 'string') {
    throw new TypeError('SpecNode JSON must be an object with a "kind" field');
  }
  return specFromNode(deserializeNode(raw as SpecNode), registry);
}

/** Map a leaf node to its CommonSpecs class. */
function leafToSpec<T>(node: SpecLeaf): ISpecification<T> {
  switch (node.op) {
    case SpecOp.Eq: return new Equal<T>(node.field, node.value);
    case SpecOp.Ne: return new NotEqual<T>(node.field, node.value);
    case SpecOp.Gt: return new GreaterThan<T>(node.field, node.value as number | Date | string);
    case SpecOp.Gte: return new GreaterThanOrEqual<T>(node.field, node.value as number | Date | string);
    case SpecOp.Lt: return new LessThan<T>(node.field, node.value as number | Date | string);
    case SpecOp.Lte: return new LessThanOrEqual<T>(node.field, node.value as number | Date | string);
    case SpecOp.In: return new In<T>(node.field, (node.value as unknown[]) ?? []);
    case SpecOp.NotIn: return new NotIn<T>(node.field, (node.value as unknown[]) ?? []);
    case SpecOp.Contains: return new Contains<T>(node.field, node.value);
    case SpecOp.StartsWith: return new StartsWith<T>(node.field, String(node.value));
    case SpecOp.EndsWith: return new EndsWith<T>(node.field, String(node.value));
    case SpecOp.Matches: {
      const v = node.value;
      if (v instanceof RegExp) return new Matches<T>(node.field, v);
      const lit = v as { source?: unknown; flags?: unknown };
      return new Matches<T>(node.field, String(lit.source), String(lit.flags ?? ''));
    }
    case SpecOp.Between:
      return new Between<T>(
        node.field,
        node.value as number | Date | string,
        node.value2 as number | Date | string
      );
    case SpecOp.IsNull: return new IsNull<T>(node.field);
    case SpecOp.IsNotNull: return new IsNotNull<T>(node.field);
  }
}
