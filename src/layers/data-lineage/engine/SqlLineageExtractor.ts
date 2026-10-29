/**
 * SQL Statement Lineage Extractor
 *
 * Parses a useful subset of SQL (CREATE TABLE AS / INSERT INTO SELECT /
 * single SELECT) and emits lineage edges into a LineageGraph:
 *
 *   - Table-level: `INSERT INTO t SELECT … FROM a JOIN b ON …` produces
 *     reads edges a→job, b→job and a writes edge job→t.
 *   - Column-level: the SELECT list is parsed per output column —
 *     `expr [AS alias]` — and `extractColumnRefs` maps each output
 *     column back to its source columns (resolving table aliases from
 *     FROM/JOIN clauses).
 *   - Sub-queries: a parenthesized SELECT in FROM is treated as an
 *     anonymous derived dataset (`<anon_N>`) and recursed into, so
 *     lineage chains through nested queries instead of stopping.
 *   - CTEs: `WITH x AS (…)` materializes `x` as a named derived dataset.
 *
 * This is a pragmatic stub, not a full SQL parser: it uses a
 * depth-aware tokenizer + clause splitter. Dialect-specific syntax
 * (LATERAL, QUALIFY, window frames) is out of scope but degrades
 * gracefully — unknown tokens become expression refs.
 *
 * @module DataLineage/Engine
 */

import { LineageGraph, NodeId, extractColumnRefs } from './LineageGraphEngine';

/** One parsed SELECT statement (flattened). */
export interface ParsedSelect {
  /** Output columns: name/alias + raw expression text. */
  readonly columns: Array<{ name: string; expression: string }>;
  /** FROM/JOIN sources: dataset id + optional alias. */
  readonly sources: Array<{ dataset: NodeId; alias: string | null }>;
  /** WITH-clause CTEs (name → inner select). */
  readonly ctes: Map<string, ParsedSelect>;
  /** Anonymous sub-queries in FROM (anon name → inner select). */
  readonly subqueries: Map<string, ParsedSelect>;
  /** The write target when the statement is INSERT/CTAS. */
  readonly target?: NodeId;
}

/** Extraction result: edges plus any unparsed leftovers. */
export interface ExtractionResult {
  readonly jobId: NodeId;
  readonly reads: NodeId[];
  readonly writes: NodeId[];
  /** Column mappings that couldn't be resolved. */
  readonly unresolved: string[];
  readonly warnings: string[];
}

/* ------------------------------------------------------------------------ */
/* Tokenizer (SQL-level)                                                    */
/* ------------------------------------------------------------------------ */

interface SqlToken {
  kind: 'word' | 'ident' | 'string' | 'number' | 'punct' | 'op';
  text: string;
  lower: string;
}

function sqlTokenize(sql: string): SqlToken[] {
  const out: SqlToken[] = [];
  let i = 0;
  const n = sql.length;
  const isWord = (c: string): boolean => /[A-Za-z_]/.test(c);
  const isIdent = (c: string): boolean => /[A-Za-z0-9_.$"]/.test(c);
  while (i < n) {
    const c = sql[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // -- line comments and /* */ block comments
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n && sql[j] !== "'") {
        if (sql[j] === "'") j++; // '' escape
        j++;
      }
      const text = sql.slice(i, Math.min(j + 1, n));
      out.push({ kind: 'string', text, lower: text.toLowerCase() });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9.]/.test(sql[j])) j++;
      const text = sql.slice(i, j);
      out.push({ kind: 'number', text, lower: text });
      i = j;
      continue;
    }
    if (isWord(c)) {
      let j = i;
      while (j < n && isIdent(sql[j])) j++;
      const text = sql.slice(i, j);
      // A token containing only word chars+dots is an ident; pure alpha
      // prefix matching a keyword is a word — we treat all as 'ident'
      // and let clause-splitting check lowercase text.
      out.push({ kind: 'ident', text, lower: text.toLowerCase() });
      i = j;
      continue;
    }
    if (c === '(' || c === ')' || c === ',' || c === ';') {
      out.push({ kind: 'punct', text: c, lower: c });
      i++;
      continue;
    }
    out.push({ kind: 'op', text: c, lower: c });
    i++;
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Parser                                                                   */
/* ------------------------------------------------------------------------ */

