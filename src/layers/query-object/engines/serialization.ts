/**
 * Serialization — QueryAst ↔ JSON-safe transport form.
 *
 * `QueryAst` is *almost* JSON already; the only non-serializable values
 * are `Date` operands and `RegExp` operands inside `Matches` nodes.
 * `serializeAst` walks the criteria tree and converts both into tagged
 * literals (`{ $date: iso }`, `{ $regex: { source, flags } }`);
 * `deserializeAst` reverses the mapping.
 *
 * Tagged literals are chosen over type-convention ("strings that look
 * like dates") because round-tripping must be lossless — a string that
 * happens to be an ISO timestamp must stay a string.
 *
 * @module QueryObject/Engines
 */

import { CompareOp, CriterionNode, QueryAst } from './types';

const DATE_TAG = '$date';
const REGEX_TAG = '$regex';

/** JSON-safe operand encoding. */
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

function encodeNode(node: CriterionNode): CriterionNode {
  switch (node.kind) {
    case 'compare':
      return { ...node, value: encodeValue(node.value), value2: encodeValue(node.value2) };
    case 'logic':
      return { ...node, children: node.children.map(encodeNode) };
    case 'not':
      return { ...node, child: encodeNode(node.child) };
    case 'inSubquery':
    case 'exists':
      return { ...node, query: serializeAst(node.query) };
  }
}

function decodeNode(node: CriterionNode): CriterionNode {
  switch (node.kind) {
    case 'compare':
      return { ...node, value: decodeValue(node.value), value2: decodeValue(node.value2) };
    case 'logic':
      return { ...node, children: node.children.map(decodeNode) };
    case 'not':
      return { ...node, child: decodeNode(node.child) };
    case 'inSubquery':
    case 'exists':
      return { ...node, query: deserializeAst(node.query) };
  }
}

/** Convert an AST to a JSON.stringify-able structure. */
export function serializeAst(ast: QueryAst): QueryAst {
  return {
    ...ast,
    where: ast.where === null ? null : encodeNode(ast.where),
    includes: ast.includes.map((i) => ({
      ...i,
      where: i.where === undefined ? undefined : encodeNode(i.where),
    })),
  };
}

/** Reverse {@link serializeAst}. */
export function deserializeAst(ast: QueryAst): QueryAst {
  return {
    ...ast,
    where: ast.where === null ? null : decodeNode(ast.where),
    includes: ast.includes.map((i) => ({
      ...i,
      where: i.where === undefined ? undefined : decodeNode(i.where),
    })),
  };
}

/** Full round trip through a JSON string — convenient for transport. */
export function astToJson(ast: QueryAst): string {
  return JSON.stringify(serializeAst(ast));
}

/**
 * Parse a JSON string back into a QueryAst. Throws on malformed input
 * rather than trusting the shape — the wire is untrusted.
 */
export function astFromJson(json: string): QueryAst {
  const raw = JSON.parse(json) as unknown;
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('QueryAst JSON must be an object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.table !== 'string') {
    throw new TypeError('QueryAst JSON missing "table"');
  }
  const ast = o as unknown as QueryAst;
  // Guard: only decode when the shape looks like ours. The tagged
  // literal decoder is tolerant of malformed nested nodes — it passes
  // them through unchanged.
  const normalized: QueryAst = {
    table: ast.table,
    select: Array.isArray(ast.select) ? ast.select : null,
    where: ast.where ?? null,
    orderBy: Array.isArray(ast.orderBy) ? ast.orderBy : [],
    limit: typeof ast.limit === 'number' ? ast.limit : null,
    offset: typeof ast.offset === 'number' ? ast.offset : null,
    includes: Array.isArray(ast.includes) ? ast.includes : [],
    distinct: ast.distinct === true,
    count: ast.count === true,
    hints: typeof ast.hints === 'object' && ast.hints !== null ? ast.hints : {},
  };
  // Special-case: a Matches operand serialized as { $regex } decodes to
  // RegExp; an operand serialized as { source, flags } (from
  // field().matches() literals) is already fine.
  const decoded = deserializeAst(normalized);
  // Normalize: CompareOp.Matches operands that decoded to RegExp are
  // kept — PredicateCompiler accepts both forms.
  return decoded;
}
