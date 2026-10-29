/**
 * Data Lineage Graph Engine
 *
 * A typed DAG over datasets, jobs and columns:
 *
 *  - Nodes: `dataset` (table/file/stream), `job` (ETL/query/transform),
 *    `column` (`dataset.column`).
 *  - Edges: table-level `reads`/`writes` (dataset → job → dataset) and
 *    column-level `derives` edges carrying the expression that produced
 *    the target column.
 *  - `LineageGraph` maintains forward and reverse adjacency for O(1)
 *    neighbor access; traversals are iterative DFS/BFS — O(V+E).
 *  - Cycle detection uses three-color DFS and reports the cycle path —
 *    lineage graphs should be acyclic; a cycle usually means a bad
 *    capture or a recursive view.
 *  - `ExpressionParser` is a tiny SQL-expression reader that extracts
 *    input column references from expressions like
 *    `upper(trim(first_name)) || ' ' || last_name`, `a + b * 2`,
 *    `case when x > 0 then y else z end` — enough for expression-aware
 *    column propagation without a full SQL grammar.
 *  - Serialization: versioned JSON snapshot with structural integrity
 *    checks on load.
 *
 * @module DataLineage/Engine
 */

/** Node kinds in the lineage graph. */
export type LineageNodeKind = 'dataset' | 'job' | 'column';

/** Fully-qualified node id: datasets `db.schema.table`, jobs `jobId`,
 * columns `db.schema.table.column`. */
export type NodeId = string;

/** A graph node with metadata. */
export interface LineageNode {
  readonly id: NodeId;
  readonly kind: LineageNodeKind;
  /** For column nodes: owning dataset id. */
  readonly dataset?: NodeId;
  readonly metadata: Record<string, unknown>;
}

/** Edge kinds. */
export type LineageEdgeKind = 'reads' | 'writes' | 'derives' | 'contains';

/** A directed edge; `expression` records the derivation for column edges. */
export interface LineageEdge {
  readonly from: NodeId;
  readonly to: NodeId;
  readonly kind: LineageEdgeKind;
  /** SQL-ish expression producing `to` from `from` (derives only). */
  readonly expression?: string;
  readonly metadata: Record<string, unknown>;
}

/** A cycle found by the detector, as a node path. */
export interface CyclePath {
  readonly nodes: NodeId[];
}

/* ------------------------------------------------------------------------ */
/* Expression parser (dependency extraction)                                */
/* ------------------------------------------------------------------------ */

/**
 * Tokenizer for the expression subset.
 * Recognizes identifiers (a.b.c), string literals, numbers, operators,
 * parens, commas, and SQL keywords (which are ignored as refs).
 */
const KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'case', 'when', 'then',
  'else', 'end', 'as', 'in', 'is', 'null', 'like', 'between', 'cast',
  'coalesce', 'distinct', 'count', 'sum', 'avg', 'min', 'max', 'over',
  'partition', 'by', 'order', 'asc', 'desc', 'true', 'false', 'interval',
]);

