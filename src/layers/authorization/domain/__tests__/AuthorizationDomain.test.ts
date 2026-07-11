/**
 * Authorization Domain Entity Tests
 */

import { AuthorizationEntity } from '../entities/AuthorizationEntity';
import { AuthorizationValueObject } from '../value-objects/AuthorizationValueObject';
import { AuthorizationDomainService } from '../services/AuthorizationDomainService';

describe('Authorization Domain', () => {
  it('should create entity', () => {
    const entity = AuthorizationEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = AuthorizationValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new AuthorizationDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
