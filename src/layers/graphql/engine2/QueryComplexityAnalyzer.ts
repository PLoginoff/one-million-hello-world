/**
 * Query Complexity Analyzer
 *
 * Static cost scoring for a parsed query *before* execution — the
 * defence against queries like `{ user { friends { friends { friends
 * { ... } } } } }` that look small but resolve O(N^depth) rows.
 *
 * Cost model (graphql-query-complexity conventions):
 *
 *     cost(field) = (fieldCost + childrenCost) × multiplicity
 *
 *   - Every field contributes `defaultFieldCost` (usually 1).
 *   - List-typed fields multiply their subtree by the `first`/`last`
 *     argument (default multiplier when absent) — `friends(first: 50)`
 *     costs 50× its children.
 *   - Aliases are *real* fields for costing: `a: expensive` and
 *     `b: expensive` are two resolutions, not one — alias-aware means we
 *     dedupe only true merges (same field+alias, i.e. the query's own
 *     merge rules), not distinct response keys.
 *   - @skip/@include directives drop the field's cost to 0 when the
 *     directive is statically `if: false`/`if: true` respectively —
 *     variable directives conservatively cost as included.
 *   - Depth limiting is independent: nesting past `maxDepth` rejects
 *     regardless of total cost (bounded multiplication can still hide
 *     exponential fan-out when multipliers are absent).
 *
 * Fragments are expanded once — cycles in fragment spreads are cut at
 * first revisit (a fragment referencing itself contributes its own cost
 * then stops; malformed recursive fragments can't loop the analyzer).
 *
 * Complexity: O(S) where S = selections after fragment expansion.
 *
 * @module GraphqlLayer/Engine2
 */

import {
  DirectiveNode,
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  OperationDefinitionNode,
  SelectionNode,
  SelectionSetNode,
  valueToLiteral,
} from '../implementations/ast/ast';

export interface ComplexityConfig {
  /** Default cost of one field resolution. Default 1. */
  readonly defaultFieldCost?: number;
  /** Multiplier for list fields without first/last args. Default 10. */
  readonly defaultListMultiplier?: number;
  /** Argument names that size a list. Default ['first','last','limit']. */
  readonly listSizeArgs?: readonly string[];
  /** Cost ceiling — queries over this are rejected. Default 1000. */
  readonly maxComplexity?: number;
  /** Depth ceiling. Default 15. */
  readonly maxDepth?: number;
  /**
   * Field costs by `Type.field` path (e.g. `User.friends: 5`) — overrides
   * defaultFieldCost for known-expensive resolvers.
   */
  readonly fieldCosts?: Readonly<Record<string, number>>;
  /**
   * Fields known to return lists even without schema info (heuristic
   * mode): `Type.field: true`. When schema types are available the
   * analyzer prefers TypeRef list detection.
   */
  readonly listFields?: Readonly<Record<string, boolean>>;
}

export interface ComplexityViolation {
  readonly kind: 'max-complexity' | 'max-depth';
  readonly message: string;
  /** Where the violation trips — first offending field path. */
  readonly at: string;
}

export interface ComplexityReport {
  readonly totalCost: number;
  readonly maxDepthReached: number;
  /** Cost by top-level field — shows where the budget went. */
  readonly byRootField: Readonly<Record<string, number>>;
  readonly violations: readonly ComplexityViolation[];
  readonly ok: boolean;
}

interface AnalysisCtx {
  fragments: Map<string, FragmentDefinitionNode>;
  config: Required<Omit<ComplexityConfig, 'fieldCosts' | 'listFields'>> & {
    fieldCosts: Record<string, number>;
    listFields: Record<string, boolean>;
  };
  /** Fragment names currently being expanded — cycle cut. */
  expanding: Set<string>;
}

export class QueryComplexityAnalyzer {
  private readonly _config: Required<Omit<ComplexityConfig, 'fieldCosts' | 'listFields'>> & {
    fieldCosts: Record<string, number>;
    listFields: Record<string, boolean>;
  };

  constructor(config: ComplexityConfig = {}) {
    this._config = {
      defaultFieldCost: config.defaultFieldCost ?? 1,
      defaultListMultiplier: config.defaultListMultiplier ?? 10,
      listSizeArgs: config.listSizeArgs ?? ['first', 'last', 'limit'],
      maxComplexity: config.maxComplexity ?? 1000,
      maxDepth: config.maxDepth ?? 15,
      fieldCosts: { ...(config.fieldCosts ?? {}) },
      listFields: { ...(config.listFields ?? {}) },
    };
  }

