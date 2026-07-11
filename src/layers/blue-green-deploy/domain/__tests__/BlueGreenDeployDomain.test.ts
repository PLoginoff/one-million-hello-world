/**
 * BlueGreenDeploy Domain Entity Tests
 */

import { BlueGreenDeployEntity } from '../entities/BlueGreenDeployEntity';
import { BlueGreenDeployValueObject } from '../value-objects/BlueGreenDeployValueObject';
import { BlueGreenDeployDomainService } from '../services/BlueGreenDeployDomainService';

describe('BlueGreenDeploy Domain', () => {
  it('should create entity', () => {
    const entity = BlueGreenDeployEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = BlueGreenDeployValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new BlueGreenDeployDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