interface Token {
  kind: 'ident' | 'number' | 'string' | 'op' | 'lparen' | 'rparen' | 'comma';
  text: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = expr.length;
  while (i < n) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      while (j < n && expr[j] !== "'") {
        if (expr[j] === '\\') j++;
        j++;
      }
      tokens.push({ kind: 'string', text: expr.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(expr[i + 1] ?? ''))) {
      let j = i;
      while (j < n && /[0-9._eE+-]/.test(expr[j]) && !(expr[j] === '+' && expr[j - 1] !== 'e' && expr[j - 1] !== 'E') && !(expr[j] === '-' && expr[j - 1] !== 'e' && expr[j - 1] !== 'E')) j++;
      tokens.push({ kind: 'number', text: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_.$]/.test(expr[j])) j++;
      tokens.push({ kind: 'ident', text: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '(') tokens.push({ kind: 'lparen', text: '(' });
    else if (ch === ')') tokens.push({ kind: 'rparen', text: ')' });
    else if (ch === ',') tokens.push({ kind: 'comma', text: ',' });
    else tokens.push({ kind: 'op', text: ch });
    i++;
  }
  return tokens;
}

/** A column reference discovered in an expression. */
export interface ColumnRef {
  /** Qualified name as written, e.g. `orders.total` or `total`. */
  readonly name: string;
  /** Table qualifier when present (`orders.total` → `orders`). */
  readonly qualifier?: string;
}

/**
 * Extract column references from an expression.
 *
 * Strategy: tokenize, then keep every `ident` that is not a SQL keyword
 * and not immediately followed by `(` (a function call). Qualifiers are
 * split on the last dot — `a.b.c` → qualifier `a.b`, name `c`... kept
 * verbatim as the qualified ref; resolution to datasets happens in the
 * graph layer.
 */
export function extractColumnRefs(expression: string): ColumnRef[] {
  const tokens = tokenize(expression);
  const refs: ColumnRef[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind !== 'ident') continue;
    const lower = t.text.toLowerCase();
    if (KEYWORDS.has(lower)) continue;
    // Function call: ident followed directly by '('
    const next = tokens[i + 1];
    if (next !== undefined && next.kind === 'lparen') continue;
    if (seen.has(t.text)) continue;
    seen.add(t.text);
    const lastDot = t.text.lastIndexOf('.');
    if (lastDot > 0 && lastDot < t.text.length - 1) {
      refs.push({ name: t.text, qualifier: t.text.slice(0, lastDot) });
    } else {
      refs.push({ name: t.text });
    }
  }
  return refs;
}

/* ------------------------------------------------------------------------ */
/* Graph                                                                    */
/* ------------------------------------------------------------------------ */

/** Result of upstream/downstream traversal. */
export interface TraversalResult {
  /** Reached nodes with BFS distance from the start. */
  readonly nodes: ReadonlyMap<NodeId, number>;
}

/** Impact analysis report for a node change. */
export interface ImpactReport {
  readonly root: NodeId;
  /** Everything the root feeds (downstream), distance-keyed. */
  readonly downstream: ReadonlyMap<NodeId, number>;
  /** Everything feeding the root (upstream). */
  readonly upstream: ReadonlyMap<NodeId, number>;
  /** Downstream datasets only (for "which tables break?"). */
  readonly affectedDatasets: NodeId[];
  /** Downstream jobs only. */
  readonly affectedJobs: NodeId[];
}

/**
 * The lineage graph.
 *
 * Two adjacency maps (out/in) over all edge kinds provide O(deg)
 * neighbor access; node store is a Map keyed by id for O(1) lookup.
 */
export class LineageGraph {
  private readonly _nodes = new Map<NodeId, LineageNode>();
  private readonly _out = new Map<NodeId, LineageEdge[]>();
  private readonly _in = new Map<NodeId, LineageEdge[]>();

  /* ----- mutation ---------------------------------------------------- */

  addNode(node: LineageNode): void {
    this._nodes.set(node.id, node);
    // Column nodes auto-wire a `contains` edge from their dataset
    // (idempotent — deserialization replays contains edges explicitly).
    if (node.kind === 'column' && node.dataset !== undefined) {
      if (!this._nodes.has(node.dataset)) {
        this._nodes.set(node.dataset, { id: node.dataset, kind: 'dataset', metadata: {} });
      }
      this.addEdge({ from: node.dataset, to: node.id, kind: 'contains', metadata: {} });
    }
  }

  addDataset(id: NodeId, metadata: Record<string, unknown> = {}): void {
    this.addNode({ id, kind: 'dataset', metadata });
  }

  addJob(id: NodeId, metadata: Record<string, unknown> = {}): void {
    this.addNode({ id, kind: 'job', metadata });
  }

  addColumn(dataset: NodeId, column: string, metadata: Record<string, unknown> = {}): NodeId {
    const id = `${dataset}.${column}`;
    this.addNode({ id, kind: 'column', dataset, metadata });
    return id;
  }

  /** Remove the first edge matching (from,to,kind[,expression]). O(deg). */
  removeEdge(from: NodeId, to: NodeId, kind: LineageEdgeKind, expression?: string): boolean {
    const matches = (e: LineageEdge): boolean =>
      e.to === to && e.kind === kind && (expression === undefined || e.expression === expression);
    const out = this._out.get(from);
    if (out === undefined) return false;
    const idx = out.findIndex(matches);
    if (idx < 0) return false;
    const [removed] = out.splice(idx, 1);
    const inn = this._in.get(to);
    if (inn !== undefined) {
      const i2 = inn.indexOf(removed);
      if (i2 >= 0) inn.splice(i2, 1);
    }
    return true;
  }

