/**
 * Validation
 *
 * Static validation of a parsed document against a schema:
 *  - fields exist on their parent object types
 *  - required (non-null, no default) arguments are provided
 *  - argument names are defined
 *  - leaf fields have no sub-selections, composite fields require them
 *  - fragment spreads target defined fragments of composite type
 *  - variables used in the operation are defined
 */

import {
  DocumentNode,
  OperationDefinitionNode,
  FragmentDefinitionNode,
  SelectionSetNode,
  SelectionNode,
  FieldNode,
  ValueNode,
} from '../ast/ast';
import {
  GraphQLSchema,
  ObjectTypeDef,
  FieldDef,
  TypeDef,
  TypeRef,
  printTypeRef,
} from '../schema/Schema';

export interface ValidationError {
  readonly message: string;
  readonly rule: string;
  readonly line?: number;
  readonly column?: number;
}

interface ValidationContext {
  readonly schema: GraphQLSchema;
  readonly fragments: Map<string, FragmentDefinitionNode>;
  readonly definedVariables: Set<string>;
  readonly errors: ValidationError[];
}

function isComposite(
  t: TypeDef | undefined
): t is TypeDef & { kind: 'object' | 'interface' | 'union' } {
  return (
    t !== undefined &&
    (t.kind === 'object' || t.kind === 'interface' || t.kind === 'union')
  );
}

function namedTypeOf(ref: TypeRef): string {
  switch (ref.kind) {
    case 'list':
    case 'non_null':
      return namedTypeOf(ref.ofType);
    default:
      return ref.name;
  }
}

function isNonNull(ref: TypeRef): boolean {
  return ref.kind === 'non_null';
}

function fieldsOf(t: TypeDef | undefined): ReadonlyMap<string, FieldDef> | undefined {
  if (t === undefined) return undefined;
  if (t.kind === 'object' || t.kind === 'interface') return t.fields;
  return undefined;
}

export function validate(
  schema: GraphQLSchema,
  doc: DocumentNode,
  operationName?: string
): ValidationError[] {
  const fragments = new Map<string, FragmentDefinitionNode>();
  const operations: OperationDefinitionNode[] = [];
  for (const def of doc.definitions) {
    if (def.kind === 'FragmentDefinition') {
      if (fragments.has(def.name.value)) {
        // duplicate fragment
      }
      fragments.set(def.name.value, def);
    } else {
      operations.push(def);
    }
  }

  const errors: ValidationError[] = [];

  // fragment definitions must target composite types that exist
  for (const frag of fragments.values()) {
    const t = schema.getType(frag.typeCondition.name.value);
    if (t === undefined) {
      errors.push({
        rule: 'KnownTypeNames',
        message: `Unknown type '${frag.typeCondition.name.value}' in fragment '${frag.name.value}'`,
        line: frag.typeCondition.loc?.line,
        column: frag.typeCondition.loc?.column,
      });
    } else if (!isComposite(t)) {
      errors.push({
        rule: 'FragmentsOnCompositeTypes',
        message: `Fragment '${frag.name.value}' cannot condition on non-composite type '${frag.typeCondition.name.value}'`,
        line: frag.loc?.line,
        column: frag.loc?.column,
      });
    }
  }

  const opsToValidate =
    operationName !== undefined
      ? operations.filter((o) => o.name?.value === operationName)
      : operations;
  if (operationName !== undefined && opsToValidate.length === 0) {
    errors.push({
      rule: 'KnownOperation',
      message: `Unknown operation '${operationName}'`,
    });
    return errors;
  }

  for (const op of opsToValidate) {
    const root = schema.rootType(op.operation);
    if (root === undefined) {
      errors.push({
        rule: 'ExecutableDefinitions',
        message: `Schema does not support ${op.operation} operations`,
        line: op.loc?.line,
        column: op.loc?.column,
      });
      continue;
    }
    const ctx: ValidationContext = {
      schema,
      fragments,
      definedVariables: new Set(
        op.variableDefinitions.map((v) => v.variable.name.value)
      ),
      errors,
    };
    // check variable types exist
    for (const vd of op.variableDefinitions) {
      validateTypeRef(vd.type, ctx);
    }
    validateSelectionSet(op.selectionSet, root, ctx, new Set());
  }

  // also validate fragments reachable or standalone
  for (const frag of fragments.values()) {
    const t = schema.getType(frag.typeCondition.name.value);
    if (isComposite(t)) {
      const ctx: ValidationContext = {
        schema,
        fragments,
        definedVariables: new Set(),
        errors,
      };
      validateSelectionSet(frag.selectionSet, t, ctx, new Set([frag.name.value]));
    }
  }

  return errors;
}

function validateTypeRef(
  node: import('../ast/ast').TypeNode,
  ctx: ValidationContext
): void {
  switch (node.kind) {
    case 'NamedType': {
      if (ctx.schema.getType(node.name.value) === undefined) {
        ctx.errors.push({
          rule: 'KnownTypeNames',
          message: `Unknown type '${node.name.value}'`,
          line: node.loc?.line,
          column: node.loc?.column,
        });
      }
      return;
    }
    case 'ListType':
      validateTypeRef(node.type, ctx);
      return;
    case 'NonNullType':
      validateTypeRef(node.type, ctx);
      return;
  }
}

