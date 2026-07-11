/**
 * Graphql Domain Entity Tests
 */

import { GraphqlEntity } from '../entities/GraphqlEntity';
import { GraphqlValueObject } from '../value-objects/GraphqlValueObject';
import { GraphqlDomainService } from '../services/GraphqlDomainService';

describe('Graphql Domain', () => {
  it('should create entity', () => {
    const entity = GraphqlEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = GraphqlValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new GraphqlDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
