/**
 * Websocket Domain Entity Tests
 */

import { WebsocketEntity } from '../entities/WebsocketEntity';
import { WebsocketValueObject } from '../value-objects/WebsocketValueObject';
import { WebsocketDomainService } from '../services/WebsocketDomainService';

describe('Websocket Domain', () => {
  it('should create entity', () => {
    const entity = WebsocketEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = WebsocketValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new WebsocketDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
