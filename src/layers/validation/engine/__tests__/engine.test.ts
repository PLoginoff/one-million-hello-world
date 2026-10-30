/**
 * Validation Engine — unit tests.
 *
 * The schema compiler is tested through the public `compile →
 * validate` path; error-path assertions are the primary correctness
 * signal (a validator that can't name the failing field is useless).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  SchemaCompiler,
  CoercionPipeline,
  ErrorPath,
  SchemaCompileError,
  FieldKind,
  ObjectSchema,
  FieldSchema,
  AsyncValidationTimeoutError,
} from '../index';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function obj(props: Record<string, FieldSchema>, extra: Partial<ObjectSchema> = {}): ObjectSchema {
  return { kind: 'object', properties: props, ...extra };
}

function str(opts: Partial<FieldSchema> = {}): FieldSchema {
  return { kind: FieldKind.STRING, ...opts };
}
function num(opts: Partial<FieldSchema> = {}): FieldSchema {
  return { kind: FieldKind.NUMBER, ...opts };
}
function int(opts: Partial<FieldSchema> = {}): FieldSchema {
  return { kind: FieldKind.INTEGER, ...opts };
}
function bool(opts: Partial<FieldSchema> = {}): FieldSchema {
  return { kind: FieldKind.BOOLEAN, ...opts };
}
function arr(items: FieldSchema, opts: Partial<FieldSchema> = {}): FieldSchema {
  return { kind: FieldKind.ARRAY, items, ...opts };
}
function objF(props: Record<string, FieldSchema>, opts: Partial<FieldSchema> = {}): FieldSchema {
  return { kind: FieldKind.OBJECT, properties: props, ...opts };
}

/* ------------------------------------------------------------------ */
/* SchemaCompiler — basics                                             */
/* ------------------------------------------------------------------ */

