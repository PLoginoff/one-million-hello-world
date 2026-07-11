/**
 * SchemaRegistry Domain Entity Tests
 */

import { SchemaRegistryEntity } from '../entities/SchemaRegistryEntity';
import { SchemaRegistryValueObject } from '../value-objects/SchemaRegistryValueObject';
import { SchemaRegistryDomainService } from '../services/SchemaRegistryDomainService';

describe('SchemaRegistry Domain', () => {
  it('should create entity', () => {
    const entity = SchemaRegistryEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = SchemaRegistryValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new SchemaRegistryDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
