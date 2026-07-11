/**
 * Bpmn Domain Entity Tests
 */

import { BpmnEntity } from '../entities/BpmnEntity';
import { BpmnValueObject } from '../value-objects/BpmnValueObject';
import { BpmnDomainService } from '../services/BpmnDomainService';

describe('Bpmn Domain', () => {
  it('should create entity', () => {
    const entity = BpmnEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = BpmnValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new BpmnDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
