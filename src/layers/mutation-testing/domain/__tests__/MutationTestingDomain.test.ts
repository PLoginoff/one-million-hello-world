/**
 * MutationTesting Domain Entity Tests
 */

import { MutationTestingEntity } from '../entities/MutationTestingEntity';
import { MutationTestingValueObject } from '../value-objects/MutationTestingValueObject';
import { MutationTestingDomainService } from '../services/MutationTestingDomainService';

describe('MutationTesting Domain', () => {
  it('should create entity', () => {
    const entity = MutationTestingEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = MutationTestingValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new MutationTestingDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
