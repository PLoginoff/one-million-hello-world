/**
 * SQL lineage extractor tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LineageGraph } from '../engine/LineageGraphEngine';
import { SqlLineageExtractor, parseSelect } from '../engine/SqlLineageExtractor';

describe('parseSelect', () => {
  it('parses a simple SELECT', () => {
    const p = parseSelect('SELECT a, b AS bee FROM t');
    expect(p.columns.length).toBe(2);
    expect(p.columns[0].name).toBe('a');
    expect(p.columns[1].name).toBe('bee');
    expect(p.sources[0].dataset).toBe('t');
  });

  it('captures aliases in FROM', () => {
    const p = parseSelect('SELECT o.id FROM orders o JOIN customers c ON o.cid = c.id');
    expect(p.sources.length).toBe(2);
    expect(p.sources[0].alias).toBe('o');
    expect(p.sources[1].dataset).toBe('customers');
  });

  it('INSERT INTO target', () => {
    const p = parseSelect('INSERT INTO out_t SELECT x FROM in_t');
    expect(p.target).toBe('out_t');
  });

  it('CTAS target', () => {
    const p = parseSelect('CREATE TABLE mart.x AS SELECT a FROM src.y');
    expect(p.target).toBe('mart.x');
    expect(p.sources[0].dataset).toBe('src.y');
  });

  it('CTE captured', () => {
    const p = parseSelect('WITH tmp AS (SELECT a FROM t) SELECT a FROM tmp');
    expect(p.ctes.has('tmp')).toBe(true);
  });

  it('subquery in FROM captured', () => {
    const p = parseSelect('SELECT s.a FROM (SELECT a FROM t) s');
    expect(p.subqueries.size).toBe(1);
  });
});

describe('SqlLineageExtractor', () => {
  let g: LineageGraph;
  let x: SqlLineageExtractor;

  beforeEach(() => {
    g = new LineageGraph();
    x = new SqlLineageExtractor(g);
  });

  it('INSERT INTO produces table-level edges', () => {
    const r = x.extract('INSERT INTO mart.daily SELECT * FROM raw.events');
    expect(r.reads).toContain('raw.events');
    expect(r.writes).toContain('mart.daily');
    expect(g.outEdges('raw.events')[0].kind).toBe('reads');
    expect(g.inEdges('mart.daily')[0].kind).toBe('writes');
  });

  it('multi-source join wires all reads', () => {
    const r = x.extract('INSERT INTO j SELECT o.id, c.name FROM orders o JOIN customers c ON o.cid = c.id');
    expect(r.reads.sort()).toEqual(['customers', 'orders']);
  });

  it('column lineage resolves qualified refs through aliases', () => {
    const r = x.extract('INSERT INTO stg SELECT o.total AS tot FROM orders o');
    expect(r.unresolved.length).toBe(0);
    // orders.total → stg.tot derive edge
    const derives = g.edges().filter((e) => e.kind === 'derives');
    expect(derives.some((e) => e.from === 'orders.total' && e.to === 'stg.tot')).toBe(true);
  });

  it('CTE chains lineage through derived dataset', () => {
    const r = x.extract('WITH clean AS (SELECT id FROM raw.t) INSERT INTO out_t SELECT id FROM clean');
    expect(g.node('cte.clean')).toBeDefined();
    // raw.t feeds cte job feeds cte.clean feeds main job feeds out_t
    expect(g.downstream('raw.t')).toContain('out_t');
    void r;
  });

  it('expression columns keep expression on edge', () => {
    x.extract('INSERT INTO stg SELECT a * 2 + b AS calc FROM t');
    const derives = g.edges().filter((e) => e.kind === 'derives' && e.to === 'stg.calc');
    expect(derives.length).toBeGreaterThan(0);
    expect(derives[0].expression).toContain('*');
  });
});
