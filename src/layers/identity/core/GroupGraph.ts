/**
 * GroupGraph — nested group membership with transitive resolution.
 *
 * Groups form a DAG: a group has member users and member groups.
 * `effectiveGroups(userId)` returns the transitive closure of groups
 * the user belongs to directly or via nesting — the classic "is user
 * X in group G" enterprise question.
 *
 *  - Edges: group -> {memberUsers, memberGroups}
 *  - Cycle detection on add: adding edge A->B is rejected if B already
 *    reaches A (DFS), keeping the graph acyclic so transitive
 *    resolution always terminates
 *  - Transitive resolution: iterative DFS O(V+E)
 *  - `members(groupId)`: reverse closure — all users effectively in a
 *    group, via a reverse-edge walk
 *
 * @module Identity/Core
 */

import { IdentityCoreError, IdentityErrorCode } from './types';

export interface Group {
  id: string;
  name: string;
  description?: string;
  /** Direct member user ids. */
  memberUsers: Set<string>;
  /** Direct member group ids (nested membership). */
  memberGroups: Set<string>;
  createdAt: number;
}

export class GroupGraph {
  private readonly _groups: Map<string, Group> = new Map();

  createGroup(id: string, name: string, description?: string, now: number = Date.now()): Group {
    if (this._groups.has(id)) {
      throw new IdentityCoreError(IdentityErrorCode.USERNAME_TAKEN, `group exists: ${id}`);
    }
    const g: Group = { id, name, description, memberUsers: new Set(), memberGroups: new Set(), createdAt: now };
    this._groups.set(id, g);
    return g;
  }

  get(id: string): Group | undefined {
    return this._groups.get(id);
  }

  require(id: string): Group {
    const g = this._groups.get(id);
    if (!g) throw new IdentityCoreError(IdentityErrorCode.USER_NOT_FOUND, `group not found: ${id}`);
    return g;
  }

  deleteGroup(id: string): boolean {
    if (!this._groups.delete(id)) return false;
    for (const g of this._groups.values()) g.memberGroups.delete(id);
    return true;
  }

  /** Add a user directly to a group. */
  addUser(groupId: string, userId: string): void {
    this.require(groupId).memberUsers.add(userId);
  }

  removeUser(groupId: string, userId: string): void {
    this.require(groupId).memberUsers.delete(userId);
  }

  /**
   * Nest `childId` inside `parentId`. Rejected when child already
   * reaches parent (cycle) or parent === child.
   */
  addSubgroup(parentId: string, childId: string): void {
    if (parentId === childId) {
      throw new IdentityCoreError(IdentityErrorCode.MERGE_SELF, 'group cannot contain itself');
    }
    this.require(parentId);
    this.require(childId);
    if (this._reaches(childId, parentId)) {
      throw new IdentityCoreError(
        IdentityErrorCode.ILLEGAL_TRANSITION,
        `adding ${childId} under ${parentId} would create a cycle`
      );
    }
    this._groups.get(parentId)!.memberGroups.add(childId);
  }

  removeSubgroup(parentId: string, childId: string): void {
    this.require(parentId).memberGroups.delete(childId);
  }

  /** DFS: does `from` transitively contain `target`? */
  private _reaches(from: string, target: string): boolean {
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur === target) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const g = this._groups.get(cur);
      if (g) for (const sub of g.memberGroups) stack.push(sub);
    }
    return false;
  }

  /**
   * Transitive closure of groups `userId` effectively belongs to
   * (direct membership + all ancestors). O(V+E).
   */
  effectiveGroups(userId: string): Group[] {
    const out = new Set<string>();
    for (const g of this._groups.values()) {
      if (g.memberUsers.has(userId)) {
        // Walk UP: collect g and every ancestor
        this._ancestors(g.id, out);
      }
    }
    return [...out].map((id) => this._groups.get(id)!).filter(Boolean);
  }

  /** Collect `id` plus all transitive parent groups into `out`. */
  private _ancestors(id: string, out: Set<string>): void {
    if (out.has(id)) return;
    out.add(id);
    for (const parent of this._groups.values()) {
      if (parent.memberGroups.has(id)) this._ancestors(parent.id, out);
    }
  }

  /**
   * All users effectively in `groupId` (reverse closure — users in
   * nested subgroups count). O(V+E).
   */
  members(groupId: string): string[] {
    const users = new Set<string>();
    const seen = new Set<string>();
    const stack = [groupId];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const g = this._groups.get(cur);
      if (!g) continue;
      for (const u of g.memberUsers) users.add(u);
      for (const sub of g.memberGroups) stack.push(sub);
    }
    return [...users];
  }

  /** Is `userId` effectively a member of `groupId`? */
  isMember(groupId: string, userId: string): boolean {
    return this.members(groupId).includes(userId);
  }

  size(): number {
    return this._groups.size;
  }
}
