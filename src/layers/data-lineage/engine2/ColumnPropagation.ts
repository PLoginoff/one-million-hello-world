/**
 * Column-Level Lineage Propagation
 *
 * The base `captureColumnLineage` records `derives` edges for every
 * column ref in a SELECT list. This engine goes further — it *parses*
 * the expression's shape to classify the transform, which changes what
 * "impact" means:
 *
 *   - **Direct** (`a + b`, `UPPER(name)`): value-level dependency — the
 *     output column inherits nullability and precision from inputs.
 *   - **Aggregate** (`SUM(x)`, `COUNT(*)`): the output depends on the
 *     *set* of input rows, not any single value — a bad input row
 *     corrupts the aggregate even when "correct-looking".
 *   - **Conditional** (`CASE WHEN`, `COALESCE`, `IF`): dependency is
 *     *selective* — only some branches flow through; the engine records
 *     which columns appear in each branch.
 *   - **Cast/convert** (`CAST(x AS y)`): type-changing dependency —
 *     flagged because casts are the classic silent-precision-loss bug.
 *
 * For each output column the engine emits a `ColumnLineageEdge` per
 * input ref with the transform classification, plus the raw expression
 * for audit. Downstream consumers (impact analysis, masking-rule
 * propagation, PII tracking) filter on `transform` — e.g. a PII tag
 * propagates through `direct` and `aggregate` but the sensitivity level
 * may demote through `conditional`.
 *
 * Implementation: hand-rolled expression classifier over the shared
 * tokenizer — the same pragmatic level of parsing as the base engine
 * (recognises keywords, parens depth, CASE blocks).
 *
 * Complexity: O(#selectItems × exprLength + #refs).
 *
 * @module DataLineage/Engine2
 */

import { extractColumnRefs, LineageGraph, NodeId } from '../engine/LineageGraphEngine';

/** How the output column depends on the input. */
export enum TransformKind {
  /** Value-level derivation (arithmetic, string ops, function calls). */
  DIRECT = 'direct',
  /** Set-level derivation (SUM/AVG/COUNT/MIN/MAX/GROUP BY). */
  AGGREGATE = 'aggregate',
  /** Selective derivation — column appears under a conditional branch. */
  CONDITIONAL = 'conditional',
  /** Type-changing derivation (CAST/CONVERT). */
  CAST = 'cast',
  /** Union/combiner — output merges multiple same-shape inputs. */
  UNION = 'union',
  /** Could not classify — treated as DIRECT for propagation purposes. */
  UNKNOWN = 'unknown',
}

const AGGREGATE_FNS = new Set(['sum', 'avg', 'count', 'min', 'max', 'stddev', 'variance', 'collect_set', 'collect_list', 'array_agg', 'string_agg', 'approx_count_distinct', 'percentile', 'median']);
const CONDITIONAL_WORDS = new Set(['case', 'when', 'if', 'coalesce', 'nullif', 'ifnull', 'decode', 'switch']);
const CAST_WORDS = new Set(['cast', 'convert', 'try_cast', 'safe_cast', 'to_date', 'to_timestamp']);

/** A single input→output column edge with transform classification. */
export interface ColumnLineageEdge {
  /** Output column id (e.g. `mart.report.revenue`). */
  readonly to: NodeId;
  /** Input column ref as written in the expression. */
  readonly fromRef: string;
  /** Resolved input node id when unambiguous; else the raw ref. */
  readonly resolvedFrom: NodeId | null;
  readonly transform: TransformKind;
  /** The expression that produced this output. */
  readonly expression: string;
  /** For CONDITIONAL: which branch of the CASE the ref belongs to. */
  readonly branch?: string;
}

/** One parsed select item → resolved column edges. */
export interface ColumnPropagationResult {
  readonly targetDataset: NodeId;
  readonly targetColumn: string;
  readonly expression: string;
  readonly transform: TransformKind;
  readonly edges: readonly ColumnLineageEdge[];
  /** Refs that couldn't be resolved to a column in the graph. */
  readonly unresolved: readonly string[];
  /** Warnings (e.g. `SELECT *`, unparseable expression). */
  readonly warnings: readonly string[];
}

