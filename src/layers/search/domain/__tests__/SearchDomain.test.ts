import { SearchEntity } from '../entities/SearchEntity';
import { SearchValueObject } from '../value-objects/SearchValueObject';
import { SearchDomainService } from '../services/SearchDomainService';

describe('SearchEntity', () => {
  it('should create entity', () => {
    const entity = SearchEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = SearchEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('SearchValueObject', () => {
  it('should create value object', () => {
    const vo = SearchValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = SearchValueObject.create('test', 'string');
    const b = SearchValueObject.create('test', 'string');
    const c = SearchValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('SearchDomainService', () => {
  let service: SearchDomainService;

  beforeEach(() => { service = new SearchDomainService(); });

  it('should validate entity', () => {
    const valid = SearchEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = SearchEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
