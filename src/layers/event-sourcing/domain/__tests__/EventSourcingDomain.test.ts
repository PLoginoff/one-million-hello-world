/**
 * EventSourcing Domain Entity Tests
 */

import { EventSourcingEntity } from '../entities/EventSourcingEntity';
import { EventSourcingValueObject } from '../value-objects/EventSourcingValueObject';
import { EventSourcingDomainService } from '../services/EventSourcingDomainService';

describe('EventSourcing Domain', () => {
  it('should create entity', () => {
    const entity = EventSourcingEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = EventSourcingValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new EventSourcingDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
