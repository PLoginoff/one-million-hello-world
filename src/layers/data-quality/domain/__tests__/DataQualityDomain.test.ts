/**
 * DataQuality Domain Entity Tests
 */

import { DataQualityEntity } from '../entities/DataQualityEntity';
import { DataQualityValueObject } from '../value-objects/DataQualityValueObject';
import { DataQualityDomainService } from '../services/DataQualityDomainService';

describe('DataQuality Domain', () => {
  it('should create entity', () => {
    const entity = DataQualityEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = DataQualityValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new DataQualityDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
