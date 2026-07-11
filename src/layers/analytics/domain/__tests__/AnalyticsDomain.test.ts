/**
 * Analytics Domain Entity Tests
 */

import { AnalyticsEntity } from '../entities/AnalyticsEntity';
import { AnalyticsValueObject } from '../value-objects/AnalyticsValueObject';
import { AnalyticsDomainService } from '../services/AnalyticsDomainService';

describe('Analytics Domain', () => {
  it('should create entity', () => {
    const entity = AnalyticsEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = AnalyticsValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new AnalyticsDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
