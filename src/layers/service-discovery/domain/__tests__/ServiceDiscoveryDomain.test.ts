/**
 * ServiceDiscovery Domain Entity Tests
 */

import { ServiceDiscoveryEntity } from '../entities/ServiceDiscoveryEntity';
import { ServiceDiscoveryValueObject } from '../value-objects/ServiceDiscoveryValueObject';
import { ServiceDiscoveryDomainService } from '../services/ServiceDiscoveryDomainService';

describe('ServiceDiscovery Domain', () => {
  it('should create entity', () => {
    const entity = ServiceDiscoveryEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = ServiceDiscoveryValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new ServiceDiscoveryDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
