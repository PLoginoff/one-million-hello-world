/**
 * Throttling Domain Entity Tests
 */

import { ThrottlingEntity } from '../entities/ThrottlingEntity';
import { ThrottlingValueObject } from '../value-objects/ThrottlingValueObject';
import { ThrottlingDomainService } from '../services/ThrottlingDomainService';

describe('Throttling Domain', () => {
  it('should create entity', () => {
    const entity = ThrottlingEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = ThrottlingValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new ThrottlingDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
