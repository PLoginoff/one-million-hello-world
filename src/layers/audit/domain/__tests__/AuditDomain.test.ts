/**
 * Audit Domain Entity Tests
 */

import { AuditEntity } from '../entities/AuditEntity';
import { AuditValueObject } from '../value-objects/AuditValueObject';
import { AuditDomainService } from '../services/AuditDomainService';

describe('Audit Domain', () => {
  it('should create entity', () => {
    const entity = AuditEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = AuditValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new AuditDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
