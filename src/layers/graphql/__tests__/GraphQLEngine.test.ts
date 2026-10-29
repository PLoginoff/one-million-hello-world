import { describe, it, expect } from 'bun:test';
import { Lexer, TokenKind } from '../implementations/lexer/Lexer';
import { Parser } from '../implementations/parser/Parser';
import { valueToLiteral } from '../implementations/ast/ast';
import {
  GraphQLSchema,
  GraphQLObjectType,
  ObjectTypeBuilder,
  scalar,
  object,
  listOf,
  nonNull,
} from '../implementations/schema/Schema';
import { Executor } from '../implementations/execution/Executor';
import { validate } from '../implementations/execution/Validation';

describe('Lexer', () => {
  it('tokenizes names, ints, strings, punctuation', () => {
    const tokens = new Lexer('{ user(id: 42, name: "bob") }').tokenize();
    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toEqual([
      TokenKind.BRACE_L,
      TokenKind.NAME,
      TokenKind.PAREN_L,
      TokenKind.NAME,
      TokenKind.COLON,
      TokenKind.INT,
      TokenKind.NAME,
      TokenKind.COLON,
      TokenKind.STRING,
      TokenKind.PAREN_R,
      TokenKind.BRACE_R,
      TokenKind.EOF,
    ]);
  });

  it('tokenizes floats, negatives, exponents', () => {
    const tokens = new Lexer('-1.5e3 42 0.5').tokenize();
    expect(tokens[0].value).toBe('-1.5e3');
    expect(tokens[0].kind).toBe(TokenKind.FLOAT);
    expect(tokens[1].kind).toBe(TokenKind.INT);
    expect(tokens[2].kind).toBe(TokenKind.FLOAT);
  });

  it('handles comments and commas as ignored', () => {
    const tokens = new Lexer('# comment\n{ a, b }').tokenize();
    expect(tokens[0].kind).toBe(TokenKind.BRACE_L);
    expect(tokens[1].value).toBe('a');
    expect(tokens[2].value).toBe('b');
  });

  it('tokenizes block strings with dedent', () => {
    const tokens = new Lexer('"""\n  hello\n  world\n"""').tokenize();
    expect(tokens[0].kind).toBe(TokenKind.BLOCK_STRING);
    expect(tokens[0].value).toBe('hello\nworld');
  });

  it('tokenizes spread and variables', () => {
    const tokens = new Lexer('...frag @include(if: $ok)').tokenize();
    expect(tokens[0].kind).toBe(TokenKind.SPREAD);
    expect(tokens[7].kind).toBe(TokenKind.DOLLAR);
    expect(tokens[8].value).toBe('ok');
  });
});