function validateSelectionSet(
  selSet: SelectionSetNode,
  parentType: TypeDef,
  ctx: ValidationContext,
  visitedFragments: Set<string>
): void {
  const fields = fieldsOf(parentType);
  for (const sel of selSet.selections) {
    switch (sel.kind) {
      case 'Field':
        validateField(sel, parentType, fields, ctx, visitedFragments);
        break;
      case 'FragmentSpread': {
        const frag = ctx.fragments.get(sel.name.value);
        if (frag === undefined) {
          ctx.errors.push({
            rule: 'KnownFragmentNames',
            message: `Unknown fragment '${sel.name.value}'`,
            line: sel.loc?.line,
            column: sel.loc?.column,
          });
        } else if (!visitedFragments.has(sel.name.value)) {
          const fragType = ctx.schema.getType(frag.typeCondition.name.value);
          if (isComposite(fragType)) {
            visitedFragments.add(sel.name.value);
            validateSelectionSet(frag.selectionSet, fragType, ctx, visitedFragments);
            visitedFragments.delete(sel.name.value);
          }
        } else {
          ctx.errors.push({
            rule: 'NoFragmentCycles',
            message: `Fragment cycle detected through '${sel.name.value}'`,
            line: sel.loc?.line,
            column: sel.loc?.column,
          });
        }
        break;
      }
      case 'InlineFragment': {
        let innerType: TypeDef = parentType;
        if (sel.typeCondition !== undefined) {
          const resolved = ctx.schema.getType(sel.typeCondition.name.value);
          if (resolved === undefined) {
            ctx.errors.push({
              rule: 'KnownTypeNames',
              message: `Unknown type '${sel.typeCondition.name.value}'`,
              line: sel.loc?.line,
              column: sel.loc?.column,
            });
            break;
          }
          innerType = resolved;
        }
        validateSelectionSet(sel.selectionSet, innerType, ctx, visitedFragments);
        break;
      }
    }
  }
}

function validateField(
  field: FieldNode,
  parentType: TypeDef,
  fields: ReadonlyMap<string, FieldDef> | undefined,
  ctx: ValidationContext,
  visitedFragments: Set<string>
): void {
  const fieldName = field.name.value;
  // meta fields allowed on any type
  if (fieldName === '__typename') {
    if (field.selectionSet !== undefined) {
      ctx.errors.push({
        rule: 'ScalarLeafs',
        message: `Field '__typename' must not have a selection set`,
        line: field.loc?.line,
        column: field.loc?.column,
      });
    }
    return;
  }
  const def = fields?.get(fieldName);
  if (def === undefined) {
    ctx.errors.push({
      rule: 'FieldsOnCorrectType',
      message: `Cannot query field '${fieldName}' on type '${parentType.name}'`,
      line: field.loc?.line,
      column: field.loc?.column,
    });
    return;
  }
  // required arguments present
  for (const argDef of def.args) {
    if (isNonNull(argDef.type) && argDef.defaultValue === undefined) {
      const provided = field.arguments.find((a) => a.name.value === argDef.name);
      if (provided === undefined) {
        ctx.errors.push({
          rule: 'ProvidedRequiredArguments',
          message: `Field '${fieldName}' argument '${argDef.name}' of type '${printTypeRef(argDef.type)}' is required`,
          line: field.loc?.line,
          column: field.loc?.column,
        });
      }
    }
  }
  // unknown arguments
  for (const arg of field.arguments) {
    if (!def.args.some((a) => a.name === arg.name.value)) {
      ctx.errors.push({
        rule: 'KnownArgumentNames',
        message: `Unknown argument '${arg.name.value}' on field '${fieldName}'`,
        line: arg.loc?.line,
        column: arg.loc?.column,
      });
    }
    checkVariablesUsed(arg.value, ctx);
  }
  // leaf vs composite checks
  const typeName = namedTypeOf(def.type);
  const target = ctx.schema.getType(typeName);
  if (isComposite(target)) {
    if (field.selectionSet === undefined) {
      ctx.errors.push({
        rule: 'ScalarLeafs',
        message: `Field '${fieldName}' of type '${printTypeRef(def.type)}' must have a selection set`,
        line: field.loc?.line,
        column: field.loc?.column,
      });
    } else {
      validateSelectionSet(field.selectionSet, target, ctx, visitedFragments);
    }
  } else {
    if (field.selectionSet !== undefined) {
      ctx.errors.push({
        rule: 'ScalarLeafs',
        message: `Field '${fieldName}' of type '${printTypeRef(def.type)}' must not have a selection set`,
        line: field.loc?.line,
        column: field.loc?.column,
      });
    }
  }
}

function checkVariablesUsed(value: ValueNode, ctx: ValidationContext): void {
  switch (value.kind) {
    case 'Variable': {
      const name = value.name.value;
      if (!ctx.definedVariables.has(name)) {
        ctx.errors.push({
          rule: 'NoUndefinedVariables',
          message: `Variable '$${name}' is not defined`,
          line: value.loc?.line,
          column: value.loc?.column,
        });
      }
      return;
    }
    case 'ListValue':
      for (const v of value.values) checkVariablesUsed(v, ctx);
      return;
    case 'ObjectValue':
      for (const f of value.fields) checkVariablesUsed(f.value, ctx);
      return;
    default:
      return;
  }
}

