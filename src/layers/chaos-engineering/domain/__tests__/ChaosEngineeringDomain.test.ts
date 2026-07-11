/**
 * ChaosEngineering Domain Entity Tests
 */

import { ChaosEngineeringEntity } from '../entities/ChaosEngineeringEntity';
import { ChaosEngineeringValueObject } from '../value-objects/ChaosEngineeringValueObject';
import { ChaosEngineeringDomainService } from '../services/ChaosEngineeringDomainService';

describe('ChaosEngineering Domain', () => {
  it('should create entity', () => {
    const entity = ChaosEngineeringEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = ChaosEngineeringValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new ChaosEngineeringDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