describe('Parser', () => {
  it('parses anonymous shorthand query', () => {
    const doc = Parser.parse('{ user { name } }');
    expect(doc.definitions.length).toBe(1);
    const op = doc.definitions[0];
    expect(op.kind).toBe('OperationDefinition');
    if (op.kind === 'OperationDefinition') {
      expect(op.operation).toBe('query');
      expect(op.selectionSet.selections[0].kind).toBe('Field');
    }
  });

  it('parses named operation with variables', () => {
    const doc = Parser.parse(
      'query GetUser($id: ID!, $limit: Int = 10) { user(id: $id) { name } }'
    );
    const op = doc.definitions[0];
    if (op.kind !== 'OperationDefinition') throw new Error('expected op');
    expect(op.name?.value).toBe('GetUser');
    expect(op.variableDefinitions.length).toBe(2);
    expect(op.variableDefinitions[0].type.kind).toBe('NonNullType');
    expect(op.variableDefinitions[1].defaultValue?.kind).toBe('IntValue');
  });

  it('parses arguments of all value kinds', () => {
    const doc = Parser.parse(
      '{ f(a: 1, b: 2.5, c: "s", d: true, e: null, f: ENUM, g: [1, 2], h: {x: 1}) }'
    );
    const op = doc.definitions[0];
    if (op.kind !== 'OperationDefinition') throw new Error('x');
    const field = op.selectionSet.selections[0];
    if (field.kind !== 'Field') throw new Error('y');
    const kinds = field.arguments.map((a) => a.value.kind);
    expect(kinds).toEqual([
      'IntValue', 'FloatValue', 'StringValue', 'BooleanValue',
      'NullValue', 'EnumValue', 'ListValue', 'ObjectValue',
    ]);
    expect(valueToLiteral(field.arguments[6].value)).toEqual([1, 2]);
    expect(valueToLiteral(field.arguments[7].value)).toEqual({ x: 1 });
  });

  it('parses fragments and inline fragments', () => {
    const doc = Parser.parse(`
      { user { ...UserParts ... on Admin { level } } }
      fragment UserParts on User { name email }
    `);
    expect(doc.definitions.length).toBe(2);
    const frag = doc.definitions[1];
    expect(frag.kind).toBe('FragmentDefinition');
    if (frag.kind === 'FragmentDefinition') {
      expect(frag.name.value).toBe('UserParts');
      expect(frag.typeCondition.name.value).toBe('User');
    }
  });

  it('parses aliases and directives', () => {
    const doc = Parser.parse('{ alias1: user @include(if: true) { name } }');
    const op = doc.definitions[0];
    if (op.kind !== 'OperationDefinition') throw new Error('x');
    const field = op.selectionSet.selections[0];
    if (field.kind !== 'Field') throw new Error('y');
    expect(field.alias?.value).toBe('alias1');
    expect(field.directives[0].name.value).toBe('include');
  });

  it('rejects invalid syntax', () => {
    expect(() => Parser.parse('{ user(')).toThrow();
    expect(() => Parser.parse('fragment on on User { x }')).toThrow();
  });
});

function buildSchema(): GraphQLSchema {
  const userType = new GraphQLObjectType('User', [
    { name: 'id', type: nonNull(scalar('ID')), args: [] },
    { name: 'name', type: scalar('String'), args: [] },
    { name: 'email', type: scalar('String'), args: [] },
    {
      name: 'friends',
      type: listOf(object('User')),
      args: [],
      resolve: (source) => {
        const u = source as { friends?: unknown[] };
        return u.friends ?? [];
      },
    },
  ]);
  const queryType = new GraphQLObjectType('Query', [
    {
      name: 'user',
      type: object('User'),
      args: [{ name: 'id', type: nonNull(scalar('ID')) }],
      resolve: (_src, args) => {
        const id = args.id as string;
        if (id === '1') {
          return {
            id: '1',
            name: 'Alice',
            email: 'a@example.com',
            friends: [{ id: '2', name: 'Bob', email: 'b@example.com', friends: [] }],
          };
        }
        return null;
      },
    },
    { name: 'version', type: scalar('String'), args: [], resolve: () => '1.0' },
  ]);
  return new GraphQLSchema({ query: queryType, types: [userType] });
}

describe('Validation', () => {
  const schema = buildSchema();

  it('accepts valid queries', () => {
    const doc = Parser.parse('{ user(id: "1") { id name } }');
    expect(validate(schema, doc)).toEqual([]);
  });

  it('rejects unknown fields', () => {
    const doc = Parser.parse('{ user(id: "1") { nope } }');
    const errors = validate(schema, doc);
    expect(errors.some((e) => e.rule === 'FieldsOnCorrectType')).toBe(true);
  });

  it('requires non-null args', () => {
    const doc = Parser.parse('{ user { name } }');
    const errors = validate(schema, doc);
    expect(errors.some((e) => e.rule === 'ProvidedRequiredArguments')).toBe(true);
  });

  it('rejects unknown arguments', () => {
    const doc = Parser.parse('{ user(id: "1", bogus: 2) { name } }');
    const errors = validate(schema, doc);
    expect(errors.some((e) => e.rule === 'KnownArgumentNames')).toBe(true);
  });

  it('requires selection sets on composite fields', () => {
    const doc = Parser.parse('{ user(id: "1") }');
    const errors = validate(schema, doc);
    expect(errors.some((e) => e.rule === 'ScalarLeafs')).toBe(true);
  });

  it('forbids selection sets on scalar fields', () => {
    const doc = Parser.parse('{ version { nested } }');
    const errors = validate(schema, doc);
    expect(errors.some((e) => e.rule === 'ScalarLeafs')).toBe(true);
  });

  it('catches undefined variables', () => {
    const doc = Parser.parse('query Q { user(id: $missing) { name } }');
    const errors = validate(schema, doc);
    expect(errors.some((e) => e.rule === 'NoUndefinedVariables')).toBe(true);
  });

  it('catches unknown fragments', () => {
    const doc = Parser.parse('{ user(id: "1") { ...Missing } }');
    const errors = validate(schema, doc);
    expect(errors.some((e) => e.rule === 'KnownFragmentNames')).toBe(true);
  });
});

