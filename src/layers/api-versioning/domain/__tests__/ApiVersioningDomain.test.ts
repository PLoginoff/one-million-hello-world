import { ApiVersioningEntity } from '../entities/ApiVersioningEntity';
import { ApiVersioningValueObject } from '../value-objects/ApiVersioningValueObject';
import { ApiVersioningDomainService } from '../services/ApiVersioningDomainService';

describe('ApiVersioningEntity', () => {
  it('should create entity', () => {
    const entity = ApiVersioningEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = ApiVersioningEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('ApiVersioningValueObject', () => {
  it('should create value object', () => {
    const vo = ApiVersioningValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = ApiVersioningValueObject.create('test', 'string');
    const b = ApiVersioningValueObject.create('test', 'string');
    const c = ApiVersioningValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('ApiVersioningDomainService', () => {
  let service: ApiVersioningDomainService;

  beforeEach(() => { service = new ApiVersioningDomainService(); });

  it('should validate entity', () => {
    const valid = ApiVersioningEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = ApiVersioningEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
