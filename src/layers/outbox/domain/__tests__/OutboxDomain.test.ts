/**
 * Outbox Domain Entity Tests
 */

import { OutboxEntity } from '../entities/OutboxEntity';
import { OutboxValueObject } from '../value-objects/OutboxValueObject';
import { OutboxDomainService } from '../services/OutboxDomainService';

describe('Outbox Domain', () => {
  it('should create entity', () => {
    const entity = OutboxEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = OutboxValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new OutboxDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
