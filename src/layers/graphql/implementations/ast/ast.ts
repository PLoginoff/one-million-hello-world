/**
 * AST
 *
 * Type definitions for a parsed GraphQL document, covering the
 * executable subset of the language: operations, selection sets,
 * arguments, variables, fragments, and directives.
 */

export interface Location {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export interface NameNode {
  readonly kind: 'Name';
  readonly value: string;
  readonly loc?: Location;
}

// ---- values ----

export type ValueNode =
  | IntValueNode
  | FloatValueNode
  | StringValueNode
  | BooleanValueNode
  | NullValueNode
  | EnumValueNode
  | ListValueNode
  | ObjectValueNode
  | VariableNode;

export interface IntValueNode {
  readonly kind: 'IntValue';
  readonly value: string;
  readonly loc?: Location;
}
export interface FloatValueNode {
  readonly kind: 'FloatValue';
  readonly value: string;
  readonly loc?: Location;
}
export interface StringValueNode {
  readonly kind: 'StringValue';
  readonly value: string;
  readonly block: boolean;
  readonly loc?: Location;
}
export interface BooleanValueNode {
  readonly kind: 'BooleanValue';
  readonly value: boolean;
  readonly loc?: Location;
}
export interface NullValueNode {
  readonly kind: 'NullValue';
  readonly loc?: Location;
}
export interface EnumValueNode {
  readonly kind: 'EnumValue';
  readonly value: string;
  readonly loc?: Location;
}
export interface ListValueNode {
  readonly kind: 'ListValue';
  readonly values: readonly ValueNode[];
  readonly loc?: Location;
}
export interface ObjectFieldNode {
  readonly kind: 'ObjectField';
  readonly name: NameNode;
  readonly value: ValueNode;
  readonly loc?: Location;
}
export interface ObjectValueNode {
  readonly kind: 'ObjectValue';
  readonly fields: readonly ObjectFieldNode[];
  readonly loc?: Location;
}
export interface VariableNode {
  readonly kind: 'Variable';
  readonly name: NameNode;
  readonly loc?: Location;
}

// ---- type references ----

export type TypeNode = NamedTypeNode | ListTypeNode | NonNullTypeNode;
export interface NamedTypeNode {
  readonly kind: 'NamedType';
  readonly name: NameNode;
  readonly loc?: Location;
}
export interface ListTypeNode {
  readonly kind: 'ListType';
  readonly type: TypeNode;
  readonly loc?: Location;
}
export interface NonNullTypeNode {
  readonly kind: 'NonNullType';
  readonly type: NamedTypeNode | ListTypeNode;
  readonly loc?: Location;
}

// ---- executable document ----

export interface DocumentNode {
  readonly kind: 'Document';
  readonly definitions: readonly DefinitionNode[];
}

export type DefinitionNode =
  | OperationDefinitionNode
  | FragmentDefinitionNode;

export type OperationType = 'query' | 'mutation' | 'subscription';

export interface OperationDefinitionNode {
  readonly kind: 'OperationDefinition';
  readonly operation: OperationType;
  readonly name?: NameNode;
  readonly variableDefinitions: readonly VariableDefinitionNode[];
  readonly directives: readonly DirectiveNode[];
  readonly selectionSet: SelectionSetNode;
  readonly loc?: Location;
}

export interface VariableDefinitionNode {
  readonly kind: 'VariableDefinition';
  readonly variable: VariableNode;
  readonly type: TypeNode;
  readonly defaultValue?: ValueNode;
  readonly directives: readonly DirectiveNode[];
  readonly loc?: Location;
}

export interface SelectionSetNode {
  readonly kind: 'SelectionSet';
  readonly selections: readonly SelectionNode[];
  readonly loc?: Location;
}

export type SelectionNode =
  | FieldNode
  | FragmentSpreadNode
  | InlineFragmentNode;

export interface FieldNode {
  readonly kind: 'Field';
  readonly alias?: NameNode;
  readonly name: NameNode;
  readonly arguments: readonly ArgumentNode[];
  readonly directives: readonly DirectiveNode[];
  readonly selectionSet?: SelectionSetNode;
  readonly loc?: Location;
}

export interface ArgumentNode {
  readonly kind: 'Argument';
  readonly name: NameNode;
  readonly value: ValueNode;
  readonly loc?: Location;
}

export interface FragmentSpreadNode {
  readonly kind: 'FragmentSpread';
  readonly name: NameNode;
  readonly directives: readonly DirectiveNode[];
  readonly loc?: Location;
}

export interface InlineFragmentNode {
  readonly kind: 'InlineFragment';
  readonly typeCondition?: NamedTypeNode;
  readonly directives: readonly DirectiveNode[];
  readonly selectionSet: SelectionSetNode;
  readonly loc?: Location;
}

export interface FragmentDefinitionNode {
  readonly kind: 'FragmentDefinition';
  readonly name: NameNode;
  readonly typeCondition: NamedTypeNode;
  readonly directives: readonly DirectiveNode[];
  readonly selectionSet: SelectionSetNode;
  readonly loc?: Location;
}

export interface DirectiveNode {
  readonly kind: 'Directive';
  readonly name: NameNode;
  readonly arguments: readonly ArgumentNode[];
  readonly loc?: Location;
}

/** Convenience: type node -> string like "String!" or "[Int]". */
export function printType(node: TypeNode): string {
  switch (node.kind) {
    case 'NamedType':
      return node.name.value;
    case 'ListType':
      return `[${printType(node.type)}]`;
    case 'NonNullType':
      return `${printType(node.type)}!`;
  }
}

/** Static (non-variable) evaluation of a literal ValueNode. */
export function valueToLiteral(node: ValueNode): unknown {
  switch (node.kind) {
    case 'IntValue':
      return parseInt(node.value, 10);
    case 'FloatValue':
      return parseFloat(node.value);
    case 'StringValue':
      return node.value;
    case 'BooleanValue':
      return node.value;
    case 'NullValue':
      return null;
    case 'EnumValue':
      return node.value;
    case 'ListValue':
      return node.values.map(valueToLiteral);
    case 'ObjectValue': {
      const obj: Record<string, unknown> = {};
      for (const f of node.fields) obj[f.name.value] = valueToLiteral(f.value);
      return obj;
    }
    case 'Variable':
      return undefined; // resolved at execution time
  }
}
