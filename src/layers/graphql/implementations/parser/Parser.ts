/**
 * Parser
 *
 * Recursive-descent parser for GraphQL executable documents. Consumes
 * the Lexer token stream and produces the AST defined in ast/ast.ts.
 */

import { Lexer, Token, TokenKind, GraphQLSyntaxError } from '../lexer/Lexer';
import {
  DocumentNode,
  DefinitionNode,
  OperationDefinitionNode,
  OperationType,
  FragmentDefinitionNode,
  SelectionSetNode,
  SelectionNode,
  FieldNode,
  ArgumentNode,
  DirectiveNode,
  VariableDefinitionNode,
  VariableNode,
  TypeNode,
  NamedTypeNode,
  ValueNode,
  ObjectFieldNode,
  Location,
  NameNode,
  FragmentSpreadNode,
  InlineFragmentNode,
} from '../ast/ast';

export class Parser {
  private tokens: Token[] = [];
  private pos = 0;

  static parse(source: string): DocumentNode {
    return new Parser().parseDocument(source);
  }

  parseDocument(source: string): DocumentNode {
    this.tokens = new Lexer(source).tokenize();
    this.pos = 0;
    const definitions: DefinitionNode[] = [];
    while (this.peek().kind !== TokenKind.EOF) {
      definitions.push(this.parseDefinition());
    }
    return { kind: 'Document', definitions };
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private peekAt(offset: number): Token {
    const i = Math.min(this.pos + offset, this.tokens.length - 1);
    return this.tokens[i];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private loc(token: Token): Location {
    return { line: token.line, column: token.column, offset: token.offset };
  }

  private expect(kind: TokenKind): Token {
    const t = this.peek();
    if (t.kind !== kind) {
      throw new GraphQLSyntaxError(
        `Expected ${kind}, found ${t.kind} '${t.value}'`,
        t.line,
        t.column
      );
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

  private skip(kind: TokenKind): Token | null {
    if (this.peek().kind === kind) return this.next();
    return null;
  }

  private nameNode(token: Token): NameNode {
    return { kind: 'Name', value: token.value, loc: this.loc(token) };
  }

  private parseDefinition(): DefinitionNode {
    const t = this.peek();
    if (t.kind === TokenKind.BRACE_L) {
      // anonymous query shorthand: { ... }
      const selectionSet = this.parseSelectionSet();
      return {
        kind: 'OperationDefinition',
        operation: 'query',
        variableDefinitions: [],
        directives: [],
        selectionSet,
        loc: selectionSet.loc,
      };
    }
    if (t.kind === TokenKind.NAME) {
      switch (t.value) {
        case 'query':
        case 'mutation':
        case 'subscription':
          return this.parseOperationDefinition();
        case 'fragment':
          return this.parseFragmentDefinition();
        default:
          throw new GraphQLSyntaxError(
            `Unexpected name '${t.value}'`,
            t.line,
            t.column
          );
      }
    }
    throw new GraphQLSyntaxError(`Unexpected ${t.kind}`, t.line, t.column);
  }

  private parseOperationDefinition(): OperationDefinitionNode {
    const opToken = this.next();
    const operation = opToken.value as OperationType;
    let name: NameNode | undefined;
    if (this.peek().kind === TokenKind.NAME) {
      name = this.nameNode(this.next());
    }
    const variableDefinitions = this.parseVariableDefinitions();
    const directives = this.parseDirectives();
    const selectionSet = this.parseSelectionSet();
    return {
      kind: 'OperationDefinition',
      operation,
      name,
      variableDefinitions,
      directives,
      selectionSet,
      loc: this.loc(opToken),
    };
  }

  private parseVariableDefinitions(): VariableDefinitionNode[] {
    if (this.peek().kind !== TokenKind.PAREN_L) return [];
    this.next();
    const defs: VariableDefinitionNode[] = [];
    while (this.peek().kind !== TokenKind.PAREN_R) {
      const start = this.peek();
      const variable = this.parseVariable();
      this.expect(TokenKind.COLON);
      const type = this.parseTypeReference();
      let defaultValue: ValueNode | undefined;
      if (this.skip(TokenKind.EQ) !== null) {
        defaultValue = this.parseValueLiteral(true);
      }
      const directives = this.parseDirectives();
      defs.push({
        kind: 'VariableDefinition',
        variable,
        type,
        defaultValue,
        directives,
        loc: this.loc(start),
      });
    }
    this.expect(TokenKind.PAREN_R);
    return defs;
  }

  private parseVariable(): VariableNode {
    const start = this.expect(TokenKind.DOLLAR);
    const name = this.nameNode(this.expect(TokenKind.NAME));
    return { kind: 'Variable', name, loc: this.loc(start) };
  }

  private parseTypeReference(): TypeNode {
    const start = this.peek();
    let type: NamedTypeNode | import('../ast/ast').ListTypeNode;
    if (this.skip(TokenKind.BRACKET_L) !== null) {
      const inner = this.parseTypeReference();
      this.expect(TokenKind.BRACKET_R);
      type = { kind: 'ListType', type: inner, loc: this.loc(start) };
    } else {
      const name = this.nameNode(this.expect(TokenKind.NAME));
      type = { kind: 'NamedType', name, loc: this.loc(start) };
    }
    if (this.skip(TokenKind.BANG) !== null) {
      return {
        kind: 'NonNullType',
        type,
        loc: this.loc(start),
      };
    }
    return type;
  }

  private parseSelectionSet(): SelectionSetNode {
    const start = this.expect(TokenKind.BRACE_L);
    const selections: SelectionNode[] = [];
    do {
      selections.push(this.parseSelection());
    } while (this.peek().kind !== TokenKind.BRACE_R);
    this.expect(TokenKind.BRACE_R);
    return { kind: 'SelectionSet', selections, loc: this.loc(start) };
  }

  private parseSelection(): SelectionNode {
    if (this.peek().kind === TokenKind.SPREAD) {
      return this.parseFragment();
    }
    return this.parseField();
  }

  private parseField(): FieldNode {
    const start = this.peek();
    const nameOrAlias = this.nameNode(this.expect(TokenKind.NAME));
    let alias: NameNode | undefined;
    let name = nameOrAlias;
    if (this.skip(TokenKind.COLON) !== null) {
      alias = nameOrAlias;
      name = this.nameNode(this.expect(TokenKind.NAME));
    }
    const args = this.parseArguments(false);
    const directives = this.parseDirectives();
    let selectionSet: SelectionSetNode | undefined;
    if (this.peek().kind === TokenKind.BRACE_L) {
      selectionSet = this.parseSelectionSet();
    }
    return {
      kind: 'Field',
      alias,
      name,
      arguments: args,
      directives,
      selectionSet,
      loc: this.loc(start),
    };
  }

  private parseFragment(): FragmentSpreadNode | InlineFragmentNode {
    const start = this.expect(TokenKind.SPREAD);
    if (
      this.peek().kind === TokenKind.NAME &&
      this.peek().value !== 'on'
    ) {
      const name = this.nameNode(this.next());
      const directives = this.parseDirectives();
      return {
        kind: 'FragmentSpread',
        name,
        directives,
        loc: this.loc(start),
      };
    }
    // inline fragment: optional 'on Type'
    let typeCondition: NamedTypeNode | undefined;
    if (this.peek().kind === TokenKind.NAME && this.peek().value === 'on') {
      this.next();
      const name = this.nameNode(this.expect(TokenKind.NAME));
      typeCondition = { kind: 'NamedType', name, loc: name.loc };
    }
    const directives = this.parseDirectives();
    const selectionSet = this.parseSelectionSet();
    return {
      kind: 'InlineFragment',
      typeCondition,
      directives,
      selectionSet,
      loc: this.loc(start),
    };
  }

  private parseFragmentDefinition(): FragmentDefinitionNode {
    const start = this.expectName('fragment');
    const name = this.nameNode(this.expect(TokenKind.NAME));
    if (name.value === 'on') {
      throw new GraphQLSyntaxError(
        "Fragment name cannot be 'on'",
        start.line,
        start.column
      );
    }
    this.expectName('on');
    const typeName = this.nameNode(this.expect(TokenKind.NAME));
    const typeCondition: NamedTypeNode = {
      kind: 'NamedType',
      name: typeName,
      loc: typeName.loc,
    };
    const directives = this.parseDirectives();
    const selectionSet = this.parseSelectionSet();
    return {
      kind: 'FragmentDefinition',
      name,
      typeCondition,
      directives,
      selectionSet,
      loc: this.loc(start),
    };
  }

  private parseArguments(isConst: boolean): ArgumentNode[] {
    if (this.peek().kind !== TokenKind.PAREN_L) return [];
    this.next();
    const args: ArgumentNode[] = [];
    while (this.peek().kind !== TokenKind.PAREN_R) {
      const start = this.peek();
      const name = this.nameNode(this.expect(TokenKind.NAME));
      this.expect(TokenKind.COLON);
      const value = this.parseValueLiteral(isConst);
      args.push({ kind: 'Argument', name, value, loc: this.loc(start) });
    }
    this.expect(TokenKind.PAREN_R);
    return args;
  }

  private parseDirectives(): DirectiveNode[] {
    const directives: DirectiveNode[] = [];
    while (this.peek().kind === TokenKind.AT) {
      const start = this.next();
      const name = this.nameNode(this.expect(TokenKind.NAME));
      const args = this.parseArguments(false);
      directives.push({ kind: 'Directive', name, arguments: args, loc: this.loc(start) });
    }
    return directives;
  }

  private parseValueLiteral(isConst: boolean): ValueNode {
    const t = this.peek();
    switch (t.kind) {
      case TokenKind.INT:
        this.next();
        return { kind: 'IntValue', value: t.value, loc: this.loc(t) };
      case TokenKind.FLOAT:
        this.next();
        return { kind: 'FloatValue', value: t.value, loc: this.loc(t) };
      case TokenKind.STRING:
        this.next();
        return { kind: 'StringValue', value: t.value, block: false, loc: this.loc(t) };
      case TokenKind.BLOCK_STRING:
        this.next();
        return { kind: 'StringValue', value: t.value, block: true, loc: this.loc(t) };
      case TokenKind.NAME: {
        this.next();
        if (t.value === 'true' || t.value === 'false') {
          return { kind: 'BooleanValue', value: t.value === 'true', loc: this.loc(t) };
        }
        if (t.value === 'null') {
          return { kind: 'NullValue', loc: this.loc(t) };
        }
        return { kind: 'EnumValue', value: t.value, loc: this.loc(t) };
      }
      case TokenKind.DOLLAR: {
        if (isConst) {
          throw new GraphQLSyntaxError(
            'Variables not allowed in constant values',
            t.line,
            t.column
          );
        }
        return this.parseVariable();
      }
      case TokenKind.BRACKET_L: {
        this.next();
        const values: ValueNode[] = [];
        while (this.peek().kind !== TokenKind.BRACKET_R) {
          values.push(this.parseValueLiteral(isConst));
        }
        this.expect(TokenKind.BRACKET_R);
        return { kind: 'ListValue', values, loc: this.loc(t) };
      }
      case TokenKind.BRACE_L: {
        this.next();
        const fields: ObjectFieldNode[] = [];
        while (this.peek().kind !== TokenKind.BRACE_R) {
          const fStart = this.peek();
          const name = this.nameNode(this.expect(TokenKind.NAME));
          this.expect(TokenKind.COLON);
          const value = this.parseValueLiteral(isConst);
          fields.push({
            kind: 'ObjectField',
            name,
            value,
            loc: this.loc(fStart),
          });
        }
        this.expect(TokenKind.BRACE_R);
        return { kind: 'ObjectValue', fields, loc: this.loc(t) };
      }
      default:
        throw new GraphQLSyntaxError(
          `Unexpected value token ${t.kind} '${t.value}'`,
          t.line,
          t.column
        );
    }
  }
}

export function parse(source: string): DocumentNode {
  return Parser.parse(source);
}
