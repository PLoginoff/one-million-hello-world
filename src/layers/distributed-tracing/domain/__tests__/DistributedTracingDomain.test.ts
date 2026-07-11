/**
 * DistributedTracing Domain Entity Tests
 */

import { DistributedTracingEntity } from '../entities/DistributedTracingEntity';
import { DistributedTracingValueObject } from '../value-objects/DistributedTracingValueObject';
import { DistributedTracingDomainService } from '../services/DistributedTracingDomainService';

describe('DistributedTracing Domain', () => {
  it('should create entity', () => {
    const entity = DistributedTracingEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = DistributedTracingValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new DistributedTracingDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