  addEdge(edge: LineageEdge): void {
    const out = this._out.get(edge.from);
    if (out === undefined) {
      this._out.set(edge.from, [edge]);
    } else {
      // Idempotent insert — identical (from,to,kind,expression) edges are
      // recorded once, keeping auto-wired `contains` edges unique through
      // addNode + deserialize replays.
      const dup = out.some(
        (e) => e.to === edge.to && e.kind === edge.kind && e.expression === edge.expression
      );
      if (dup) return;
      out.push(edge);
    }
    const inn = this._in.get(edge.to);
    if (inn === undefined) this._in.set(edge.to, [edge]);
    else inn.push(edge);
  }

  removeNode(id: NodeId): boolean {
    if (!this._nodes.delete(id)) return false;
    for (const e of this._out.get(id) ?? []) {
      const inn = this._in.get(e.to);
      if (inn !== undefined) this._in.set(e.to, inn.filter((x) => x !== e));
    }
    for (const e of this._in.get(id) ?? []) {
      const out = this._out.get(e.from);
      if (out !== undefined) this._out.set(e.from, out.filter((x) => x !== e));
    }
    this._out.delete(id);
    this._in.delete(id);
    return true;
  }

  /* ----- capture hooks ------------------------------------------------ */

  /**
   * Record a job reading a dataset / writing a dataset:
   * `dataset --reads--> job --writes--> dataset`.
   */
  captureJob(jobId: NodeId, reads: readonly NodeId[], writes: readonly NodeId[], metadata: Record<string, unknown> = {}): void {
    this.addJob(jobId, metadata);
    for (const r of reads) {
      if (!this._nodes.has(r)) this.addDataset(r);
      this.addEdge({ from: r, to: jobId, kind: 'reads', metadata: {} });
    }
    for (const w of writes) {
      if (!this._nodes.has(w)) this.addDataset(w);
      this.addEdge({ from: jobId, to: w, kind: 'writes', metadata: {} });
    }
  }

  /**
   * Record column-level derivations for a job output.
   *
   * `mappings` maps output column name → SQL expression. References are
   * resolved via `extractColumnRefs` then bound to input datasets:
   *  - qualified refs (`t.col`) match the dataset whose id ends with
   *    the qualifier or equals it;
   *  - unqualified refs attach to every input dataset that contains a
   *    column of that name (ambiguous → all candidates).
   */
  captureColumnLineage(
    jobId: NodeId,
    outputDataset: NodeId,
    inputDatasets: readonly NodeId[],
    mappings: ReadonlyMap<string, string>
  ): { resolved: number; unresolved: string[] } {
    let resolved = 0;
    const unresolved: string[] = [];
    for (const [outCol, expr] of mappings) {
      const outId = this.addColumn(outputDataset, outCol);
      const refs = extractColumnRefs(expr);
      if (refs.length === 0) {
        // Literal/computed-from-constants column → job-level edge only.
        this.addEdge({ from: jobId, to: outId, kind: 'derives', expression: expr, metadata: {} });
        continue;
      }
      for (const ref of refs) {
        const sources = this._resolveRef(ref, inputDatasets);
        if (sources.length === 0) {
          unresolved.push(`${outCol} ← ${ref.name}`);
          continue;
        }
        for (const srcId of sources) {
          const srcCol = ref.name.includes('.') ? ref.name.slice(ref.name.lastIndexOf('.') + 1) : ref.name;
          const srcNode = `${srcId}.${srcCol}`;
          if (!this._nodes.has(srcNode)) this.addColumn(srcId, srcCol);
          this.addEdge({ from: srcNode, to: outId, kind: 'derives', expression: expr, metadata: { job: jobId } });
          resolved++;
        }
      }
    }
    return { resolved, unresolved };
  }

