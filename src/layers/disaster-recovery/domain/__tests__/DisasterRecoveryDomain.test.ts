import { DisasterRecoveryEntity } from '../entities/DisasterRecoveryEntity';
import { DisasterRecoveryValueObject } from '../value-objects/DisasterRecoveryValueObject';
import { DisasterRecoveryDomainService } from '../services/DisasterRecoveryDomainService';

describe('DisasterRecoveryEntity', () => {
  it('should create entity', () => {
    const entity = DisasterRecoveryEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = DisasterRecoveryEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('DisasterRecoveryValueObject', () => {
  it('should create value object', () => {
    const vo = DisasterRecoveryValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = DisasterRecoveryValueObject.create('test', 'string');
    const b = DisasterRecoveryValueObject.create('test', 'string');
    const c = DisasterRecoveryValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('DisasterRecoveryDomainService', () => {
  let service: DisasterRecoveryDomainService;

  beforeEach(() => { service = new DisasterRecoveryDomainService(); });

  it('should validate entity', () => {
    const valid = DisasterRecoveryEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = DisasterRecoveryEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
