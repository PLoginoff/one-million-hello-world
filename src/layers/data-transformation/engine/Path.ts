/**
 * Path engine
 *
 * Dot/bracket path notation with array-iteration segments:
 *
 *   "a.b.c"        → nested fields
 *   "a.b[0].c"     → numeric index
 *   "items[].name" → iterate every element of `items`, project `name`
 *   "list[].items[].id" → nested iteration (flattened)
 *
 * The same syntax drives both reads (`getPath`, `projectPath`) and writes
 * (`setPath`). Writes treat `[]` as "append a new element" and `[n]` as
 * "index n" — this pair of semantics is what makes array flattening and
 * unflattening expressible in one notation:
 *
 *   flatten:   source "orders[].lines[].sku" → target "skus[]"
 *   unflatten: source "skus[]"               → target "orders[].lines[].sku"
 *
 * Complexity: parsing is O(path length) and memoized per path string —
 * repeated transforms never re-parse. Reads/writes are O(path depth ×
 * array breadth).
 *
 * @module DataTransformationLayer/Engine
 */

/**
 * A parsed path segment.
 * - `field`: object property access
 * - `index`: fixed numeric index [n]
 * - `iterate`: iterate all elements []
 */
export type PathSegment =
  | { readonly kind: 'field'; readonly key: string }
  | { readonly kind: 'index'; readonly index: number }
  | { readonly kind: 'iterate' };

export type Path = readonly PathSegment[];

const parseCache = new Map<string, Path>();

/**
 * Parses a path string into segments. Memoized — identical strings share
 * one parse (important for compiled transforms running in hot loops).
 * O(L) on miss where L = path length; O(1) amortized on hit.
 */
export function parsePath(path: string): Path {
  const cached = parseCache.get(path);
  if (cached) {
    return cached;
  }
  const segments = parsePathUncached(path);
  parseCache.set(path, segments);
  return segments;
}

function parsePathUncached(path: string): Path {
  const segments: PathSegment[] = [];
  let i = 0;
  const n = path.length;
  let buf = '';

  const flushField = (): void => {
    if (buf.length > 0) {
      segments.push({ kind: 'field', key: buf });
      buf = '';
    }
  };

  while (i < n) {
    const ch = path[i];
    if (ch === '.') {
      flushField();
      i++;
    } else if (ch === '[') {
      flushField();
      const close = path.indexOf(']', i);
      if (close === -1) {
        throw new SyntaxError(`Unclosed bracket in path: ${path}`);
      }
      const inner = path.slice(i + 1, close).trim();
      if (inner === '') {
        segments.push({ kind: 'iterate' });
      } else {
        const idx = Number(inner);
        if (!Number.isInteger(idx) || idx < 0) {
          throw new SyntaxError(`Bad array index '${inner}' in path: ${path}`);
        }
        segments.push({ kind: 'index', index: idx });
      }
      i = close + 1;
    } else {
      buf += ch;
      i++;
    }
  }
  flushField();

  if (segments.length === 0) {
    throw new SyntaxError(`Empty path`);
  }
  return segments;
}

/**
 * True when the path contains at least one `[]` segment.
 */
export function hasIteration(path: Path): boolean {
  return path.some((s) => s.kind === 'iterate');
}

/**
 * Reads a path WITHOUT iteration. Returns undefined when any hop is absent
 * or not traversable. Never throws on missing data — callers decide
 * required/optional semantics.
 */
export function getPath(source: unknown, path: Path): unknown {
  let current = source;
  for (const seg of path) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    if (seg.kind === 'field') {
      current = (current as Record<string, unknown>)[seg.key];
    } else if (seg.kind === 'index') {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[seg.index];
    } else {
      // iterate in a plain read: project first element's rest? No —
      // iterate requires projectPath; treat a bare getPath on an
      // iterate segment as "the array itself".
      return current;
    }
  }
  return current;
}

/**
 * Projects a path possibly containing `[]` segments. Collects every leaf
 * value reached; returns a flat array when the path iterates, or the
 * scalar from getPath otherwise. Missing leaf values are skipped.
 *
 * Example: projectPath(obj, "orders[].lines[].sku") → flat list of skus.
 */
export function projectPath(source: unknown, path: Path): unknown {
  if (!hasIteration(path)) {
    return getPath(source, path);
  }
  const out: unknown[] = [];
  projectInto(source, path, 0, out);
  return out;
}

function projectInto(node: unknown, path: Path, at: number, out: unknown[]): void {
  if (at >= path.length) {
    if (node !== undefined) {
      out.push(node);
    }
    return;
  }
  const seg = path[at];
  if (node === null || node === undefined) {
    return;
  }
  switch (seg.kind) {
    case 'field':
      if (typeof node === 'object' && !Array.isArray(node)) {
        projectInto((node as Record<string, unknown>)[seg.key], path, at + 1, out);
      }
      return;
    case 'index':
      if (Array.isArray(node)) {
        projectInto(node[seg.index], path, at + 1, out);
      }
      return;
    case 'iterate':
      if (Array.isArray(node)) {
        for (const item of node) {
          projectInto(item, path, at + 1, out);
        }
      }
      return;
  }
}

/**
 * Writes `value` at `path` inside `root`, creating intermediate
 * objects/arrays as needed. `[]` segments APPEND (push) a new element;
 * `[n]` sets index n. `root` must be an object.
 *
 * Used for both scalar targets ("a.b.c") and array construction
 * ("skus[]" pushes each flattened value; "orders[].lines[].sku" rebuilds
 * nested arrays — each `[]` appends a fresh element per write, so callers
 * driving unflatten iterate the source array and write element-by-element).
 */
export function setPath(root: Record<string, unknown>, path: Path, value: unknown): void {
  let node: Record<string, unknown> | unknown[] = root;

  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    const last = i === path.length - 1;

    if (seg.kind === 'field') {
      const obj = node as Record<string, unknown>;
      if (last) {
        obj[seg.key] = value;
        return;
      }
      const next = path[i + 1];
      const existing = obj[seg.key];
      if (existing === undefined || existing === null || typeof existing !== 'object') {
        obj[seg.key] = next.kind === 'field' ? {} : [];
      }
      node = obj[seg.key] as Record<string, unknown> | unknown[];
    } else if (seg.kind === 'index') {
      const arr = node as unknown[];
      if (!Array.isArray(arr)) {
        throw new TypeError(`Path expects array at segment ${i}`);
      }
      if (last) {
        arr[seg.index] = value;
        return;
      }
      const next = path[i + 1];
      if (arr[seg.index] === undefined || arr[seg.index] === null || typeof arr[seg.index] !== 'object') {
        arr[seg.index] = next.kind === 'field' ? {} : [];
      }
      node = arr[seg.index] as Record<string, unknown> | unknown[];
    } else {
      // iterate == append
      const arr = node as unknown[];
      if (!Array.isArray(arr)) {
        throw new TypeError(`Path expects array for [] at segment ${i}`);
      }
      const next = path[i + 1];
      if (last) {
        arr.push(value);
        return;
      }
      const child: unknown = next.kind === 'field' ? {} : [];
      arr.push(child);
      node = child as Record<string, unknown> | unknown[];
    }
  }
}
