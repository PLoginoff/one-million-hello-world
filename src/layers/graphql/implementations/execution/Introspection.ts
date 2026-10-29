/**
 * Introspection
 *
 * Produces __schema/__type introspection results matching the standard
 * introspection query shape (TypeKind/TypeRef nested structure), usable
 * for tooling and schema documentation.
 */

import {
  GraphQLSchema,
  TypeDef,
  TypeRef,
  ObjectTypeDef,
  FieldDef,
} from '../schema/Schema';

export interface IntroTypeRef {
  readonly kind: string;
  readonly name: string | null;
  readonly ofType: IntroTypeRef | null;
}

export interface IntroField {
  readonly name: string;
  readonly type: IntroTypeRef;
  readonly args: readonly { name: string; type: IntroTypeRef; defaultValue: string | null }[];
  readonly isDeprecated: boolean;
  readonly deprecationReason: string | null;
}

export interface IntroType {
  readonly kind: string;
  readonly name: string;
  readonly fields: readonly IntroField[] | null;
  readonly enumValues: readonly { name: string }[] | null;
  readonly inputFields:
    | readonly { name: string; type: IntroTypeRef; defaultValue: string | null }[]
    | null;
  readonly possibleTypes: readonly { name: string; kind: string }[] | null;
}

export interface IntroSchema {
  readonly queryType: { name: string };
  readonly mutationType: { name: string } | null;
  readonly subscriptionType: { name: string } | null;
  readonly types: readonly IntroType[];
}

function kindOf(t: TypeDef): string {
  switch (t.kind) {
    case 'scalar':
      return 'SCALAR';
    case 'object':
      return 'OBJECT';
    case 'interface':
      return 'INTERFACE';
    case 'union':
      return 'UNION';
    case 'enum':
      return 'ENUM';
    case 'input':
      return 'INPUT_OBJECT';
  }
}

function introTypeRef(t: TypeRef, schema: GraphQLSchema): IntroTypeRef {
  switch (t.kind) {
    case 'non_null':
      return { kind: 'NON_NULL', name: null, ofType: introTypeRef(t.ofType, schema) };
    case 'list':
      return { kind: 'LIST', name: null, ofType: introTypeRef(t.ofType, schema) };
    default: {
      const def = schema.getType(t.name);
      return { kind: def !== undefined ? kindOf(def) : 'OBJECT', name: t.name, ofType: null };
    }
  }
}

function introField(f: FieldDef, schema: GraphQLSchema): IntroField {
  return {
    name: f.name,
    type: introTypeRef(f.type, schema),
    args: f.args.map((a) => ({
      name: a.name,
      type: introTypeRef(a.type, schema),
      defaultValue: a.defaultValue !== undefined ? JSON.stringify(a.defaultValue) : null,
    })),
    isDeprecated: f.deprecationReason !== undefined,
    deprecationReason: f.deprecationReason ?? null,
  };
}

export function introspectSchema(schema: GraphQLSchema): IntroSchema {
  const types: IntroType[] = [];
  for (const name of schema.typeNames()) {
    const t = schema.getType(name);
    if (t === undefined) continue;
    types.push(introType(t, schema));
  }
  return {
    queryType: { name: schema.queryType.name },
    mutationType: schema.mutationType !== undefined ? { name: schema.mutationType.name } : null,
    subscriptionType:
      schema.subscriptionType !== undefined ? { name: schema.subscriptionType.name } : null,
    types,
  };
}

export function introspectType(schema: GraphQLSchema, name: string): IntroType | null {
  const t = schema.getType(name);
  return t !== undefined ? introType(t, schema) : null;
}

function introType(t: TypeDef, schema: GraphQLSchema): IntroType {
  switch (t.kind) {
    case 'object':
    case 'interface':
      return {
        kind: kindOf(t),
        name: t.name,
        fields: [...t.fields.values()].map((f) => introField(f, schema)),
        enumValues: null,
        inputFields: null,
        possibleTypes:
          t.kind === 'interface'
            ? findImplementations(t.name, schema).map((n) => ({ name: n, kind: 'OBJECT' }))
            : null,
      };
    case 'union':
      return {
        kind: 'UNION',
        name: t.name,
        fields: null,
        enumValues: null,
        inputFields: null,
        possibleTypes: t.members.map((n) => ({ name: n, kind: 'OBJECT' })),
      };
    case 'enum':
      return {
        kind: 'ENUM',
        name: t.name,
        fields: null,
        enumValues: t.values.map((v) => ({ name: v })),
        inputFields: null,
        possibleTypes: null,
      };
    case 'input':
      return {
        kind: 'INPUT_OBJECT',
        name: t.name,
        fields: null,
        enumValues: null,
        inputFields: [...t.fields.values()].map((f) => ({
          name: f.name,
          type: introTypeRef(f.type, schema),
          defaultValue: f.defaultValue !== undefined ? JSON.stringify(f.defaultValue) : null,
        })),
        possibleTypes: null,
      };
    case 'scalar':
      return {
        kind: 'SCALAR',
        name: t.name,
        fields: null,
        enumValues: null,
        inputFields: null,
        possibleTypes: null,
      };
  }
}

function findImplementations(interfaceName: string, schema: GraphQLSchema): string[] {
  const iface = schema.getType(interfaceName);
  if (iface === undefined || iface.kind !== 'interface') return [];
  const out: string[] = [];
  for (const name of schema.typeNames()) {
    const t = schema.getType(name);
    if (t === undefined || t.kind !== 'object') continue;
    let implementsAll = true;
    for (const f of iface.fields.keys()) {
      if (!t.fields.has(f)) {
        implementsAll = false;
        break;
      }
    }
    if (implementsAll) out.push(name);
  }
  return out;
}

/** Handle __schema / __type meta fields inside execution. */
export function isIntrospectionField(name: string): boolean {
  return name === '__schema' || name === '__type';
}
