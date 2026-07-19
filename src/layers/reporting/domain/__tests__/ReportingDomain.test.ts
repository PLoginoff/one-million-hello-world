import { ReportingEntity } from '../entities/ReportingEntity';
import { ReportingValueObject } from '../value-objects/ReportingValueObject';
import { ReportingDomainService } from '../services/ReportingDomainService';

describe('ReportingEntity', () => {
  it('should create entity', () => {
    const entity = ReportingEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = ReportingEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('ReportingValueObject', () => {
  it('should create value object', () => {
    const vo = ReportingValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = ReportingValueObject.create('test', 'string');
    const b = ReportingValueObject.create('test', 'string');
    const c = ReportingValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('ReportingDomainService', () => {
  let service: ReportingDomainService;

  beforeEach(() => { service = new ReportingDomainService(); });

  it('should validate entity', () => {
    const valid = ReportingEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = ReportingEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
