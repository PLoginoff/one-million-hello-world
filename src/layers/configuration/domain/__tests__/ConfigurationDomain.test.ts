/**
 * Configuration Domain Entity Tests
 */

import { ConfigurationEntity } from '../entities/ConfigurationEntity';
import { ConfigurationValueObject } from '../value-objects/ConfigurationValueObject';
import { ConfigurationDomainService } from '../services/ConfigurationDomainService';

describe('Configuration Domain', () => {
  it('should create entity', () => {
    const entity = ConfigurationEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = ConfigurationValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new ConfigurationDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
