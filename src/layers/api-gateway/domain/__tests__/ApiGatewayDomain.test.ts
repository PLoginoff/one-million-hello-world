/**
 * ApiGateway Domain Entity Tests
 */

import { ApiGatewayEntity } from '../entities/ApiGatewayEntity';
import { ApiGatewayValueObject } from '../value-objects/ApiGatewayValueObject';
import { ApiGatewayDomainService } from '../services/ApiGatewayDomainService';

describe('ApiGateway Domain', () => {
  it('should create entity', () => {
    const entity = ApiGatewayEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = ApiGatewayValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new ApiGatewayDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
