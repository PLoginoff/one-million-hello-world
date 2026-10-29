import { describe, it, expect } from 'bun:test';
import { SchemaParser, parseSchema, buildSchema } from '../implementations/sdl/SchemaParser';
import { introspectSchema, introspectType } from '../implementations/execution/Introspection';
import { GraphQLHandler } from '../implementations/execution/GraphQLHandler';
import { Executor } from '../implementations/execution/Executor';
import { parse } from '../implementations/parser/Parser';
import { validate } from '../implementations/execution/Validation';

const SDL = `
  "A user of the system"
  type User {
    id: ID!
    name: String
    email: String
    friends(first: Int = 10): [User]
  }

  type Query {
    user(id: ID!): User
    users: [User!]!
    version: String
  }

  type Mutation {
    createUser(input: CreateUserInput!): User
  }

  input CreateUserInput {
    name: String!
    email: String
  }

  enum Role { ADMIN USER GUEST }

  union SearchResult = User | Page

  interface Node { id: ID! }
  scalar DateTime
`;

describe('SchemaParser', () => {
  it('parses object types with args', () => {
    const sdl = parseSchema(SDL);
    const user = sdl.types.find((t) => t.name === 'User');
    expect(user).toBeDefined();
    expect(user!.kind).toBe('object');
    if (user!.kind === 'object') {
      const friends = user!.fields.get('friends');
      expect(friends).toBeDefined();
      expect(friends!.type.kind).toBe('list');
      expect(friends!.args.length).toBe(1);
      expect(friends!.args[0].defaultValue).toBe(10);
    }
  });

  it('parses input/enum/union/interface/scalar', () => {
    const sdl = parseSchema(SDL);
    const kinds = new Map(sdl.types.map((t) => [t.name, t.kind]));
    expect(kinds.get('CreateUserInput')).toBe('input');
    expect(kinds.get('Role')).toBe('enum');
    expect(kinds.get('SearchResult')).toBe('union');
    expect(kinds.get('Node')).toBe('interface');
    expect(kinds.get('DateTime')).toBe('scalar');
  });

  it('parses schema block roots', () => {
    const sdl = parseSchema('schema { query: MyRoot } type MyRoot { x: Int }');
    expect(sdl.queryTypeName).toBe('MyRoot');
  });

  it('parses non-null and nested list types', () => {
    const sdl = parseSchema('type Q { m: [[Int!]!]! }');
    const q = sdl.types.find((t) => t.name === 'Q');
    if (q?.kind !== 'object') throw new Error('x');
    const m = q.fields.get('m')!;
    expect(m.type.kind).toBe('non_null');
  });
});

describe('buildSchema + Executor', () => {
  const schema = buildSchema(
    `
      type User { id: ID!, name: String }
      type Query { user(id: ID!): User, hello: String }
    `,
    {
      Query: {
        user: (_s, args) => ({ id: args.id, name: 'Test User' }),
        hello: () => 'world',
      },
    }
  );

  it('executes SDL-built schema', async () => {
    const ex = new Executor(schema);
    const result = await ex.execute(parse('{ user(id: "1") { id name } hello }'));
    const data = result.data as { user: { name: string }; hello: string };
    expect(data.user.name).toBe('Test User');
    expect(data.hello).toBe('world');
  });

  it('validates against SDL-built schema', () => {
    const doc = parse('{ user { nope } }');
    const errors = validate(schema, doc);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('Introspection', () => {
  const schema = buildSchema(`
    type User { id: ID!, name: String }
    type Query { user: User }
    enum Color { RED GREEN }
  `);

  it('introspects schema types', () => {
    const intro = introspectSchema(schema);
    expect(intro.queryType.name).toBe('Query');
    const names = intro.types.map((t) => t.name);
    expect(names).toContain('User');
    expect(names).toContain('Color');
    const user = intro.types.find((t) => t.name === 'User');
    expect(user!.fields!.map((f) => f.name)).toEqual(['id', 'name']);
  });

  it('introspects single type', () => {
    const t = introspectType(schema, 'Color');
    expect(t!.kind).toBe('ENUM');
    expect(t!.enumValues!.map((v) => v.name)).toEqual(['RED', 'GREEN']);
  });
});

describe('GraphQLHandler', () => {
  const schema = buildSchema(
    `type Query { hello: String, user(id: ID!): User } type User { name: String }`,
    {
      Query: {
        hello: () => 'hi',
        user: (_s, a) => ({ name: `user-${a.id}` }),
      },
    }
  );
  const handler = new GraphQLHandler(schema);

  it('handles a normal query end-to-end', async () => {
    const res = await handler.handle({ query: '{ hello user(id: "7") { name } }' });
    expect(res.status).toBe(200);
    const body = res.body as { data: { hello: string; user: { name: string } } };
    expect(body.data.hello).toBe('hi');
    expect(body.data.user.name).toBe('user-7');
  });

  it('returns 400 on syntax errors', async () => {
    const res = await handler.handle({ query: '{ hello(' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on validation errors', async () => {
    const res = await handler.handle({ query: '{ nonexistent }' });
    expect(res.status).toBe(400);
  });

  it('answers introspection queries', async () => {
    const res = await handler.handle({
      query: '{ __schema { queryType { name } } }',
    });
    expect(res.status).toBe(200);
    const body = res.body as { data: { __schema: { queryType: { name: string } } } };
    expect(body.data.__schema.queryType.name).toBe('Query');
  });

  it('answers __type queries', async () => {
    const res = await handler.handle({
      query: '{ __type(name: "User") { name } }',
    });
    expect(res.status).toBe(200);
    const body = res.body as { data: { __type: { name: string } } };
    expect(body.data.__type.name).toBe('User');
  });
});
