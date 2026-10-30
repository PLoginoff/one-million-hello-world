/**
 * Resource-Hierarchy Permission Resolver
 *
 * Permissions granted on a node cascade to all descendants — grant
 * `read` on `folder:root` and every document beneath it inherits read.
 * Deny grants at any level override allows (deny-overrides), so a
 * confidential sub-folder can carve itself out of a broad parent grant.
 *
 * Resolution walks UP the ancestor chain from the target resource,
 * collecting grants in nearest-first order. Cycle-safe (visited set),
 * depth-capped to bound pathological inputs.
 *
 * Complexity: O(depth × grantsPerNode) per check; grants are indexed
 * per (resourceId, principal) for O(1) lookup per level.
 *
 * @module AuthorizationLayer/Engine2
 */

import { HierarchyNode, NodeGrant } from './types';

const MAX_DEPTH = 64;

export interface HierarchyCheck {
  readonly allowed: boolean;
  /** Node id where the decisive grant was found. */
  readonly decidedAt?: string;
  /** 'deny' when a deny grant overrode inherited allows. */
  readonly effect: 'allow' | 'deny';
  /** The chain walked, target first — audit trail for the decision. */
  readonly path: readonly string[];
}

interface GrantKey {
  principal: string;
  permission: string;
}

export class HierarchyResolver {
  private readonly _nodes = new Map<string, HierarchyNode>();
  /** resourceId → principal → permission → effect */
  private readonly _grants = new Map<string, Map<string, Map<string, 'allow' | 'deny'>>>();

  /** Register hierarchy edges. Reparenting is allowed — latest wins. */
  setNode(node: HierarchyNode): void {
    this._nodes.set(node.resourceId, node);
  }

  removeNode(resourceId: string): void {
    this._nodes.delete(resourceId);
    // Orphan children keep their parentId but resolution stops (parent missing).
  }

  /** Attach a grant at a node — cascades to descendants. */
  grant(grant: NodeGrant): void {
    let byPrincipal = this._grants.get(grant.resourceId);
    if (!byPrincipal) {
      byPrincipal = new Map();
      this._grants.set(grant.resourceId, byPrincipal);
    }
    let byPermission = byPrincipal.get(grant.principal);
    if (!byPermission) {
      byPermission = new Map();
      byPrincipal.set(grant.principal, byPermission);
    }
    for (const p of grant.permissions) {
      byPermission.set(p, grant.effect ?? 'allow');
    }
  }

  revoke(resourceId: string, principal: string, permission: string): boolean {
    const byP = this._grants.get(resourceId)?.get(principal);
    return byP?.delete(permission) ?? false;
  }

  /**
   * Resolve `permission` for `principal` at `resourceId`, walking up the
   * ancestor chain. Also consults the wildcard principal `*` (public
   * grants). Nearest explicit deny beats any allow; otherwise first
   * allow wins.
   */
  check(principal: string, resourceId: string, permission: string): HierarchyCheck {
    const path: string[] = [];
    const visited = new Set<string>();
    let allowFound: string | undefined;

    let cur: string | undefined = resourceId;
    let depth = 0;
    while (cur !== undefined && depth < MAX_DEPTH) {
      if (visited.has(cur)) break; // cycle guard
      visited.add(cur);
      path.push(cur);

      const grants = this._grants.get(cur);
      for (const p of [principal, '*']) {
        const effect = grants?.get(p)?.get(permission);
        if (effect === 'deny') {
          return { allowed: false, decidedAt: cur, effect: 'deny', path };
        }
        if (effect === 'allow' && allowFound === undefined) {
          allowFound = cur;
        }
      }
      cur = this._nodes.get(cur)?.parentId;
      depth++;
    }

    if (allowFound !== undefined) {
      return { allowed: true, decidedAt: allowFound, effect: 'allow', path };
    }
    return { allowed: false, effect: 'deny', path };
  }

  /**
   * Collect every permission `principal` can exercise at `resourceId`
   * (direct + inherited, denies subtracted). Used by bulk checks and
   * permission listings.
   */
  effectivePermissions(principal: string, resourceId: string): Set<string> {
    const allowed = new Set<string>();
    const denied = new Set<string>();
    const visited = new Set<string>();

    let cur: string | undefined = resourceId;
    let depth = 0;
    while (cur !== undefined && depth < MAX_DEPTH) {
      if (visited.has(cur)) break;
      visited.add(cur);
      const grants = this._grants.get(cur);
      if (grants) {
        for (const p of [principal, '*']) {
          const perms = grants.get(p);
          if (!perms) continue;
          for (const [perm, effect] of perms) {
            if (effect === 'deny') denied.add(perm);
            else if (!denied.has(perm)) allowed.add(perm);
          }
        }
      }
      cur = this._nodes.get(cur)?.parentId;
      depth++;
    }
    for (const d of denied) allowed.delete(d);
    return allowed;
  }
}
