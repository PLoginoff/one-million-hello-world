import { SchedulingEntity } from '../entities/SchedulingEntity';
import { SchedulingValueObject } from '../value-objects/SchedulingValueObject';
import { SchedulingDomainService } from '../services/SchedulingDomainService';

describe('SchedulingEntity', () => {
  it('should create entity', () => {
    const entity = SchedulingEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = SchedulingEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('SchedulingValueObject', () => {
  it('should create value object', () => {
    const vo = SchedulingValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = SchedulingValueObject.create('test', 'string');
    const b = SchedulingValueObject.create('test', 'string');
    const c = SchedulingValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('SchedulingDomainService', () => {
  let service: SchedulingDomainService;

  beforeEach(() => { service = new SchedulingDomainService(); });

  it('should validate entity', () => {
    const valid = SchedulingEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = SchedulingEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
