/**
 * Mfa Domain Entity Tests
 */

import { MfaEntity } from '../entities/MfaEntity';
import { MfaValueObject } from '../value-objects/MfaValueObject';
import { MfaDomainService } from '../services/MfaDomainService';

describe('Mfa Domain', () => {
  it('should create entity', () => {
    const entity = MfaEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = MfaValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new MfaDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
