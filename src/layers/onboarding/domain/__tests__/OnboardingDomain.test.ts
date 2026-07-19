import { OnboardingEntity } from '../entities/OnboardingEntity';
import { OnboardingValueObject } from '../value-objects/OnboardingValueObject';
import { OnboardingDomainService } from '../services/OnboardingDomainService';

describe('OnboardingEntity', () => {
  it('should create entity', () => {
    const entity = OnboardingEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = OnboardingEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('OnboardingValueObject', () => {
  it('should create value object', () => {
    const vo = OnboardingValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = OnboardingValueObject.create('test', 'string');
    const b = OnboardingValueObject.create('test', 'string');
    const c = OnboardingValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('OnboardingDomainService', () => {
  let service: OnboardingDomainService;

  beforeEach(() => { service = new OnboardingDomainService(); });

  it('should validate entity', () => {
    const valid = OnboardingEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = OnboardingEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
