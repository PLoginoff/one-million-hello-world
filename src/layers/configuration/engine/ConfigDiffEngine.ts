/**
 * Configuration Engine — Change Detection (Diff)
 *
 * Computes the path-level delta between two EffectiveConfigs: added,
 * removed and modified leaves. Diffing happens on the *flattened* maps —
 * O(n + m) where n,m are the flat path counts — instead of a recursive tree
 * walk, because the merger already produces flat maps.
 *
 * Source attribution: for a modified path we report which layers contributed
 * (`origin` from the new config; when the old config had a different origin
 * we report both). This lets reload logs say
 * "database.host changed (env → remote)" rather than just "changed".
 *
 * @module Configuration/Engine
 */

import { ConfigChange, ConfigDiff, ConfigValue, EffectiveConfig } from './ConfigTypes';
import { valueEquals } from './ConfigMerger';

export class ConfigDiffEngine {
  /**
   * Compute `before → after`. `at` is a timestamp supplied by the caller's
   * injectable clock.
   */
  diff(before: EffectiveConfig | null, after: EffectiveConfig, at: number): ConfigDiff {
    const changes: ConfigChange[] = [];

    if (before === null) {
      for (const p of after.paths()) {
        changes.push({
          path: p,
          kind: 'added',
          oldValue: undefined,
          newValue: after.get(p),
          sources: this._sources(undefined, after.origin(p)),
        });
      }
      return { changes, at, changed: changes.length > 0 };
    }

    const beforePaths = new Set(before.paths());
    const afterPaths = new Set(after.paths());

    // Added + modified: iterate `after` — stable ordering for reports.
    for (const p of afterPaths) {
      const nv = after.get(p) as ConfigValue;
      if (!beforePaths.has(p)) {
        changes.push({
          path: p,
          kind: 'added',
          oldValue: undefined,
          newValue: nv,
          sources: this._sources(undefined, after.origin(p)),
        });
      } else {
        const ov = before.get(p);
        if (!valueEquals(ov, nv)) {
          const oldOrigin = before.origin(p);
          const newOrigin = after.origin(p);
          changes.push({
            path: p,
            kind: 'modified',
            oldValue: ov,
            newValue: nv,
            sources: this._sources(oldOrigin, newOrigin),
          });
        }
      }
    }

    // Removed.
    for (const p of beforePaths) {
      if (!afterPaths.has(p)) {
        changes.push({
          path: p,
          kind: 'removed',
          oldValue: before.get(p),
          newValue: undefined,
          sources: this._sources(before.origin(p), undefined),
        });
      }
    }

    return { changes, at, changed: changes.length > 0 };
  }

  /**
   * Filter a diff to the subset of paths under `prefix` — used by scoped
   * listeners ("only tell me about `database.**` changes").
   */
  filterByPrefix(diff: ConfigDiff, prefix: string): ConfigDiff {
    const p = prefix.endsWith('.') ? prefix : `${prefix}.`;
    return {
      ...diff,
      changes: diff.changes.filter((c) => c.path === prefix || c.path.startsWith(p)),
      changed: diff.changes.some((c) => c.path === prefix || c.path.startsWith(p)),
    };
  }

  private _sources(oldOrigin: string | undefined, newOrigin: string | undefined): ReadonlyArray<string> {
    const out: string[] = [];
    if (oldOrigin !== undefined) out.push(oldOrigin);
    if (newOrigin !== undefined && newOrigin !== oldOrigin) out.push(newOrigin);
    return out;
  }
}
