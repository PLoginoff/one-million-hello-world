/**
 * Specification Domain Entity Tests
 */

import { SpecificationEntity } from '../entities/SpecificationEntity';
import { SpecificationValueObject } from '../value-objects/SpecificationValueObject';
import { SpecificationDomainService } from '../services/SpecificationDomainService';

describe('Specification Domain', () => {
  it('should create entity', () => {
    const entity = SpecificationEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = SpecificationValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new SpecificationDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
