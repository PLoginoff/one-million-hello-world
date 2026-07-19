import { MlFeatureStoreEntity } from '../entities/MlFeatureStoreEntity';
import { MlFeatureStoreValueObject } from '../value-objects/MlFeatureStoreValueObject';
import { MlFeatureStoreDomainService } from '../services/MlFeatureStoreDomainService';

describe('MlFeatureStoreEntity', () => {
  it('should create entity', () => {
    const entity = MlFeatureStoreEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = MlFeatureStoreEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('MlFeatureStoreValueObject', () => {
  it('should create value object', () => {
    const vo = MlFeatureStoreValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = MlFeatureStoreValueObject.create('test', 'string');
    const b = MlFeatureStoreValueObject.create('test', 'string');
    const c = MlFeatureStoreValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('MlFeatureStoreDomainService', () => {
  let service: MlFeatureStoreDomainService;

  beforeEach(() => { service = new MlFeatureStoreDomainService(); });

  it('should validate entity', () => {
    const valid = MlFeatureStoreEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = MlFeatureStoreEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
