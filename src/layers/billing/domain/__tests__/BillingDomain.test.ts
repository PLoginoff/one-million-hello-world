import { BillingEntity } from '../entities/BillingEntity';
import { BillingValueObject } from '../value-objects/BillingValueObject';
import { BillingDomainService } from '../services/BillingDomainService';

describe('BillingEntity', () => {
  it('should create entity', () => {
    const entity = BillingEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = BillingEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('BillingValueObject', () => {
  it('should create value object', () => {
    const vo = BillingValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = BillingValueObject.create('test', 'string');
    const b = BillingValueObject.create('test', 'string');
    const c = BillingValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('BillingDomainService', () => {
  let service: BillingDomainService;

  beforeEach(() => { service = new BillingDomainService(); });

  it('should validate entity', () => {
    const valid = BillingEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = BillingEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
