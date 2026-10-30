/**
 * Controller Engine Tests
 *
 * Covers: DTO schema validation (nested objects, arrays, enums,
 * custom validators), Accept-header content negotiation, CSV/JSON/
 * plain serialization, HATEOAS links + URI templates, RFC 7807
 * problem+json mapping, and request-context extraction.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import {
  DtoValidator,
  DtoValidationError,
  SchemaError,
  ResponseBuilder,
  JsonSerializer,
  CsvSerializer,
  PlainTextSerializer,
  NotAcceptableError,
  parseAccept,
  LinkBuilder,
  paginationLinks,
  expandTemplate,
  isTemplated,
  ProblemDetailsMapper,
  ProblemCategory,
  extractPagination,
  extractSort,
  extractFilters,
  extractRequestContext,
} from '../engine';
import { DtoSchema } from '../engine/types';

// ---------------------------------------------------------------------------
// DTO validation
// ---------------------------------------------------------------------------

const userSchema: DtoSchema = {
  id: { kind: 'string', required: true, pattern: /^[a-z0-9-]+$/ },
  email: { kind: 'string', required: true, minLength: 3, maxLength: 120 },
  age: { kind: 'integer', min: 0, max: 150 },
  role: { kind: 'enum', values: ['admin', 'user', 'guest'], required: true },
  tags: { kind: 'array', items: { kind: 'string' }, maxItems: 5 },
  address: {
    kind: 'object',
    fields: {
      city: { kind: 'string', required: true },
      zip: { kind: 'string', pattern: /^\d{5}$/ },
    },
  },
};

describe('DtoValidator', () => {
  let validator: DtoValidator;

  beforeEach(() => {
    validator = new DtoValidator(userSchema);
  });

  it('accepts a fully valid payload', () => {
    const outcome = validator.validate({
      id: 'u-1',
      email: 'a@b.co',
      role: 'user',
      tags: ['x', 'y'],
      address: { city: 'SF', zip: '94110' },
    });
    expect(outcome.valid).toBe(true);
  });

  it('reports missing required fields', () => {
    const outcome = validator.validate({ role: 'user' });
    expect(outcome.valid).toBe(false);
    const codes = outcome.issues.map((i) => `${i.path}:${i.code}`);
    expect(codes).toContain('id:required');
    expect(codes).toContain('email:required');
  });

  it('rejects wrong types', () => {
    const outcome = validator.validate({ id: 'u-1', email: 'a@b.co', role: 'user', age: 'old' });
    expect(outcome.valid).toBe(false);
    expect(outcome.issues.find((i) => i.path === 'age')?.code).toBe('type');
  });

  it('enforces string length + pattern', () => {
    const tooShort = validator.validate({ id: 'u-1', email: 'a', role: 'user' });
    expect(tooShort.issues.find((i) => i.path === 'email')?.code).toBe('minLength');

    const badId = validator.validate({ id: 'BAD_ID!', email: 'a@b.co', role: 'user' });
    expect(badId.issues.find((i) => i.path === 'id')?.code).toBe('pattern');
  });

  it('enforces numeric range', () => {
    const outcome = validator.validate({ id: 'u-1', email: 'a@b.co', role: 'user', age: 200 });
    expect(outcome.issues.find((i) => i.path === 'age')?.code).toBe('max');
  });

  it('enforces enum membership', () => {
    const outcome = validator.validate({ id: 'u-1', email: 'a@b.co', role: 'superuser' });
    expect(outcome.issues.find((i) => i.path === 'role')?.code).toBe('enum');
  });

  it('validates nested objects with dot paths', () => {
    const outcome = validator.validate({
      id: 'u-1',
      email: 'a@b.co',
      role: 'user',
      address: { city: 'SF', zip: 'not-a-zip' },
    });
    expect(outcome.issues.find((i) => i.path === 'address.zip')?.code).toBe('pattern');
  });

  it('validates array items', () => {
    const outcome = validator.validate({
      id: 'u-1',
      email: 'a@b.co',
      role: 'user',
      tags: ['ok', 42],
    });
    expect(outcome.issues.find((i) => i.path === 'tags[1]')?.code).toBe('type');
  });

  it('runs custom validators', () => {
    const v = new DtoValidator({
      pw: { kind: 'string', required: true, validate: (v) => (String(v).includes('!') ? null : 'needs !') },
    });
    const outcome = v.validate({ pw: 'weak' });
    expect(outcome.issues[0].code).toBe('custom');
  });

  it('rejects non-object roots', () => {
    expect(validator.validate('nope').valid).toBe(false);
    expect(validator.validate([1, 2]).valid).toBe(false);
    expect(validator.validate(null).valid).toBe(false);
  });

  it('assert throws DtoValidationError carrying issues', () => {
    expect(() => validator.assert({ role: 'user' })).toThrow(DtoValidationError);
    try {
      validator.assert({ role: 'user' });
    } catch (e) {
      expect(e).toBeInstanceOf(DtoValidationError);
      expect((e as DtoValidationError).issues.length).toBeGreaterThan(0);
    }
  });

  it('rejects malformed schemas at construction', () => {
    expect(() => new DtoValidator({ f: { kind: 'enum' } })).toThrow(SchemaError);
    expect(() => new DtoValidator({ f: { kind: 'string', minLength: 10, maxLength: 2 } })).toThrow(SchemaError);
  });
});

// ---------------------------------------------------------------------------
// Content negotiation
// ---------------------------------------------------------------------------

describe('parseAccept', () => {
  it('parses weighted ranges', () => {
    const ranges = parseAccept('text/html, application/json;q=0.9, */*;q=0.1');
    expect(ranges.map((r) => `${r.type}/${r.subtype}@${r.q}`)).toEqual([
      'text/html@1',
      'application/json@0.9',
      '*/*@0.1',
    ]);
  });

  it('defaults q to 1 and sorts by q then specificity', () => {
    const ranges = parseAccept('application/*;q=0.8, application/json;q=0.8');
    expect(ranges[0].subtype).toBe('json'); // more specific wins ties
  });

  it('empty header yields */*', () => {
    expect(parseAccept(undefined)[0]).toEqual({ type: '*', subtype: '*', q: 1, index: 0 });
  });
});

