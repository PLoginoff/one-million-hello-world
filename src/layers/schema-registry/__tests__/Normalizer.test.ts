/**
 * SchemaNormalizer tests — reference resolution, flattening, implied refs.
 */

import { describe, it, expect } from 'bun:test';
import { SchemaNormalizer, typeTableFromRefs } from '../registry/SchemaNormalizer';
import { RegistryError, SchemaRegistryErrorCode } from '../registry/types';

const ADDRESS = {
  type: 'record', name: 'Address',
  fields: [{ name: 'street', type: 'string' }, { name: 'zip', type: 'string' }],
};

describe('SchemaNormalizer.resolveReferences', () => {
  it('inlines named-type references', () => {
    const table = new Map<string, unknown>([['Address', ADDRESS]]);
    const schema = {
      type: 'record', name: 'User',
      fields: [{ name: 'addr', type: 'Address' }],
    };
    const resolved = SchemaNormalizer.resolveReferences(schema, table) as {
      fields: Array<{ type: { type: string } }>;
    };
    expect(resolved.fields[0].type.type).toBe('record');
  });

  it('detects self-referencing cycles', () => {
    const cyc = { type: 'record', name: 'N', fields: [{ name: 'next', type: 'N' }] };
    const table = new Map<string, unknown>([['N', cyc]]);
    expect(() => SchemaNormalizer.resolveReferences('N', table))
      .toThrowError(expect.objectContaining({ code: SchemaRegistryErrorCode.CIRCULAR_REFERENCE }));
  });

  it('unresolved names throw or pass through', () => {
    expect(() => SchemaNormalizer.resolveReferences('Missing', new Map())).toThrow(RegistryError);
    expect(SchemaNormalizer.resolveReferences('Missing', new Map(), true)).toBe('Missing');
  });

  it('typeTableFromRefs builds lookup from SchemaReference list', () => {
    const table = typeTableFromRefs(
      [{ name: 'Address', subject: 'geo', version: 2 }],
      (s, v) => (s === 'geo' && v === 2 ? ADDRESS : undefined)
    );
    expect(table instanceof Map ? table.get('Address') : undefined).toBe(ADDRESS);
  });
});

describe('SchemaNormalizer.flatten', () => {
  it('hoists nested records into definitions', () => {
    const schema = {
      type: 'record', name: 'User',
      fields: [
        { name: 'home', type: ADDRESS },
        { name: 'work', type: ADDRESS },
      ],
    };
    const { root, definitions } = SchemaNormalizer.flatten(schema) as {
      root: { fields: Array<{ type: string }> };
      definitions: Record<string, unknown>;
    };
    expect(Object.keys(definitions)).toEqual(['Address']);
    expect(root.fields[0].type).toBe('Address');
    expect(root.fields[1].type).toBe('Address');
  });
});

describe('SchemaNormalizer.impliedReferences', () => {
  it('finds external type names used but not defined locally', () => {
    const schema = {
      type: 'record', name: 'Order',
      fields: [
        { name: 'shipTo', type: 'Address' },
        { name: 'item', type: { type: 'record', name: 'Item', fields: [{ name: 'sku', type: 'string' }] } },
      ],
    };
    expect(SchemaNormalizer.impliedReferences(schema)).toEqual(['Address']);
  });
});
