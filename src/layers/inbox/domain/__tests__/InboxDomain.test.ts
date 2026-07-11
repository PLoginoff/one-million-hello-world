/**
 * Inbox Domain Entity Tests
 */

import { InboxEntity } from '../entities/InboxEntity';
import { InboxValueObject } from '../value-objects/InboxValueObject';
import { InboxDomainService } from '../services/InboxDomainService';

describe('Inbox Domain', () => {
  it('should create entity', () => {
    const entity = InboxEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = InboxValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new InboxDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
