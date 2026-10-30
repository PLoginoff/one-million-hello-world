/**
 * RBAC Resolver
 *
 * Resolves a subject's effective permissions by walking the role
 * hierarchy. Inheritance edges are traversed depth-first with a
 * visited set, so cycles (a inherits b inherits a) resolve safely to
 * the union of reachable permissions.
 *
 * A per-role memo caches the transitive permission set; writes to the
 * role graph (register/update/remove) bump a version counter that
 * invalidates all memos — O(1) invalidation, no graph walk.
 *
 * Complexity:
 *  - resolve(subject): O(R + P) first call after a change, where R =
 *    reachable roles and P = permissions emitted; O(1) per warm role.
 *  - permission match: O(#permissions x #pattern segments).
 *
 * @module AuthorizationLayer/Engine
 */

import { Permission, Role, Subject, SubjectGrant, PermissionDiff } from './types';

/** Split a permission into `:`-separated segments. */
function segments(p: Permission): string[] {
  return p.split(':');
}

/**
 * Does `pattern` match `permission`? `*` matches a whole segment.
 * A pattern may be shorter than the permission only when it ends in
 * a wildcard — `doc:*` matches `doc:read` and `doc:read:all`, while
 * `doc:read` does NOT match `doc:read:all`.
 */
export function permissionMatches(pattern: Permission, permission: Permission): boolean {
  if (pattern === '*' || pattern === permission) return true;
  const ps = segments(pattern);
  const ts = segments(permission);
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!;
    if (p === '*') {
      if (i === ps.length - 1) return true; // trailing wildcard: match rest
      if (i >= ts.length) return false;
      continue;
    }
    if (i >= ts.length || p !== ts[i]) return false;
  }
  return ps.length === ts.length;
}

/** All permissions `perm` is covered by from a set of patterns. */
export function coveredBy(permission: Permission, patterns: readonly Permission[]): boolean {
  return patterns.some((p) => permissionMatches(p, permission));
}

/**
 * Set diff between two permission lists: what was added/removed.
 * Treats permissions as opaque strings (no wildcard expansion —
 * wildcarded grants are compared literally).
 */
export function diffPermissions(
  before: readonly Permission[],
  after: readonly Permission[]
): PermissionDiff {
  const a = new Set(before);
  const b = new Set(after);
  const added = [...b].filter((p) => !a.has(p)).sort();
  const removed = [...a].filter((p) => !b.has(p)).sort();
  const unchanged = [...a].filter((p) => b.has(p)).sort();
  return { added, removed, unchanged };
}

/**
 * Diff the *effective* permission sets of two subjects — expanding
 * role inheritance first, so a hierarchy change shows up correctly.
 */
export interface EffectiveDiff {
  readonly added: readonly Permission[];
  readonly removed: readonly Permission[];
}

export class RbacResolver {
  private _roles: Map<string, Role>;
  private _memo: Map<string, Set<Permission>>;
  private _version: number;
  private _memoVersion: number;

  constructor() {
    this._roles = new Map();
    this._memo = new Map();
    this._version = 0;
    this._memoVersion = -1;
  }

  /** Register or replace a role. */
  registerRole(role: Role): void {
    this._roles.set(role.id, role);
    this._version++;
  }

  /** Remove a role (subjects keeping its id lose its permissions). */
  removeRole(roleId: string): boolean {
    const had = this._roles.delete(roleId);
    if (had) this._version++;
    return had;
  }

  getRole(roleId: string): Role | undefined {
    return this._roles.get(roleId);
  }

  /** All registered roles. */
  roles(): Role[] {
    return [...this._roles.values()];
  }

  /**
   * Resolve a role's transitive permissions (direct + inherited).
   * Cycle-safe via DFS visited set; memoized per graph version.
   */
  resolveRole(roleId: string): Set<Permission> {
    if (this._memoVersion !== this._version) {
      this._memo.clear();
      this._memoVersion = this._version;
    }
    const cached = this._memo.get(roleId);
    if (cached) return cached;

    const out = new Set<Permission>();
    const visited = new Set<string>();
    const stack: string[] = [roleId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const role = this._roles.get(id);
      if (!role) continue;
      for (const p of role.permissions) out.add(p);
      for (const parent of role.inherits) stack.push(parent);
    }
    this._memo.set(roleId, out);
    return out;
  }

