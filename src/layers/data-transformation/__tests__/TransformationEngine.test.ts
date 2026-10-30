/**
 * TransformationEngine unit tests.
 *
 * Covers: declarative mapping DSL, nested paths, array flatten/unflatten,
 * strict/lenient coercion, validators, enrichment joins, group-by + fold
 * aggregation, batch error collection, and spec compilation/reuse.
 */

import { describe, it, expect } from 'bun:test';

import { MappingEngine } from '../engine/MappingEngine';
import { Coercer } from '../engine/Coercer';
import { Enricher } from '../engine/Enricher';
import { Aggregator } from '../engine/Aggregator';
import { BatchTransformer } from '../engine/BatchTransformer';
import { TransformationEngine } from '../engine/TransformationEngine';
import { parsePath, getPath, projectPath, setPath } from '../engine/Path';
import { allOf, inRange, lengthBetween, matches, oneOf } from '../engine/Validators';
import { applyTransforms, flattenDeep, uniqueByIdentity } from '../engine/Transforms';
import { MappingSpec } from '../engine/types';

// ---------------------------------------------------------------------------

describe('Path', () => {
  it('parses field, index, and iterate segments', () => {
    expect(parsePath('a.b.c')).toEqual([
      { kind: 'field', key: 'a' },
      { kind: 'field', key: 'b' },
      { kind: 'field', key: 'c' },
    ]);
    expect(parsePath('a[0].b')).toEqual([
      { kind: 'field', key: 'a' },
      { kind: 'index', index: 0 },
      { kind: 'field', key: 'b' },
    ]);
    expect(parsePath('items[].name')).toEqual([
      { kind: 'field', key: 'items' },
      { kind: 'iterate' },
      { kind: 'field', key: 'name' },
    ]);
  });

  it('getPath reads nested values and returns undefined on missing', () => {
    const obj = { a: { b: [{ c: 7 }] } };
    expect(getPath(obj, parsePath('a.b[0].c'))).toBe(7);
    expect(getPath(obj, parsePath('a.x.y'))).toBeUndefined();
    expect(getPath(obj, parsePath('a.b[5].c'))).toBeUndefined();
  });

  it('projectPath flattens iterated paths', () => {
    const obj = {
      orders: [{ lines: [{ sku: 'a' }, { sku: 'b' }] }, { lines: [{ sku: 'c' }] }],
    };
    expect(projectPath(obj, parsePath('orders[].lines[].sku'))).toEqual(['a', 'b', 'c']);
  });

  it('setPath writes scalars and appends on []', () => {
    const out: Record<string, unknown> = {};
    setPath(out, parsePath('a.b.c'), 1);
    expect(out).toEqual({ a: { b: { c: 1 } } });
    setPath(out, parsePath('list[]'), 'x');
    setPath(out, parsePath('list[]'), 'y');
    expect(out.list).toEqual(['x', 'y']);
    setPath(out, parsePath('nested[].field'), 'v1');
    setPath(out, parsePath('nested[].field'), 'v2');
    expect(out.nested).toEqual([{ field: 'v1' }, { field: 'v2' }]);
  });
});

// ---------------------------------------------------------------------------

