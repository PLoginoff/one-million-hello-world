import { CdnIntegrationEntity } from '../entities/CdnIntegrationEntity';
import { CdnIntegrationValueObject } from '../value-objects/CdnIntegrationValueObject';
import { CdnIntegrationDomainService } from '../services/CdnIntegrationDomainService';

describe('CdnIntegrationEntity', () => {
  it('should create entity', () => {
    const entity = CdnIntegrationEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = CdnIntegrationEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('CdnIntegrationValueObject', () => {
  it('should create value object', () => {
    const vo = CdnIntegrationValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = CdnIntegrationValueObject.create('test', 'string');
    const b = CdnIntegrationValueObject.create('test', 'string');
    const c = CdnIntegrationValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('CdnIntegrationDomainService', () => {
  let service: CdnIntegrationDomainService;

  beforeEach(() => { service = new CdnIntegrationDomainService(); });

  it('should validate entity', () => {
    const valid = CdnIntegrationEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = CdnIntegrationEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