describe('ResponseBuilder', () => {
  let builder: ResponseBuilder;

  beforeEach(() => {
    builder = new ResponseBuilder();
  });

  it('defaults to JSON for no Accept', () => {
    const res = builder.build(200, { ok: true });
    expect(res.contentType).toBe('application/json');
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it('selects CSV when client prefers it', () => {
    const res = builder.build(200, [{ a: 1, b: 'x' }, { a: 2, b: 'y' }], 'text/csv');
    expect(res.contentType).toBe('text/csv');
    expect(res.body.split('\r\n')[0]).toBe('a,b');
    expect(res.body).toContain('1,x');
  });

  it('honors q-values', () => {
    const res = builder.build(200, { a: 1 }, 'text/csv;q=0.9, application/json;q=0.1');
    expect(res.contentType).toBe('text/csv');
  });

  it('rejects q=0 matches', () => {
    const res = builder.build(200, { a: 1 }, 'text/csv;q=0, application/json;q=0.5');
    expect(res.contentType).toBe('application/json');
  });

  it('throws NotAcceptableError when nothing matches', () => {
    expect(() => builder.build(200, {}, 'image/png')).toThrow(NotAcceptableError);
  });

  it('plain-text serializer stringifies', () => {
    const res = builder.build(200, 'hello', 'text/plain');
    expect(res.body).toBe('hello');
    const resObj = builder.build(200, { a: 1 }, 'text/plain');
    expect(resObj.body).toBe('{"a":1}');
  });
});

// ---------------------------------------------------------------------------
// HATEOAS
// ---------------------------------------------------------------------------

describe('LinkBuilder', () => {
  it('builds self/next/prev/related links', () => {
    const links = new LinkBuilder()
      .self('/users/42')
      .related('/users/42/orders', 'orders')
      .collection('/users')
      .build();

    expect(links).toHaveLength(3);
    expect(links[0]).toMatchObject({ rel: 'self', href: '/users/42', templated: false });
  });

  it('marks templated hrefs', () => {
    const links = new LinkBuilder().add('search', '/users{?name,page}').build();
    expect(links[0].templated).toBe(true);
    expect(isTemplated('/x/{id}')).toBe(true);
    expect(isTemplated('/x/1')).toBe(false);
  });

  it('expands URI templates', () => {
    expect(expandTemplate('/users/{id}', { id: '42' })).toBe('/users/42');
    // Operator-prefixed expressions ({?a,b}) expand to comma-joined values.
    expect(expandTemplate('/users{?page,size}', { page: 2, size: 10 })).toBe('/users2,10');
    // Unknown variables stay literal.
    expect(expandTemplate('/users/{id}', {})).toBe('/users/{id}');
  });

  it('paginationLinks emits full navigation set', () => {
    const links = paginationLinks('/users{?page,size}', 3, 10, 95);
    const rels = links.map((l) => l.rel);
    expect(rels).toEqual(expect.arrayContaining(['self', 'first', 'last', 'prev', 'next']));
  });

  it('paginationLinks drops prev on first page', () => {
    const links = paginationLinks('/users{?page,size}', 1, 10, 95);
    expect(links.find((l) => l.rel === 'prev')).toBeUndefined();
    expect(links.find((l) => l.rel === 'next')).toBeDefined();
  });

  it('envelope wraps data + links', () => {
    const env = LinkBuilder.envelope({ id: 'u-1' }, new LinkBuilder().self('/users/u-1').build());
    expect(env.data).toEqual({ id: 'u-1' });
    expect(env.links[0].rel).toBe('self');
  });
});

// ---------------------------------------------------------------------------
// Problem details
// ---------------------------------------------------------------------------

describe('ProblemDetailsMapper', () => {
  let mapper: ProblemDetailsMapper;

  beforeEach(() => {
    mapper = new ProblemDetailsMapper();
  });

  it('emits problem+json with category-shaped fields', () => {
    const res = mapper.for(ProblemCategory.NOT_FOUND, 'user 42 missing');
    expect(res.contentType).toBe('application/problem+json');
    expect(res.status).toBe(404);
    const parsed = JSON.parse(res.body);
    expect(parsed.type).toBe('urn:omhw:problem:not-found');
    expect(parsed.title).toBe('Resource Not Found');
    expect(parsed.detail).toBe('user 42 missing');
  });

  it('forValidation embeds issues in extensions', () => {
    const res = mapper.forValidation([
      { path: 'email', code: 'required', message: 'Missing required field "email"' },
      { path: 'age', code: 'max', message: 'above max' },
    ]);
    const parsed = JSON.parse(res.body);
    expect(res.status).toBe(400);
    expect(parsed.extensions.issues).toHaveLength(2);
    expect(parsed.extensions.issues[0].path).toBe('email');
  });

  it('fromError respects status-bearing errors', () => {
    const err = Object.assign(new Error('nope'), { status: 404 });
    const res = mapper.fromError(err);
    expect(res.status).toBe(404);
    expect(res.problem.title).toBe('Resource Not Found');
  });

  it('fromError infers category from error names', () => {
    const e = new Error('denied');
    e.name = 'ForbiddenError';
    const res = mapper.fromError(e);
    expect(res.status).toBe(403);
  });

  it('fromError defaults to 500 for unknown errors', () => {
    const res = mapper.fromError('totally broken');
    expect(res.status).toBe(500);
    expect(res.problem.type).toBe('urn:omhw:problem:internal');
  });
});

// ---------------------------------------------------------------------------
// Request context extraction
// ---------------------------------------------------------------------------

describe('request context extraction', () => {
  it('applies pagination defaults', () => {
    const p = extractPagination({});
    expect(p).toEqual({ page: 1, pageSize: 20, offset: 0, limit: 20 });
  });

  it('clamps pageSize to max', () => {
    const p = extractPagination({ size: '9999' }, { maxPageSize: 100 });
    expect(p.pageSize).toBe(100);
  });

  it('derives offset from page', () => {
    const p = extractPagination({ page: '3', size: '25' });
    expect(p.offset).toBe(50);
    expect(p.limit).toBe(25);
  });

  it('supports offset/limit directly', () => {
    const p = extractPagination({ offset: '40', limit: '10' });
    expect(p.offset).toBe(40);
    expect(p.limit).toBe(10);
  });

  it('parses sort with direction', () => {
    const sort = extractSort({ sort: 'name,-createdAt' });
    expect(sort).toEqual([
      { field: 'name', direction: 'asc' },
      { field: 'createdAt', direction: 'desc' },
    ]);
  });

  it('drops disallowed sort fields', () => {
    const sort = extractSort({ sort: 'name,evil' }, { sortableFields: ['name'] });
    expect(sort).toEqual([{ field: 'name', direction: 'asc' }]);
  });

  it('parses structured filters', () => {
    const f = extractFilters({
      'filter[name][contains]': 'al',
      'filter[age][gte]': '30',
      'filter[role]': 'admin',
    });
    expect(f).toEqual(
      expect.arrayContaining([
        { field: 'name', op: 'contains', value: 'al' },
        { field: 'age', op: 'gte', value: '30' },
        { field: 'role', op: 'eq', value: 'admin' },
      ])
    );
  });

  it('shorthand params become eq filters, reserving pagination keys', () => {
    const ctx = extractRequestContext({
      page: '2',
      size: '10',
      sort: '-name',
      status: 'active',
    });
    expect(ctx.filters).toEqual([{ field: 'status', op: 'eq', value: 'active' }]);
    expect(ctx.extras).toEqual({});
  });

  it('extras keeps non-parsed params', () => {
    const ctx = extractRequestContext({ page: '1', trace: 'yes' }, { filterableFields: [] });
    expect(ctx.extras).toEqual({ trace: 'yes' });
  });
});
