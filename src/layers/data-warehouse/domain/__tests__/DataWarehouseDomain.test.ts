/**
 * DataWarehouse Domain Entity Tests
 */

import { DataWarehouseEntity } from '../entities/DataWarehouseEntity';
import { DataWarehouseValueObject } from '../value-objects/DataWarehouseValueObject';
import { DataWarehouseDomainService } from '../services/DataWarehouseDomainService';

describe('DataWarehouse Domain', () => {
  it('should create entity', () => {
    const entity = DataWarehouseEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = DataWarehouseValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new DataWarehouseDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
