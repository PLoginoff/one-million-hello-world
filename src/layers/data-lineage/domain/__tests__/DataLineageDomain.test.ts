import { DataLineageEntity } from '../entities/DataLineageEntity';
import { DataLineageValueObject } from '../value-objects/DataLineageValueObject';
import { DataLineageDomainService } from '../services/DataLineageDomainService';

describe('DataLineageEntity', () => {
  it('should create entity', () => {
    const entity = DataLineageEntity.create('test');
    expect(entity.data.name).toBe('test');
    expect(entity.data.id).toBeDefined();
  });

  it('should update attributes immutably', () => {
    const entity = DataLineageEntity.create('test');
    const updated = entity.updateAttributes({ key: 'value' });
    expect(updated.data.attributes.key).toBe('value');
    expect(entity.data.attributes.key).toBeUndefined();
  });
});

describe('DataLineageValueObject', () => {
  it('should create value object', () => {
    const vo = DataLineageValueObject.create('test', 'string');
    expect(vo.value).toBe('test');
    expect(vo.type).toBe('string');
  });

  it('should compare equality', () => {
    const a = DataLineageValueObject.create('test', 'string');
    const b = DataLineageValueObject.create('test', 'string');
    const c = DataLineageValueObject.create('other', 'string');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('DataLineageDomainService', () => {
  let service: DataLineageDomainService;

  beforeEach(() => { service = new DataLineageDomainService(); });

  it('should validate entity', () => {
    const valid = DataLineageEntity.create('test');
    expect(service.validate(valid).valid).toBe(true);
  });

  it('should reject empty name', () => {
    const invalid = DataLineageEntity.create('');
    expect(service.validate(invalid).valid).toBe(false);
  });
});
