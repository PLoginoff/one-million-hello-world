/**
 * CompatibilityMatrix
 *
 * Breaking-change detection between contract versions, plus the
 * compatibility matrix that answers "can consumer version X talk to
 * provider version Y?".
 *
 * Change classification (mirroring Pact Broker / schema-evolution rules):
 *
 *  BREAKING:
 *   - interaction removed
 *   - request method or path changed
 *   - response status changed (unless covered by rules)
 *   - required response field removed or its type changed
 *   - matching rule tightened (min raised / max lowered / regex narrowed)
 *
 *  NON-BREAKING:
 *   - interaction added
 *   - optional response field added (consumers tolerate extra data)
 *   - matching rule relaxed (min lowered / max raised)
 *   - description / provider-state changes
 *
 * The analyzer walks both contracts' response schemas and produces a
 * {@link CompatibilityReport} — a list of classified changes. The matrix
 * then uses semver semantics: consumer contracts at major M are
 * compatible with provider behaviors that satisfy all M-major contracts.
 *
 * @module ContractTesting/Engine
 */

import {
  Json,
  MatchingRule,
  jsonTypeOf,
  structuralDiff,
} from './ContractMatchers';
import {
  Contract,
  ContractInteraction,
  Semver,
  formatSemver,
} from './ContractRegistry';

/* ------------------------------------------------------------------------ */
/* Change model                                                             */
/* ------------------------------------------------------------------------ */

/** Severity of a detected change. */
export type ChangeSeverity = 'breaking' | 'nonBreaking' | 'info';

/** One detected change between two contract versions. */
export interface ContractChange {
  readonly severity: ChangeSeverity;
  readonly kind:
    | 'interactionRemoved'
    | 'interactionAdded'
    | 'requestChanged'
    | 'responseStatusChanged'
    | 'responseFieldRemoved'
    | 'responseFieldAdded'
    | 'responseFieldTypeChanged'
    | 'responseFieldValueChanged'
    | 'ruleTightened'
    | 'ruleRelaxed'
    | 'ruleAdded'
    | 'ruleRemoved'
    | 'metadataChanged';
  readonly interactionId?: string;
  readonly path?: string;
  readonly detail: string;
}

/** Analysis output for a (previous, next) contract pair. */
export interface CompatibilityReport {
  readonly consumer: string;
  readonly provider: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly changes: readonly ContractChange[];
  readonly breakingChanges: readonly ContractChange[];
  /** True when no breaking change was detected. */
  readonly backwardCompatible: boolean;
  /** Suggested next version per semver rules. */
  readonly suggestedBump: 'major' | 'minor' | 'patch';
}

/* ------------------------------------------------------------------------ */
/* Schema inference                                                         */
/* ------------------------------------------------------------------------ */

/**
 * Minimal JSON-schema-ish shape inferred from a body, used to compare
 * response structures across versions.
 */
interface FieldShape {
  readonly type: string;
  readonly required: boolean;
  readonly children: ReadonlyMap<string, FieldShape>;
  readonly element?: FieldShape; // array element shape
}

/**
 * Infer a {@link FieldShape} for a JSON value. For arrays the element
 * shape is the union of all element shapes (first differing type wins
 * lexicographically — deterministic, since contracts are fixed docs).
 * Complexity: O(nodes).
 */
export function inferShape(value: Json, required = true): FieldShape {
  const type = jsonTypeOf(value);
  if (Array.isArray(value)) {
    let element: FieldShape | undefined;
    for (const el of value) {
      if (!element) {
        element = inferShape(el, true);
      } else if (jsonTypeOf(el) !== element.type) {
        // heterogenous arrays collapse to 'any'-like: keep first element
        // shape but mark type union by widest observed — we keep the
        // first shape; typeChanged will fire on explicit diffs instead.
      }
    }
    return { type, required, children: new Map(), element };
  }
  if (type === 'object') {
    const rec = value as Record<string, Json>;
    const children = new Map<string, FieldShape>();
    for (const [k, v] of Object.entries(rec)) {
      children.set(k, inferShape(v, true));
    }
    return { type, required, children };
  }
  return { type, required, children: new Map() };
}

