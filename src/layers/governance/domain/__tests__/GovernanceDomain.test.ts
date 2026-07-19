import { GovernanceEntity } from '../entities/GovernanceEntity';
import { GovernanceValueObject } from '../value-objects/GovernanceValueObject';
import { GovernanceDomainService } from '../services/GovernanceDomainService';

describe('GovernanceEntity', () => {
  it('should create entity', () => {
    const entity = GovernanceEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = GovernanceEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('GovernanceValueObject', () => {
  it('should create value object', () => {
    const vo = GovernanceValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = GovernanceValueObject.create('test', 'string');
    const b = GovernanceValueObject.create('test', 'string');
    const c = GovernanceValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('GovernanceDomainService', () => {
  let service: GovernanceDomainService;

  beforeEach(() => { service = new GovernanceDomainService(); });

  it('should validate entity', () => {
    const valid = GovernanceEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = GovernanceEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
