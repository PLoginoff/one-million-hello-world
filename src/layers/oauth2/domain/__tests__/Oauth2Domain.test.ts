/**
 * Oauth2 Domain Entity Tests
 */

import { Oauth2Entity } from '../entities/Oauth2Entity';
import { Oauth2ValueObject } from '../value-objects/Oauth2ValueObject';
import { Oauth2DomainService } from '../services/Oauth2DomainService';

describe('Oauth2 Domain', () => {
  it('should create entity', () => {
    const entity = Oauth2Entity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = Oauth2ValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new Oauth2DomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
