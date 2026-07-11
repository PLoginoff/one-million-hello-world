/**
 * Sso Domain Entity Tests
 */

import { SsoEntity } from '../entities/SsoEntity';
import { SsoValueObject } from '../value-objects/SsoValueObject';
import { SsoDomainService } from '../services/SsoDomainService';

describe('Sso Domain', () => {
  it('should create entity', () => {
    const entity = SsoEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = SsoValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new SsoDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
