/**
 * Observability Domain Entity Tests
 */

import { ObservabilityEntity } from '../entities/ObservabilityEntity';
import { ObservabilityValueObject } from '../value-objects/ObservabilityValueObject';
import { ObservabilityDomainService } from '../services/ObservabilityDomainService';

describe('Observability Domain', () => {
  it('should create entity', () => {
    const entity = ObservabilityEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = ObservabilityValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new ObservabilityDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
