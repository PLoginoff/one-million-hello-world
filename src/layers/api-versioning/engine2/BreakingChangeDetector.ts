/**
 * Breaking Change Detector
 *
 * Structurally diffs two endpoint schemas (old vs new) and classifies
 * every difference as breaking or non-breaking.
 *
 * The direction matters and is NOT symmetric:
 *
 * - **Request** schemas describe what the server *accepts*. Removing an
 *   accepted field, narrowing an enum, closing `additionalProperties`,
 *   or making an optional field required are all breaking — a client
 *   built against the old contract may now be rejected.
 * - **Response** schemas describe what the server *produces*. Removing a
 *   produced field, changing its type, or making a previously-required
 *   field optional are breaking — a client reading that field breaks.
 *   Adding fields is safe either way.
 *
 * The algorithm is a recursive walk over the {@link SchemaNode} tree —
 * O(N) in the number of schema nodes — emitting a {@link SchemaChange}
 * per difference with a dotted `path` for reporting.
 *
 * @module ApiVersioningLayer/Engine2
 */

import { ChangeKind, SchemaChange, SchemaDiff, SchemaDirection, SchemaNode } from './types';

export class BreakingChangeDetector {
  /**
   * Diff `before` against `after` in the given direction.
   * `before`/`after` are schemas of the SAME logical endpoint.
   */
  diff(before: SchemaNode, after: SchemaNode, direction: SchemaDirection): SchemaDiff {
    const changes: SchemaChange[] = [];
    this._walk('', before, after, direction, changes);
    return {
      direction,
      changes,
      hasBreaking: changes.some((c) => c.kind === ChangeKind.Breaking),
    };
  }

  /** True iff upgrading `before` -> `after` is safe for existing clients. */
  isCompatible(before: SchemaNode, after: SchemaNode, direction: SchemaDirection): boolean {
    return !this.diff(before, after, direction).hasBreaking;
  }

  // ------------------------------------------------------------------
  // recursive walk
  // ------------------------------------------------------------------

  private _walk(
    path: string,
    before: SchemaNode,
    after: SchemaNode,
    dir: SchemaDirection,
    out: SchemaChange[]
  ): void {
    // 1. Type tag changed — always breaking regardless of direction.
    if (before.type !== undefined && after.type !== undefined && before.type !== after.type) {
      // integer -> number is a widening: safe for responses (still a number),
      // breaking for requests is debatable; we treat any tag change as
      // breaking except integer->number in a RESPONSE (clients already
      // handle numbers).
      const widening =
        dir === SchemaDirection.Response &&
        before.type === 'integer' &&
        after.type === 'number';
      out.push({
        kind: widening ? ChangeKind.NonBreaking : ChangeKind.Breaking,
        path,
        reason: 'type-changed',
        before: before.type,
        after: after.type,
      });
      // Type changed: deeper structural comparison is meaningless.
      return;
    }

    // 2. Enum membership changed.
    if (before.enum && after.enum) {
      const beforeSet = new Set(before.enum);
      const afterSet = new Set(after.enum);
      const removed = before.enum.filter((v) => !afterSet.has(v));
      const added = after.enum.filter((v) => !beforeSet.has(v));
      if (removed.length > 0) {
        // Removing enum members: breaking for requests (server rejects
        // previously-legal values). For responses removing members means
        // the server emits FEWER variants — safe.
        out.push({
          kind: dir === SchemaDirection.Request ? ChangeKind.Breaking : ChangeKind.NonBreaking,
          path,
          reason: 'enum-narrowed',
          before: before.enum.join('|'),
          after: after.enum.join('|'),
        });
      }
      if (added.length > 0) {
        // Adding enum members: breaking for responses (client sees a
        // value it never expected), safe for requests.
        out.push({
          kind: dir === SchemaDirection.Response ? ChangeKind.Breaking : ChangeKind.NonBreaking,
          path,
          reason: 'enum-widened',
          before: before.enum.join('|'),
          after: after.enum.join('|'),
        });
      }
    }

    // 3. additionalProperties closed.
    const beforeOpen = before.additionalProperties !== false;
    const afterOpen = after.additionalProperties !== false;
    if (beforeOpen && !afterOpen) {
      out.push({
        // Closing the object: for requests the server now rejects extra
        // fields clients may send — breaking. For responses it just
        // means a stricter produced shape — non-breaking for readers.
        kind: dir === SchemaDirection.Request ? ChangeKind.Breaking : ChangeKind.NonBreaking,
        path,
        reason: 'additional-props-closed',
      });
    }

    // 4. Object properties.
    if (before.properties || after.properties) {
      this._walkProperties(path, before, after, dir, out);
    }

    // 5. Array items.
    if (before.items && after.items) {
      this._walk(`${path}[]`, before.items, after.items, dir, out);
      // If the item walk produced changes, tag them as items-changed
      // at this level for easy filtering — the detailed entries remain.
      const itemsChanges = out.filter((c) => c.path.startsWith(`${path}[]`));
      if (itemsChanges.some((c) => c.kind === ChangeKind.Breaking)) {
        out.push({ kind: ChangeKind.Breaking, path, reason: 'items-changed' });
      }
    }
  }

