import { AnomalyDetectionEntity } from '../entities/AnomalyDetectionEntity';
import { AnomalyDetectionValueObject } from '../value-objects/AnomalyDetectionValueObject';
import { AnomalyDetectionDomainService } from '../services/AnomalyDetectionDomainService';

describe('AnomalyDetectionEntity', () => {
  it('should create entity', () => {
    const entity = AnomalyDetectionEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = AnomalyDetectionEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('AnomalyDetectionValueObject', () => {
  it('should create value object', () => {
    const vo = AnomalyDetectionValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = AnomalyDetectionValueObject.create('test', 'string');
    const b = AnomalyDetectionValueObject.create('test', 'string');
    const c = AnomalyDetectionValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('AnomalyDetectionDomainService', () => {
  let service: AnomalyDetectionDomainService;

  beforeEach(() => { service = new AnomalyDetectionDomainService(); });

  it('should validate entity', () => {
    const valid = AnomalyDetectionEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = AnomalyDetectionEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
