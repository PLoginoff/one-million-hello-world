/**
 * Policy Engine — Versioned Policy Bundles
 *
 * A {@link PolicyBundle} packages a root policy-set plus its dependent
 * bundles into one deployable unit — like a package with a lockfile:
 *
 *  - Each bundle has `name`, semver-ish `version`, `dependencies`
 *    (`name@range` — range is a minimum-version `>=x.y.z` or exact `=x.y.z`),
 *    and a content `digest` (FNV-1a over canonical JSON — dependency-free
 *    fingerprint for tamper detection).
 *  - The {@link PolicyBundleStore} is an append-only registry; resolving a
 *    bundle walks the dependency graph, topologically orders installs
 *    (dependencies first), and rejects cycles/missing/unsatisfiable ranges.
 *  - `verify(bundle)` recomputes the digest — detects content tampering
 *    between signing and deploy.
 *  - `flatten(bundle)` produces the effective merged policy set: the
 *    bundle's own root with dependency roots spliced in order (declaration
 *    order) — a real merge, not a lookup, so the deployed artifact is
 *    self-contained.
 *
 * @module PolicyEngine/Engine2
 */

import { Policy, PolicySet, isPolicySet } from '../domain/policy-model';

export interface BundleDependency {
  readonly name: string;
  /** `>=x.y.z` or `=x.y.z`. */
  readonly range: string;
}

export interface PolicyBundle {
  readonly name: string;
  readonly version: string;
  readonly root: PolicySet;
  readonly dependencies: ReadonlyArray<BundleDependency>;
  /** FNV-1a digest of canonical content — set by {@link computeDigest}. */
  readonly digest?: string;
  readonly metadata?: Record<string, string>;
}

export class BundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleError';
  }
}

/* ------------------------------------------------------------------ */
/* Digest — FNV-1a over canonical JSON                                  */
/* ------------------------------------------------------------------ */

