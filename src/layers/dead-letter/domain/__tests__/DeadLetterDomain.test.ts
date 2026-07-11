/**
 * DeadLetter Domain Entity Tests
 */

import { DeadLetterEntity } from '../entities/DeadLetterEntity';
import { DeadLetterValueObject } from '../value-objects/DeadLetterValueObject';
import { DeadLetterDomainService } from '../services/DeadLetterDomainService';

describe('DeadLetter Domain', () => {
  it('should create entity', () => {
    const entity = DeadLetterEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = DeadLetterValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new DeadLetterDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