/** Classification of an expression. */
export interface ExpressionShape {
  readonly transform: TransformKind;
  /** Distinct branches for CONDITIONAL expressions. */
  readonly branches: readonly { readonly label: string; readonly refs: readonly string[] }[];
  /** The aggregate functions present, if any. */
  readonly aggregateFns: readonly string[];
}

const WORD_RE = /[A-Za-z_][A-Za-z0-9_.]*/g;

/**
 * Classify an expression's transform kind by scanning its tokens.
 * Lightweight heuristic — full SQL parsing lives in the extractor;
 * this only needs the shape, not the semantics.
 */
export function classifyExpression(expr: string): ExpressionShape {
  const lower = expr.toLowerCase();
  const words = lower.match(WORD_RE) ?? [];
  const fns = new Set<string>();
  let hasCast = false;
  let hasConditional = false;
  let hasUnion = /\bunion\b/.test(lower);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // Function call if followed by `(` — crude but enough for shape.
    const rest = lower.slice(lower.indexOf(w, i === 0 ? 0 : lower.indexOf(words[i - 1]) + words[i - 1].length));
    const isFn = /^\s*\(/.test(rest.slice(w.length));
    if (AGGREGATE_FNS.has(w) && isFn) fns.add(w);
    if (CAST_WORDS.has(w) && isFn) hasCast = true;
    if (CONDITIONAL_WORDS.has(w)) hasConditional = true;
  }
  let transform: TransformKind;
  if (hasUnion) transform = TransformKind.UNION;
  else if (hasCast) transform = TransformKind.CAST;
  else if (fns.size > 0) transform = TransformKind.AGGREGATE;
  else if (hasConditional || /\bcase\b/.test(lower)) transform = TransformKind.CONDITIONAL;
  else transform = TransformKind.DIRECT;

  // For CONDITIONAL: split out the WHEN/THEN/ELSE branches to record
  // which refs appear in which branch.
  const branches: { label: string; refs: string[] }[] = [];
  if (transform === TransformKind.CONDITIONAL && /\bcase\b/.test(lower)) {
    const whenRe = /when\s+(.+?)\s+then\s+(.+?)(?=\s+when|\s+else|\s+end|$)/gs;
    let m: RegExpExecArray | null;
    while ((m = whenRe.exec(lower)) !== null) {
      const condRefs = extractColumnRefs(m[1]).map((r) => r.name);
      const valRefs = extractColumnRefs(m[2]).map((r) => r.name);
      branches.push({ label: 'when-cond', refs: condRefs });
      branches.push({ label: 'when-value', refs: valRefs });
    }
    const elseRe = /else\s+(.+?)\s+end/s;
    const em = elseRe.exec(lower);
    if (em !== null) {
      branches.push({ label: 'else', refs: extractColumnRefs(em[1]).map((r) => r.name) });
    }
  }
  return { transform, branches, aggregateFns: [...fns] };
}

/**
 * ColumnPropagator — expression-aware column lineage.
 *
 * Resolves each select-item's refs against the graph's column nodes,
 * classifies the transform, and emits typed edges. Unresolvable refs
 * are reported (a strict caller can reject the capture).
 */
export class ColumnPropagator {
  private readonly _g: LineageGraph;

  constructor(graph: LineageGraph) {
    this._g = graph;
  }

  /**
   * Propagate one select item: `expression AS targetColumn` on
   * `targetDataset`. `sourceDatasets` hints the resolver when refs
   * are unqualified.
   */
  propagate(
    targetDataset: NodeId,
    targetColumn: string,
    expression: string,
    sourceDatasets: readonly NodeId[]
  ): ColumnPropagationResult {
    const shape = classifyExpression(expression);
    const refs = extractColumnRefs(expression);
    const warnings: string[] = [];
    const unresolved: string[] = [];
    const edges: ColumnLineageEdge[] = [];
    const targetColId = `${targetDataset}.${targetColumn}`;

    if (refs.length === 0) {
      warnings.push(`no column refs found in expression '${expression}'`);
    }

    for (const ref of refs) {
      const resolved = this._resolve(ref.name, ref.qualifier, sourceDatasets);
      if (resolved === null) {
        unresolved.push(ref.name);
      }
      edges.push({
        to: targetColId,
        fromRef: ref.name,
        resolvedFrom: resolved,
        transform: shape.transform,
        expression,
        branch: this._branchFor(ref.name, shape),
      });
    }

    return {
      targetDataset,
      targetColumn,
      expression,
      transform: shape.transform,
      edges,
      unresolved,
      warnings,
    };
  }

