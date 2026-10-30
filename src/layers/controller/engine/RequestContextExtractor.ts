/**
 * Request Context Extractor
 *
 * Normalizes the messy query-string surface into a typed
 * {@link RequestContext}: pagination, sorting, filtering, plus leftover
 * params.
 *
 * Conventions:
 * - Pagination: `?page=2&size=25` (aliases: `pageSize`, `per_page`,
 *   `limit`, `offset`). 1-based; clamps to [1, maxPageSize].
 * - Sort: `?sort=name,-createdAt` — comma-separated fields, `-` prefix
 *   for descending. Allow-listed via `sortableFields`.
 * - Filters: `?filter[name][contains]=al` or shorthand `?name=al`.
 *   Operators: `eq, ne, gt, gte, lt, lte, contains`. Allow-listed via
 *   `filterableFields`.
 * - Extras: everything else stays verbatim in `extras`.
 *
 * @module ControllerLayer/Engine
 */

import {
  FilterClause,
  Pagination,
  RequestContext,
  RequestContextOptions,
  SortClause,
} from './types';

/** Query parameter map (already parsed: name → first value). */
export type QueryParams = Record<string, string>;

const PAGE_KEYS = ['page', 'pageSize', 'per_page'] as const;
const SIZE_KEYS = ['size', 'pageSize', 'per_page', 'limit'] as const;
const OFFSET_KEYS = ['offset'] as const;
const SORT_KEYS = ['sort', 'orderBy', 'order'] as const;
const RESERVED_KEYS = new Set<string>([
  ...PAGE_KEYS,
  ...SIZE_KEYS,
  ...OFFSET_KEYS,
  ...SORT_KEYS,
  'filter',
  'q',
]);

const FILTER_OPS = new Set(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'] as const);

/** Parse a positive int; clamps and falls back on junk input. */
function parsePositiveInt(raw: string | undefined, fallback: number, max?: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) {
    return fallback;
  }
  return max !== undefined ? Math.min(n, max) : n;
}

/**
 * Extract pagination from query params with defaults.
 *
 * `offset`/`limit` take precedence over page/size when both exist —
 * callers can always derive one from the other.
 */
export function extractPagination(
  params: QueryParams,
  options?: RequestContextOptions
): Pagination {
  const defaultSize = options?.defaultPageSize ?? 20;
  const maxSize = options?.maxPageSize ?? 200;

  const offsetRaw = firstOf(params, OFFSET_KEYS);
  const explicitOffset = offsetRaw !== undefined ? parsePositiveInt(offsetRaw, 0) : undefined;

  const pageRaw = firstOf(params, PAGE_KEYS);
  const page = parsePositiveInt(pageRaw, 1);

  const sizeRaw = firstOf(params, SIZE_KEYS);
  const pageSize = parsePositiveInt(sizeRaw, defaultSize, maxSize);

  // Derive offset+limit consistently regardless of which the client sent.
  const limit = pageSize;
  const offset = explicitOffset ?? (page - 1) * pageSize;

  return { page, pageSize, offset, limit };
}

/**
 * Extract sort clauses. Drops disallowed fields silently — clients
 * learn about accepted fields from docs, not 400s.
 */
export function extractSort(
  params: QueryParams,
  options?: RequestContextOptions
): readonly SortClause[] {
  const raw = firstOf(params, SORT_KEYS);
  if (raw === undefined || raw.trim() === '') {
    return [];
  }

  const allowed = options?.sortableFields;
  const out: SortClause[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') {
      continue;
    }
    const desc = trimmed.startsWith('-');
    const field = desc ? trimmed.slice(1) : trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
    if (field === '') {
      continue;
    }
    if (allowed !== undefined && !allowed.includes(field)) {
      continue;
    }
    out.push({ field, direction: desc ? 'desc' : 'asc' });
  }
  return out;
}

/**
 * Extract filters. Two shapes:
 * - Structured: `filter[field][op]=value`
 * - Shorthand: `field=value` (non-reserved keys, op = eq)
 */
export function extractFilters(
  params: QueryParams,
  options?: RequestContextOptions
): readonly FilterClause[] {
  const allowed = options?.filterableFields;
  const out: FilterClause[] = [];

  for (const [key, value] of Object.entries(params)) {
    // Structured form: filter[name][op]
    const structured = /^filter\[([^\]]+)\]\[([^\]]+)\]$/.exec(key);
    if (structured !== null) {
      const [, field, op] = structured;
      const opNorm = op === 'eq' ? 'eq' : op;
      if (FILTER_OPS.has(opNorm as FilterClause['op'])) {
        if (allowed === undefined || allowed.includes(field)) {
          out.push({ field, op: opNorm as FilterClause['op'], value });
        }
      }
      continue;
    }
    // filter[field]=value — implicit eq
    const shortStructured = /^filter\[([^\]]+)\]$/.exec(key);
    if (shortStructured !== null) {
      const field = shortStructured[1];
      if (allowed === undefined || allowed.includes(field)) {
        out.push({ field, op: 'eq', value });
      }
      continue;
    }
    // Shorthand: non-reserved top-level params become eq filters.
    if (!RESERVED_KEYS.has(key)) {
      if (allowed === undefined || allowed.includes(key)) {
        out.push({ field: key, op: 'eq', value });
      }
    }
  }
  return out;
}

/**
 * Full extraction: pagination + sort + filters + extras.
 */
export function extractRequestContext(
  params: QueryParams,
  options?: RequestContextOptions
): RequestContext {
  const consumed = new Set<string>();
  const pagination = extractPagination(params, options);
  const sort = extractSort(params, options);
  const filters = extractFilters(params, options);

  for (const k of RESERVED_KEYS) {
    consumed.add(k);
  }
  for (const f of filters) {
    consumed.add(`filter[${f.field}][${f.op}]`);
    consumed.add(`filter[${f.field}]`);
    consumed.add(f.field);
  }
  for (const key of Object.keys(params)) {
    if (key.startsWith('filter[')) {
      consumed.add(key);
    }
  }

  const extras: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!consumed.has(key)) {
      extras[key] = value;
    }
  }

  return { pagination, sort, filters, extras };
}

function firstOf(params: QueryParams, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const v = params[key];
    if (v !== undefined) {
      return v;
    }
  }
  return undefined;
}
