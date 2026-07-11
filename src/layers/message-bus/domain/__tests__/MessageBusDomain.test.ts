/**
 * MessageBus Domain Entity Tests
 */

import { MessageBusEntity } from '../entities/MessageBusEntity';
import { MessageBusValueObject } from '../value-objects/MessageBusValueObject';
import { MessageBusDomainService } from '../services/MessageBusDomainService';

describe('MessageBus Domain', () => {
  it('should create entity', () => {
    const entity = MessageBusEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = MessageBusValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new MessageBusDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
