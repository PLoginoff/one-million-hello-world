/**
 * canonical — deterministic JSON serialization for hash chaining.
 *
 * Sorts object keys recursively so two structurally-equal values
 * produce identical strings regardless of insertion order.
 *
 * @module Identity/Core
 */

export function canonicalize(value: unknown): string {
  return JSON.stringify(canon(value));
}

function canon(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(canon);
  const obj = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = canon(obj[k]);
  return out;
}