/* ------------------------------------------------------------------------ */
/* Analyzer                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Compares two versions of a contract and classifies every change.
 */
export class ContractCompatibilityAnalyzer {
  /**
   * Produce a compatibility report for `next` relative to `previous`.
   * Both must describe the same consumer/provider pair.
   */
  analyze(previous: Contract, next: Contract): CompatibilityReport {
    if (previous.consumer !== next.consumer || previous.provider !== next.provider) {
      throw new Error(
        `cannot compare contracts of different pairs: ` +
          `${previous.consumer}->${previous.provider} vs ` +
          `${next.consumer}->${next.provider}`
      );
    }
    const changes: ContractChange[] = [];

    const prevById = new Map(previous.interactions.map((i) => [i.id, i]));
    const nextById = new Map(next.interactions.map((i) => [i.id, i]));

    // Match interactions by id first, then by (method, path) signature
    // so re-keyed interactions are still compared instead of appearing
    // as remove+add pairs.
    const signature = (i: ContractInteraction): string =>
      `${i.request.method} ${i.request.path}`;
    const prevBySig = new Map(previous.interactions.map((i) => [signature(i), i]));
    const paired = new Set<string>();
    const pairs: [ContractInteraction, ContractInteraction][] = [];

    for (const nextI of next.interactions) {
      const byId = prevById.get(nextI.id);
      const bySig = prevBySig.get(signature(nextI));
      const prevI = byId ?? (bySig && !paired.has(bySig.id) ? bySig : undefined);
      if (prevI && !paired.has(prevI.id)) {
        paired.add(prevI.id);
        pairs.push([prevI, nextI]);
      } else {
        changes.push({
          severity: 'nonBreaking',
          kind: 'interactionAdded',
          interactionId: nextI.id,
          path: signature(nextI),
          detail: `new interaction "${nextI.description}"`,
        });
      }
    }
    for (const prevI of previous.interactions) {
      if (!paired.has(prevI.id) && !nextById.has(prevI.id)) {
        changes.push({
          severity: 'breaking',
          kind: 'interactionRemoved',
          interactionId: prevI.id,
          path: signature(prevI),
          detail: `interaction "${prevI.description}" (${signature(prevI)}) removed`,
        });
      }
    }

    for (const [prevI, nextI] of pairs) {
      this._compareInteraction(prevI, nextI, changes);
    }

    this._compareRules(previous.matchingRules, next.matchingRules, undefined, changes);

    const breaking = changes.filter((c) => c.severity === 'breaking');
    return {
      consumer: previous.consumer,
      provider: previous.provider,
      fromVersion: formatSemver(previous.version),
      toVersion: formatSemver(next.version),
      changes,
      breakingChanges: breaking,
      backwardCompatible: breaking.length === 0,
      suggestedBump:
        breaking.length > 0
          ? 'major'
          : changes.some((c) => c.kind === 'interactionAdded')
            ? 'minor'
            : 'patch',
    };
  }

  /* ------------------------------------------------------------------ */

