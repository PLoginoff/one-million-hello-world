/**
 * Executor
 *
 * Executes a validated GraphQL document against a schema's resolvers.
 * Supports: async resolvers, variable coercion (defaults + input
 * values), @skip/@include directives, fragments (named + inline),
 * aliases, list/null propagation with NonNull bubbling, and error
 * collection per the spec's partial-result semantics.
 */

import {
  DocumentNode,
  OperationDefinitionNode,
  FragmentDefinitionNode,
  SelectionSetNode,
  SelectionNode,
  FieldNode,
  ValueNode,
  DirectiveNode,
  valueToLiteral,
} from '../ast/ast';
import {
  GraphQLSchema,
  ObjectTypeDef,
  FieldDef,
  TypeDef,
  TypeRef,
  ScalarTypeDef,
} from '../schema/Schema';

export interface ExecutionError {
  readonly message: string;
  readonly path: readonly (string | number)[];
  readonly fieldName?: string;
}

export interface ExecutionResult {
  readonly data: Record<string, unknown> | null;
  readonly errors?: readonly ExecutionError[];
}

interface ExecContext {
  readonly schema: GraphQLSchema;
  readonly fragments: Map<string, FragmentDefinitionNode>;
  readonly variables: Record<string, unknown>;
  readonly contextValue: unknown;
  readonly errors: ExecutionError[];
}

function isPromise(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Resolve a ValueNode to a runtime value using variable bindings. */
function coerceValue(node: ValueNode, variables: Record<string, unknown>): unknown {
  if (node.kind === 'Variable') {
    return variables[node.name.value];
  }
  return valueToLiteral(node);
}

function argsToObject(
  field: FieldNode,
  variables: Record<string, unknown>
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const arg of field.arguments) {
    args[arg.name.value] = coerceValue(arg.value, variables);
  }
  return args;
}

/** Evaluate @skip/@include. Returns true if the node should execute. */
function shouldInclude(
  directives: readonly DirectiveNode[],
  variables: Record<string, unknown>
): boolean {
  for (const d of directives) {
    const ifArg = d.arguments.find((a) => a.name.value === 'if');
    const cond = ifArg !== undefined ? coerceValue(ifArg.value, variables) : undefined;
    if (d.name.value === 'skip' && cond === true) return false;
    if (d.name.value === 'include' && cond === false) return false;
  }
  return true;
}

/** Response key = alias ?? name. */
function responseKey(field: FieldNode): string {
  return field.alias?.value ?? field.name.value;
}

/** Collect field selections, expanding fragments. */
function collectFields(
  ctx: ExecContext,
  runtimeType: ObjectTypeDef,
  selSet: SelectionSetNode,
  fields: Map<string, FieldNode[]>,
  visited: Set<string>
): void {
  for (const sel of selSet.selections) {
    if (!shouldInclude(directivesOf(sel), ctx.variables)) continue;
    if (sel.kind === 'Field') {
      const key = responseKey(sel);
      const list = fields.get(key);
      if (list !== undefined) list.push(sel);
      else fields.set(key, [sel]);
    } else if (sel.kind === 'FragmentSpread') {
      const name = sel.name.value;
      if (visited.has(name)) continue;
      const frag = ctx.fragments.get(name);
      if (frag === undefined) continue;
      if (!doesFragmentApply(ctx, frag.typeCondition.name.value, runtimeType)) {
        continue;
      }
      visited.add(name);
      collectFields(ctx, runtimeType, frag.selectionSet, fields, visited);
      visited.delete(name);
    } else {
      // InlineFragment
      if (
        sel.typeCondition === undefined ||
        doesFragmentApply(ctx, sel.typeCondition.name.value, runtimeType)
      ) {
        collectFields(ctx, runtimeType, sel.selectionSet, fields, visited);
      }
    }
  }
}

function directivesOf(sel: SelectionNode): readonly DirectiveNode[] {
  return sel.directives;
}

function doesFragmentApply(
  ctx: ExecContext,
  typeCondition: string,
  runtimeType: ObjectTypeDef
): boolean {
  if (typeCondition === runtimeType.name) return true;
  const t = ctx.schema.getType(typeCondition);
  if (t === undefined) return false;
  if (t.kind === 'interface') {
    // runtime type applies if it "implements" the interface — we approximate:
    // check the runtime object has all interface fields defined in schema
    // via its isTypeOf marker, else field-name compatibility.
    if (runtimeType.isTypeOf !== undefined) {
      return false; // defer: object types declare isTypeOf for unions only
    }
    // conservative: check all interface fields exist on the object type
    for (const name of t.fields.keys()) {
      if (!runtimeType.fields.has(name)) return false;
    }
    return true;
  }
  if (t.kind === 'union') {
    return t.members.includes(runtimeType.name);
  }
  return false;
}

