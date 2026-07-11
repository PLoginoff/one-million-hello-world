/**
 * DataLake Domain Entity Tests
 */

import { DataLakeEntity } from '../entities/DataLakeEntity';
import { DataLakeValueObject } from '../value-objects/DataLakeValueObject';
import { DataLakeDomainService } from '../services/DataLakeDomainService';

describe('DataLake Domain', () => {
  it('should create entity', () => {
    const entity = DataLakeEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = DataLakeValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new DataLakeDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
