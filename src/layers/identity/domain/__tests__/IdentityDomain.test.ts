/**
 * Identity Domain Entity Tests
 */

import { IdentityEntity } from '../entities/IdentityEntity';
import { IdentityValueObject } from '../value-objects/IdentityValueObject';
import { IdentityDomainService } from '../services/IdentityDomainService';

describe('Identity Domain', () => {
  it('should create entity', () => {
    const entity = IdentityEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = IdentityValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new IdentityDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
