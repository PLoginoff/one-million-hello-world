/**
 * Cqrs Domain Entity Tests
 */

import { CqrsEntity } from '../entities/CqrsEntity';
import { CqrsValueObject } from '../value-objects/CqrsValueObject';
import { CqrsDomainService } from '../services/CqrsDomainService';

describe('Cqrs Domain', () => {
  it('should create entity', () => {
    const entity = CqrsEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = CqrsValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new CqrsDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