  /**
   * The full inheritance chain (transitive role ids) for a role,
   * useful for diagnostics. Order: DFS pre-order.
   */
  roleChain(roleId: string): string[] {
    const out: string[] = [];
    const visited = new Set<string>();
    const walk = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const role = this._roles.get(id);
      if (!role) return;
      out.push(id);
      for (const parent of role.inherits) walk(parent);
    };
    walk(roleId);
    return out;
  }

  /**
   * Effective permissions for a subject = union over roles' resolved
   * permissions + direct allow grants (deny grants are returned
   * separately so the evaluator can apply deny-overrides).
   */
  resolveSubject(subject: Subject): {
    allow: Set<Permission>;
    deny: Set<Permission>;
    contributingRoles: string[];
  } {
    const allow = new Set<Permission>();
    const deny = new Set<Permission>();
    const contributingRoles: string[] = [];

    for (const roleId of subject.roles) {
      const rolePerms = this.resolveRole(roleId);
      if (rolePerms.size > 0) contributingRoles.push(roleId);
      for (const p of rolePerms) allow.add(p);
    }
    for (const grant of subject.grants ?? []) {
      if (grant.effect === 'deny') deny.add(grant.permission);
      else allow.add(grant.permission);
    }
    return { allow, deny, contributingRoles };
  }

  /**
   * Effective permission set for a subject (denies excluded — this is
   * the "what can they do" view used by diffing).
   */
  effectivePermissions(subject: Subject): Set<Permission> {
    return this.resolveSubject(subject).allow;
  }

  /**
   * Diff two subjects' effective permission sets — e.g. before/after
   * a role reassignment or a role edit.
   */
  diffSubjects(a: Subject, b: Subject): EffectiveDiff {
    const pa = this.effectivePermissions(a);
    const pb = this.effectivePermissions(b);
    return {
      added: [...pb].filter((p) => !pa.has(p)).sort(),
      removed: [...pa].filter((p) => !pb.has(p)).sort(),
    };
  }

  /**
   * Diff two role *sets* (e.g. role v1 vs role v2 after edits):
   * resolves each role list into effective permissions and diffs.
   */
  diffRoleSets(roleIdsA: readonly string[], roleIdsB: readonly string[]): EffectiveDiff {
    const collect = (ids: readonly string[]): Set<Permission> => {
      const out = new Set<Permission>();
      for (const id of ids) {
        for (const p of this.resolveRole(id)) out.add(p);
      }
      return out;
    };
    const pa = collect(roleIdsA);
    const pb = collect(roleIdsB);
    return {
      added: [...pb].filter((p) => !pa.has(p)).sort(),
      removed: [...pa].filter((p) => !pb.has(p)).sort(),
    };
  }

  /**
   * Detect inheritance cycles among registered roles. Returns the
   * first cycle found (list of role ids) or undefined. The resolver
   * itself tolerates cycles, but admins usually want to know.
   */
  findCycle(): string[] | undefined {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const stack: string[] = [];

    const dfs = (id: string): string[] | undefined => {
      color.set(id, GRAY);
      stack.push(id);
      const role = this._roles.get(id);
      for (const parent of role?.inherits ?? []) {
        const c = color.get(parent) ?? WHITE;
        if (c === GRAY) {
          const start = stack.indexOf(parent);
          return stack.slice(start).concat(parent);
        }
        if (c === WHITE) {
          const found = dfs(parent);
          if (found) return found;
        }
      }
      stack.pop();
      color.set(id, BLACK);
      return undefined;
    };

    for (const id of this._roles.keys()) {
      if ((color.get(id) ?? WHITE) === WHITE) {
        const found = dfs(id);
        if (found) return found;
      }
    }
    return undefined;
  }
}