  private _compareInteraction(
    prev: ContractInteraction,
    next: ContractInteraction,
    changes: ContractChange[]
  ): void {
    const id = next.id;

    if (prev.request.method !== next.request.method || prev.request.path !== next.request.path) {
      changes.push({
        severity: 'breaking',
        kind: 'requestChanged',
        interactionId: id,
        detail:
          `request changed: ${prev.request.method} ${prev.request.path} -> ` +
          `${next.request.method} ${next.request.path}`,
      });
      return; // further comparison is meaningless
    }

    if (prev.response.status !== next.response.status) {
      changes.push({
        severity: 'breaking',
        kind: 'responseStatusChanged',
        interactionId: id,
        path: '$.status',
        detail: `status ${prev.response.status} -> ${next.response.status}`,
      });
    }

    // Response-body field-level analysis via structural diff + shapes.
    if (prev.response.body !== undefined && next.response.body !== undefined) {
      const prevShape = inferShape(prev.response.body);
      const nextShape = inferShape(next.response.body);
      this._compareShapes(prevShape, nextShape, '$.body', id, changes);
      // value-level drift on primitives is informational — consumers must
      // not depend on literal values, only on shape (rules decide truth).
      for (const d of structuralDiff(prev.response.body, next.response.body)) {
        if (d.kind === 'changed') {
          changes.push({
            severity: 'info',
            kind: 'responseFieldValueChanged',
            interactionId: id,
            path: d.path,
            detail: `example value changed at ${d.path}`,
          });
        }
      }
    } else if (prev.response.body !== undefined) {
      changes.push({
        severity: 'breaking',
        kind: 'responseFieldRemoved',
        interactionId: id,
        path: '$.body',
        detail: 'response body removed',
      });
    } else if (next.response.body !== undefined) {
      changes.push({
        severity: 'nonBreaking',
        kind: 'responseFieldAdded',
        interactionId: id,
        path: '$.body',
        detail: 'response body added',
      });
    }

    this._compareRules(prev.matchingRules ?? [], next.matchingRules ?? [], id, changes);
  }

  /**
   * Recursive shape comparison. `required` children disappearing or
   * changing primitive type are breaking; new children are additive.
   */
  private _compareShapes(
    prev: FieldShape,
    next: FieldShape,
    path: string,
    interactionId: string,
    changes: ContractChange[]
  ): void {
    if (prev.type !== next.type) {
      changes.push({
        severity: 'breaking',
        kind: 'responseFieldTypeChanged',
        interactionId,
        path,
        detail: `type changed ${prev.type} -> ${next.type} at ${path}`,
      });
      return;
    }
    if (prev.type === 'object') {
      for (const [k, child] of prev.children) {
        const nextChild = next.children.get(k);
        if (!nextChild) {
          changes.push({
            severity: 'breaking',
            kind: 'responseFieldRemoved',
            interactionId,
            path: `${path}.${k}`,
            detail: `field "${k}" removed from ${path}`,
          });
          continue;
        }
        this._compareShapes(child, nextChild, `${path}.${k}`, interactionId, changes);
      }
      for (const k of next.children.keys()) {
        if (!prev.children.has(k)) {
          changes.push({
            severity: 'nonBreaking',
            kind: 'responseFieldAdded',
            interactionId,
            path: `${path}.${k}`,
            detail: `field "${k}" added to ${path}`,
          });
        }
      }
      return;
    }
    if (prev.type === 'array' && prev.element && next.element) {
      this._compareShapes(prev.element, next.element, `${path}[*]`, interactionId, changes);
    }
  }

