/**
 * QueryObject Domain Entity Tests
 */

import { QueryObjectEntity } from '../entities/QueryObjectEntity';
import { QueryObjectValueObject } from '../value-objects/QueryObjectValueObject';
import { QueryObjectDomainService } from '../services/QueryObjectDomainService';

describe('QueryObject Domain', () => {
  it('should create entity', () => {
    const entity = QueryObjectEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = QueryObjectValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new QueryObjectDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
