/**
 * PropertyTesting Domain Entity Tests
 */

import { PropertyTestingEntity } from '../entities/PropertyTestingEntity';
import { PropertyTestingValueObject } from '../value-objects/PropertyTestingValueObject';
import { PropertyTestingDomainService } from '../services/PropertyTestingDomainService';

describe('PropertyTesting Domain', () => {
  it('should create entity', () => {
    const entity = PropertyTestingEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = PropertyTestingValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new PropertyTestingDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
