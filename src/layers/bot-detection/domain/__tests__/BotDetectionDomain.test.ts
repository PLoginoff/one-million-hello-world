/**
 * BotDetection Domain Entity Tests
 */

import { BotDetectionEntity } from '../entities/BotDetectionEntity';
import { BotDetectionValueObject } from '../value-objects/BotDetectionValueObject';
import { BotDetectionDomainService } from '../services/BotDetectionDomainService';

describe('BotDetection Domain', () => {
  it('should create entity', () => {
    const entity = BotDetectionEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = BotDetectionValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new BotDetectionDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
