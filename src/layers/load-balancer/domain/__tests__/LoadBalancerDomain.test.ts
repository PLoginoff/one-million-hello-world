/**
 * LoadBalancer Domain Entity Tests
 */

import { LoadBalancerEntity } from '../entities/LoadBalancerEntity';
import { LoadBalancerValueObject } from '../value-objects/LoadBalancerValueObject';
import { LoadBalancerDomainService } from '../services/LoadBalancerDomainService';

describe('LoadBalancer Domain', () => {
  it('should create entity', () => {
    const entity = LoadBalancerEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = LoadBalancerValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new LoadBalancerDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
