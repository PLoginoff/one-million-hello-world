import { LocalizationEntity } from '../entities/LocalizationEntity';
import { LocalizationValueObject } from '../value-objects/LocalizationValueObject';
import { LocalizationDomainService } from '../services/LocalizationDomainService';

describe('LocalizationEntity', () => {
  it('should create entity', () => {
    const entity = LocalizationEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = LocalizationEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('LocalizationValueObject', () => {
  it('should create value object', () => {
    const vo = LocalizationValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = LocalizationValueObject.create('test', 'string');
    const b = LocalizationValueObject.create('test', 'string');
    const c = LocalizationValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('LocalizationDomainService', () => {
  let service: LocalizationDomainService;

  beforeEach(() => { service = new LocalizationDomainService(); });

  it('should validate entity', () => {
    const valid = LocalizationEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = LocalizationEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
