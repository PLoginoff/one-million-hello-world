import { MultiTenancyEntity } from '../entities/MultiTenancyEntity';
import { MultiTenancyValueObject } from '../value-objects/MultiTenancyValueObject';
import { MultiTenancyDomainService } from '../services/MultiTenancyDomainService';

describe('MultiTenancyEntity', () => {
  it('should create entity', () => {
    const entity = MultiTenancyEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = MultiTenancyEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('MultiTenancyValueObject', () => {
  it('should create value object', () => {
    const vo = MultiTenancyValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = MultiTenancyValueObject.create('test', 'string');
    const b = MultiTenancyValueObject.create('test', 'string');
    const c = MultiTenancyValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('MultiTenancyDomainService', () => {
  let service: MultiTenancyDomainService;

  beforeEach(() => { service = new MultiTenancyDomainService(); });

  it('should validate entity', () => {
    const valid = MultiTenancyEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = MultiTenancyEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