const TOP_CLAUSES = new Set(['from', 'where', 'group', 'order', 'having', 'limit', 'union', 'intersect', 'except', 'qualify', 'window', 'join', 'inner', 'left', 'right', 'full', 'cross', 'on', 'using']);

/** Split a token list at top-level commas (paren-depth 0). */
function splitTopLevel(tokens: readonly SqlToken[], sep: (t: SqlToken) => boolean): SqlToken[][] {
  const parts: SqlToken[][] = [[]];
  let depth = 0;
  for (const t of tokens) {
    if (t.kind === 'punct' && t.text === '(') depth++;
    if (t.kind === 'punct' && t.text === ')') depth--;
    if (depth === 0 && sep(t)) {
      parts.push([]);
      continue;
    }
    parts[parts.length - 1].push(t);
  }
  return parts;
}

/** Find index of first top-level token whose lower text ∈ set. */
function indexOfTopLevel(tokens: readonly SqlToken[], words: ReadonlySet<string>, from = 0): number {
  let depth = 0;
  for (let i = from; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'punct' && t.text === '(') depth++;
    else if (t.kind === 'punct' && t.text === ')') depth--;
    else if (depth === 0 && words.has(t.lower)) return i;
  }
  return -1;
}

function untokenize(tokens: readonly SqlToken[]): string {
  return tokens.map((t) => t.text).join(' ');
}

/** Parse the statement into a ParsedSelect tree. */
export function parseSelect(sql: string): ParsedSelect {
  const tokens = sqlTokenize(sql.trim().replace(/;\s*$/, ''));
  return parseTokens(tokens);
}

