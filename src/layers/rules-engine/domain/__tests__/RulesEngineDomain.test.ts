/**
 * RulesEngine Domain Entity Tests
 */

import { RulesEngineEntity } from '../entities/RulesEngineEntity';
import { RulesEngineValueObject } from '../value-objects/RulesEngineValueObject';
import { RulesEngineDomainService } from '../services/RulesEngineDomainService';

describe('RulesEngine Domain', () => {
  it('should create entity', () => {
    const entity = RulesEngineEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = RulesEngineValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new RulesEngineDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
