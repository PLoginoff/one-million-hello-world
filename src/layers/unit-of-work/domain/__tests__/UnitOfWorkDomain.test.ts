/**
 * UnitOfWork Domain Entity Tests
 */

import { UnitOfWorkEntity } from '../entities/UnitOfWorkEntity';
import { UnitOfWorkValueObject } from '../value-objects/UnitOfWorkValueObject';
import { UnitOfWorkDomainService } from '../services/UnitOfWorkDomainService';

describe('UnitOfWork Domain', () => {
  it('should create entity', () => {
    const entity = UnitOfWorkEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = UnitOfWorkValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new UnitOfWorkDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
