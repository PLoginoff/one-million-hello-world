import { RecommendationEntity } from '../entities/RecommendationEntity';
import { RecommendationValueObject } from '../value-objects/RecommendationValueObject';
import { RecommendationDomainService } from '../services/RecommendationDomainService';

describe('RecommendationEntity', () => {
  it('should create entity', () => {
    const entity = RecommendationEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = RecommendationEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('RecommendationValueObject', () => {
  it('should create value object', () => {
    const vo = RecommendationValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = RecommendationValueObject.create('test', 'string');
    const b = RecommendationValueObject.create('test', 'string');
    const c = RecommendationValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('RecommendationDomainService', () => {
  let service: RecommendationDomainService;

  beforeEach(() => { service = new RecommendationDomainService(); });

  it('should validate entity', () => {
    const valid = RecommendationEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = RecommendationEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
