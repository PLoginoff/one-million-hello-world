/**
 * EtlPipeline Domain Entity Tests
 */

import { EtlPipelineEntity } from '../entities/EtlPipelineEntity';
import { EtlPipelineValueObject } from '../value-objects/EtlPipelineValueObject';
import { EtlPipelineDomainService } from '../services/EtlPipelineDomainService';

describe('EtlPipeline Domain', () => {
  it('should create entity', () => {
    const entity = EtlPipelineEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = EtlPipelineValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new EtlPipelineDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
