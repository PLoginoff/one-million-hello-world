/**
 * SchemaParser
 *
 * Parses GraphQL SDL (schema definition language) into the runtime
 * TypeDef model: type/enum/input/interface/union/scalar definitions,
 * field arguments with types and defaults, and schema { } blocks.
 * Uses the same Lexer primitives plus SDL-only tokens handled here.
 */

import { Lexer, Token, TokenKind, GraphQLSyntaxError } from '../lexer/Lexer';
import {
  TypeDef,
  TypeRef,
  ObjectTypeDef,
  FieldDef,
  ArgumentDef,
  InputObjectTypeDef,
  InterfaceTypeDef,
  UnionTypeDef,
  EnumTypeDef,
  ScalarTypeDef,
  GraphQLSchema,
  GraphQLObjectType,
  ResolverFn,
} from '../schema/Schema';

export class SchemaParseError extends Error {
  constructor(message: string, line: number, column: number) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = 'SchemaParseError';
  }
}

export interface SdlField {
  readonly name: string;
  readonly args: readonly ArgumentDef[];
  readonly type: TypeRef;
  readonly description?: string;
}

export interface SdlSchema {
  readonly types: readonly TypeDef[];
  readonly queryTypeName?: string;
  readonly mutationTypeName?: string;
  readonly subscriptionTypeName?: string;
}

export class SchemaParser {
  private tokens: Token[] = [];
  private pos = 0;

