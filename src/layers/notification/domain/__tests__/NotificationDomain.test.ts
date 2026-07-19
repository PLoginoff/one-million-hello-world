import { NotificationEntity } from '../entities/NotificationEntity';
import { NotificationValueObject } from '../value-objects/NotificationValueObject';
import { NotificationDomainService } from '../services/NotificationDomainService';

describe('NotificationEntity', () => {
  it('should create entity', () => {
    const entity = NotificationEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = NotificationEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('NotificationValueObject', () => {
  it('should create value object', () => {
    const vo = NotificationValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = NotificationValueObject.create('test', 'string');
    const b = NotificationValueObject.create('test', 'string');
    const c = NotificationValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('NotificationDomainService', () => {
  let service: NotificationDomainService;

  beforeEach(() => { service = new NotificationDomainService(); });

  it('should validate entity', () => {
    const valid = NotificationEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = NotificationEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