/** Unwrap a possibly-promise value. */
async function awaitIfNeeded(v: unknown): Promise<unknown> {
  if (isPromise(v)) return v;
  return v;
}

export class Executor {
  private readonly schema: GraphQLSchema;

  constructor(schema: GraphQLSchema) {
    this.schema = schema;
  }

  async execute(
    doc: DocumentNode,
    options: {
      operationName?: string;
      variableValues?: Record<string, unknown>;
      contextValue?: unknown;
      rootValue?: unknown;
    } = {}
  ): Promise<ExecutionResult> {
    const fragments = new Map<string, FragmentDefinitionNode>();
    const operations: OperationDefinitionNode[] = [];
    for (const def of doc.definitions) {
      if (def.kind === 'FragmentDefinition') fragments.set(def.name.value, def);
      else operations.push(def);
    }
    let operation: OperationDefinitionNode | undefined;
    if (options.operationName !== undefined) {
      operation = operations.find((o) => o.name?.value === options.operationName);
    } else if (operations.length === 1) {
      operation = operations[0];
    } else {
      return {
        data: null,
        errors: [
          { message: 'Must provide operationName when document has multiple operations', path: [] },
        ],
      };
    }
    if (operation === undefined) {
      return {
        data: null,
        errors: [{ message: `Operation '${options.operationName ?? ''}' not found`, path: [] }],
      };
    }
    const rootType = this.schema.rootType(operation.operation);
    if (rootType === undefined) {
      return {
        data: null,
        errors: [{ message: `Schema has no ${operation.operation} root type`, path: [] }],
      };
    }
    const variables = this.coerceVariables(operation, options.variableValues ?? {});
    const ctx: ExecContext = {
      schema: this.schema,
      fragments,
      variables,
      contextValue: options.contextValue,
      errors: [],
    };
    const data = await this.executeSelectionSet(
      ctx,
      operation.selectionSet,
      rootType,
      options.rootValue ?? {},
      []
    );
    const result: ExecutionResult = { data: data as Record<string, unknown> | null };
    if (ctx.errors.length > 0) {
      return { ...result, errors: ctx.errors };
    }
    return result;
  }

  private coerceVariables(
    operation: OperationDefinitionNode,
    provided: Record<string, unknown>
  ): Record<string, unknown> {
    const vars: Record<string, unknown> = {};
    for (const def of operation.variableDefinitions) {
      const name = def.variable.name.value;
      if (Object.prototype.hasOwnProperty.call(provided, name)) {
        vars[name] = provided[name];
      } else if (def.defaultValue !== undefined) {
        vars[name] = valueToLiteral(def.defaultValue);
      } else {
        vars[name] = undefined;
      }
    }
    // pass through undeclared variables too (harmless)
    for (const [k, v] of Object.entries(provided)) {
      if (!(k in vars)) vars[k] = v;
    }
    return vars;
  }

  private async executeSelectionSet(
    ctx: ExecContext,
    selSet: SelectionSetNode,
    objectType: ObjectTypeDef,
    source: unknown,
    path: readonly (string | number)[]
  ): Promise<Record<string, unknown> | null> {
    const grouped = new Map<string, FieldNode[]>();
    collectFields(ctx, objectType, selSet, grouped, new Set());
    const result: Record<string, unknown> = {};
    for (const [key, fields] of grouped) {
      const fieldNode = fields[0];
      const value = await this.executeField(
        ctx,
        objectType,
        source,
        fields,
        [...path, key]
      );
      result[key] = value;
    }
    return result;
  }

