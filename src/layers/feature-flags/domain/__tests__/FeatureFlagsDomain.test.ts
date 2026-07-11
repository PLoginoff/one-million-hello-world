/**
 * FeatureFlags Domain Entity Tests
 */

import { FeatureFlagsEntity } from '../entities/FeatureFlagsEntity';
import { FeatureFlagsValueObject } from '../value-objects/FeatureFlagsValueObject';
import { FeatureFlagsDomainService } from '../services/FeatureFlagsDomainService';

describe('FeatureFlags Domain', () => {
  it('should create entity', () => {
    const entity = FeatureFlagsEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = FeatureFlagsValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new FeatureFlagsDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
