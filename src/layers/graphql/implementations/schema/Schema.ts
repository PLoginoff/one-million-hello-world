/**
 * Schema
 *
 * Programmatic schema model for the execution engine: named types
 * (scalars, objects, enums, input objects), fields with resolvers, and
 * a Schema container with Query/Mutation root types.
 */

export type ScalarName = 'Int' | 'Float' | 'String' | 'Boolean' | 'ID';

export type TypeRef =
  | { readonly kind: 'scalar'; readonly name: ScalarName | string }
  | { readonly kind: 'object'; readonly name: string }
  | { readonly kind: 'enum'; readonly name: string }
  | { readonly kind: 'input'; readonly name: string }
  | { readonly kind: 'list'; readonly ofType: TypeRef }
  | { readonly kind: 'non_null'; readonly ofType: TypeRef };

export const scalar = (name: ScalarName | string): TypeRef => ({ kind: 'scalar', name });
export const object = (name: string): TypeRef => ({ kind: 'object', name });
export const enumType = (name: string): TypeRef => ({ kind: 'enum', name });
export const inputType = (name: string): TypeRef => ({ kind: 'input', name });
export const listOf = (ofType: TypeRef): TypeRef => ({ kind: 'list', ofType });
export const nonNull = (ofType: TypeRef): TypeRef => ({ kind: 'non_null', ofType });

export function printTypeRef(t: TypeRef): string {
  switch (t.kind) {
    case 'list':
      return `[${printTypeRef(t.ofType)}]`;
    case 'non_null':
      return `${printTypeRef(t.ofType)}!`;
    default:
      return t.name;
  }
}

export interface ResolveInfo {
  readonly fieldName: string;
  readonly path: readonly (string | number)[];
  readonly parentType: string;
}

export type ResolverFn = (
  source: unknown,
  args: Record<string, unknown>,
  context: unknown,
  info: ResolveInfo
) => unknown;

export interface ArgumentDef {
  readonly name: string;
  readonly type: TypeRef;
  readonly defaultValue?: unknown;
}

export interface FieldDef {
  readonly name: string;
  readonly type: TypeRef;
  readonly args: readonly ArgumentDef[];
  readonly resolve?: ResolverFn;
  readonly deprecationReason?: string;
}

export interface ObjectTypeDef {
  readonly kind: 'object';
  readonly name: string;
  readonly fields: ReadonlyMap<string, FieldDef>;
  /** for unions/interfaces: detect membership */
  readonly isTypeOf?: (value: unknown) => boolean;
}

export interface ScalarTypeDef {
  readonly kind: 'scalar';
  readonly name: string;
  readonly serialize?: (value: unknown) => unknown;
  readonly parseValue?: (value: unknown) => unknown;
}

export interface EnumTypeDef {
  readonly kind: 'enum';
  readonly name: string;
  readonly values: readonly string[];
}

export interface InputFieldDef {
  readonly name: string;
  readonly type: TypeRef;
  readonly defaultValue?: unknown;
}

export interface InputObjectTypeDef {
  readonly kind: 'input';
  readonly name: string;
  readonly fields: ReadonlyMap<string, InputFieldDef>;
}

export interface InterfaceTypeDef {
  readonly kind: 'interface';
  readonly name: string;
  readonly fields: ReadonlyMap<string, FieldDef>;
  readonly resolveType?: (value: unknown) => string | undefined;
}

export interface UnionTypeDef {
  readonly kind: 'union';
  readonly name: string;
  readonly members: readonly string[];
  readonly resolveType?: (value: unknown) => string | undefined;
}

export type TypeDef =
  | ObjectTypeDef
  | ScalarTypeDef
  | EnumTypeDef
  | InputObjectTypeDef
  | InterfaceTypeDef
  | UnionTypeDef;

export class GraphQLObjectType implements ObjectTypeDef {
  readonly kind = 'object' as const;
  readonly name: string;
  readonly fields: Map<string, FieldDef>;
  readonly isTypeOf?: (value: unknown) => boolean;

  constructor(
    name: string,
    fields: readonly FieldDef[],
    isTypeOf?: (value: unknown) => boolean
  ) {
    this.name = name;
    this.fields = new Map(fields.map((f) => [f.name, f]));
    this.isTypeOf = isTypeOf;
  }

  field(name: string): FieldDef | undefined {
    return this.fields.get(name);
  }
}

export class GraphQLSchema {
  private readonly types: Map<string, TypeDef> = new Map();
  readonly queryType: ObjectTypeDef;
  readonly mutationType?: ObjectTypeDef;
  readonly subscriptionType?: ObjectTypeDef;

  constructor(options: {
    query: ObjectTypeDef;
    mutation?: ObjectTypeDef;
    subscription?: ObjectTypeDef;
    types?: readonly TypeDef[];
  }) {
    this.queryType = options.query;
    this.mutationType = options.mutation;
    this.subscriptionType = options.subscription;
    this.registerType(this.queryType);
    if (this.mutationType !== undefined) this.registerType(this.mutationType);
    if (this.subscriptionType !== undefined) this.registerType(this.subscriptionType);
    for (const t of options.types ?? []) this.registerType(t);
    // built-in scalars
    for (const s of ['Int', 'Float', 'String', 'Boolean', 'ID'] as const) {
      if (!this.types.has(s)) {
        this.types.set(s, { kind: 'scalar', name: s });
      }
    }
  }

  registerType(def: TypeDef): void {
    this.types.set(def.name, def);
  }

  getType(name: string): TypeDef | undefined {
    return this.types.get(name);
  }

  getObjectType(name: string): ObjectTypeDef | undefined {
    const t = this.types.get(name);
    return t !== undefined && t.kind === 'object' ? t : undefined;
  }

  rootType(operation: 'query' | 'mutation' | 'subscription'): ObjectTypeDef | undefined {
    switch (operation) {
      case 'query':
        return this.queryType;
      case 'mutation':
        return this.mutationType;
      case 'subscription':
        return this.subscriptionType;
    }
  }

  typeNames(): string[] {
    return [...this.types.keys()];
  }
}

/** Fluent builder for object types. */
export class ObjectTypeBuilder {
  private readonly name: string;
  private readonly fieldList: FieldDef[] = [];
  private typeCheck: ((value: unknown) => boolean) | undefined;

  constructor(name: string) {
    this.name = name;
  }

  field(def: FieldDef): this {
    this.fieldList.push(def);
    return this;
  }

  isTypeOf(fn: (value: unknown) => boolean): this {
    this.typeCheck = fn;
    return this;
  }

  build(): GraphQLObjectType {
    return new GraphQLObjectType(this.name, this.fieldList, this.typeCheck);
  }
}