describe('SchemaCompiler', () => {
  let compiler: SchemaCompiler;

  beforeEach(() => {
    compiler = new SchemaCompiler();
  });

  it('validates a flat object', () => {
    const v = compiler.compile(obj({
      name: str({ required: true, minLength: 2 }),
      age: int({ min: 0, max: 150 }),
    }));
    expect(v({ name: 'alice', age: 30 }).valid).toBe(true);
    const r = v({ name: 'a', age: 200 });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBe(2);
    expect(r.errors.map((e) => e.path).sort()).toEqual(['$.age', '$.name']);
  });

  it('reports missing required fields with correct paths', () => {
    const v = compiler.compile(obj({ name: str({ required: true }) }));
    const r = v({});
    expect(r.valid).toBe(false);
    expect(r.errors[0].path).toBe('$.name');
    expect(r.errors[0].rule).toBe('required');
  });

  it('produces nested dot-notation paths', () => {
    const v = compiler.compile(obj({
      user: objF({
        address: objF({
          zip: str({ pattern: '^\\d{5}$' }),
        }),
      }),
    }));
    const r = v({ user: { address: { zip: 'abc' } } });
    expect(r.errors[0].path).toBe('$.user.address.zip');
    expect(r.errors[0].rule).toBe('pattern');
  });

  it('produces indexed paths for array items', () => {
    const v = compiler.compile(obj({
      items: arr(objF({ id: int({ required: true }) })),
    }));
    const r = v({ items: [{ id: 1 }, { id: 'x' }, {}] });
    expect(r.valid).toBe(false);
    const paths = r.errors.map((e) => e.path).sort();
    expect(paths).toContain('$.items[1].id');
    expect(paths).toContain('$.items[2].id');
  });

  it('rejects non-object input', () => {
    const v = compiler.compile(obj({}));
    expect(v('string').valid).toBe(false);
    expect(v([1, 2]).valid).toBe(false);
    expect(v(null).valid).toBe(false);
  });

  it('validates string constraints', () => {
    const v = compiler.compile(obj({
      s: str({ minLength: 3, maxLength: 5, pattern: '^[a-z]+$' }),
    }));
    expect(v({ s: 'abc' }).valid).toBe(true);
    expect(v({ s: 'ab' }).errors[0].rule).toBe('minLength');
    expect(v({ s: 'abcdef' }).errors[0].rule).toBe('maxLength');
    expect(v({ s: 'ABC' }).errors[0].rule).toBe('pattern');
  });

  it('validates formats', () => {
    const v = compiler.compile(obj({
      email: str({ format: 'email' }),
      uuid: str({ format: 'uuid' }),
      url: str({ format: 'url' }),
    }));
    expect(v({
      email: 'a@b.co',
      uuid: '123e4567-e89b-12d3-a456-426614174000',
      url: 'https://example.com',
    }).valid).toBe(true);
    const r = v({ email: 'nope', uuid: 'nope', url: 'nope' });
    expect(r.errors.length).toBe(3);
  });

  it('validates numeric constraints incl. multipleOf', () => {
    const v = compiler.compile(obj({
      n: num({ min: 0, max: 100, multipleOf: 5 }),
    }));
    expect(v({ n: 50 }).valid).toBe(true);
    expect(v({ n: 3 }).errors[0].rule).toBe('multipleOf');
    expect(v({ n: -1 }).errors[0].rule).toBe('min');
    expect(v({ n: 101 }).errors[0].rule).toBe('max');
  });

  it('validates integer kind strictly', () => {
    const v = compiler.compile(obj({ i: int() }));
    expect(v({ i: 4 }).valid).toBe(true);
    expect(v({ i: 4.5 }).valid).toBe(false);
    expect(v({ i: '4' }).valid).toBe(false); // no coercion requested
  });

  it('validates array constraints', () => {
    const v = compiler.compile(obj({
      tags: arr(str(), { minItems: 1, maxItems: 3, uniqueItems: true }),
    }));
    expect(v({ tags: ['a'] }).valid).toBe(true);
    expect(v({ tags: [] }).errors[0].rule).toBe('minItems');
    expect(v({ tags: ['a', 'b', 'c', 'd'] }).errors[0].rule).toBe('maxItems');
    expect(v({ tags: ['a', 'a'] }).errors[0].rule).toBe('uniqueItems');
  });

  it('validates enum', () => {
    const v = compiler.compile(obj({
      role: { kind: FieldKind.ENUM, enum: ['admin', 'user', 'guest'] },
    }));
    expect(v({ role: 'admin' }).valid).toBe(true);
    expect(v({ role: 'root' }).errors[0].rule).toBe('enum');
  });

  it('rejects additionalProperties when false', () => {
    const v = compiler.compile(obj({ a: str() }, { additionalProperties: false }));
    const r = v({ a: 'x', b: 'y' });
    expect(r.errors[0].rule).toBe('additionalProperties');
    expect(r.errors[0].path).toBe('$.b');
  });

  it('runs custom validate functions', () => {
    const v = compiler.compile(obj({
      s: str({ validate: (x) => (x === 'bad' ? 'is bad' : null) }),
    }));
    expect(v({ s: 'good' }).valid).toBe(true);
    expect(v({ s: 'bad' }).errors[0].rule).toBe('custom');
  });

  it('throws SchemaCompileError on malformed schemas', () => {
    expect(() =>
      compiler.compile(obj({ f: { kind: FieldKind.STRING, pattern: '([' } }))
    ).toThrow(SchemaCompileError);
    expect(() =>
      compiler.compile(obj({ f: { kind: FieldKind.ENUM } }))
    ).toThrow(SchemaCompileError);
    expect(() =>
      compiler.compile({ kind: 'object', properties: {} } as ObjectSchema)
    ).not.toThrow();
  });

  it('compilation is once: the validator is a plain closure', () => {
    const v = compiler.compile(obj({ s: str({ minLength: 1 }) }));
    // Validate many times — the closure is reused; compile cost paid once.
    for (let i = 0; i < 1000; i++) {
      v({ s: 'x' });
    }
    expect(v({ s: 'x' }).valid).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Cross-field rules                                                   */
/* ------------------------------------------------------------------ */

describe('SchemaCompiler — cross-field', () => {
  const compiler = new SchemaCompiler();

  it('dependent-required: present field requires another', () => {
    const v = compiler.compile(obj({
      card: str(),
      cvv: str(),
    }, {
      crossField: [{
        id: 'card-cvv',
        kind: 'dependent-required',
        field: 'card',
        requires: ['cvv'],
      }],
    }));
    expect(v({}).valid).toBe(true); // no card → cvv optional
    expect(v({ card: '1234', cvv: '999' }).valid).toBe(true);
    const r = v({ card: '1234' });
    expect(r.errors[0].rule).toBe('dependent-required');
    expect(r.errors[0].path).toBe('$.card');
  });

  it('mutually-exclusive: two fields cannot coexist', () => {
    const v = compiler.compile(obj({
      email: str(),
      phone: str(),
    }, {
      crossField: [{
        id: 'contact',
        kind: 'mutually-exclusive',
        fields: ['email', 'phone'],
      }],
    }));
    expect(v({ email: 'a' }).valid).toBe(true);
    expect(v({ phone: '1' }).valid).toBe(true);
    const r = v({ email: 'a', phone: '1' });
    expect(r.errors[0].rule).toBe('mutually-exclusive');
  });

  it('at-least-one: enforces a group presence', () => {
    const v = compiler.compile(obj({
      a: str(),
      b: str(),
    }, {
      crossField: [{
        id: 'al1',
        kind: 'at-least-one',
        fields: ['a', 'b'],
      }],
    }));
    expect(v({ a: 'x' }).valid).toBe(true);
    expect(v({}).valid).toBe(false);
  });

  it('if-then: conditional schema fires when the condition matches', () => {
    const v = compiler.compile(obj({
      type: str(),
      count: int(),
    }, {
      crossField: [{
        id: 'counted',
        kind: 'if-then',
        if: objF({ type: { kind: FieldKind.ENUM, enum: ['counted'] } }),
        then: objF({ count: { kind: FieldKind.INTEGER, required: true } }),
        message: 'counted type requires count',
      }],
    }));
    expect(v({ type: 'other' }).valid).toBe(true); // if doesn't match
    const r = v({ type: 'counted' });
    expect(r.valid).toBe(false);
    expect(v({ type: 'counted', count: 5 }).valid).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* CoercionPipeline                                                    */
/* ------------------------------------------------------------------ */

describe('CoercionPipeline', () => {
  const loose = new CoercionPipeline();
  const strict = new CoercionPipeline({ strict: true });

  it('coerces strings to numbers loosely', () => {
    expect(loose.coerce('42', FieldKind.NUMBER).value).toBe(42);
    expect(loose.coerce('4.5', FieldKind.NUMBER).value).toBe(4.5);
    expect(loose.coerce('abc', FieldKind.NUMBER).ok).toBe(false);
  });

  it('strict mode refuses lossy number coercion', () => {
    expect(strict.coerce('4.5', FieldKind.INTEGER).ok).toBe(false);
    expect(strict.coerce('42', FieldKind.INTEGER).value).toBe(42);
    expect(loose.coerce('4.5', FieldKind.INTEGER).value).toBe(4); // truncates loose
  });

  it('coerces boolean strings with strictness on spellings', () => {
    expect(strict.coerce('true', FieldKind.BOOLEAN).value).toBe(true);
    expect(strict.coerce('yes', FieldKind.BOOLEAN).ok).toBe(false); // strict: only true/false/1/0
    expect(loose.coerce('yes', FieldKind.BOOLEAN).value).toBe(true);
    expect(loose.coerce('off', FieldKind.BOOLEAN).value).toBe(false);
  });

  it('coerces ISO dates strictly, others loosely', () => {
    expect(strict.coerce('2024-01-15', FieldKind.DATE).value).toBeInstanceOf(Date);
    expect(strict.coerce('Jan 15 2024', FieldKind.DATE).ok).toBe(false);
    expect(loose.coerce('Jan 15 2024', FieldKind.DATE).value).toBeInstanceOf(Date);
  });

  it('empty string becomes absent when emptyStringAsAbsent', () => {
    expect(loose.coerce('', FieldKind.STRING).value).toBeUndefined();
    const keep = new CoercionPipeline({ emptyStringAsAbsent: false });
    expect(keep.coerce('', FieldKind.STRING).value).toBe('');
  });

  it('schema-level coercion applies before rule checks', () => {
    const compiler = new SchemaCompiler();
    const v = compiler.compile(obj({
      age: int({ required: true, coerce: 'strict', min: 18 }),
    }));
    // '21' coerces → 21 → passes min 18.
    const r = v({ age: '21' });
    expect(r.valid).toBe(true);
    expect((r.coerced as Record<string, unknown>).age).toBe(21);
    // 'abc' fails coercion — coerce error, not a kind error.
    const r2 = v({ age: 'abc' });
    expect(r2.errors[0].rule).toBe('coerce');
    // '17' coerces but fails min.
    const r3 = v({ age: '17' });
    expect(r3.errors[0].rule).toBe('min');
  });

  it('loose single values wrap to arrays', () => {
    expect(loose.coerce('x', FieldKind.ARRAY).value).toEqual(['x']);
    expect(strict.coerce('x', FieldKind.ARRAY).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Async validation                                                    */
/* ------------------------------------------------------------------ */

describe('SchemaCompiler — async', () => {
  const compiler = new SchemaCompiler();
  const clock = { t: 0, now() { return this.t; }, advance(ms: number) { this.t += ms; } };

  it('runs async rules sequentially and collects errors', async () => {
    const r = await compiler.validateAsync(
      { name: 'alice', email: 'taken@x.com' },
      [
        {
          path: 'name',
          rule: 'unique',
          fn: async (v) => (v === 'alice' ? 'taken' : null),
        },
        {
          path: 'email',
          rule: 'unique',
          fn: async (v) => (v === 'taken@x.com' ? 'taken' : null),
        },
      ],
      { clock }
    );
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBe(2);
    expect(r.errors[0].path).toBe('$.name');
    expect(r.errors[1].path).toBe('$.email');
  });

  it('times out a hung validator', async () => {
    const r = await compiler.validateAsync(
      { f: 'x' },
      [{
        path: 'f',
        rule: 'hang',
        fn: () => new Promise<string | null>(() => { /* never resolves */ }),
        timeoutMs: 50,
      }],
      { defaultTimeoutMs: 50 }
    );
    expect(r.valid).toBe(false);
    expect(r.errors[0].rule).toBe('timeout');
  });

  it('honours the total timeout budget', async () => {
    const r = await compiler.validateAsync(
      {},
      [
        // First rule hangs ~80ms — crosses the 30ms total budget mid-run.
        { path: 'a', rule: 'slow', fn: () => new Promise<string | null>((res) => setTimeout(() => res(null), 80)) },
        { path: 'b', rule: 'slow', fn: async () => null },
      ],
      { defaultTimeoutMs: 5000, totalTimeoutMs: 30 }
    );
    // Total budget 30ms < rule-a's 80ms runtime → timeout error recorded.
    expect(r.valid).toBe(false);
  });

  it('resolves nested paths', async () => {
    const r = await compiler.validateAsync(
      { user: { address: { zip: '1' } } },
      [{
        path: 'user.address.zip',
        rule: 'len',
        fn: async (v) => (typeof v === 'string' && v.length < 5 ? 'too short' : null),
      }]
    );
    expect(r.errors[0]?.path).toBe('$.user.address.zip');
  });
});

/* ------------------------------------------------------------------ */
/* ErrorPath                                                           */
/* ------------------------------------------------------------------ */

describe('ErrorPath', () => {
  it('builds and renders paths', () => {
    const p = ErrorPath.root().child('user').child('address').child('zip');
    expect(p.toString()).toBe('$.user.address.zip');
    expect(ErrorPath.root().child('items').at(3).child('id').toString()).toBe('$.items[3].id');
  });

  it('round-trips through parse', () => {
    const s = '$.user.items[2].name';
    const p = ErrorPath.parse(s);
    expect(p.toString()).toBe(s);
  });

  it('immutability: child returns a new path', () => {
    const a = ErrorPath.root().child('a');
    const b = a.child('b');
    expect(a.toString()).toBe('$.a');
    expect(b.toString()).toBe('$.a.b');
  });
});
