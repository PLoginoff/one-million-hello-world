/**
 * Bulk Authorization Engine
 *
 * Checks N permissions for one subject in a single call with two
 * optimizations over naive per-permission checks:
 *
 *  1. Shared-prefix grouping — `doc:read`, `doc:write`, `doc:delete`
 *     share the `doc:` prefix; when the caller supplies a
 *     `PrefixDenyOracle` (e.g. "subject can't touch docs at all"), a
 *     single oracle hit settles the whole group without N check calls.
 *  2. Memoization — duplicate permissions in the request are checked
 *     once.
 *
 * The checker remains the source of truth — this engine only decides
 * WHICH checks it can safely skip.
 *
 * @module AuthorizationLayer/Engine2
 */

import { BulkCheckRequest, BulkCheckResult, PermissionChecker } from './types';

/**
 * Optional fast-path oracle: answers "does subject have ANY grant under
 * prefix?" when the caller can compute that cheaper than N full checks
 * (e.g. an index lookup over `subject → resource-prefix`).
 * Return undefined when the oracle can't decide — the group falls back
 * to per-permission checks.
 */
export type PrefixDenyOracle = (subjectId: string, prefix: string) => boolean | undefined;

export interface BulkAuthorizerOptions {
  readonly oracle?: PrefixDenyOracle;
  /** Prefix delimiter — permissions group on `segment:` runs. */
  readonly delimiter?: string;
  /**
   * Minimum group size to bother consulting the oracle (default 2) —
   * for singletons the oracle call itself isn't amortized.
   */
  readonly minGroupForOracle?: number;
}

export class BulkAuthorizer {
  private readonly _checker: PermissionChecker;
  private readonly _oracle: PrefixDenyOracle | undefined;
  private readonly _delimiter: string;
  private readonly _minGroup: number;
  /** Diagnostics: how many real checks ran — tests assert savings. */
  checkCallCount = 0;

  constructor(checker: PermissionChecker, options?: BulkAuthorizerOptions) {
    this._checker = checker;
    this._oracle = options?.oracle;
    this._delimiter = options?.delimiter ?? ':';
    this._minGroup = options?.minGroupForOracle ?? 2;
  }

  /** Longest first-segment prefix, e.g. `doc` for `doc:read`. */
  private prefixOf(permission: string): string {
    const idx = permission.indexOf(this._delimiter);
    return idx === -1 ? permission : permission.slice(0, idx);
  }

  check(request: BulkCheckRequest): BulkCheckResult {
    this.checkCallCount = 0;
    const results: Record<string, boolean> = {};
    const shortCircuited: string[] = [];

    // Dedupe while preserving first-seen order.
    const unique = [...new Set(request.permissions)];

    // Group by first-segment prefix.
    const groups = new Map<string, string[]>();
    for (const p of unique) {
      const prefix = this.prefixOf(p);
      const g = groups.get(prefix);
      if (g) g.push(p);
      else groups.set(prefix, [p]);
    }

    for (const [prefix, perms] of groups) {
      let oracleDenied = false;
      if (this._oracle && perms.length >= this._minGroup) {
        oracleDenied = this._oracle(request.subjectId, prefix) === false;
      }
      if (oracleDenied) {
        for (const p of perms) {
          results[p] = false;
          shortCircuited.push(p);
        }
        continue;
      }
      for (const p of perms) {
        this.checkCallCount++;
        results[p] = this._checker(request.subjectId, p);
      }
    }

    return { subjectId: request.subjectId, results, shortCircuited };
  }

  /**
   * Chunked variant for very large permission sets — processes in
   * batches of `chunkSize` so a streaming PEP can interleave results.
   */
  *checkChunked(request: BulkCheckRequest, chunkSize = 100): Generator<BulkCheckResult> {
    for (let i = 0; i < request.permissions.length; i += chunkSize) {
      yield this.check({
        subjectId: request.subjectId,
        permissions: request.permissions.slice(i, i + chunkSize),
      });
    }
  }
}