  /**
   * Propagate a whole SELECT list — convenience for the common
   * `INSERT INTO t SELECT a, f(b) AS c, SUM(d) AS total FROM ...` case.
   * `selectItems` = (outputColumn, expression) pairs; a bare column
   * uses itself as the expression (direct passthrough).
   */
  propagateSelect(
    targetDataset: NodeId,
    selectItems: ReadonlyArray<{ output: string; expr?: string }>,
    sourceDatasets: readonly NodeId[]
  ): ColumnPropagationResult[] {
    return selectItems.map((item) =>
      this.propagate(targetDataset, item.output, item.expr ?? item.output, sourceDatasets)
    );
  }

  /**
   * Apply the propagation to the graph — adds `derives` edges with
   * transform metadata so downstream consumers can filter.
   */
  apply(results: readonly ColumnPropagationResult[], jobId?: NodeId): void {
    for (const r of results) {
      const targetColId = `${r.targetDataset}.${r.targetColumn}`;
      // Ensure the target column node exists.
      if (this._g.node(targetColId) === undefined) {
        this._g.addColumn(r.targetDataset, r.targetColumn);
      }
      for (const e of r.edges) {
        if (e.resolvedFrom === null) continue;
        if (this._g.node(e.resolvedFrom) === undefined) continue;
        this._g.addEdge({
          from: e.resolvedFrom,
          to: targetColId,
          kind: 'derives',
          expression: e.expression,
          metadata: {
            transform: e.transform,
            branch: e.branch ?? '',
            job: jobId ?? '',
          },
        });
      }
    }
  }

  /**
   * Find which refs appear in which conditional branch — for auditing
   * "this PII column only flows through the ELSE branch".
   */
  branchOf(refName: string, shape: ExpressionShape): string | null {
    for (const b of shape.branches) {
      if (b.refs.includes(refName)) return b.label;
    }
    return null;
  }

  /* ----- internals ------------------------------------------------------- */

  private _branchFor(refName: string, shape: ExpressionShape): string | undefined {
    const b = this.branchOf(refName, shape);
    return b ?? undefined;
  }

  /**
   * Resolve a column ref to a graph node id. Mirrors the base engine's
   * resolution: prefer qualifier-matched columns, then dataset-scoped,
   * then unambiguous tail-name matches.
   */
  private _resolve(refName: string, qualifier: string | undefined, sourceDatasets: readonly NodeId[]): NodeId | null {
    const tail = refName.includes('.') ? refName.slice(refName.lastIndexOf('.') + 1) : refName;
    const nodes = this._g.toJSON().nodes.filter((n) => n.kind === 'column');
    // 1. Fully qualified: exact node id match.
    if (qualifier !== undefined) {
      const exact = nodes.find((n) => n.id === `${qualifier}.${tail}`);
      if (exact !== undefined) return exact.id;
      // Qualifier could itself be a partially-qualified dataset id.
      const suffix = `.${qualifier}.${tail}`;
      const m = nodes.filter((n) => n.id.endsWith(suffix));
      if (m.length > 0) return m[0].id;
    }
    // 2. Match against the hinted source datasets.
    for (const ds of sourceDatasets) {
      const id = `${ds}.${tail}`;
      if (nodes.some((n) => n.id === id)) return id;
    }
    // 3. Tail-name match across the graph (unambiguous only).
    const tailMatches = nodes.filter((n) => n.id.endsWith(`.${tail}`) || n.id === tail);
    if (tailMatches.length === 1) return tailMatches[0].id;
    return null;
  }
}