  parse(sdl: string): SdlSchema {
    this.tokens = new Lexer(sdl).tokenize();
    this.pos = 0;
    const types: TypeDef[] = [];
    let queryName: string | undefined;
    let mutationName: string | undefined;
    let subscriptionName: string | undefined;
    while (this.peek().kind !== TokenKind.EOF) {
      // skip descriptions
      if (
        this.peek().kind === TokenKind.STRING ||
        this.peek().kind === TokenKind.BLOCK_STRING
      ) {
        this.next();
      }
      const t = this.peek();
      if (t.kind !== TokenKind.NAME) {
        throw new GraphQLSyntaxError(
          `Unexpected token ${t.kind} in SDL`,
          t.line,
          t.column
        );
      }
      switch (t.value) {
        case 'schema':
          ({ queryName, mutationName, subscriptionName } = this.parseSchemaBlock());
          break;
        case 'type':
          types.push(this.parseObjectType('object'));
          break;
        case 'interface':
          types.push(this.parseObjectType('interface'));
          break;
        case 'input':
          types.push(this.parseInputType());
          break;
        case 'enum':
          types.push(this.parseEnumType());
          break;
        case 'union':
          types.push(this.parseUnionType());
          break;
        case 'scalar': {
          this.next();
          const name = this.expectName();
          types.push({ kind: 'scalar', name: name.value } as ScalarTypeDef);
          break;
        }
        case 'extend':
          this.next(); // treat 'extend type X' as 'type X' merge
          break;
        case 'directive': {
          // skip @directive(...) on ... definitions
          this.skipDirectiveDefinition();
          break;
        }
        default:
          throw new GraphQLSyntaxError(
            `Unexpected keyword '${t.value}' in SDL`,
            t.line,
            t.column
          );
      }
    }
    return {
      types,
      queryTypeName: queryName ?? 'Query',
      mutationTypeName: mutationName ?? 'Mutation',
      subscriptionTypeName: subscriptionName ?? 'Subscription',
    };
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private expect(kind: TokenKind): Token {
    const t = this.peek();
    if (t.kind !== kind) {
      throw new GraphQLSyntaxError(`Expected ${kind}, found ${t.kind}`, t.line, t.column);
    }
    return this.next();
  }

  private expectName(value?: string): Token {
    const t = this.expect(TokenKind.NAME);
    if (value !== undefined && t.value !== value) {
      throw new GraphQLSyntaxError(
        `Expected '${value}', found '${t.value}'`,
        t.line,
        t.column
      );
    }
    return t;
  }

  private skip(kind: TokenKind): boolean {
    if (this.peek().kind === kind) {
      this.next();
      return true;
    }
    return false;
  }

  private description(): string | undefined {
    if (
      this.peek().kind === TokenKind.STRING ||
      this.peek().kind === TokenKind.BLOCK_STRING
    ) {
      return this.next().value;
    }
    return undefined;
  }

  private parseSchemaBlock(): {
    queryName?: string;
    mutationName?: string;
    subscriptionName?: string;
  } {
    this.expectName('schema');
    this.skipDirectives();
    this.expect(TokenKind.BRACE_L);
    const out: { queryName?: string; mutationName?: string; subscriptionName?: string } = {};
    while (this.peek().kind !== TokenKind.BRACE_R) {
      const kw = this.expectName();
      this.expect(TokenKind.COLON);
      const typeName = this.expectName().value;
      if (kw.value === 'query') out.queryName = typeName;
      else if (kw.value === 'mutation') out.mutationName = typeName;
      else if (kw.value === 'subscription') out.subscriptionName = typeName;
    }
    this.expect(TokenKind.BRACE_R);
    return out;
  }

  private parseObjectType(kind: 'object' | 'interface'): ObjectTypeDef | InterfaceTypeDef {
    this.next(); // 'type' or 'interface'
    const name = this.expectName().value;
    // implements clause
    if (this.peek().kind === TokenKind.NAME && this.peek().value === 'implements') {
      this.next();
      this.skip(TokenKind.AMP);
      do {
        this.expect(TokenKind.NAME);
      } while (this.skip(TokenKind.AMP));
    }
    this.skipDirectives();
    this.expect(TokenKind.BRACE_L);
    const fields: SdlField[] = [];
    while (this.peek().kind !== TokenKind.BRACE_R) {
      fields.push(this.parseFieldDef());
    }
    this.expect(TokenKind.BRACE_R);
    const fieldMap = new Map<string, FieldDef>(
      fields.map((f) => [f.name, { name: f.name, type: f.type, args: f.args }])
    );
    if (kind === 'object') {
      return { kind: 'object', name, fields: fieldMap } as ObjectTypeDef;
    }
    return { kind: 'interface', name, fields: fieldMap } as InterfaceTypeDef;
  }

  private parseFieldDef(): SdlField {
    const description = this.description();
    const name = this.expectName().value;
    const args = this.parseArgDefs();
    this.expect(TokenKind.COLON);
    const type = this.parseTypeRef();
    this.skipDirectives();
    return { name, args, type, description };
  }

  private parseArgDefs(): ArgumentDef[] {
    if (!this.skip(TokenKind.PAREN_L)) return [];
    const args: ArgumentDef[] = [];
    while (this.peek().kind !== TokenKind.PAREN_R) {
      this.description();
      const name = this.expectName().value;
      this.expect(TokenKind.COLON);
      const type = this.parseTypeRef();
      let defaultValue: unknown;
      if (this.skip(TokenKind.EQ)) {
        defaultValue = this.parseLiteral();
      }
      this.skipDirectives();
      args.push({ name, type, defaultValue });
    }
    this.expect(TokenKind.PAREN_R);
    return args;
  }

  private parseTypeRef(): TypeRef {
    let inner: TypeRef;
    if (this.skip(TokenKind.BRACKET_L)) {
      const t = this.parseTypeRef();
      this.expect(TokenKind.BRACKET_R);
      inner = { kind: 'list', ofType: t };
    } else {
      const name = this.expectName().value;
      // decide scalar vs named object later; store as scalar if builtin
      const builtins = new Set(['Int', 'Float', 'String', 'Boolean', 'ID']);
      inner = builtins.has(name)
        ? { kind: 'scalar', name }
        : { kind: 'object', name };
    }
    if (this.skip(TokenKind.BANG)) {
      return { kind: 'non_null', ofType: inner };
    }
    return inner;
  }

  private parseLiteral(): unknown {
    const t = this.next();
    switch (t.kind) {
      case TokenKind.INT:
        return parseInt(t.value, 10);
      case TokenKind.FLOAT:
        return parseFloat(t.value);
      case TokenKind.STRING:
      case TokenKind.BLOCK_STRING:
        return t.value;
      case TokenKind.NAME:
        if (t.value === 'true') return true;
        if (t.value === 'false') return false;
        if (t.value === 'null') return null;
        return t.value; // enum literal
      case TokenKind.BRACKET_L: {
        const arr: unknown[] = [];
        while (this.peek().kind !== TokenKind.BRACKET_R) {
          arr.push(this.parseLiteral());
        }
        this.expect(TokenKind.BRACKET_R);
        return arr;
      }
      case TokenKind.BRACE_L: {
        const obj: Record<string, unknown> = {};
        while (this.peek().kind !== TokenKind.BRACE_R) {
          const key = this.expectName().value;
          this.expect(TokenKind.COLON);
          obj[key] = this.parseLiteral();
        }
        this.expect(TokenKind.BRACE_R);
        return obj;
      }
      default:
        throw new GraphQLSyntaxError(
          `Unexpected default value token ${t.kind}`,
          t.line,
          t.column
        );
    }
  }

  private parseInputType(): InputObjectTypeDef {
    this.expectName('input');
    const name = this.expectName().value;
    this.skipDirectives();
    this.expect(TokenKind.BRACE_L);
    const fields = new Map<string, { name: string; type: TypeRef; defaultValue?: unknown }>();
    while (this.peek().kind !== TokenKind.BRACE_R) {
      this.description();
      const fname = this.expectName().value;
      this.expect(TokenKind.COLON);
      const type = this.parseTypeRef();
      let defaultValue: unknown;
      if (this.skip(TokenKind.EQ)) defaultValue = this.parseLiteral();
      this.skipDirectives();
      fields.set(fname, { name: fname, type, defaultValue });
    }
    this.expect(TokenKind.BRACE_R);
    return { kind: 'input', name, fields };
  }

  private parseEnumType(): EnumTypeDef {
    this.expectName('enum');
    const name = this.expectName().value;
    this.skipDirectives();
    this.expect(TokenKind.BRACE_L);
    const values: string[] = [];
    while (this.peek().kind !== TokenKind.BRACE_R) {
      this.description();
      values.push(this.expectName().value);
      this.skipDirectives();
    }
    this.expect(TokenKind.BRACE_R);
    return { kind: 'enum', name, values };
  }

  private parseUnionType(): UnionTypeDef {
    this.expectName('union');
    const name = this.expectName().value;
    this.skipDirectives();
    this.expect(TokenKind.EQ);
    const members: string[] = [];
    this.skip(TokenKind.PIPE);
    do {
      members.push(this.expectName().value);
    } while (this.skip(TokenKind.PIPE));
    return { kind: 'union', name, members };
  }

  private skipDirectives(): void {
    while (this.peek().kind === TokenKind.AT) {
      this.next();
      this.expect(TokenKind.NAME);
      if (this.skip(TokenKind.PAREN_L)) {
        let depth = 1;
        while (depth > 0) {
          const t = this.next();
          if (t.kind === TokenKind.PAREN_L) depth++;
          else if (t.kind === TokenKind.PAREN_R) depth--;
          else if (t.kind === TokenKind.EOF) {
            throw new GraphQLSyntaxError('Unterminated directive args', t.line, t.column);
          }
        }
      }
    }
  }

  private skipDirectiveDefinition(): void {
    this.expectName('directive');
    this.expect(TokenKind.AT);
    this.expect(TokenKind.NAME);
    this.parseArgDefs(); // may have args definition
    if (this.peek().kind === TokenKind.NAME && this.peek().value === 'repeatable') {
      this.next();
    }
    if (this.peek().kind === TokenKind.NAME && this.peek().value === 'on') {
      this.next();
      this.skip(TokenKind.PIPE);
      do {
        this.expect(TokenKind.NAME);
      } while (this.skip(TokenKind.PIPE));
    }
  }
}

export function parseSchema(sdl: string): SdlSchema {
  return new SchemaParser().parse(sdl);
}

/**
 * Build an executable GraphQLSchema from SDL + a resolver map.
 * `resolvers[typeName][fieldName]` provides ResolverFns; missing fields
 * fall back to default property resolution.
 */
export function buildSchema(
  sdl: string,
  resolvers: Readonly<Record<string, Record<string, ResolverFn>>> = {}
): GraphQLSchema {
  const parsed = parseSchema(sdl);
  const types = new Map<string, TypeDef>();
  for (const t of parsed.types) types.set(t.name, t);
  // attach resolvers
  const resolved = parsed.types.map((t): TypeDef => {
    if (t.kind !== 'object') return t;
    const fieldResolvers = resolvers[t.name] ?? {};
    const fields = new Map<string, FieldDef>();
    for (const [fname, fdef] of t.fields) {
      fields.set(fname, { ...fdef, resolve: fieldResolvers[fname] });
    }
    return new GraphQLObjectType(t.name, [...fields.values()], t.isTypeOf);
  });
  const byName = new Map(resolved.map((t) => [t.name, t]));
  const query = byName.get(parsed.queryTypeName ?? 'Query');
  if (query === undefined || query.kind !== 'object') {
    throw new SchemaParseError(
      `SDL does not define query root '${parsed.queryTypeName}'`,
      0,
      0
    );
  }
  const mutation = byName.get(parsed.mutationTypeName ?? 'Mutation');
  const subscription = byName.get(parsed.subscriptionTypeName ?? 'Subscription');
  return new GraphQLSchema({
    query: query as ObjectTypeDef,
    mutation: mutation?.kind === 'object' ? mutation : undefined,
    subscription: subscription?.kind === 'object' ? subscription : undefined,
    types: resolved,
  });
}
