/**
 * StreamProcessing Domain Entity Tests
 */

import { StreamProcessingEntity } from '../entities/StreamProcessingEntity';
import { StreamProcessingValueObject } from '../value-objects/StreamProcessingValueObject';
import { StreamProcessingDomainService } from '../services/StreamProcessingDomainService';

describe('StreamProcessing Domain', () => {
  it('should create entity', () => {
    const entity = StreamProcessingEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = StreamProcessingValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new StreamProcessingDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