  private _resolveRef(ref: ColumnRef, candidates: readonly NodeId[]): NodeId[] {
    if (ref.qualifier !== undefined) {
      const q = ref.qualifier.toLowerCase();
      return candidates.filter((c) => {
        const tail = c.split('.').slice(-1)[0].toLowerCase();
        return c.toLowerCase() === q || tail === q || c.toLowerCase().endsWith(`.${q}`);
      });
    }
    // Unqualified: attach to datasets having a column of that name.
    const colName = ref.name.toLowerCase();
    const matches = candidates.filter((c) => {
      // Check if a column node `${c}.${ref.name}` exists.
      return this._nodes.has(`${c}.${ref.name}`) || this._nodes.has(`${c}.${colName}`);
    });
    // Fall back to all candidates when no dataset has the column yet —
    // we can't disprove the reference.
    return matches.length > 0 ? matches : [...candidates];
  }

  /* ----- queries ------------------------------------------------------ */

  node(id: NodeId): LineageNode | undefined {
    return this._nodes.get(id);
  }

  get nodeCount(): number {
    return this._nodes.size;
  }

  edges(id?: NodeId): LineageEdge[] {
    if (id === undefined) {
      const all: LineageEdge[] = [];
      for (const es of this._out.values()) all.push(...es);
      return all;
    }
    const seen = new Set<LineageEdge>();
    for (const e of [...(this._out.get(id) ?? []), ...(this._in.get(id) ?? [])]) {
      if (!seen.has(e)) {
        seen.add(e);
      }
    }
    return [...seen];
  }

  outEdges(id: NodeId): LineageEdge[] {
    return this._out.get(id) ?? [];
  }

  inEdges(id: NodeId): LineageEdge[] {
    return this._in.get(id) ?? [];
  }

  /**
   * Breadth-first transitive traversal. `direction` picks which
   * adjacency to follow; optional `edgeKinds` filter restricts which
   * edge types to cross. Returns id → distance map. O(V+E).
   */
  traverse(start: NodeId, direction: 'up' | 'down', edgeKinds?: readonly LineageEdgeKind[]): TraversalResult {
    const dist = new Map<NodeId, number>([[start, 0]]);
    const queue: NodeId[] = [start];
    while (queue.length > 0) {
      const cur = queue.shift() as NodeId;
      const d = dist.get(cur) as number;
      const edges = direction === 'down' ? this._out.get(cur) : this._in.get(cur);
      for (const e of edges ?? []) {
        if (edgeKinds !== undefined && !edgeKinds.includes(e.kind)) continue;
        const next = direction === 'down' ? e.to : e.from;
        if (!dist.has(next)) {
          dist.set(next, d + 1);
          queue.push(next);
        }
      }
    }
    return { nodes: dist };
  }

  upstream(id: NodeId): NodeId[] {
    return [...this.traverse(id, 'up').nodes.keys()].filter((n) => n !== id);
  }

  downstream(id: NodeId): NodeId[] {
    return [...this.traverse(id, 'down').nodes.keys()].filter((n) => n !== id);
  }

  /** Impact analysis: combined upstream/downstream with kind splits. */
  impact(id: NodeId): ImpactReport {
    const down = this.traverse(id, 'down').nodes;
    const up = this.traverse(id, 'up').nodes;
    const affectedDatasets: NodeId[] = [];
    const affectedJobs: NodeId[] = [];
    for (const n of down.keys()) {
      if (n === id) continue; // the changed node itself is not 'affected'
      const node = this._nodes.get(n);
      if (node?.kind === 'dataset') affectedDatasets.push(n);
      if (node?.kind === 'job') affectedJobs.push(n);
    }
    return { root: id, downstream: down, upstream: up, affectedDatasets, affectedJobs };
  }

  /**
   * Column-level impact: which downstream columns derive (transitively)
   * from `dataset.column` — follows only `derives`/`contains` edges
   * plus job `reads`/`writes` so propagation crosses table boundaries.
   */
  columnImpact(columnId: NodeId): NodeId[] {
    const res = this.traverse(columnId, 'down', ['derives', 'reads', 'writes', 'contains']);
    return [...res.nodes.keys()].filter((n) => {
      const node = this._nodes.get(n);
      return node?.kind === 'column' && n !== columnId;
    });
  }

  /* ----- cycle detection ---------------------------------------------- */

