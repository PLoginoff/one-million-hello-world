/**
 * Siem Domain Entity Tests
 */

import { SiemEntity } from '../entities/SiemEntity';
import { SiemValueObject } from '../value-objects/SiemValueObject';
import { SiemDomainService } from '../services/SiemDomainService';

describe('Siem Domain', () => {
  it('should create entity', () => {
    const entity = SiemEntity.create({ name: 'test' });
    expect(entity.data).toEqual({ name: 'test' });
  });

  it('should create value object', () => {
    const vo = SiemValueObject.create('value');
    expect(vo.value).toBe('value');
  });

  it('should validate via domain service', () => {
    const service = new SiemDomainService();
    expect(service.validate({ name: 'test' })).toBe(true);
  });
});