describe('Executor', () => {
  const schema = buildSchema();
  const executor = new Executor(schema);

  it('executes a simple query', async () => {
    const doc = Parser.parse('{ user(id: "1") { id name email } }');
    const result = await executor.execute(doc);
    expect(result.errors).toBeUndefined();
    const data = result.data as { user: { name: string } };
    expect(data.user.name).toBe('Alice');
  });

  it('resolves nested objects', async () => {
    const doc = Parser.parse('{ user(id: "1") { name friends { name } } }');
    const result = await executor.execute(doc);
    const data = result.data as { user: { friends: Array<{ name: string }> } };
    expect(data.user.friends[0].name).toBe('Bob');
  });

  it('applies variables', async () => {
    const doc = Parser.parse('query Q($id: ID!) { user(id: $id) { name } }');
    const result = await executor.execute(doc, {
      variableValues: { id: '1' },
    });
    const data = result.data as { user: { name: string } };
    expect(data.user.name).toBe('Alice');
  });

  it('variable defaults apply when not provided', async () => {
    const doc = Parser.parse(
      'query Q($id: ID! = "1") { user(id: $id) { name } }'
    );
    const result = await executor.execute(doc);
    const data = result.data as { user: { name: string } };
    expect(data.user.name).toBe('Alice');
  });

  it('supports @include/@skip', async () => {
    const doc = Parser.parse(`
      query Q($show: Boolean!) {
        user(id: "1") { name email @include(if: $show) id @skip(if: $show) }
      }
    `);
    const withEmail = await executor.execute(doc, { variableValues: { show: true } });
    const data1 = withEmail.data as { user: Record<string, unknown> };
    expect(data1.user.email).toBe('a@example.com');
    expect(data1.user.id).toBeUndefined();
    const without = await executor.execute(doc, { variableValues: { show: false } });
    const data2 = without.data as { user: Record<string, unknown> };
    expect(data2.user.id).toBe('1');
    expect(data2.user.email).toBeUndefined();
  });

  it('expands named fragments', async () => {
    const doc = Parser.parse(`
      { user(id: "1") { ...Parts } }
      fragment Parts on User { name email }
    `);
    const result = await executor.execute(doc);
    const data = result.data as { user: { name: string; email: string } };
    expect(data.user.name).toBe('Alice');
    expect(data.user.email).toBe('a@example.com');
  });

  it('returns null data leaf for missing object, no error', async () => {
    const doc = Parser.parse('{ user(id: "999") { name } }');
    const result = await executor.execute(doc);
    const data = result.data as { user: unknown };
    expect(data.user).toBeNull();
  });

  it('collects resolver errors', async () => {
    const t = new GraphQLObjectType('Query', [
      {
        name: 'boom',
        type: scalar('String'),
        args: [],
        resolve: () => {
          throw new Error('resolver failed');
        },
      },
    ]);
    const s = new GraphQLSchema({ query: t });
    const ex = new Executor(s);
    const result = await ex.execute(Parser.parse('{ boom }'));
    expect(result.errors).toBeDefined();
    expect(result.errors![0].message).toBe('resolver failed');
  });

  it('supports aliases', async () => {
    const doc = Parser.parse('{ who: user(id: "1") { n: name } }');
    const result = await executor.execute(doc);
    const data = result.data as { who: { n: string } };
    expect(data.who.n).toBe('Alice');
  });

  it('__typename works', async () => {
    const doc = Parser.parse('{ user(id: "1") { __typename name } }');
    const result = await executor.execute(doc);
    const data = result.data as { user: { __typename: string } };
    expect(data.user.__typename).toBe('User');
  });
});
