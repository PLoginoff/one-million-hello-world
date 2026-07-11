/**
 * CanaryDeploy Domain Entity Tests
 */

import { CanaryDeployEntity } from '../entities/CanaryDeployEntity';
import { CanaryDeployValueObject } from '../value-objects/CanaryDeployValueObject';
import { CanaryDeployDomainService } from '../services/CanaryDeployDomainService';

describe('CanaryDeploy Domain', () => {
  it('should create entity', () => {
    const entity = CanaryDeployEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = CanaryDeployValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new CanaryDeployDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