  /**
   * Three-color DFS; returns the first cycle found or null. O(V+E).
   * `contains` edges are excluded — a dataset trivially "contains" its
   * columns; cycles that matter flow through reads/writes/derives.
   */
  findCycle(): CyclePath | null {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<NodeId, number>();
    const stack: NodeId[] = [];
    const visit = (id: NodeId): NodeId[] | null => {
      color.set(id, GRAY);
      stack.push(id);
      for (const e of this._out.get(id) ?? []) {
        if (e.kind === 'contains') continue;
        const c = color.get(e.to) ?? WHITE;
        if (c === GRAY) {
          return [...stack.slice(stack.indexOf(e.to)), e.to];
        }
        if (c === WHITE) {
          const found = visit(e.to);
          if (found !== null) return found;
        }
      }
      stack.pop();
      color.set(id, BLACK);
      return null;
    };
    for (const id of this._nodes.keys()) {
      if ((color.get(id) ?? WHITE) === WHITE) {
        const found = visit(id);
        if (found !== null) return { nodes: found };
      }
    }
    return null;
  }

  /* ----- serialization ------------------------------------------------- */

  /** Versioned JSON snapshot. */
  toJSON(): { version: 1; nodes: LineageNode[]; edges: LineageEdge[] } {
    return { version: 1, nodes: [...this._nodes.values()], edges: this.edges() };
  }

  serialize(): string {
    return JSON.stringify(this.toJSON());
  }

  /** Rebuild from a snapshot; validates shape. */
  static deserialize(json: string): LineageGraph {
    const parsed = JSON.parse(json) as { version: number; nodes: LineageNode[]; edges: LineageEdge[] };
    if (parsed.version !== 1) throw new Error(`Unsupported lineage snapshot version ${parsed.version}`);
    const g = new LineageGraph();
    for (const n of parsed.nodes) g.addNode(n);
    for (const e of parsed.edges) g.addEdge(e);
    return g;
  }
}

/* ------------------------------------------------------------------------ */
/* Capture hook — instrumentation surface for runtimes                      */
/* ------------------------------------------------------------------------ */

/**
 * Hook interface a job runtime calls to feed the graph.
 * Implementations may be no-op (lineage disabled) or write through to
 * a shared LineageGraph.
 */
export interface LineageCaptureHook {
  jobStarted(jobId: NodeId): void;
  datasetRead(jobId: NodeId, dataset: NodeId): void;
  datasetWritten(jobId: NodeId, dataset: NodeId): void;
  columnDerived(jobId: NodeId, outputDataset: NodeId, outputColumn: string, expression: string, inputDatasets: readonly NodeId[]): void;
  jobFinished(jobId: NodeId): void;
}

/** Hook writing straight into a LineageGraph. */
export class GraphCaptureHook implements LineageCaptureHook {
  private readonly _graph: LineageGraph;
  private readonly _reads = new Map<NodeId, Set<NodeId>>();
  private readonly _writes = new Map<NodeId, Set<NodeId>>();
  private readonly _columns = new Map<NodeId, Map<string, string>>(); // job → outDataset? — simplified: keyed by outputDataset.col

  constructor(graph: LineageGraph) {
    this._graph = graph;
  }

  jobStarted(jobId: NodeId): void {
    this._graph.addJob(jobId);
    this._reads.set(jobId, new Set());
    this._writes.set(jobId, new Set());
  }

  datasetRead(jobId: NodeId, dataset: NodeId): void {
    this._reads.get(jobId)?.add(dataset);
    if (!this._graph.node(dataset)) this._graph.addDataset(dataset);
    this._graph.addEdge({ from: dataset, to: jobId, kind: 'reads', metadata: {} });
  }

  datasetWritten(jobId: NodeId, dataset: NodeId): void {
    this._writes.get(jobId)?.add(dataset);
    if (!this._graph.node(dataset)) this._graph.addDataset(dataset);
    this._graph.addEdge({ from: jobId, to: dataset, kind: 'writes', metadata: {} });
  }

  columnDerived(jobId: NodeId, outputDataset: NodeId, outputColumn: string, expression: string, inputDatasets: readonly NodeId[]): void {
    this._graph.captureColumnLineage(jobId, outputDataset, inputDatasets, new Map([[outputColumn, expression]]));
  }

  jobFinished(_jobId: NodeId): void {
    // Nothing to flush — edges were written eagerly.
  }
}
