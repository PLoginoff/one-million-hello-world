/**
 * Environment Parity Checker
 *
 * Diffs the blue and green environment configurations before a switch:
 * the failure mode this catches is "green deployed, then errors because
 * `PAYMENTS_URL` still points at staging" — a config skew that smoke
 * tests catch too late.
 *
 * Comparison rules:
 *   - Presence: a key on one side but not the other is an issue.
 *   - Non-secret values compare literally.
 *   - Secrets compare by `hash` (the caller fingerprints them — this
 *     module never sees the plaintext, which is the whole point of
 *     carrying `hash` instead of `value`).
 *   - `ignore` patterns suppress intentional skew (e.g. `*_COLOR`,
 *     `REVISION`, `*_REPLICAS`) as `*`-glob patterns anchored at both
 *     ends — `DB_*` matches `DB_HOST` and `DB_POOL_SIZE`.
 *
 * An entry with `secret: true` but no `hash` is a parity failure by
 * construction — an unhashable secret cannot be verified, so flag it
 * rather than trust it.
 *
 * Cost: O(K) over the union of keys; globs compile once per call.
 *
 * @module BlueGreenDeployLayer/Engine2
 */

import { EnvVarEntry, ParityIssue, ParityReport } from './types';

function glob(pattern: string): RegExp {
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '*' ? '.*' : `\\${c}`));
  return new RegExp(`^${esc}$`);
}

export function checkParity(
  blue: readonly EnvVarEntry[],
  green: readonly EnvVarEntry[],
  ignore: readonly string[] = []
): ParityReport {
  const ignores = ignore.map(glob);
  const ignored = (k: string): boolean => ignores.some((re) => re.test(k));

  const b = new Map(blue.map((e) => [e.key, e]));
  const g = new Map(green.map((e) => [e.key, e]));
  const keys = new Set([...b.keys(), ...g.keys()]);
  const issues: ParityIssue[] = [];
  const ignoredKeys: string[] = [];
  let compared = 0;

  for (const key of [...keys].sort()) {
    if (ignored(key)) {
      ignoredKeys.push(key);
      continue;
    }
    compared++;
    const be = b.get(key);
    const ge = g.get(key);
    if (be === undefined) {
      issues.push({ key, kind: 'missing-in-blue', greenValue: ge?.secret ? undefined : ge?.value });
      continue;
    }
    if (ge === undefined) {
      issues.push({ key, kind: 'missing-in-green', blueValue: be.secret ? undefined : be.value });
      continue;
    }
    if (be.secret || ge.secret) {
      // Secret comparison goes through the fingerprint only.
      if (be.hash === undefined || ge.hash === undefined || be.hash !== ge.hash) {
        issues.push({ key, kind: 'hash-differs' });
      }
      continue;
    }
    if (be.value !== ge.value) {
      issues.push({ key, kind: 'value-differs', blueValue: be.value, greenValue: ge.value });
    }
  }

  return {
    ok: issues.length === 0,
    comparedKeys: compared,
    issues,
    ignoredKeys,
  };
}
