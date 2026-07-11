/**
 * Secrets Domain Entity Tests
 */

import { SecretsEntity } from '../entities/SecretsEntity';
import { SecretsValueObject } from '../value-objects/SecretsValueObject';
import { SecretsDomainService } from '../services/SecretsDomainService';

describe('Secrets Domain', () => {
  it('should create entity', () => {
    const entity = SecretsEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = SecretsValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new SecretsDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
