/**
 * WorkflowEngine Domain Entity Tests
 */

import { WorkflowEngineEntity } from '../entities/WorkflowEngineEntity';
import { WorkflowEngineValueObject } from '../value-objects/WorkflowEngineValueObject';
import { WorkflowEngineDomainService } from '../services/WorkflowEngineDomainService';

describe('WorkflowEngine Domain', () => {
  it('should create entity', () => {
    const entity = WorkflowEngineEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = WorkflowEngineValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new WorkflowEngineDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
