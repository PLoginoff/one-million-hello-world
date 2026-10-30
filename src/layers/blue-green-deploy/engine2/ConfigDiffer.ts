/**
 * Deep Config Differ
 *
 * Beyond the env-var parity checker: recursive diff of structured
 * service configs (JSON-ish trees) so "the green configmap differs in
 * `features.checkout.v2`" comes back as a path, not a blob.
 *
 * The differ reports structural changes — added, removed, changed —
 * leaf-typed (string/number/boolean/null compare by value; arrays
 * compare elementwise by index — config arrays are positional, not
 * sets). Objects recurse. Type changes (object → scalar) report as
 * `changed` with both sides' types.
 *
 * Cost: O(N) over the union tree.
 *
 * @module BlueGreenDeployLayer/Engine2
 */

export type ConfigValue =
  | null
  | boolean
  | number
  | string
  | readonly ConfigValue[]
  | { readonly [k: string]: ConfigValue };

export type DiffKind = 'added' | 'removed' | 'changed' | 'type-changed';

export interface ConfigDiff {
  /** Dotted path, e.g. `features.checkout.v2` or `servers[2].host`. */
  readonly path: string;
  readonly kind: DiffKind;
  readonly blue?: ConfigValue;
  readonly green?: ConfigValue;
}

function isObject(v: ConfigValue): v is { readonly [k: string]: ConfigValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function walk(
  path: string,
  a: ConfigValue | undefined,
  b: ConfigValue | undefined,
  out: ConfigDiff[]
): void {
  if (a === undefined && b !== undefined) {
    out.push({ path, kind: 'added', green: b });
    return;
  }
  if (b === undefined && a !== undefined) {
    out.push({ path, kind: 'removed', blue: a });
    return;
  }
  if (a === undefined || b === undefined) return;

  const aObj = isObject(a);
  const bObj = isObject(b);
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aObj !== bObj || aArr !== bArr) {
    out.push({ path, kind: 'type-changed', blue: a, green: b });
    return;
  }
  if (aObj && bObj) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of [...keys].sort()) {
      walk(path ? `${path}.${k}` : k, a[k], b[k], out);
    }
    return;
  }
  if (aArr && bArr) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      walk(`${path}[${i}]`, a[i], b[i], out);
    }
    return;
  }
  if (a !== b) {
    out.push({ path, kind: 'changed', blue: a, green: b });
  }
}

/** Diff two config trees; returns sorted-by-path differences. */
export function diffConfigs(blue: ConfigValue, green: ConfigValue): ConfigDiff[] {
  const out: ConfigDiff[] = [];
  walk('', blue, green, out);
  return out.sort((x, y) => x.path.localeCompare(y.path));
}

/** Summary for dashboards: count by kind. */
export function summarize(diffs: readonly ConfigDiff[]): Record<DiffKind, number> {
  const s: Record<DiffKind, number> = { added: 0, removed: 0, changed: 0, 'type-changed': 0 };
  for (const d of diffs) s[d.kind]++;
  return s;
}