  /**
   * Rule comparison. Tightening (higher min, lower max, changed regex)
   * is breaking because previously valid responses may now fail.
   */
  private _compareRules(
    prev: readonly MatchingRule[],
    next: readonly MatchingRule[],
    interactionId: string | undefined,
    changes: ContractChange[]
  ): void {
    const key = (r: MatchingRule): string => `${r.path}::${r.matcher}`;
    const prevMap = new Map(prev.map((r) => [key(r), r]));
    const nextMap = new Map(next.map((r) => [key(r), r]));

    for (const [k, p] of prevMap) {
      const n = nextMap.get(k);
      if (!n) {
        changes.push({
          severity: 'nonBreaking',
          kind: 'ruleRemoved',
          interactionId,
          path: p.path,
          detail: `matching rule ${k} removed (verification relaxed)`,
        });
        continue;
      }
      if (n.min !== undefined && (p.min ?? -Infinity) < n.min) {
        changes.push({
          severity: 'breaking',
          kind: 'ruleTightened',
          interactionId,
          path: p.path,
          detail: `min raised ${p.min ?? 'none'} -> ${n.min} at ${p.path}`,
        });
      }
      if (n.max !== undefined && (p.max ?? Infinity) > n.max) {
        changes.push({
          severity: 'breaking',
          kind: 'ruleTightened',
          interactionId,
          path: p.path,
          detail: `max lowered ${p.max ?? 'none'} -> ${n.max} at ${p.path}`,
        });
      }
      if (p.pattern !== n.pattern && p.pattern !== undefined) {
        changes.push({
          severity: 'breaking',
          kind: 'ruleTightened',
          interactionId,
          path: p.path,
          detail: `regex changed /${p.pattern}/ -> /${n.pattern ?? 'none'}/`,
        });
      }
      if ((n.min !== undefined && (p.min ?? Infinity) > n.min) ||
          (n.max !== undefined && (p.max ?? -Infinity) < n.max)) {
        changes.push({
          severity: 'nonBreaking',
          kind: 'ruleRelaxed',
          interactionId,
          path: p.path,
          detail: `constraints relaxed at ${p.path}`,
        });
      }
    }
    for (const [k, n] of nextMap) {
      if (!prevMap.has(k)) {
        // A new rule restricts what the provider must emit — potentially
        // breaking for the provider side, non-breaking for consumers.
        changes.push({
          severity: 'info',
          kind: 'ruleAdded',
          interactionId,
          path: n.path,
          detail: `new matching rule ${k}`,
        });
      }
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Compatibility matrix                                                     */
/* ------------------------------------------------------------------------ */

/** One cell of the matrix: whether a pair is deployable together. */
export interface CompatibilityCell {
  readonly consumer: string;
  readonly consumerVersion: string;
  readonly provider: string;
  readonly providerContractVersion: string;
  readonly compatible: boolean;
  readonly breakingChanges: readonly ContractChange[];
  readonly reason: string;
}

/**
 * Matrix over all versions of a consumer/provider pair held by a
 * registry. `isDeployable` answers: "may consumer contract C be deployed
 * against the provider satisfying contract P?" — true when upgrading the
 * consumer contract from P to C introduces no breaking changes (the
 * provider already satisfies the newer expectations).
 */
export class CompatibilityMatrix {
  private readonly _analyzer = new ContractCompatibilityAnalyzer();

  /**
   * Check whether `consumerContract` can be deployed against a provider
   * currently verified to satisfy `providerContract`.
   *
   * Rule: analyze(providerContract -> consumerContract). If the newer
   * consumer contract is backward compatible with what the provider
   * satisfies (no removed interactions, no tightened rules), deployment
   * is safe.
   */
  isDeployable(consumerContract: Contract, providerContract: Contract): CompatibilityCell {
    const report = this._analyzer.analyze(providerContract, consumerContract);
    return {
      consumer: consumerContract.consumer,
      consumerVersion: formatSemver(consumerContract.version),
      provider: consumerContract.provider,
      providerContractVersion: formatSemver(providerContract.version),
      compatible: report.backwardCompatible,
      breakingChanges: report.breakingChanges,
      reason: report.backwardCompatible
        ? 'consumer contract is a backward-compatible evolution'
        : `${report.breakingChanges.length} breaking change(s) detected`,
    };
  }

  /**
   * Build the full N×M matrix between all published versions of a pair.
   * Rows: consumer contract versions (ascending); columns: provider
   * contract versions (ascending).
   */
  build(
    consumerVersions: readonly Contract[],
    providerVersions: readonly Contract[]
  ): readonly CompatibilityCell[] {
    const cells: CompatibilityCell[] = [];
    for (const c of consumerVersions) {
      for (const p of providerVersions) {
        cells.push(this.isDeployable(c, p));
      }
    }
    return cells;
  }
}
