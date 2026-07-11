/**
 * Encryption Domain Entity Tests
 */

import { EncryptionEntity } from '../entities/EncryptionEntity';
import { EncryptionValueObject } from '../value-objects/EncryptionValueObject';
import { EncryptionDomainService } from '../services/EncryptionDomainService';

describe('Encryption Domain', () => {
  it('should create entity', () => {
    const entity = EncryptionEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = EncryptionValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new EncryptionDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
