import { BatchProcessingEntity } from '../entities/BatchProcessingEntity';
import { BatchProcessingValueObject } from '../value-objects/BatchProcessingValueObject';
import { BatchProcessingDomainService } from '../services/BatchProcessingDomainService';

describe('BatchProcessingEntity', () => {
  it('should create entity', () => {
    const entity = BatchProcessingEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = BatchProcessingEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('BatchProcessingValueObject', () => {
  it('should create value object', () => {
    const vo = BatchProcessingValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = BatchProcessingValueObject.create('test', 'string');
    const b = BatchProcessingValueObject.create('test', 'string');
    const c = BatchProcessingValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('BatchProcessingDomainService', () => {
  let service: BatchProcessingDomainService;

  beforeEach(() => { service = new BatchProcessingDomainService(); });

  it('should validate entity', () => {
    const valid = BatchProcessingEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = BatchProcessingEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
