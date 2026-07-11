/**
 * FraudDetection Domain Entity Tests
 */

import { FraudDetectionEntity } from '../entities/FraudDetectionEntity';
import { FraudDetectionValueObject } from '../value-objects/FraudDetectionValueObject';
import { FraudDetectionDomainService } from '../services/FraudDetectionDomainService';

describe('FraudDetection Domain', () => {
  it('should create entity', () => {
    const entity = FraudDetectionEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = FraudDetectionValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new FraudDetectionDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