  private _walkProperties(
    path: string,
    before: SchemaNode,
    after: SchemaNode,
    dir: SchemaDirection,
    out: SchemaChange[]
  ): void {
    const bProps = before.properties ?? {};
    const aProps = after.properties ?? {};
    const bReq = new Set(before.required ?? []);
    const aReq = new Set(after.required ?? []);

    for (const name of Object.keys(bProps)) {
      const sub = path ? `${path}.${name}` : name;
      const a = aProps[name];
      const b = bProps[name]!;
      if (!a) {
        // Property removed: breaking for responses (client reads a field
        // that vanished); for requests, removing an *accepted* field means
        // the server ignores it — breaking only if additionalProperties
        // was just closed, which is reported separately. We mark it
        // non-breaking for requests when the object stays open.
        const open = after.additionalProperties !== false;
        out.push({
          kind:
            dir === SchemaDirection.Response || !open
              ? ChangeKind.Breaking
              : ChangeKind.NonBreaking,
          path: sub,
          reason: 'property-removed',
          before: b.type,
        });
        continue;
      }
      this._walk(sub, b, a, dir, out);
    }

    for (const name of Object.keys(aProps)) {
      if (bProps[name]) continue;
      const sub = path ? `${path}.${name}` : name;
      const a = aProps[name]!;
      const reqNow = aReq.has(name);
      out.push({
        // Added property: safe for responses. For requests it's safe
        // UNLESS it's required — a new mandatory field breaks old callers.
        kind:
          dir === SchemaDirection.Request && reqNow
            ? ChangeKind.Breaking
            : ChangeKind.NonBreaking,
        path: sub,
        reason: 'property-added',
        after: a.type,
      });
    }

    // Required-ness flips on properties present in both.
    for (const name of Object.keys(aProps)) {
      if (!bProps[name]) continue;
      const sub = path ? `${path}.${name}` : name;
      const was = bReq.has(name);
      const now = aReq.has(name);
      if (!was && now) {
        out.push({
          // Optional -> required: breaking for requests (old callers
          // omit it). For responses a field that was optional is now
          // always present — safe.
          kind: dir === SchemaDirection.Request ? ChangeKind.Breaking : ChangeKind.NonBreaking,
          path: sub,
          reason: 'became-required',
        });
      } else if (was && !now) {
        out.push({
          // Required -> optional: breaking for responses (client assumes
          // presence), safe for requests.
          kind: dir === SchemaDirection.Response ? ChangeKind.Breaking : ChangeKind.NonBreaking,
          path: sub,
          reason: 'became-optional',
        });
      }
    }
  }
}
