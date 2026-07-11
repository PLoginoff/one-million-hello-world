/**
 * JwtValidation Domain Entity Tests
 */

import { JwtValidationEntity } from '../entities/JwtValidationEntity';
import { JwtValidationValueObject } from '../value-objects/JwtValidationValueObject';
import { JwtValidationDomainService } from '../services/JwtValidationDomainService';

describe('JwtValidation Domain', () => {
  it('should create entity', () => {
    const entity = JwtValidationEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = JwtValidationValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new JwtValidationDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
