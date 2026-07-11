/**
 * PolicyEngine Domain Entity Tests
 */

import { PolicyEngineEntity } from '../entities/PolicyEngineEntity';
import { PolicyEngineValueObject } from '../value-objects/PolicyEngineValueObject';
import { PolicyEngineDomainService } from '../services/PolicyEngineDomainService';

describe('PolicyEngine Domain', () => {
  it('should create entity', () => {
    const entity = PolicyEngineEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = PolicyEngineValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new PolicyEngineDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
