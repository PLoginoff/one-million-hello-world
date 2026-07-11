/**
 * Waf Domain Entity Tests
 */

import { WafEntity } from '../entities/WafEntity';
import { WafValueObject } from '../value-objects/WafValueObject';
import { WafDomainService } from '../services/WafDomainService';

describe('Waf Domain', () => {
  it('should create entity', () => {
    const entity = WafEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = WafValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new WafDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
