/**
 * IdentityProvider Domain Entity Tests
 */

import { IdentityProviderEntity } from '../entities/IdentityProviderEntity';
import { IdentityProviderValueObject } from '../value-objects/IdentityProviderValueObject';
import { IdentityProviderDomainService } from '../services/IdentityProviderDomainService';

describe('IdentityProvider Domain', () => {
  it('should create entity', () => {
    const entity = IdentityProviderEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = IdentityProviderValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new IdentityProviderDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
