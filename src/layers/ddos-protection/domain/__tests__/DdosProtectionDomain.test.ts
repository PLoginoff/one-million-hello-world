/**
 * DdosProtection Domain Entity Tests
 */

import { DdosProtectionEntity } from '../entities/DdosProtectionEntity';
import { DdosProtectionValueObject } from '../value-objects/DdosProtectionValueObject';
import { DdosProtectionDomainService } from '../services/DdosProtectionDomainService';

describe('DdosProtection Domain', () => {
  it('should create entity', () => {
    const entity = DdosProtectionEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = DdosProtectionValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new DdosProtectionDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