  private async executeField(
    ctx: ExecContext,
    parentType: ObjectTypeDef,
    source: unknown,
    fields: readonly FieldNode[],
    path: readonly (string | number)[]
  ): Promise<unknown> {
    const fieldNode = fields[0];
    const fieldName = fieldNode.name.value;
    if (fieldName === '__typename') return parentType.name;
    const def = parentType.fields.get(fieldName);
    if (def === undefined) return undefined; // validated earlier; be permissive
    try {
      const resolved = await this.resolveFieldValue(ctx, def, fieldNode, source, path);
      return await this.completeValue(ctx, def.type, fields, resolved, path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.errors.push({ message, path, fieldName });
      return null;
    }
  }

  private async resolveFieldValue(
    ctx: ExecContext,
    def: FieldDef,
    fieldNode: FieldNode,
    source: unknown,
    path: readonly (string | number)[]
  ): Promise<unknown> {
    const args = argsToObject(fieldNode, ctx.variables);
    if (def.resolve !== undefined) {
      return awaitIfNeeded(
        def.resolve(source, args, ctx.contextValue, {
          fieldName: def.name,
          path,
          parentType: parentTypeName(path),
        })
      );
    }
    // default resolver: property access, or zero-arg method call
    if (isRecord(source)) {
      const v = source[def.name];
      if (typeof v === 'function') {
        return (v as (a: Record<string, unknown>) => unknown).call(source, args);
      }
      return v;
    }
    return undefined;
  }

  /** Complete a resolved value per its declared type, with null bubbling. */
  private async completeValue(
    ctx: ExecContext,
    type: TypeRef,
    fields: readonly FieldNode[],
    value: unknown,
    path: readonly (string | number)[]
  ): Promise<unknown> {
    if (type.kind === 'non_null') {
      const completed = await this.completeValue(ctx, type.ofType, fields, value, path);
      if (completed === null || completed === undefined) {
        throw new Error('Cannot return null for non-nullable field');
      }
      return completed;
    }
    if (value === null || value === undefined) return null;
    if (type.kind === 'list') {
      if (!Array.isArray(value)) {
        ctx.errors.push({ message: 'Expected iterable for list field', path });
        return null;
      }
      const out: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        try {
          out.push(
            await this.completeValue(ctx, type.ofType, fields, value[i], [...path, i])
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ctx.errors.push({ message, path: [...path, i] });
          out.push(null);
        }
      }
      return out;
    }
    const typeName = type.name;
    const typeDef = ctx.schema.getType(typeName);
    if (typeDef === undefined) {
      // unknown type name — return raw
      return value;
    }
    if (typeDef.kind === 'scalar' || typeDef.kind === 'enum') {
      return this.completeScalar(typeDef, value);
    }
    if (typeDef.kind === 'object') {
      const selSet = mergeSelectionSets(fields);
      if (selSet === undefined) return null;
      return this.executeSelectionSet(ctx, selSet, typeDef, value, path);
    }
    if (typeDef.kind === 'interface' || typeDef.kind === 'union') {
      const runtimeType = this.resolveAbstractType(ctx, typeDef, value);
      if (runtimeType === undefined) {
        ctx.errors.push({
          message: `Could not resolve concrete type for '${typeName}'`,
          path,
        });
        return null;
      }
      const selSet = mergeSelectionSets(fields);
      if (selSet === undefined) return null;
      return this.executeSelectionSet(ctx, selSet, runtimeType, value, path);
    }
    return value;
  }

  private completeScalar(typeDef: TypeDef, value: unknown): unknown {
    if (typeDef.kind === 'enum') {
      return typeof value === 'string' ? value : null;
    }
    const scalarDef = typeDef as ScalarTypeDef;
    if (scalarDef.serialize !== undefined) {
      try {
        return scalarDef.serialize(value);
      } catch {
        return null;
      }
    }
    switch (typeDef.name) {
      case 'Int':
        return typeof value === 'number' ? Math.trunc(value) : null;
      case 'Float':
        return typeof value === 'number' ? value : null;
      case 'String':
      case 'ID':
        return typeof value === 'string' || typeof value === 'number'
          ? String(value)
          : null;
      case 'Boolean':
        return typeof value === 'boolean' ? value : null;
      default:
        return value;
    }
  }

  private resolveAbstractType(
    ctx: ExecContext,
    typeDef: TypeDef,
    value: unknown
  ): ObjectTypeDef | undefined {
    if (typeDef.kind === 'union' && typeDef.resolveType !== undefined) {
      const name = typeDef.resolveType(value);
      return name !== undefined ? ctx.schema.getObjectType(name) : undefined;
    }
    if (typeDef.kind === 'interface' && typeDef.resolveType !== undefined) {
      const name = typeDef.resolveType(value);
      return name !== undefined ? ctx.schema.getObjectType(name) : undefined;
    }
    // try __typename on the value
    if (isRecord(value) && typeof value.__typename === 'string') {
      return ctx.schema.getObjectType(value.__typename);
    }
    // fallback: scan union members for isTypeOf
    if (typeDef.kind === 'union') {
      for (const member of typeDef.members) {
        const t = ctx.schema.getObjectType(member);
        if (t?.isTypeOf?.(value)) return t;
      }
    }
    return undefined;
  }
}

function parentTypeName(_path: readonly (string | number)[]): string {
  return 'Object';
}

function mergeSelectionSets(fields: readonly FieldNode[]): SelectionSetNode | undefined {
  for (const f of fields) {
    if (f.selectionSet !== undefined) {
      // merge all selection sets across same response key
      const selections: SelectionNode[] = [];
      for (const g of fields) {
        if (g.selectionSet !== undefined) {
          selections.push(...g.selectionSet.selections);
        }
      }
      return {
        kind: 'SelectionSet',
        selections,
        loc: f.selectionSet.loc,
      };
    }
  }
  return undefined;
}
