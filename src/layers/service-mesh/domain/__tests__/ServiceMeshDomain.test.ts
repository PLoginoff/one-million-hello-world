/**
 * ServiceMesh Domain Entity Tests
 */

import { ServiceMeshEntity } from '../entities/ServiceMeshEntity';
import { ServiceMeshValueObject } from '../value-objects/ServiceMeshValueObject';
import { ServiceMeshDomainService } from '../services/ServiceMeshDomainService';

describe('ServiceMesh Domain', () => {
  it('should create entity', () => {
    const entity = ServiceMeshEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = ServiceMeshValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new ServiceMeshDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
