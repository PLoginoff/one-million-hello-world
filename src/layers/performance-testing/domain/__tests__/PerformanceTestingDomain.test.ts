/**
 * PerformanceTesting Domain Entity Tests
 */

import { PerformanceTestingEntity } from '../entities/PerformanceTestingEntity';
import { PerformanceTestingValueObject } from '../value-objects/PerformanceTestingValueObject';
import { PerformanceTestingDomainService } from '../services/PerformanceTestingDomainService';

describe('PerformanceTesting Domain', () => {
  it('should create entity', () => {
    const entity = PerformanceTestingEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = PerformanceTestingValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new PerformanceTestingDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