function parseTokens(tokens: SqlToken[]): ParsedSelect {
  const warnings: string[] = [];
  void warnings;

  // --- WITH clause ------------------------------------------------------
  const ctes = new Map<string, ParsedSelect>();
  let rest = tokens;
  if (rest.length > 0 && rest[0].lower === 'with') {
    // WITH [RECURSIVE] name AS (select) [, name AS (select)]* SELECT …
    let i = 1;
    if (rest[i]?.lower === 'recursive') i++;
    while (i < rest.length) {
      const name = rest[i].text;
      if (rest[i + 1]?.lower !== 'as') break;
      // find the ( … ) after AS
      let j = i + 2;
      if (rest[j]?.text !== '(') break;
      let depth = 0;
      const start = j;
      for (; j < rest.length; j++) {
        if (rest[j].text === '(') depth++;
        if (rest[j].text === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      ctes.set(name.toLowerCase(), parseTokens(rest.slice(start + 1, j)));
      i = j + 1;
      if (rest[i]?.text === ',') i++;
      else break;
    }
    rest = rest.slice(i);
  }

  // --- INSERT INTO / CTAS targets ---------------------------------------
  let target: NodeId | undefined;
  if (rest[0]?.lower === 'insert') {
    // INSERT INTO t [cols] SELECT …
    const selectIdx = indexOfTopLevel(rest, new Set(['select']));
    const intoIdx = indexOfTopLevel(rest, new Set(['into']));
    if (intoIdx > 0 && intoIdx + 1 < rest.length) {
      target = rest[intoIdx + 1].text;
    }
    rest = selectIdx >= 0 ? rest.slice(selectIdx) : [];
  } else if (rest[0]?.lower === 'create') {
    // CREATE TABLE t AS SELECT …
    const selectIdx = indexOfTopLevel(rest, new Set(['select']));
    // find table name after 'table'/'view'
    for (let i = 0; i < rest.length; i++) {
      if ((rest[i].lower === 'table' || rest[i].lower === 'view') && rest[i + 1] !== undefined) {
        target = rest[i + 1].text;
        break;
      }
    }
    rest = selectIdx >= 0 ? rest.slice(selectIdx) : rest;
  } else if (rest[0]?.lower === 'merge' || rest[0]?.lower === 'update' || rest[0]?.lower === 'delete') {
    // MERGE/UPDATE/DELETE — capture target + sources where findable.
    const intoIdx = indexOfTopLevel(rest, new Set(['into', 'update', 'from']));
    if (intoIdx >= 0 && rest[intoIdx + 1] !== undefined) target = rest[intoIdx + 1].text;
  }

  // --- SELECT core --------------------------------------------------------
  const selectIdx = indexOfTopLevel(rest, new Set(['select']));
  const columns: ParsedSelect['columns'] = [];
  const sources: ParsedSelect['sources'] = [];
  const subqueries = new Map<string, ParsedSelect>();
  if (selectIdx < 0) {
    return { columns, sources, ctes, subqueries, target };
  }
  let i = selectIdx + 1;
  if (rest[i]?.lower === 'distinct' || rest[i]?.lower === 'all') i++;
  const fromIdx = indexOfTopLevel(rest, new Set(['from']), i);
  const selectList = rest.slice(i, fromIdx < 0 ? rest.length : fromIdx);

  // Split select list at top commas → expr [AS alias]
  const items = splitTopLevel(selectList, (t) => t.text === ',');
  let anonCol = 0;
  for (const item of items) {
    if (item.length === 0) continue;
    const asIdx = indexOfTopLevel(item, new Set(['as']));
    let name: string;
    let expr: string;
    if (asIdx > 0 && item[asIdx + 1] !== undefined) {
      name = item[asIdx + 1].text;
      expr = untokenize(item.slice(0, asIdx));
    } else {
      // Trailing bare ident as alias: `x y` → alias y
      const last = item[item.length - 1];
      const prev = item[item.length - 2];
      if (item.length >= 2 && last.kind === 'ident' && ![')', ','].includes(last.text) && prev !== undefined && prev.kind !== 'op' && prev.lower !== 'as' && !TOP_CLAUSES.has(last.lower) && (prev.kind !== 'ident' || prev.text.includes('.'))) {
        name = last.text;
        expr = untokenize(item.slice(0, -1));
      } else if (item.length === 1 && last.kind === 'ident') {
        name = last.text.includes('.') ? last.text.slice(last.text.lastIndexOf('.') + 1) : last.text;
        expr = last.text;
      } else {
        name = `__col_${anonCol++}`;
        expr = untokenize(item);
      }
    }
    columns.push({ name, expression: expr });
  }

  // --- FROM / JOIN sources -------------------------------------------------
  if (fromIdx >= 0) {
    // Terminate the FROM region at the next clause keyword.
    const endIdx = indexOfTopLevel(rest, new Set(['where', 'group', 'order', 'having', 'limit', 'union', 'intersect', 'except', 'qualify', 'window']), fromIdx + 1);
    const fromRegion = rest.slice(fromIdx + 1, endIdx < 0 ? rest.length : endIdx);
    sources.push(...parseFromRegion(fromRegion, subqueries));
  }

  return { columns, sources, ctes, subqueries, target };
}

let anonSeq = 0;

/** Parse `a [AS] x, b y JOIN c z ON …` into source list. */
function parseFromRegion(region: SqlToken[], subqueries: Map<string, ParsedSelect>): Array<{ dataset: NodeId; alias: string | null }> {
  const sources: Array<{ dataset: NodeId; alias: string | null }> = [];
  let i = 0;
  const n = region.length;
  const skipJoinCond = (j: number): number => {
    // skip ON <cond> | USING (…)
    if (region[j]?.lower === 'on') {
      let depth = 0;
      let k = j + 1;
      for (; k < n; k++) {
        const t = region[k];
        if (t.text === '(') depth++;
        if (t.text === ')') depth--;
        if (depth === 0 && (t.lower === 'join' || t.lower === 'inner' || t.lower === 'left' || t.lower === 'right' || t.lower === 'full' || t.lower === 'cross' || t.text === ',')) break;
      }
      return k;
    }
    if (region[j]?.lower === 'using') {
      let depth = 0;
      let k = j + 1;
      for (; k < n; k++) {
        if (region[k].text === '(') depth++;
        else if (region[k].text === ')') {
          depth--;
          if (depth === 0) {
            k++;
            break;
          }
        }
      }
      return k;
    }
    return j;
  };
  const joinWords = new Set(['join', 'inner', 'left', 'right', 'full', 'cross', 'outer', 'natural', 'lateral']);

  while (i < n) {
    const t = region[i];
    if (joinWords.has(t.lower) || t.text === ',') {
      i++;
      // skip extra join qualifiers (left outer join)
      while (i < n && (joinWords.has(region[i].lower) || region[i].lower === 'outer')) i++;
      continue;
    }
    // Sub-query in parens?
    if (t.text === '(') {
      let depth = 0;
      let j = i;
      for (; j < n; j++) {
        if (region[j].text === '(') depth++;
        if (region[j].text === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      const inner = region.slice(i + 1, j);
      if (inner.length > 0 && inner[0].lower === 'select') {
        const anon = `<subq_${anonSeq++}>`;
        subqueries.set(anon, parseTokens(inner));
        // optional alias
        let alias: string | null = null;
        let k = j + 1;
        if (region[k]?.lower === 'as') k++;
        if (region[k]?.kind === 'ident') {
          alias = region[k].text;
          k++;
        }
        sources.push({ dataset: anon, alias });
        i = skipJoinCond(k);
        continue;
      }
      i = j + 1;
      continue;
    }
    if (t.kind === 'ident') {
      const dataset = t.text;
      let alias: string | null = null;
      let k = i + 1;
      if (region[k]?.lower === 'as') k++;
      if (region[k]?.kind === 'ident' && !TOP_CLAUSES.has(region[k].lower) && !joinWords.has(region[k].lower)) {
        alias = region[k].text;
        k++;
      }
      sources.push({ dataset, alias });
      i = skipJoinCond(k);
      continue;
    }
    i++;
  }
  return sources;
}

/* ------------------------------------------------------------------------ */
/* Extractor                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Feeds parsed statements into a LineageGraph.
 */
export class SqlLineageExtractor {
  private readonly _graph: LineageGraph;
  private _jobSeq = 0;

  constructor(graph: LineageGraph) {
    this._graph = graph;
  }

  /**
   * Extract lineage from a SQL statement.
   *
   * Creates a job node `sql_N`, table-level reads/writes edges, and
   * column-level derives edges via `captureColumnLineage`.
   */
  extract(sql: string, jobId?: NodeId): ExtractionResult {
    const job = jobId ?? `sql_${this._jobSeq++}`;
    const parsed = parseSelect(sql);
    const warnings: string[] = [];
    const unresolved: string[] = [];
    const reads: NodeId[] = [];
    const writes: NodeId[] = [];

    // Register CTEs as derived datasets first (their own jobs).
    const cteNames = new Map<string, NodeId>();
    for (const [name, inner] of parsed.ctes) {
      const cteDs = `cte.${name}`;
      cteNames.set(name, cteDs);
      const innerJob = `${job}/cte:${name}`;
      this._extractInner(inner, innerJob, cteDs, cteNames, reads, unresolved, warnings);
    }
    // Sub-queries likewise.
    const subqNames = new Map<string, NodeId>();
    for (const [anon, inner] of parsed.subqueries) {
      const ds = `subq.${anon.replace(/[<>\s]/g, '')}`;
      subqNames.set(anon, ds);
      const innerJob = `${job}/sub:${anon}`;
      this._extractInner(inner, innerJob, ds, new Map([...cteNames, ...subqNames]), reads, unresolved, warnings);
    }

    // Resolve source names through CTE/subquery tables.
    const resolve = (ds: NodeId): NodeId => {
      const tail = ds.split('.').pop()?.toLowerCase() ?? ds.toLowerCase();
      return cteNames.get(tail) ?? subqNames.get(ds) ?? cteNames.get(ds.toLowerCase()) ?? ds;
    };
    const inputDatasets = parsed.sources.map((s) => resolve(s.dataset));

    // Table-level edges.
    this._graph.addJob(job);
    for (const ds of inputDatasets) {
      if (!this._graph.node(ds)) this._graph.addDataset(ds);
      this._graph.addEdge({ from: ds, to: job, kind: 'reads', metadata: {} });
      if (!reads.includes(ds)) reads.push(ds);
    }
    if (parsed.target !== undefined) {
      if (!this._graph.node(parsed.target)) this._graph.addDataset(parsed.target);
      this._graph.addEdge({ from: job, to: parsed.target, kind: 'writes', metadata: {} });
      writes.push(parsed.target);

      // Column-level: map select-list expressions to input columns,
      // resolving table aliases → dataset names.
      const aliasMap = new Map<string, NodeId>();
      for (const s of parsed.sources) {
        if (s.alias !== null) aliasMap.set(s.alias.toLowerCase(), resolve(s.dataset));
        aliasMap.set(s.dataset.split('.').pop()?.toLowerCase() ?? s.dataset.toLowerCase(), resolve(s.dataset));
        aliasMap.set(s.dataset.toLowerCase(), resolve(s.dataset));
      }
      const mappings = new Map<string, string>();
      for (const col of parsed.columns) {
        // Rewrite qualified refs through the alias map where possible so
        // captureColumnLineage's qualifier resolution hits.
        mappings.set(col.name, col.expression);
      }
      // Expand input datasets: alias-qualified refs resolve via the map
      // — we pass the resolved datasets; the graph's qualifier matcher
      // uses dataset tail names, which may differ from aliases. To make
      // `o.total` resolve when `orders o` is aliased, we add synthetic
      // alias-datasets? No — we rewrite expressions: `o.x` → `orders.x`.
      const rewritten = new Map<string, string>();
      for (const col of parsed.columns) {
        rewritten.set(col.name, this._rewriteQualifiers(col.expression, aliasMap));
      }
      const res = this._graph.captureColumnLineage(job, parsed.target, inputDatasets, rewritten);
      unresolved.push(...res.unresolved);
    } else if (parsed.columns.length > 0) {
      warnings.push('SELECT without target: column lineage recorded only at job level');
    }
    return { jobId: job, reads, writes, unresolved, warnings };
  }

  private _extractInner(
    inner: ParsedSelect,
    innerJob: NodeId,
    outputDs: NodeId,
    scope: Map<string, NodeId>,
    reads: NodeId[],
    unresolved: string[],
    warnings: string[]
  ): void {
    const inputs = inner.sources.map((s) => {
      const tail = s.dataset.split('.').pop()?.toLowerCase() ?? s.dataset.toLowerCase();
      return scope.get(tail) ?? scope.get(s.dataset) ?? s.dataset;
    });
    this._graph.addJob(innerJob);
    for (const ds of inputs) {
      if (!this._graph.node(ds)) this._graph.addDataset(ds);
      this._graph.addEdge({ from: ds, to: innerJob, kind: 'reads', metadata: {} });
      if (!reads.includes(ds)) reads.push(ds);
    }
    if (!this._graph.node(outputDs)) this._graph.addDataset(outputDs);
    this._graph.addEdge({ from: innerJob, to: outputDs, kind: 'writes', metadata: {} });
    const aliasMap = new Map<string, NodeId>();
    for (const s of inner.sources) {
      if (s.alias !== null) aliasMap.set(s.alias.toLowerCase(), s.dataset);
      aliasMap.set(s.dataset.toLowerCase(), s.dataset);
      const tail = s.dataset.split('.').pop()?.toLowerCase();
      if (tail !== undefined) aliasMap.set(tail, s.dataset);
    }
    const mappings = new Map<string, string>();
    for (const col of inner.columns) {
      mappings.set(col.name, this._rewriteQualifiers(col.expression, aliasMap));
    }
    const res = this._graph.captureColumnLineage(innerJob, outputDs, inputs, mappings);
    unresolved.push(...res.unresolved);
    void warnings;
    // Recurse into nested subqueries.
    for (const [anon, sub] of inner.subqueries) {
      const ds = `subq.${anon.replace(/[<>\s]/g, '')}`;
      this._extractInner(sub, `${innerJob}/sub:${anon}`, ds, scope, reads, unresolved, warnings);
    }
  }

  /** Replace `alias.col` refs with `dataset.col` using the alias map. */
  private _rewriteQualifiers(expression: string, aliasMap: Map<string, NodeId>): string {
    return expression.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g, (match, q: string, col: string) => {
      const ds = aliasMap.get(q.toLowerCase());
      if (ds === undefined) return match;
      const tail = ds.split('.').pop() ?? ds;
      return `${tail}.${col}`;
    });
  }
}