/** Stable-stringify: object keys sorted recursively for a canonical form. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const rec = v as Record<string, unknown>;
  const keys = Object.keys(rec).filter((k) => k !== 'digest' && k !== 'metadata').sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(rec[k])}`).join(',')}}`;
}

/** FNV-1a 32-bit — hex. Not cryptographic; a tamper-detection checksum. */
export function computeDigest(bundle: Omit<PolicyBundle, 'digest'>): string {
  const s = canonical({ name: bundle.name, version: bundle.version, root: bundle.root, dependencies: bundle.dependencies });
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/* ------------------------------------------------------------------ */
/* Semver-lite                                                          */
/* ------------------------------------------------------------------ */

function parseVersion(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new BundleError(`invalid version '${v}' — expected x.y.z`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmpVersion(a: string, b: string): number {
  const [a1, a2, a3] = parseVersion(a);
  const [b1, b2, b3] = parseVersion(b);
  return a1 - b1 || a2 - b2 || a3 - b3;
}

/** Does `version` satisfy `range` (`>=x.y.z` or `=x.y.z`)? */
export function satisfies(version: string, range: string): boolean {
  if (range.startsWith('>=')) return cmpVersion(version, range.slice(2)) >= 0;
  if (range.startsWith('=')) return cmpVersion(version, range.slice(1)) === 0;
  throw new BundleError(`unsupported range '${range}' — use >=x.y.z or =x.y.z`);
}

/* ------------------------------------------------------------------ */
/* Store + resolution                                                   */
/* ------------------------------------------------------------------ */

export interface ResolvedBundle {
  readonly bundle: PolicyBundle;
  /** Flattened, self-contained policy set with dependencies merged in. */
  readonly effectivePolicySet: PolicySet;
}

export class PolicyBundleStore {
  /** name → version → bundle */
  private readonly _bundles = new Map<string, Map<string, PolicyBundle>>();

  /** Register a bundle. Immutable — same name+version cannot be replaced. */
  publish(bundle: PolicyBundle): PolicyBundle {
    parseVersion(bundle.version);
    const digest = bundle.digest ?? computeDigest(bundle);
    const withDigest: PolicyBundle = { ...bundle, digest };
    let versions = this._bundles.get(bundle.name);
    if (!versions) {
      versions = new Map();
      this._bundles.set(bundle.name, versions);
    }
    if (versions.has(bundle.version)) {
      throw new BundleError(`bundle ${bundle.name}@${bundle.version} already published`);
    }
    versions.set(bundle.version, withDigest);
    return withDigest;
  }

  /** Latest published version of `name`. */
  latest(name: string): PolicyBundle | undefined {
    const versions = this._bundles.get(name);
    if (!versions || versions.size === 0) return undefined;
    return [...versions.values()].sort((a, b) => cmpVersion(b.version, a.version))[0];
  }

  /** Pick the highest published version satisfying `range`. */
  satisfy(name: string, range: string): PolicyBundle | undefined {
    const versions = this._bundles.get(name);
    if (!versions) return undefined;
    const ok = [...versions.values()].filter((b) => satisfies(b.version, range));
    if (ok.length === 0) return undefined;
    return ok.sort((a, b) => cmpVersion(b.version, a.version))[0];
  }

  /** Recompute and compare the digest — tamper check. */
  verify(bundle: PolicyBundle): boolean {
    return bundle.digest === computeDigest(bundle);
  }

  /**
   * Resolve `name@version` (or latest when version omitted) into a
   * self-contained policy set. Topological install order — dependencies
   * flattened before dependents. Cycles and unsatisfiable ranges throw.
   */
  resolve(name: string, version?: string): ResolvedBundle {
    const root = version ? this._bundles.get(name)?.get(version) : this.latest(name);
    if (!root) {
      throw new BundleError(`bundle ${name}${version ? `@${version}` : ''} not found`);
    }
    if (!this.verify(root)) {
      throw new BundleError(`bundle ${root.name}@${root.version} digest mismatch — content tampered`);
    }

    // Topological install order — DFS post-order over dependencies.
    const installed = new Map<string, PolicyBundle>(); // name → chosen version
    const visiting = new Set<string>();
    const order: PolicyBundle[] = [];

    const visit = (b: PolicyBundle): void => {
      const existing = installed.get(b.name);
      if (existing) {
        // Diamond: same name resolved twice — versions must agree.
        if (existing.version !== b.version) {
          throw new BundleError(
            `conflicting versions for '${b.name}': ${existing.version} vs ${b.version}`
          );
        }
        return;
      }
      if (visiting.has(b.name)) {
        throw new BundleError(`dependency cycle at '${b.name}'`);
      }
      visiting.add(b.name);
      for (const dep of b.dependencies) {
        const chosen = this.satisfy(dep.name, dep.range);
        if (!chosen) {
          throw new BundleError(
            `dependency '${dep.name}@${dep.range}' of '${b.name}@${b.version}' not satisfiable`
          );
        }
        if (!this.verify(chosen)) {
          throw new BundleError(`bundle ${chosen.name}@${chosen.version} digest mismatch`);
        }
        visit(chosen);
      }
      visiting.delete(b.name);
      installed.set(b.name, b);
      order.push(b);
    };
    visit(root);

    // Merge: dependency roots first (declaration order), then the root's
    // own policies — produces ONE self-contained PolicySet.
    const merged: PolicySet = {
      id: `${root.name}@${root.version}`,
      version: root.version,
      policyCombining: root.root.policyCombining,
      target: root.root.target,
      policies: [
        ...order.slice(0, -1).flatMap((b) => b.root.policies as readonly (Policy | PolicySet)[]),
        ...root.root.policies,
      ],
      obligations: root.root.obligations,
      advice: root.root.advice,
    };
    return { bundle: root, effectivePolicySet: merged };
  }

  /** Install plan without flattening — the ordered bundle list. */
  installPlan(name: string, version?: string): ReadonlyArray<{ name: string; version: string }> {
    const r = this.resolve(name, version);
    void r; // resolution performs the validation; reconstruct the plan:
    const root = version ? this._bundles.get(name)?.get(version) : this.latest(name);
    const plan: { name: string; version: string }[] = [];
    const seen = new Set<string>();
    const walk = (b: PolicyBundle): void => {
      if (seen.has(b.name)) return;
      for (const dep of b.dependencies) {
        const chosen = this.satisfy(dep.name, dep.range)!;
        walk(chosen);
      }
      seen.add(b.name);
      plan.push({ name: b.name, version: b.version });
    };
    walk(root!);
    return plan;
  }
}
