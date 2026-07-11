/**
 * ReadModel Domain Entity Tests
 */

import { ReadModelEntity } from '../entities/ReadModelEntity';
import { ReadModelValueObject } from '../value-objects/ReadModelValueObject';
import { ReadModelDomainService } from '../services/ReadModelDomainService';

describe('ReadModel Domain', () => {
  it('should create entity', () => {
    const entity = ReadModelEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = ReadModelValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new ReadModelDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