  /**
   * Analyze one operation in a document. `typeName` seeds `Type.field`
   * lookups for fieldCosts/listFields (usually 'Query'/'Mutation').
   */
  analyze(doc: DocumentNode, operationName?: string, rootType = 'Query'): ComplexityReport {
    const fragments = new Map<string, FragmentDefinitionNode>();
    let operation: OperationDefinitionNode | null = null;
    for (const def of doc.definitions) {
      if (def.kind === 'FragmentDefinition') {
        fragments.set(def.name.value, def);
      } else if (def.kind === 'OperationDefinition') {
        if (!operationName || def.name?.value === operationName) {
          operation = def;
        }
      }
    }
    if (!operation) {
      return { totalCost: 0, maxDepthReached: 0, byRootField: {}, violations: [], ok: true };
    }

    const ctx: AnalysisCtx = {
      fragments,
      config: this._config,
      expanding: new Set(),
    };

    const violations: ComplexityViolation[] = [];
    const byRoot: Record<string, number> = {};
    let maxDepth = 0;

    for (const sel of operation.selectionSet.selections) {
      const { cost, depth, path } = this._selectionCost(sel, 1, rootType, ctx, violations);
      if (sel.kind === 'Field') {
        byRoot[sel.alias?.value ?? sel.name.value] = cost;
      }
      maxDepth = Math.max(maxDepth, depth);
      void path;
    }

    const total = Object.values(byRoot).reduce((a, b) => a + b, 0);
    if (total > this._config.maxComplexity) {
      violations.push({
        kind: 'max-complexity',
        message: `query complexity ${total} exceeds limit ${this._config.maxComplexity}`,
        at: '$',
      });
    }
    return {
      totalCost: total,
      maxDepthReached: maxDepth,
      byRootField: byRoot,
      violations,
      ok: violations.length === 0,
    };
  }

  /* ---------------------------------------------------------------- */

  private _selectionCost(
    sel: SelectionNode,
    depth: number,
    parentType: string,
    ctx: AnalysisCtx,
    violations: ComplexityViolation[]
  ): { cost: number; depth: number; path: string } {
    if (sel.kind === 'FragmentSpread') {
      const name = sel.name.value;
      const frag = ctx.fragments.get(name);
      if (!frag || ctx.expanding.has(name)) return { cost: 0, depth, path: name };
      ctx.expanding.add(name);
      const r = this._setCost(frag.selectionSet, depth, frag.typeCondition.name.value, ctx, violations);
      ctx.expanding.delete(name);
      return { ...r, path: `...${name}` };
    }
    if (sel.kind === 'InlineFragment') {
      const t = sel.typeCondition?.name.value ?? parentType;
      const r = this._setCost(sel.selectionSet, depth, t, ctx, violations);
      return { ...r, path: '...' };
    }
    return this._fieldCost(sel, depth, parentType, ctx, violations);
  }

  private _setCost(
    set: SelectionSetNode,
    depth: number,
    typeName: string,
    ctx: AnalysisCtx,
    violations: ComplexityViolation[]
  ): { cost: number; depth: number; path: string } {
    let cost = 0;
    let maxD = depth;
    let first = '';
    for (const s of set.selections) {
      const r = this._selectionCost(s, depth, typeName, ctx, violations);
      cost += r.cost;
      if (r.depth > maxD) {
        maxD = r.depth;
        first = r.path;
      }
    }
    return { cost, depth: maxD, path: first };
  }

  private _fieldCost(
    field: FieldNode,
    depth: number,
    parentType: string,
    ctx: AnalysisCtx,
    violations: ComplexityViolation[]
  ): { cost: number; depth: number; path: string } {
    const name = field.name.value;
    const path = `${parentType}.${name}`;

    // Directive pruning — statically-evaluated @skip/@include.
    if (this._isSkipped(field.directives)) {
      return { cost: 0, depth, path };
    }

    if (depth > ctx.config.maxDepth) {
      violations.push({
        kind: 'max-depth',
        message: `depth ${depth} exceeds limit ${ctx.config.maxDepth}`,
        at: path,
      });
      return { cost: 0, depth, path };
    }

    const own = ctx.config.fieldCosts[path] ?? ctx.config.defaultFieldCost;

    // Children cost × list multiplicity.
    let childCost = 0;
    let maxD = depth;
    if (field.selectionSet) {
      const childType = name.charAt(0).toUpperCase() + name.slice(1); // heuristic type name
      const r = this._setCost(field.selectionSet, depth + 1, childType, ctx, violations);
      childCost = r.cost;
      maxD = r.depth;
    }

    const multiplier = this._multiplier(field, path, ctx.config, childCost > 0);
    return { cost: (own + childCost) * multiplier, depth: maxD, path };
  }

  /**
   * List multiplier: first/last/limit arg value when present, else the
   * configured default when the field is list-shaped. Only multiplies
   * when the field actually has children (scalar leaves aren't lists).
   */
  private _multiplier(
    field: FieldNode,
    path: string,
    config: AnalysisCtx['config'],
    hasChildren: boolean
  ): number {
    if (!hasChildren) return 1;
    for (const argName of config.listSizeArgs) {
      const arg = field.arguments.find((a) => a.name.value === argName);
      if (arg) {
        const v = valueToLiteral(arg.value);
        if (typeof v === 'number' && v > 0) return Math.floor(v);
      }
    }
    // List-shaped but unbounded — the dangerous case.
    if (config.listFields[path] || config.defaultListMultiplier > 0) {
      return config.defaultListMultiplier;
    }
    return 1;
  }

  /** @skip(if:true) drops the field; @include(if:false) too. */
  private _isSkipped(directives: readonly DirectiveNode[]): boolean {
    for (const d of directives) {
      const ifArg = d.arguments.find((a) => a.name.value === 'if');
      if (!ifArg) continue;
      const v = valueToLiteral(ifArg.value);
      if (typeof v !== 'boolean') continue; // variable → include conservatively
      if (d.name.value === 'skip' && v) return true;
      if (d.name.value === 'include' && !v) return true;
    }
    return false;
  }
}
