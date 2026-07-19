import { SecretsRotationEntity } from '../entities/SecretsRotationEntity';
import { SecretsRotationValueObject } from '../value-objects/SecretsRotationValueObject';
import { SecretsRotationDomainService } from '../services/SecretsRotationDomainService';

describe('SecretsRotationEntity', () => {
  it('should create entity', () => {
    const entity = SecretsRotationEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = SecretsRotationEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('SecretsRotationValueObject', () => {
  it('should create value object', () => {
    const vo = SecretsRotationValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = SecretsRotationValueObject.create('test', 'string');
    const b = SecretsRotationValueObject.create('test', 'string');
    const c = SecretsRotationValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('SecretsRotationDomainService', () => {
  let service: SecretsRotationDomainService;

  beforeEach(() => { service = new SecretsRotationDomainService(); });

  it('should validate entity', () => {
    const valid = SecretsRotationEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = SecretsRotationEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
