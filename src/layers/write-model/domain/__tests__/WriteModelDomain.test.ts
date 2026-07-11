/**
 * WriteModel Domain Entity Tests
 */

import { WriteModelEntity } from '../entities/WriteModelEntity';
import { WriteModelValueObject } from '../value-objects/WriteModelValueObject';
import { WriteModelDomainService } from '../services/WriteModelDomainService';

describe('WriteModel Domain', () => {
  it('should create entity', () => {
    const entity = WriteModelEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = WriteModelValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new WriteModelDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
