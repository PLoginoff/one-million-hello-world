import { CostOptimizationEntity } from '../entities/CostOptimizationEntity';
import { CostOptimizationValueObject } from '../value-objects/CostOptimizationValueObject';
import { CostOptimizationDomainService } from '../services/CostOptimizationDomainService';

describe('CostOptimizationEntity', () => {
  it('should create entity', () => {
    const entity = CostOptimizationEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = CostOptimizationEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('CostOptimizationValueObject', () => {
  it('should create value object', () => {
    const vo = CostOptimizationValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = CostOptimizationValueObject.create('test', 'string');
    const b = CostOptimizationValueObject.create('test', 'string');
    const c = CostOptimizationValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('CostOptimizationDomainService', () => {
  let service: CostOptimizationDomainService;

  beforeEach(() => { service = new CostOptimizationDomainService(); });

  it('should validate entity', () => {
    const valid = CostOptimizationEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = CostOptimizationEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
