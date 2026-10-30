/**
 * dirty.ts — hash-based dirty detection.
 *
 * Deep-comparing every tracked entity on every flush is O(total state
 * size). Instead we keep an FNV-1a hash of each entity's canonical form
 * (sorted keys, recursively), computed at track time; on flush we
 * rehash and compare. Equal hash → clean, skip field diff (the common
 * case — most entities are untouched). Different hash → fall through
 * to a field-level diff for the change list.
 *
 * Hash collision caveat: FNV-1a is not cryptographic — an adversarial
 * or pathological pair of states could collide and mask a change.
 * Acceptable for change detection (worst case = missed dirty flag,
 * not corrupted data); use a real hash if adversarial input is a threat.
 *
 * Canonicalization sorts object keys recursively so field order never
 * produces false dirties.
 *
 * @module UnitOfWorkLayer/Engine2
 */

/** FNV-1a 32-bit hash of the canonical JSON. */
export function hashEntity(entity: Record<string, unknown>): number {
  const canon = canonicalize(entity);
  let h = 0x811c9dc5;
  for (let i = 0; i < canon.length; i++) {
    h ^= canon.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Canonical JSON: object keys sorted recursively → order-independent. */
export function canonicalize(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(o[k])}`).join(',')}}`;
}