describe('Coercer', () => {
  const strict = new Coercer('strict');
  const lenient = new Coercer('lenient');

  it('strict: numeric strings → number', () => {
    expect(strict.convert('42.5', 'number')).toBe(42.5);
    expect(strict.convert('-7', 'number')).toBe(-7);
  });

  it('strict: rejects trailing-junk numbers', () => {
    const r = strict.coerce('12x', 'number', 'f');
    expect(r.ok).toBe(false);
  });

  it('lenient: parses leading numeric run', () => {
    expect(lenient.convert('12x', 'number')).toBe(12);
    expect(lenient.convert('abc', 'number')).toBe(0);
  });

  it('strict vs lenient integer', () => {
    expect(strict.coerce(1.9, 'integer', 'r').ok).toBe(false);
    expect(lenient.convert(1.9, 'integer')).toBe(1);
    expect(strict.convert('7', 'integer')).toBe(7);
  });

  it('strict vs lenient boolean', () => {
    expect(strict.convert('true', 'boolean')).toBe(true);
    expect(strict.convert('0', 'boolean')).toBe(false);
    expect(strict.coerce('banana', 'boolean', 'r').ok).toBe(false);
    expect(lenient.convert('yes', 'boolean')).toBe(true);
    expect(lenient.convert('nope', 'boolean')).toBe(false);
  });

  it('ISO date coercion', () => {
    const d = strict.convert('2024-01-15T10:30:00Z', 'date') as Date;
    expect(d.toISOString()).toBe('2024-01-15T10:30:00.000Z');
    expect(strict.convert('2024-01-15', 'date')).toBeInstanceOf(Date);
    expect(strict.coerce('not a date', 'date', 'r').ok).toBe(false);
    // lenient falls back to epoch for garbage
    expect((lenient.convert('garbage!!!', 'date') as Date).getTime()).toBe(0);
  });

  it('iso-date produces canonical string', () => {
    expect(strict.convert(0, 'iso-date')).toBe('1970-01-01T00:00:00.000Z');
  });

  it('array coercion wraps in lenient, requires iterable in strict', () => {
    expect(lenient.convert(5, 'array')).toEqual([5]);
    expect(strict.coerce(5, 'array', 'r').ok).toBe(false);
    expect(strict.convert([1, 2], 'array')).toEqual([1, 2]);
  });

  it('null/undefined never coerce', () => {
    expect(strict.coerce(null, 'number', 'r').ok).toBe(false);
    expect(strict.coerce(undefined, 'string', 'r').ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('MappingEngine — basic DSL', () => {
  const engine = new MappingEngine({ coercionMode: 'strict' });

  const spec: MappingSpec = {
    rules: [
      { source: 'firstName', target: 'first_name', transform: 'trim' },
      { source: 'lastName', target: 'last_name' },
      { source: 'age', target: 'age_years', coerce: 'integer' },
      { target: 'version', value: 2 },
    ],
  };

  it('maps fields, applies transforms, coerces, writes constants', () => {
    const { output, errors } = engine.map(
      { firstName: '  Ada  ', lastName: 'Lovelace', age: '36' },
      spec
    );
    expect(errors).toEqual([]);
    expect(output).toEqual({
      first_name: 'Ada',
      last_name: 'Lovelace',
      age_years: 36,
      version: 2,
    });
  });

  it('skips missing optional fields', () => {
    const { output, errors } = engine.map({ firstName: 'x', age: '1' }, spec);
    expect(errors).toEqual([]);
    expect(output).toEqual({ first_name: 'x', age_years: 1, version: 2 });
  });

  it('reports required-field failures', () => {
    const req: MappingSpec = {
      rules: [{ source: 'id', target: 'id', required: true }],
    };
    const { errors } = engine.map({}, req);
    expect(errors.length).toBe(1);
    expect(errors[0].phase).toBe('required');
  });

  it('applies defaults when the source is absent', () => {
    const specWithDefault: MappingSpec = {
      rules: [{ source: 'role', target: 'role', default: 'viewer' }],
    };
    const { output } = engine.map({}, specWithDefault);
    expect(output.role).toBe('viewer');
  });

  it('compiles once and reuses the closure', () => {
    const compiled = engine.compile(spec);
    const a = compiled({ firstName: 'a', lastName: 'b', age: '1' });
    const b = compiled({ firstName: 'c', lastName: 'd', age: '2' });
    expect(a.output.first_name).toBe('a');
    expect(b.output.first_name).toBe('c');
  });
});

describe('MappingEngine — nested paths and arrays', () => {
  const engine = new MappingEngine();

  it('maps deeply nested source to differently-nested target', () => {
    const { output } = engine.map(
      { user: { contact: { email: 'a@b.c' } } },
      { rules: [{ source: 'user.contact.email', target: 'meta.email' }] }
    );
    expect(output).toEqual({ meta: { email: 'a@b.c' } });
  });

  it('flattens nested arrays via [] source → [] target', () => {
    const { output, errors } = engine.map(
      { orders: [{ lines: [{ sku: 'a' }, { sku: 'b' }] }, { lines: [{ sku: 'c' }] }] },
      { rules: [{ source: 'orders[].lines[].sku', target: 'skus[]' }] }
    );
    expect(errors).toEqual([]);
    expect(output).toEqual({ skus: ['a', 'b', 'c'] });
  });

  it('unflattens a flat array back into nested structure', () => {
    const { output } = engine.map(
      { skus: ['a', 'b', 'c'] },
      { rules: [{ source: 'skus[]', target: 'orders[].line.sku' }] }
    );
    expect(output).toEqual({
      orders: [{ line: { sku: 'a' } }, { line: { sku: 'b' } }, { line: { sku: 'c' } }],
    });
  });

  it('coerces iterate-source arrays element-wise', () => {
    const { output, errors } = engine.map(
      { tags: [{ weight: '1' }, { weight: '2' }] },
      { rules: [{ source: 'tags[].weight', target: 'weights[]', coerce: 'integer' }] }
    );
    expect(errors).toEqual([]);
    expect(output).toEqual({ weights: [1, 2] });
  });
});

describe('MappingEngine — validation', () => {
  const engine = new MappingEngine();

  it('named validators reject bad values', () => {
    const spec: MappingSpec = {
      rules: [{ source: 'age', target: 'age', validate: ['isNumber', 'positive'] }],
    };
    const { errors } = engine.map({ age: 'not a number' }, spec);
    expect(errors.length).toBe(1);
    expect(errors[0].phase).toBe('validate');
  });

  it('combinators express compound rules', () => {
    const spec: MappingSpec = {
      rules: [
        {
          source: 'username',
          target: 'username',
          validate: [allOf('isString', lengthBetween(3, 20), matches(/^[a-z_]+$/))],
        },
        { source: 'role', target: 'role', validate: [oneOf('admin', 'user', 'guest')] },
        { source: 'score', target: 'score', validate: [inRange(0, 100)] },
      ],
    };

    expect(engine.map({ username: 'ada_l', role: 'admin', score: 55 }, spec).errors).toEqual([]);
    expect(engine.map({ username: 'ADA!', role: 'admin', score: 55 }, spec).errors.length).toBe(1);
    expect(engine.map({ username: 'ada', role: 'superuser', score: 55 }, spec).errors.length).toBe(1);
    expect(engine.map({ username: 'ada', role: 'admin', score: 150 }, spec).errors.length).toBe(1);
  });

  it('custom function validators supply reasons', () => {
    const spec: MappingSpec = {
      rules: [
        {
          source: 'code',
          target: 'code',
          validate: [(v) => (typeof v === 'string' && v.startsWith('X-') ? true : 'must start with X-')],
        },
      ],
    };
    expect(engine.map({ code: 'X-1' }, spec).errors).toEqual([]);
    const { errors } = engine.map({ code: 'Y-1' }, spec);
    expect(errors[0].message).toBe('must start with X-');
  });
});

describe('MappingEngine — transforms', () => {
  const engine = new MappingEngine();

  it('builtin transforms chain left-to-right', () => {
    expect(applyTransforms('  Hello  ', ['trim', 'lowercase'])).toBe('hello');
    expect(applyTransforms(-3.7, ['abs', 'floor'])).toBe(3);
  });

  it('collection transforms work on arrays', () => {
    expect(applyTransforms([3, 1, 2, 1], ['unique', 'first'])).toBe(3);
    expect(flattenDeep([[1, 2], [3, [4, 5]]])).toEqual([1, 2, 3, 4, 5]);
    expect(uniqueByIdentity([1, 'a', 1, 'a', 2])).toEqual([1, 'a', 2]);
  });

  it('json/parseJson round-trip', () => {
    expect(applyTransforms({ a: 1 }, 'json')).toBe('{"a":1}');
    expect(applyTransforms('{"a":1}', 'parseJson')).toEqual({ a: 1 });
  });

  it('throwing inline transforms become transform-phase errors', () => {
    const { errors } = engine.map(
      { x: 1 },
      {
        rules: [
          {
            source: 'x',
            target: 'y',
            transform: () => {
              throw new Error('transform blew up');
            },
          },
        ],
      }
    );
    expect(errors.length).toBe(1);
    expect(errors[0].phase).toBe('transform');
    expect(errors[0].message).toBe('transform blew up');
  });
});

// ---------------------------------------------------------------------------

describe('Enricher', () => {
  const table = Enricher.buildTable(
    'countries',
    [
      { code: 'US', name: 'United States', region: 'NA' },
      { code: 'DE', name: 'Germany', region: 'EU' },
    ],
    'code'
  );

  it('merge-joins matching records into the item root', () => {
    const enricher = new Enricher();
    const { output, errors } = enricher.join(
      { id: 1, country: 'US' },
      { table, keyPath: 'country' }
    );
    expect(errors).toEqual([]);
    expect(output).toEqual({ id: 1, country: 'US', code: 'US', name: 'United States', region: 'NA' });
  });

  it('nests the record under target when provided', () => {
    const enricher = new Enricher();
    const { output } = enricher.join(
      { id: 1, country: 'DE' },
      { table, keyPath: 'country', target: 'countryInfo' }
    );
    expect(output.countryInfo).toEqual({ code: 'DE', name: 'Germany', region: 'EU' });
    expect(output.country).toBe('DE');
  });

  it('onMissing=error reports unmatched keys', () => {
    const enricher = new Enricher();
    const { errors } = enricher.join(
      { id: 1, country: 'XX' },
      { table, keyPath: 'country', onMissing: 'error' }
    );
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("no record in 'countries'");
  });

  it('onMissing=null writes null at target', () => {
    const enricher = new Enricher();
    const { output } = enricher.join(
      { id: 1, country: 'XX' },
      { table, keyPath: 'country', target: 'info', onMissing: 'null' }
    );
    expect(output.info).toBeNull();
  });

  it('joinAll collects per-item errors without aborting', () => {
    const enricher = new Enricher();
    const { outputs, errors } = enricher.joinAll(
      [{ country: 'US' }, { country: 'XX' }, { country: 'DE' }],
      { table, keyPath: 'country', onMissing: 'error' }
    );
    expect(outputs.length).toBe(3);
    expect(errors.length).toBe(1);
    expect(errors[0].index).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('Aggregator', () => {
  const agg = new Aggregator();
  const sales = [
    { region: 'east', product: 'a', qty: 2, price: 10 },
    { region: 'west', product: 'b', qty: 1, price: 20 },
    { region: 'east', product: 'b', qty: 3, price: 20 },
    { region: 'west', product: 'a', qty: 4, price: 10 },
    { region: 'east', product: 'a', qty: 1, price: 10 },
  ];

  it('groups and folds numerics', () => {
    const result = agg.aggregate(sales, {
      groupBy: 'region',
      folds: [
        { source: 'qty', target: 'totalQty', fold: 'sum' },
        { source: 'price', target: 'maxPrice', fold: 'max' },
        { source: 'qty', target: 'avgQty', fold: 'avg' },
      ],
    });
    expect(result.groupCount).toBe(2);
    const east = result.groups[0];
    expect(east.region).toBe('east');
    expect(east.__count).toBe(3);
    expect(east.totalQty).toBe(6);
    expect(east.maxPrice).toBe(20);
    expect(east.avgQty).toBeCloseTo(2, 5);
  });

  it('count/min/collect/concat folds', () => {
    const result = agg.aggregate(sales, {
      groupBy: 'region',
      folds: [
        { source: 'product', target: 'n', fold: 'count' },
        { source: 'price', target: 'minPrice', fold: 'min' },
        { source: 'product', target: 'products', fold: 'collect' },
      ],
    });
    const east = result.groups[0];
    expect(east.n).toBe(3);
    expect(east.minPrice).toBe(10);
    expect(east.products).toEqual(['a', 'b', 'a']);
  });

  it('first/last and custom op folds', () => {
    const result = agg.aggregate(sales, {
      groupBy: 'region',
      folds: [
        { source: 'product', target: 'firstProduct', fold: 'first' },
        { source: 'product', target: 'lastProduct', fold: 'last' },
        {
          source: 'qty',
          target: 'productQty',
          fold: { op: (acc: unknown, v: unknown) => ((acc as number) ?? 1) * (v as number) },
        },
      ],
    });
    const east = result.groups[0];
    expect(east.firstProduct).toBe('a');
    expect(east.lastProduct).toBe('a');
    expect(east.productQty).toBe(6); // 2*3*1
  });

  it('preserves first-seen group order', () => {
    const result = agg.aggregate(
      [
        { g: 'b', v: 1 },
        { g: 'a', v: 1 },
        { g: 'b', v: 2 },
      ],
      { groupBy: 'g', folds: [{ source: 'v', target: 's', fold: 'sum' }] }
    );
    expect(result.groups.map((g) => g.g)).toEqual(['b', 'a']);
  });
});

// ---------------------------------------------------------------------------

describe('BatchTransformer', () => {
  it('collects per-item errors instead of failing fast', () => {
    const engine = new MappingEngine();
    const compiled = engine.compile({
      rules: [
        { source: 'id', target: 'id', required: true },
        { source: 'n', target: 'n', coerce: 'integer' },
      ],
    });
    const batch = new BatchTransformer();
    const result = batch.transformAll(
      [{ id: 'a', n: '1' }, { n: 'bad' }, { id: 'c', n: '3' }, { id: 'd', n: 'NaN' }],
      compiled
    );

    expect(result.total).toBe(4);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(2);
    // item 1: missing required id; item 3: NaN strict-coerce failure
    expect(result.items[0].ok).toBe(true);
    expect(result.items[1].ok).toBe(false);
    expect(result.items[1].errors[0].phase).toBe('required');
    expect(result.items[3].ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('TransformationEngine — integration', () => {
  it('registerSpec + transformNamed reuses compiled closures', () => {
    const engine = new TransformationEngine();
    engine.registerSpec('user', {
      rules: [{ source: 'name', target: 'name', transform: 'uppercase' }],
    });
    const a = engine.transformNamed('user', { name: 'ada' });
    const b = engine.transformNamed('user', { name: 'grace' });
    expect(a.output!.name).toBe('ADA');
    expect(b.output!.name).toBe('GRACE');
    expect(engine.specCount).toBe(1);
    expect(() => engine.transformNamed('nope', {})).toThrow(/No mapping spec/);
  });

  it('transform with join enriches mapped output', () => {
    const engine = new TransformationEngine();
    const table = Enricher.buildTable(
      'roles',
      [{ role: 'admin', level: 10 }],
      'role'
    );
    const result = engine.transform(
      { rules: [{ source: 'user.role', target: 'role' }] },
      { user: { role: 'admin' } },
      { table, keyPath: 'role' }
    );
    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ role: 'admin', level: 10 });
  });

  it('transformBatch + join applies enrichment per item', () => {
    const engine = new TransformationEngine();
    const table = Enricher.buildTable('cc', [{ c: 'US', n: 'United States' }], 'c');
    const compiled = engine.compile({ rules: [{ source: 'country', target: 'c' }] });
    const result = engine.transformBatch(
      [{ country: 'US' }, { country: 'FR' }],
      compiled,
      { table, keyPath: 'c' }
    );
    // FR joins nothing (skip default) — both still succeed
    expect(result.succeeded).toBe(2);
    expect(result.items[0].output).toEqual({ c: 'US', n: 'United States' });
    expect(result.items[1].output).toEqual({ c: 'FR' });
  });

  it('mapAndAggregate excludes failed items', () => {
    const engine = new TransformationEngine();
    const { result, failures } = engine.mapAndAggregate(
      [
        { g: 'x', v: '1' },
        { g: 'x', v: '2' },
        { v: '3' }, // missing g → required error
      ],
      {
        rules: [
          { source: 'g', target: 'g', required: true },
          { source: 'v', target: 'v', coerce: 'integer' },
        ],
      },
      { groupBy: 'g', folds: [{ source: 'v', target: 'sum', fold: 'sum' }] }
    );
    expect(result.groupCount).toBe(1);
    expect(result.groups[0].sum).toBe(3);
    expect(failures.length).toBe(1);
  });

  it('strict vs lenient engine modes differ on dirty data', () => {
    const strict = new TransformationEngine({ coercionMode: 'strict' });
    const lenient = new TransformationEngine({ coercionMode: 'lenient' });
    const spec: MappingSpec = { rules: [{ source: 'n', target: 'n', coerce: 'number' }] };

    expect(strict.transform(spec, { n: '12x' }).ok).toBe(false);
    const r = lenient.transform(spec, { n: '12x' });
    expect(r.ok).toBe(true);
    expect(r.output!.n).toBe(12);
  });
});
