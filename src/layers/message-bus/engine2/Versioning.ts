/**
 * Message Versioning & Upcasting
 *
 * Event-sourced systems rename fields, split aggregates, and merge
 * types over time; old messages sitting in queues still need to be
 * consumable. Rather than migrating stored data, consumers register
 * adjacent-version upcast steps (v1→v2, v2→v3) which this registry
 * chains into a path: on consume, a v1 payload walks v1→v2→v3.
 *
 * Resolution is a BFS over the version graph per message type —
 * O(V+E) where V = registered versions, E = steps. Steps may be
 * non-adjacent (a v1→v3 shortcut beats v1→v2→v3 by hop count); BFS
 * finds the shortest chain.
 *
 * @module MessageBusLayer/Engine2
 */

import { UpcastStep, VersionedPayload } from './types';

export class UpcastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpcastError';
  }
}

interface StepEdge {
  readonly step: UpcastStep;
  readonly to: number;
}

export class VersioningRegistry {
  /** messageType → fromVersion → edges. */
  private readonly _graph = new Map<string, Map<number, StepEdge[]>>();

  /**
   * Register an upcast step. `from` must differ from `to`; registering
   * the exact same (type, from, to) triple twice throws — ambiguous
   * chains are a configuration bug, not a runtime choice.
   */
  register(step: UpcastStep): void {
    if (step.from === step.to) {
      throw new UpcastError(
        `upcast step for '${step.messageType}' maps v${step.from} to itself`
      );
    }
    let byType = this._graph.get(step.messageType);
    if (!byType) {
      byType = new Map();
      this._graph.set(step.messageType, byType);
    }
    const edges = byType.get(step.from) ?? [];
    if (edges.some((e) => e.to === step.to)) {
      throw new UpcastError(
        `duplicate upcast step '${step.messageType}' v${step.from}→v${step.to}`
      );
    }
    edges.push({ step, to: step.to });
    byType.set(step.from, edges);
  }

  /**
   * The highest version reachable for a message type, or `undefined`
   * when no steps exist. Consumers ask "what's current?" without
   * knowing the migration history.
   */
  latestVersion(messageType: string): number | undefined {
    const byType = this._graph.get(messageType);
    if (!byType) return undefined;
    let max: number | undefined;
    const collect = (from: number): void => {
      for (const e of byType.get(from) ?? []) {
        if (max === undefined || e.to > max) max = e.to;
        collect(e.to);
      }
    };
    for (const from of byType.keys()) collect(from);
    return max;
  }

  /**
   * Upcast `payload` (at `version`) to `targetVersion`. Returns a new
   * `VersionedPayload`; never mutates the input. When the payload is
   * already at the target it's returned as-is (identity upcast).
   *
   * Throws `UpcastError` when no chain reaches the target — silently
   * delivering a stale shape to a new consumer is worse than failing.
   */
  upcastTo(
    messageType: string,
    versioned: VersionedPayload,
    targetVersion: number
  ): VersionedPayload {
    if (versioned.version === targetVersion) return versioned;
    const path = this._findPath(messageType, versioned.version, targetVersion);
    if (!path) {
      throw new UpcastError(
        `no upcast chain for '${messageType}' v${versioned.version}→v${targetVersion}`
      );
    }
    let payload = versioned.payload;
    for (const step of path) {
      payload = step.upcast(payload);
    }
    return { version: targetVersion, payload };
  }

  /**
   * Upcast to the latest known version; if the type has no registered
   * steps the payload passes through unchanged (unversioned types).
   */
  upcastToLatest(messageType: string, versioned: VersionedPayload): VersionedPayload {
    const latest = this.latestVersion(messageType);
    if (latest === undefined || versioned.version >= latest) return versioned;
    return this.upcastTo(messageType, versioned, latest);
  }

  /**
   * BFS shortest path over the version graph. Returns the ordered
   * steps, or null when the target is unreachable.
   */
  private _findPath(
    messageType: string,
    from: number,
    to: number
  ): readonly UpcastStep[] | null {
    const byType = this._graph.get(messageType);
    if (!byType) return null;

    // visited[v] = {prev, step} — parent pointers for reconstruction.
    const visited = new Map<number, { prev: number; step: UpcastStep }>();
    const queue: number[] = [from];
    visited.set(from, { prev: -1, step: null as unknown as UpcastStep });

    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur === undefined) break;
      if (cur === to) {
        // Reconstruct by walking parents back to `from`.
        const steps: UpcastStep[] = [];
        let v = to;
        for (;;) {
          const rec = visited.get(v);
          if (!rec || rec.prev === -1) break;
          steps.push(rec.step);
          v = rec.prev;
        }
        steps.reverse();
        return steps;
      }
      for (const e of byType.get(cur) ?? []) {
        if (!visited.has(e.to)) {
          visited.set(e.to, { prev: cur, step: e.step });
          queue.push(e.to);
        }
      }
    }
    return null;
  }

  /** Convenience builder: register a chain of adjacent steps at once. */
  registerChain(messageType: string, steps: ReadonlyArray<UpcastStep>): void {
    for (const s of steps) {
      if (s.messageType !== messageType) {
        throw new UpcastError(
          `chain step type '${s.messageType}' does not match '${messageType}'`
        );
      }
      this.register(s);
    }
  }
}
