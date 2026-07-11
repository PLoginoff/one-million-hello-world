/**
 * EdgeCache Domain Entity Tests
 */

import { EdgeCacheEntity } from '../entities/EdgeCacheEntity';
import { EdgeCacheValueObject } from '../value-objects/EdgeCacheValueObject';
import { EdgeCacheDomainService } from '../services/EdgeCacheDomainService';

describe('EdgeCache Domain', () => {
  it('should create entity', () => {
    const entity = EdgeCacheEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = EdgeCacheValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new EdgeCacheDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
